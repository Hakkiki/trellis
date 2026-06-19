---
title: What's new
description: Recent changes to the Trellis simulator, newest first.
---

What's shipped to the live simulator, newest first. The footer shows the exact build
(date · commit) currently deployed.

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
