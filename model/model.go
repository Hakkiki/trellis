// Package model holds Trellis's core domain types: the two projections of a
// resource (desired and observed), the manifest that is the single source of
// truth for desired state, and the generation stamps that distinguish authored
// progress from unauthored drift.
//
// These types are provider-neutral by design (spec §15). They name *what a
// resource is for* — never a provider-specific resource type — so the same
// control loop drives a simulated cloud and, later, a real one (AWS first).
package model

import "time"

// Generation is a version stamp on desired state, produced by the Author action
// (a plan) that wrote it (spec §1, §11). In the full system it is realized as a
// Git commit SHA; in the reconcile spine it is a monotonic counter. Generations
// are what let Trellis tell authored progress ("converging toward generation N")
// apart from unauthored drift ("diverged from N with nothing pending").
type Generation uint64

// Kind is the capability-intent type of a resource — provider-neutral (spec
// §15). It names what the resource is for ("managed-relational-db", "compute",
// "load-balancer"), not a provider resource type ("aws_db_instance"). A Provider
// binds a Kind to concrete cloud resources behind the port.
type Kind string

// ResourceID is the stable identity of a resource across its whole lifecycle.
type ResourceID string

// Spec is the desired or observed configuration of a resource — the Substance
// facet (spec §3). Opaque key/values for the spine; a typed per-Kind schema
// arrives with the planner.
type Spec map[string]string

// DesiredResource is the *authored* projection of a resource (spec §4): its spec
// plus the Generation that authored it. "Desired" is a projection, never a state
// in its own right; the lifecycle state is derived (see package state).
type DesiredResource struct {
	ID         ResourceID
	Kind       Kind
	Spec       Spec
	Generation Generation
}

// Manifest is the desired state of the world: the full set of authored resources
// at a Generation. It is the single source of truth the reconciler converges
// toward. In the spine it is hand-written (build-sequence step 1); later the
// planner compiles it and Git stores it.
type Manifest struct {
	Generation Generation
	Resources  map[ResourceID]DesiredResource
}

// Health is the liveness of an observed resource, independent of whether it
// matches desired (spec §4).
type Health int

const (
	// HealthUnknown means liveness could not be determined (e.g. stale telemetry).
	HealthUnknown Health = iota
	// HealthHealthy means the resource is alive and serving.
	HealthHealthy
	// HealthDegraded means the resource exists but is not serving correctly.
	HealthDegraded
)

func (h Health) String() string {
	switch h {
	case HealthHealthy:
		return "Healthy"
	case HealthDegraded:
		return "Degraded"
	default:
		return "Unknown"
	}
}

// Observation is the *measured* projection of a resource — its status (spec §4),
// timestamped with freshness so stale telemetry can be treated as Unknown rather
// than assumed-converged (Invariant 7).
//
// AppliedGeneration — the generation an actuator last successfully applied — is
// what makes the Progressing-vs-Drifted distinction provenance-based rather than
// gap-based: observed differing from desired is "progress" when a newer
// generation is still rolling out, and "drift" when it diverged from the
// generation already applied.
type Observation struct {
	ID                ResourceID
	Exists            bool
	Spec              Spec
	Health            Health
	AppliedGeneration Generation
	ObservedAt        time.Time
}

// SpecEqual reports whether two specs are identical.
func SpecEqual(a, b Spec) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

// CloneSpec returns a deep copy of a spec, so callers cannot mutate shared maps.
func CloneSpec(s Spec) Spec {
	if s == nil {
		return nil
	}
	out := make(Spec, len(s))
	for k, v := range s {
		out[k] = v
	}
	return out
}
