---
title: What's new
description: Recent changes to the Trellis simulator, newest first.
---

What's shipped to the live simulator, newest first. The footer shows the exact build
(date · commit) currently deployed.

## Reduced-motion support

Trellis now respects the OS **Reduce Motion** accessibility setting. With it on, the topology's pulsing
nodes, flowing weave wires, and glow stop, and the guided tour drops its slide/scroll animation — state
still reads through color, and you can still orbit and zoom. For anyone prone to motion sickness or
distraction, the page goes calm automatically.

## Polish pass

Share-ready details:

- **Branded tour** — the guided-tour popovers now match the Trellis dark/amber theme instead of the
  default white box.
- **Reset** — a control in the guide clears your saved session and starts fresh (handy for a live demo).
- **Lens-aware overview tiles** — the grouped service tiles tint by the active lens (cost / health /
  security) and show $/mo in the cost lens, not just the state roll-up.
- **Smoother 3D** — the stage is GPU-composited (`will-change` + `contain`), so orbit and zoom stay
  fluid.
- **Refreshed landing** — current "what's new" pill, and stress cards for cost drift, ownership, and
  self-upgrade.

## Topology that scales to many services

The 3D stage used to pack every service into the same edge/app/data cells, so two services already
overlapped and more was unreadable. Now it groups and drills in:

- **Overview (default)** — each region shows **one tile per service** (name, roll-up state, resource
  count). Clean however many services you own.
- **Drill in** — **tap a service tile** (or a chip above the stage) to open that service's full
  edge→app→data weave, with its cross-region replication. Tap **All services** to go back.
- A single-service environment skips the grouping and shows its weave directly. The grid view filters to
  the focused service too.

## Onboarding & UI polish

The simulator is easier to pick up and share:

- **A collapsible guide** at the top — what this is, how to drive it, and a plain-English list of
  exactly what's included (every part of the loop).
- **A guided tour** (driver.js, the same tour library lattice uses) that walks you through Posture →
  Plan → Approve → topology → lenses → inject reality → ownership → self-upgrade.
- **A 3D stage that fits any screen** — it auto-scales to its container (no overflow on phones),
  supports **pinch-to-zoom** on touch, and shows **zoom / reset controls** on hover on desktop.
- **No more runaway text** — audit and proof entries wrap cleanly instead of forcing a horizontal
  scroll.

## Self-upgrade — the loop managing itself

The capstone (spec §16): the control plane manages *itself*. Its **TCB** — planner · proof · gate ·
catalog · reconciler — is a **Criticality-0 self-environment**, and a Trellis upgrade is a transition on
that environment:

- **Propose a self-upgrade** on a component → it's gated at the **highest bar**: dual-control /
  sealed-root (you're changing the thing that governs change). Two approvals, then a **canary rollout**.
- **The circularity hazard** — a **faulty** upgrade bricks the component. Brick the **reconciler** and the
  workload self-heal loop goes **down**: the topology still observes reality, but nothing reconciles —
  the one change the loop can't heal itself.
- **Meta-DR recovery** — re-bootstrap from the **external seed + the last-good generation** (never the
  ordinary loop), and the loop comes back and resumes healing.

A new control-plane panel shows the five TCB components, the in-flight transition, and the recovery path.

## Security View

A 4th topology lens (spec §7) — a **trust/exposure projection** of the same Structure. Switch the lens to
**security** and every resource is tiered by where it sits in the trust topology:

- **exposed** — the internet-facing edge (the attack surface).
- **sensitive** — data and stateful clusters (crown jewels that hold state).
- **internal** — app compute behind the edge.
- **at-risk** — flagged when a resource is a **third-party dependency** (outside our TCB), an **exposed
  surface without per-service isolation** (a C2/C3 colocated edge), or **crown jewels without compliance
  coverage**. Drop a Service to C3 or clear the compliance tags and watch tiers turn at-risk.

The legend follows the lens, on both the 3D stage and the grid.

## Cost as a live signal

Cost was a planner input; now it's a **first-class loop signal** (spec §13). The simulated cloud bills
you, and the bill can diverge from the plan:

- **Cost drift** — a **Cost spike** event makes a resource bill **3× its planned cost** (a usage spike /
  price change / leak). It's observed like any drift; the budget bar overlays **billed over planned**,
  and the cost-drifted resource is flagged.
- **Budget-breach** — when billed spend exceeds budget, on-call is paged. By **posture** (`alert` vs
  `block`), a breach either just alerts or **blocks further provisioning** (Approve is held) until the
  cost is reconciled. The **Owners** tab attributes billed-vs-planned to each Service.
- **Reconcile** — clear the spike (right-size / fix the leak) and the breach clears, unblocking the gate.

## Multi-service & ownership

An environment now owns **more than one Service** (spec §6), each with its own **Criticality** — a C0
`payments-api` next to a C3 `internal-dashboard`, sharing one budget:

- **The planner solves across Services** — it floors every Service at its cheapest realization meeting
  the declared resilience, then (maximize-resilience) greedily upgrades by score-per-dollar until the
  **shared budget** is spent.
- **State and spend attribute up the tree** — a new **Owners** tab shows each Service's roll-up state,
  monthly cost, and share of budget, summing to the environment total. Fail one Service and only its
  owner reddens; its peer is untouched.
- **The Posture editor manages the Service list** (add/remove, per-service Criticality), and the 3D
  stage wires each Service's edge→app→data chain independently so the topology stays legible.

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
