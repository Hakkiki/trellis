package reconcile

import (
	"context"
	"testing"
	"time"

	"github.com/hakkiki/trellis/model"
	"github.com/hakkiki/trellis/provider/sim"
	"github.com/hakkiki/trellis/state"
)

// manifest builds a small hand-written desired state at generation gen.
func manifest(gen model.Generation) model.Manifest {
	return model.Manifest{
		Generation: gen,
		Resources: map[model.ResourceID]model.DesiredResource{
			"web": {ID: "web", Kind: "compute", Generation: gen, Spec: model.Spec{"replicas": "2", "size": "small"}},
			"db":  {ID: "db", Kind: "managed-relational-db", Generation: gen, Spec: model.Spec{"engine": "postgres", "size": "medium"}},
		},
	}
}

// run drives the loop to a fixpoint (or until maxSteps), advancing the sim each
// iteration. Returns the final statuses.
func run(t *testing.T, s *sim.Sim, r *Reconciler, m model.Manifest, maxSteps int) []Status {
	t.Helper()
	var last []Status
	for i := 0; i < maxSteps; i++ {
		st, err := r.Step(context.Background(), m, s.Now())
		if err != nil {
			t.Fatalf("step %d: %v", i, err)
		}
		last = st
		if Converged(st) {
			return st
		}
		s.Tick()
	}
	return last
}

func stateOf(statuses []Status, id model.ResourceID) state.State {
	for _, s := range statuses {
		if s.ID == id {
			return s.State
		}
	}
	return state.StateUnknown
}

func TestConvergesFromScratch(t *testing.T) {
	s := sim.New(sim.WithApplyLatency(2))
	r := New(s, Options{})
	got := run(t, s, r, manifest(1), 20)
	if !Converged(got) {
		t.Fatalf("expected convergence, got %+v", got)
	}
}

// TestProvenance: a brand-new generation makes resources Progressing
// (Converging), never Drifted — the difference is provenance, not gap size.
func TestProvenanceProgressingNotDrifted(t *testing.T) {
	s := sim.New(sim.WithApplyLatency(3))
	r := New(s, Options{})
	m := manifest(1)
	// First step: nothing applied yet → everything should be Converging.
	st, err := r.Step(context.Background(), m, s.Now())
	if err != nil {
		t.Fatal(err)
	}
	for _, x := range st {
		if x.State != state.StateConverging {
			t.Fatalf("%s: want Converging on first apply, got %s", x.ID, x.State)
		}
	}
}

// TestDriftDetectedAndCorrected: an out-of-band change is detected as Drifted
// and corrected back to desired.
func TestDriftDetectedAndCorrected(t *testing.T) {
	s := sim.New(sim.WithApplyLatency(2))
	r := New(s, Options{DriftPolicy: Enforce})
	m := manifest(1)
	run(t, s, r, m, 20) // converge first

	// Hand-edit the db out of band, without bumping the generation.
	s.InjectDrift("db", func(sp model.Spec) { sp["size"] = "tiny" })

	// One step should classify it as Drifted...
	st, _ := r.Step(context.Background(), m, s.Now())
	if got := stateOf(st, "db"); got != state.StateDrifted {
		t.Fatalf("want Drifted after injection, got %s", got)
	}
	// ...and the loop should heal it back to Converged.
	s.Tick()
	final := run(t, s, r, m, 20)
	if !Converged(final) {
		t.Fatalf("drift not corrected: %+v", final)
	}
}

// TestDriftIgnoredWhenPolicyIgnore: with policy=ignore, drift is left alone.
func TestDriftIgnoredWhenPolicyIgnore(t *testing.T) {
	s := sim.New(sim.WithApplyLatency(1))
	r := New(s, Options{DriftPolicy: Ignore})
	m := manifest(1)
	run(t, s, r, m, 20)
	s.InjectDrift("web", func(sp model.Spec) { sp["replicas"] = "99" })
	st, _ := r.Step(context.Background(), m, s.Now())
	for _, x := range st {
		if x.ID == "web" && x.Action == ActApply {
			t.Fatalf("policy=ignore should not correct drift, but applied")
		}
	}
}

// TestSelfHeal: a failed node is Degraded, then healed within the envelope.
func TestSelfHeal(t *testing.T) {
	s := sim.New(sim.WithApplyLatency(2))
	r := New(s, Options{})
	m := manifest(1)
	run(t, s, r, m, 20)

	s.FailNode("web")
	st, _ := r.Step(context.Background(), m, s.Now())
	if got := stateOf(st, "web"); got != state.StateDegraded {
		t.Fatalf("want Degraded after node failure, got %s", got)
	}
	s.Tick()
	final := run(t, s, r, m, 20)
	if !Converged(final) {
		t.Fatalf("self-heal failed: %+v", final)
	}
}

// TestFailSafeOnUnknown: stale telemetry → Unknown, and the reconciler holds
// rather than acting on stale data (Invariant 7).
func TestFailSafeOnUnknown(t *testing.T) {
	s := sim.New(sim.WithApplyLatency(1))
	r := New(s, Options{StalenessBudget: 5 * time.Second})
	m := manifest(1)
	run(t, s, r, m, 20)

	s.SetStale("db", true)
	// Advance the clock past the staleness budget without refreshing db.
	for i := 0; i < 10; i++ {
		s.Tick()
	}
	st, _ := r.Step(context.Background(), m, s.Now())
	if got := stateOf(st, "db"); got != state.StateUnknown {
		t.Fatalf("want Unknown on stale telemetry, got %s", got)
	}
	for _, x := range st {
		if x.ID == "db" && x.Action != ActHold {
			t.Fatalf("must hold on Unknown, got action %s", x.Action)
		}
	}
}

// TestBreakGlassFreeze: a frozen resource is held (reconciliation suspended).
func TestBreakGlassFreeze(t *testing.T) {
	s := sim.New(sim.WithApplyLatency(1))
	r := New(s, Options{DriftPolicy: Enforce})
	m := manifest(1)
	run(t, s, r, m, 20)

	r.Freeze("web")
	s.InjectDrift("web", func(sp model.Spec) { sp["replicas"] = "1" })
	st, _ := r.Step(context.Background(), m, s.Now())
	for _, x := range st {
		if x.ID == "web" {
			if x.State != state.StateFrozen {
				t.Fatalf("want Frozen, got %s", x.State)
			}
			if x.Action != ActHold {
				t.Fatalf("frozen must hold, got %s", x.Action)
			}
		}
	}
}

// TestRetireUndesired: a resource absent from desired is retired under Enforce.
func TestRetireUndesired(t *testing.T) {
	s := sim.New(sim.WithApplyLatency(0))
	r := New(s, Options{DriftPolicy: Enforce})
	// Apply an extra resource directly to the cloud, out of band.
	_ = s.Apply(context.Background(), model.DesiredResource{ID: "rogue", Kind: "compute", Generation: 1, Spec: model.Spec{"x": "1"}})
	m := manifest(1)
	st, _ := r.Step(context.Background(), m, s.Now())
	var retired bool
	for _, x := range st {
		if x.ID == "rogue" && x.Action == ActDelete {
			retired = true
		}
	}
	if !retired {
		t.Fatalf("expected rogue resource to be retired, got %+v", st)
	}
}
