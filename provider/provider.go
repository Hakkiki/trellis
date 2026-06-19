// Package provider defines the capability-contract port (spec §15) that
// decouples the Trellis control loop from any particular cloud.
//
// This seam is the whole reason "the simulator can turn into the real thing":
// the reconciler drives a Provider and never speaks to a cloud directly. The
// simulator (package provider/sim) is one implementation, backed by an in-memory
// fake cloud with real dynamics; an AWS implementation is another. The loop code
// above this seam does not change when you swap them.
package provider

import (
	"context"

	"github.com/hakkiki/trellis/model"
)

// Provider is the boundary between the control loop and a cloud. It is expressed
// as capability intent (Apply/Observe/Delete over provider-neutral resources),
// never as provider-specific resource types — this is what avoids the
// lowest-common-denominator trap (spec §15).
//
// Implementations MUST be idempotent: calling Apply repeatedly with the same
// desired spec converges to the same observed state, with no side effects beyond
// the first convergence. This is what makes the reconcile loop safe to run
// continuously.
type Provider interface {
	// Name identifies the implementation (e.g. "sim", "aws").
	Name() string

	// Apply converges a single resource toward its desired spec — the Converge
	// action (spec §7) at the provider boundary. The provider records the
	// authorizing generation so later observation can attribute provenance.
	Apply(ctx context.Context, d model.DesiredResource) error

	// Delete removes a resource — used to retire resources that desired state no
	// longer contains, and during the contract phase of a transition (spec §10).
	Delete(ctx context.Context, id model.ResourceID) error

	// Observe returns the measured projection of a single resource. If the
	// resource is unknown, it returns an Observation with Exists == false.
	Observe(ctx context.Context, id model.ResourceID) (model.Observation, error)

	// ObserveAll returns the measured projection of every resource the provider
	// knows about — including resources absent from desired state, which are
	// candidates for drift correction or retirement.
	ObserveAll(ctx context.Context) ([]model.Observation, error)
}
