// Package state implements the Trellis State model (spec §4): the live lifecycle
// condition of a resource, *derived* from its two projections plus health and
// the reconciler's control stance —
//
//	state = f(desired, observed, health)
//
// State is a pure, recomputable function, never stored as ground truth. That is
// "no magic" applied to state: every state is explainable by showing its inputs.
package state

import (
	"time"

	"github.com/hakkiki/trellis/model"
)

// Sync is the observed-vs-desired sub-dimension (spec §4).
type Sync int

const (
	// SyncUnknown means observation is stale or missing — we cannot assert.
	SyncUnknown Sync = iota
	// SyncInSync means observed matches desired.
	SyncInSync
	// SyncProgressing means observed differs from desired because a newer
	// authored generation is still rolling out (good).
	SyncProgressing
	// SyncDrifted means observed diverged from the generation already applied,
	// with nothing newer pending — an unauthored change (bad).
	SyncDrifted
)

// Control is the reconciler's stance toward a resource (spec §4).
type Control int

const (
	// ControlSettled means the reconciler is holding; no action in flight.
	ControlSettled Control = iota
	// ControlReconciling means the reconciler is actively closing a gap.
	ControlReconciling
	// ControlStalled means convergence cannot make progress — needs a human.
	ControlStalled
	// ControlFrozen means reconciliation is suspended (break-glass, §7).
	ControlFrozen
)

// State is the named lifecycle state — the salient cell of the
// Sync × Health × Control product (spec §4).
type State int

const (
	// StateUnknown means observation is stale/missing; the system cannot assert
	// a state and must fail safe (Invariant 7).
	StateUnknown State = iota
	// StateConverged means InSync · Healthy · Settled — the goal.
	StateConverged
	// StateConverging means an authored gap is closing (a deploy).
	StateConverging
	// StateDrifted means an unauthored divergence the reconciler will correct.
	StateDrifted
	// StateDegraded means correct-but-unhealthy → self-heal.
	StateDegraded
	// StateStalled means convergence is blocked — needs a human.
	StateStalled
	// StateFrozen means reconciliation is suspended (break-glass) with a debt.
	StateFrozen
)

func (s State) String() string {
	switch s {
	case StateConverged:
		return "Converged"
	case StateConverging:
		return "Converging"
	case StateDrifted:
		return "Drifted"
	case StateDegraded:
		return "Degraded"
	case StateStalled:
		return "Stalled"
	case StateFrozen:
		return "Frozen"
	default:
		return "Unknown"
	}
}

// Derive computes the named State of a resource from its desired and observed
// projections, the reconciler's control stance, and a freshness check. It is the
// pure function at the heart of the State model (spec §4) and is never stored.
//
// stalenessBudget bounds how old an observation may be before it is treated as
// Unknown rather than assumed-converged (Invariant 7, fail-safe-on-Unknown). A
// zero budget disables the freshness check.
func Derive(d model.DesiredResource, o model.Observation, ctrl Control, now time.Time, stalenessBudget time.Duration) State {
	// A break-glass freeze dominates everything: reconciliation is suspended.
	if ctrl == ControlFrozen {
		return StateFrozen
	}

	sync := classifySync(d, o, now, stalenessBudget)

	// A reconciler that has given up (flap/blast-radius breaker tripped, or
	// repeated failure) reports Stalled — but only once it is actually behind.
	if ctrl == ControlStalled && sync != SyncInSync {
		return StateStalled
	}

	// Fail-safe on Unknown: never assume Converged from stale data.
	if sync == SyncUnknown {
		return StateUnknown
	}

	switch sync {
	case SyncInSync:
		switch o.Health {
		case model.HealthHealthy:
			return StateConverged
		case model.HealthDegraded:
			return StateDegraded
		default:
			// InSync but liveness unknown — cannot assert healthy.
			return StateUnknown
		}
	case SyncProgressing:
		return StateConverging
	case SyncDrifted:
		return StateDrifted
	}
	return StateUnknown
}

// classifySync decides the observed-vs-desired relationship, using provenance
// (generations), not gap size, to separate authored progress from drift (the
// key non-obvious rule of spec §4).
func classifySync(d model.DesiredResource, o model.Observation, now time.Time, stalenessBudget time.Duration) Sync {
	if !o.Exists {
		// Desired exists but nothing is observed yet: an authored creation is in
		// flight.
		return SyncProgressing
	}
	if stalenessBudget > 0 && !o.ObservedAt.IsZero() && now.Sub(o.ObservedAt) > stalenessBudget {
		return SyncUnknown
	}
	if model.SpecEqual(o.Spec, d.Spec) {
		return SyncInSync
	}
	// observed != desired — provenance decides.
	if d.Generation > o.AppliedGeneration {
		// A newer authored generation has not been applied yet: progress.
		return SyncProgressing
	}
	// observed diverged from the generation already applied: unauthored drift.
	return SyncDrifted
}
