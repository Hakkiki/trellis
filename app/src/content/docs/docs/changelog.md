---
title: What's new
description: Recent changes to the Trellis simulator, newest first.
---

What's shipped to the live simulator, newest first. The footer shows the exact build
(date · commit) currently deployed.

## Topology Views

The topology now has a **`state · cost · health`** lens toggle (spec §13) — the same Structure, recolored
by the question you're asking. A **View** is a read-only projection, never authoritative:

- **State** — the lifecycle state (the default).
- **Cost** — a $/mo heatmap from cheap (cool) to costly (warm), anchored to the most expensive resource,
  with per-resource dollar labels in the grid. The FinOps lens.
- **Health** — collapses the lifecycle into **healthy / degraded / at-risk / unknown** for an at-a-glance
  SLO read.

The legend follows the active lens, on both the 3D stage and the grid.

## Frame roll-up state

A **Frame** (a region, and the whole environment) now shows a state rolled up from its children —
worst-of across the Service and Stateful workloads it contains (spec §4):

- **Region frames** on the 3D stage and the grid headers are tinted by their roll-up, with the state
  named beside the region.
- **The environment** carries an `env · State` badge in the header, read through **Resilience**:
  active-active keeps **serving from the healthy region**, active-passive **fails over to standby**, and
  single-region impact is **user-visible**. Take a region down (**Region outage**) to watch it.

## Reconciler safety

The reconciler now governs *when and how hard* it acts (spec §9):

- **Change-freeze / maintenance window** — toggle a freeze and non-emergency Converge actions are held;
  drift is recorded but not corrected. Break-glass still overrides per-resource.
- **Blast-radius breaker** — if a single pass would remediate a large share of the fleet (e.g. a region
  outage), it **halts and pages** instead of mass-stomping; an operator clicks **Proceed** to continue.
- (Plus the existing flap breaker: a self-heal that never sticks trips to Stalled.)

## Stateful clusters

The last **workload archetype**: a self-run **stateful broker** (a quorum cluster, distinct from the
provider-managed DB). Health rolls up by quorum — all nodes **Converged**, a majority still serving
**Degraded**, a minority **Unavailable**. Select the BROKER node and **Fail node** twice to watch
3/3 → 2/3 → 1/3 and self-heal. Completes the set: **Service · Job · External · Stateful**.

## Making the loop honest

- **The planner actually solves** the objective program — `minimize-cost` picks the cheapest
  realization meeting the floor; `maximize-resilience` upgrades as far as the budget allows. The proof
  shows the alternatives weighed.
- **Governance can reject** — toggle a service out of the whitelist and the plan **fails with a proof**
  ("Governance denied …"), never traded for cost or resilience.
- **Circuit breaker + incidents** — a **Hard failure** flaps, then trips a resource to **Stalled** and
  raises an **incident** with a Resolve action.
- **Click-through proof** — select any resource to see "why this exists".

## Workload archetypes (Jobs & External)

- **Jobs** run to completion (Pending → Running → Succeeded) and re-run on schedule — completion is
  success, not drift.
- **External** dependencies are observe-only: they degrade but the reconciler never remediates them.

## Promotion pipeline

Cut an immutable version and promote it **dev → staging → prod**, each environment instantiating it with
its own posture overrides and re-planning against its own state. Hand-edit an environment to see it
**drifted off its version**.

## Branding & chrome

A proper hero landing with the Trellis logo, a shadcn nav bar + mobile drawer, and branded docs.

## The reconcile spine

The foundation: **Posture → plan that is a proof → gate → reconcile**, with
`state = f(desired, observed, health)`, provenance-based drift, self-heal, fail-safe on Unknown,
break-glass, transitions (expand-contract), a CSS-3D topology, FinOps, and an audit trail. State
persists in IndexedDB.
