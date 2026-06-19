// Package reconcile implements the Trellis reconcile spine (build-sequence step
// 1, spec §9): observe the cloud through the provider port, derive each
// resource's State, and converge gaps within the approved envelope —
// continuously. Self-healing is just this loop running forever instead of once.
//
// The reconciler performs only Converge actions (spec §7). It never mutates
// desired state — that is the Author class, and it happens elsewhere (the
// manifest). This is the one law: desired state changes only through Author;
// everything else converges toward it.
package reconcile

import (
	"context"
	"sort"
	"time"

	"github.com/hakkiki/trellis/model"
	"github.com/hakkiki/trellis/provider"
	"github.com/hakkiki/trellis/state"
)

// DriftPolicy controls how unauthored divergence is handled, per scope (spec
// §4). It defaults to Enforce.
type DriftPolicy int

const (
	// Enforce auto-corrects drift back to desired.
	Enforce DriftPolicy = iota
	// Warn reports drift but does not correct it.
	Warn
	// Ignore leaves drift alone (e.g. a resource hand-managed during migration).
	Ignore
)

// Options configure a Reconciler.
type Options struct {
	// DriftPolicy decides what to do with unauthored divergence.
	DriftPolicy DriftPolicy
	// StalenessBudget bounds how old an observation may be before the resource
	// is treated as Unknown and held (Invariant 7). Zero disables the check.
	StalenessBudget time.Duration
}

// Action names what the reconciler decided to do about a resource in a Step.
type Action int

const (
	// ActNone means the resource is converged or intentionally held.
	ActNone Action = iota
	// ActApply means the reconciler converged the resource toward desired.
	ActApply
	// ActDelete means the reconciler retired a resource absent from desired.
	ActDelete
	// ActHold means the reconciler deliberately did nothing (Unknown/Frozen).
	ActHold
	// ActWarn means drift was detected but policy says don't correct it.
	ActWarn
)

func (a Action) String() string {
	switch a {
	case ActApply:
		return "apply"
	case ActDelete:
		return "delete"
	case ActHold:
		return "hold"
	case ActWarn:
		return "warn"
	default:
		return "none"
	}
}

// Status is the reconciler's per-resource report from one Step.
type Status struct {
	ID     model.ResourceID
	State  state.State
	Health model.Health
	Action Action
	// Reason is a short, human-readable justification — the seed of the proof
	// discipline ("no magic": every action is explainable).
	Reason string
}

// Reconciler converges a provider toward desired state.
type Reconciler struct {
	p      provider.Provider
	opts   Options
	frozen map[model.ResourceID]bool // break-glass: reconciliation suspended
}

// New creates a Reconciler over a provider.
func New(p provider.Provider, opts Options) *Reconciler {
	return &Reconciler{p: p, opts: opts, frozen: map[model.ResourceID]bool{}}
}

// Freeze suspends reconciliation of a resource — the effect of break-glass (spec
// §7). The resource enters Frozen and the reconciler will not touch it (the debt
// is repaid out of band, by an Author action).
func (r *Reconciler) Freeze(id model.ResourceID)   { r.frozen[id] = true }
func (r *Reconciler) Unfreeze(id model.ResourceID) { delete(r.frozen, id) }

// Step runs one reconcile pass against the manifest and returns the derived
// state and action for every resource considered. now is the reconciler's time
// source (use the provider's clock so freshness checks agree).
func (r *Reconciler) Step(ctx context.Context, m model.Manifest, now time.Time) ([]Status, error) {
	obs, err := r.p.ObserveAll(ctx)
	if err != nil {
		return nil, err
	}
	byID := make(map[model.ResourceID]model.Observation, len(obs))
	for _, o := range obs {
		byID[o.ID] = o
	}

	var out []Status

	// Converge every desired resource.
	for id, d := range m.Resources {
		o := byID[id] // zero value has Exists == false, which is correct
		ctrl := state.ControlSettled
		if r.frozen[id] {
			ctrl = state.ControlFrozen
		}
		st := state.Derive(d, o, ctrl, now, r.opts.StalenessBudget)
		status := Status{ID: id, State: st, Health: o.Health}

		switch st {
		case state.StateConverged:
			status.Action, status.Reason = ActNone, "matches spec and healthy"
		case state.StateConverging:
			if err := r.p.Apply(ctx, d); err != nil {
				return out, err
			}
			status.Action, status.Reason = ActApply, "authored change rolling out"
		case state.StateDegraded:
			// Self-heal: correct-but-unhealthy → re-provision within envelope.
			if err := r.p.Apply(ctx, d); err != nil {
				return out, err
			}
			status.Action, status.Reason = ActApply, "self-heal: unhealthy, re-provisioning"
		case state.StateDrifted:
			switch r.opts.DriftPolicy {
			case Enforce:
				if err := r.p.Apply(ctx, d); err != nil {
					return out, err
				}
				status.Action, status.Reason = ActApply, "drift: unauthored change, correcting"
			case Warn:
				status.Action, status.Reason = ActWarn, "drift detected (policy=warn, not correcting)"
			default: // Ignore
				status.Action, status.Reason = ActNone, "drift ignored (policy=ignore)"
			}
		case state.StateUnknown:
			// Fail-safe: never act on stale/missing data (Invariant 7).
			status.Action, status.Reason = ActHold, "telemetry stale/missing — holding"
		case state.StateFrozen:
			status.Action, status.Reason = ActHold, "break-glass: reconciliation suspended"
		case state.StateStalled:
			status.Action, status.Reason = ActHold, "stalled — needs a human"
		}
		out = append(out, status)
	}

	// Retire resources that exist but desired state no longer contains — these
	// are unauthored existence (drift), corrected under Enforce.
	if r.opts.DriftPolicy == Enforce {
		for _, o := range obs {
			if _, wanted := m.Resources[o.ID]; wanted || !o.Exists {
				continue
			}
			if r.frozen[o.ID] {
				continue
			}
			if err := r.p.Delete(ctx, o.ID); err != nil {
				return out, err
			}
			out = append(out, Status{
				ID: o.ID, State: state.StateDrifted, Health: o.Health,
				Action: ActDelete, Reason: "not in desired state — retiring",
			})
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// Converged reports whether every desired resource is Converged.
func Converged(statuses []Status) bool {
	for _, s := range statuses {
		if s.State != state.StateConverged {
			return false
		}
	}
	return len(statuses) > 0
}
