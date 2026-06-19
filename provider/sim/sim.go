// Package sim is an in-memory implementation of the provider.Provider port: a
// *simulated* cloud whose dynamics are real. Nothing is provisioned, but apply
// has latency, telemetry has freshness, nodes fail, and out-of-band changes
// drift — exactly the dynamics the reconcile loop exists to handle.
//
// It is the executable form of the "thinnest end-to-end slice" from the
// buildability assessment, and it shares the provider port with the eventual AWS
// implementation, so the loop driving it never has to change.
package sim

import (
	"context"
	"sync"
	"time"

	"github.com/hakkiki/trellis/model"
)

// tickDuration is the logical-clock step advanced by each Tick.
const tickDuration = time.Second

// resource is the sim's internal view of one cloud resource.
type resource struct {
	kind       model.Kind
	observed   model.Spec // what telemetry currently reports
	target     model.Spec // what the last Apply asked for
	appliedGen model.Generation
	health     model.Health
	convergeIn int       // ticks until target becomes observed (apply latency)
	exists     bool      // has the resource finished its first convergence?
	stale      bool      // telemetry frozen (observability-plane degradation)
	observedAt time.Time // freshness stamp; frozen while stale
}

// Sim is an in-memory fake cloud. It is safe for concurrent use.
type Sim struct {
	mu sync.Mutex
	// applyLatency is how many Ticks an Apply takes to land. Models that cloud
	// changes are not instantaneous, so resources pass through Converging.
	applyLatency int
	now          time.Time
	res          map[model.ResourceID]*resource
}

// Option configures a Sim.
type Option func(*Sim)

// WithApplyLatency sets how many Ticks an Apply takes to converge (default 2).
func WithApplyLatency(ticks int) Option {
	return func(s *Sim) {
		if ticks >= 0 {
			s.applyLatency = ticks
		}
	}
}

// WithStartTime sets the sim's logical clock origin (default: a fixed epoch so
// tests are deterministic).
func WithStartTime(t time.Time) Option {
	return func(s *Sim) { s.now = t }
}

// New creates a sim cloud.
func New(opts ...Option) *Sim {
	s := &Sim{
		applyLatency: 2,
		now:          time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		res:          make(map[model.ResourceID]*resource),
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Now returns the sim's logical clock. The reconciler uses this as its time
// source so freshness checks share one clock with the fake cloud.
func (s *Sim) Now() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.now
}

// Name implements provider.Provider.
func (s *Sim) Name() string { return "sim" }

// Tick advances the logical clock by one step and lets in-flight applies make
// progress. Drive it from the loop to animate the fake cloud.
func (s *Sim) Tick() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.now = s.now.Add(tickDuration)
	for _, r := range s.res {
		if r.convergeIn > 0 {
			r.convergeIn--
			if r.convergeIn == 0 {
				// Apply lands: observed catches up to target and the resource is
				// healthy and exists.
				r.observed = model.CloneSpec(r.target)
				r.exists = true
				r.health = model.HealthHealthy
			}
		}
		if !r.stale {
			r.observedAt = s.now
		}
	}
}

// Apply implements provider.Provider. It is idempotent: re-applying an
// already-converged, healthy resource is a no-op.
func (s *Sim) Apply(_ context.Context, d model.DesiredResource) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.res[d.ID]
	if !ok {
		r = &resource{kind: d.Kind, health: model.HealthUnknown, observedAt: s.now}
		s.res[d.ID] = r
	}
	converged := r.exists && model.SpecEqual(r.observed, d.Spec) && r.appliedGen == d.Generation
	healthy := r.health == model.HealthHealthy
	if converged && healthy {
		return nil // nothing to do
	}
	// Already converging toward this exact desired state: don't restart the
	// latency clock — that would prevent an in-flight apply from ever landing.
	// (Self-heal and drift differ: those have convergeIn == 0, so they fall
	// through and re-provision.)
	if r.convergeIn > 0 && model.SpecEqual(r.target, d.Spec) && r.appliedGen == d.Generation {
		return nil
	}
	// (Re)provision toward the desired spec. Applying to a degraded resource
	// replaces it — this is how self-heal restores health.
	r.kind = d.Kind
	r.target = model.CloneSpec(d.Spec)
	r.appliedGen = d.Generation
	r.convergeIn = s.applyLatency
	if r.convergeIn == 0 {
		// Zero-latency clouds converge immediately.
		r.observed = model.CloneSpec(d.Spec)
		r.exists = true
		r.health = model.HealthHealthy
	}
	return nil
}

// Delete implements provider.Provider.
func (s *Sim) Delete(_ context.Context, id model.ResourceID) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.res, id)
	return nil
}

// Observe implements provider.Provider.
func (s *Sim) Observe(_ context.Context, id model.ResourceID) (model.Observation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.res[id]
	if !ok {
		return model.Observation{ID: id, Exists: false}, nil
	}
	return s.observationLocked(id, r), nil
}

// ObserveAll implements provider.Provider.
func (s *Sim) ObserveAll(_ context.Context) ([]model.Observation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]model.Observation, 0, len(s.res))
	for id, r := range s.res {
		out = append(out, s.observationLocked(id, r))
	}
	return out, nil
}

func (s *Sim) observationLocked(id model.ResourceID, r *resource) model.Observation {
	health := r.health
	if !r.exists {
		health = model.HealthUnknown
	}
	return model.Observation{
		ID:                id,
		Exists:            r.exists,
		Spec:              model.CloneSpec(r.observed),
		Health:            health,
		AppliedGeneration: r.appliedGen,
		ObservedAt:        r.observedAt,
	}
}

// --- Fault injection (sim-only; not part of the provider port) -------------
//
// These model the dynamics the reconcile loop must survive. They are how the
// simulator lets you "feel the model" before building the real thing.

// FailNode marks a resource unhealthy, as if the underlying node died. The
// resource still matches spec (InSync) but is Degraded → the reconciler should
// self-heal it within the approved envelope.
func (s *Sim) FailNode(id model.ResourceID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.res[id]; ok {
		r.health = model.HealthDegraded
	}
}

// InjectDrift mutates a resource's observed spec out of band — a hand-edit in
// the console — without advancing its applied generation. The reconciler should
// see this as Drifted (unauthored) and correct it.
func (s *Sim) InjectDrift(id model.ResourceID, mutate func(model.Spec)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.res[id]; ok && r.exists {
		mutate(r.observed)
	}
}

// SetStale freezes (or unfreezes) a resource's telemetry, modeling a degraded
// observability plane. While stale, ObservedAt stops advancing, so the
// reconciler should treat the resource as Unknown and hold (Invariant 7).
func (s *Sim) SetStale(id model.ResourceID, stale bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.res[id]; ok {
		r.stale = stale
		if !stale {
			r.observedAt = s.now
		}
	}
}
