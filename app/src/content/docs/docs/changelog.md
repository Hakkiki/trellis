---
title: What's new
description: Recent changes to the Trellis simulator, newest first.
---

What's shipped to the live simulator, newest first. The footer shows the exact build
(date · commit) currently deployed.

## Inversion stress test — five new invariants

We applied **Munger's inversion** to Trellis: instead of "how does it succeed?", we asked *"how would we
guarantee it causes the exact catastrophe it exists to prevent?"*, walked every kill-path, and designed
each one shut. The five genuine gaps became **normative Invariants 11–15** — most importantly **progressive,
reversible convergence** (the reconciler never does a fleet-wide write, so even an approved bad change
can't take a whole division down at once — the direct answer to the original 100%-blast-radius outage).
A new [Inversion stress test](/trellis/docs/hardening) page tells the story; the raw kill-path enumeration
is kept off-site in the red-team bundle.

## Three decisions promoted into the spec

Three things that had been living as applied-decision pages are now part of the **normative
specification**: **control-plane partitioning** (the enforcer is not exempt — anything with standing
write is sliced to the containment boundary; new Invariant 10), the **Kubernetes boundary** (Trellis owns
the cluster, the in-cluster GitOps loop owns the workloads; slice at the cluster, not the namespace), and
the control plane keeping **no consensus store of its own** (desired state in Git, audit external, live
State derived). Promoted maker/checker, and recorded in the spec's provenance.

## Docs, in three genres

The documentation is now sorted into clear genres so it's obvious what each page *is*: the **narrative**
(The case, Why Trellis), the **model** (concept primers), **applied decisions** (operating model,
bootstrap, provider crosswalk, architecture), and the **specification** — the normative source of truth.
The sidebar is regrouped to match, and every page carries a one-line status banner saying which genre it
belongs to, so you always know whether you're reading canon or commentary.

## Trellis and Kubernetes
The [operating model](/trellis/docs/operating-model#trellis-and-kubernetes-where-the-line-is) now spells
out where Trellis ends and Kubernetes begins. Because k8s is itself a reconciler, the rule is: Trellis
manages the **cluster** (version, nodes, add-ons) and the in-cluster GitOps loop owns the **workloads** —
never overlapping, or the two loops fight. And you slice at the **cluster**, not the namespace, since a
namespace shares the cluster's control plane and upgrade fate. Includes the honest costs (cluster sprawl;
the upgrade/API-compat seam where "infra only" blurs).

## Provider crosswalk

A new [provider-crosswalk page](/trellis/docs/provider-crosswalk) maps the provider-neutral capability
contract to **AWS (the column we build) → GCP → Azure** across all twelve buckets — the documented escape
hatch. We're fully committed to AWS now (one provider, executed richly); the crosswalk means adding GCP or
Azure later is an additive, parity-gated adapter, never a rewrite. It's honest about where the mapping
leaks: identity / the credential mint, the org boundary (account → project → subscription), and services
with no twin (Aurora, QLDB).

## Bootstrap & footprint

A new [Bootstrap & footprint page](/trellis/docs/bootstrap) covers the part everything hangs from: how
Trellis gets installed the first time (a one-time, externally-rooted, dual-controlled ceremony — seed
once, discover read-only, plan + prove, approve the minimal scoped write, then seal the root) and what it
needs *standing* to run (workload identity, a delegated-admin position that's unprivileged for writes,
STS-minted plan-scoped ephemeral credentials, and a small near-stateless footprint: compute + Git + the
external audit + a lock table + a secrets store). Plus per-division bootstrap and meta-DR.

## Operating model

A new [operating-model page](/trellis/docs/operating-model) covers the *how* of per-division platforms:
where to put the boundary (the org / account / VPC / namespace grain ladder, and why a namespace is the
wrong grain when the goal is blast-radius containment), why synchronous-only coupling between divisions is
the healthy kind, and the key move — **slice the control plane too**, so each division runs its own
Trellis and only a signed, versioned, pulled catalog (plus SCP guardrails and the external audit) stays
shared.

## Why Trellis — a use case

A new [use-case page](/trellis/docs/use-case) tells the motivating story plainly: a single shared service
(privileged access, CI/CD, DNS, source control) becomes a company-wide single point of failure — a
careful active-active upgrade still takes everything down, because HA hardens against infra failure, not a
bad change. The fix is per-division environments that contain the blast radius, with the platform team
curating a vetted catalog + governance so divisions declare intent instead of operating their own cloud.

## FAQ

A new [FAQ](/trellis/docs/faq) answers the hard questions in plain English — what problem Trellis solves
and why, who it's for and *not* for, what fails and why (and the mitigations), how cross-region
connectivity heals, how security works, who manages database replication, how it relates to GitOps /
Kubernetes / S3 / Terraform, where the platform/application line sits, what integrations exist, how
third-party "batteries" are included, and an honest take on what's real vs simulated and what's deferred.
It also answers **"do we have to run our own Git?"** — no: Git is a *role* (versioned manifest store +
merge-as-gate), filled by managed GitHub/GitLab or AWS CodeCommit (closed to new customers since 2024) or
self-hosted; the store is Trellis's own and per-division (not shared Git infra), and it's a soft
dependency — Git down pauses changes, not running infra. And: **Trellis needs no etcd or Consul of its own** — desired
state is Git, audit is an external append-only log, and live state is derived, so each control-plane
instance is near-stateless and re-bootstrappable. And a follow-on: **where the live console gets "down"
or "in transition"** — derived on the fly from Git (desired) + live telemetry (observed), with the
timeline coming from the external audit; nothing reads a stored "status." And **where the audit log
lives** — external, append-only/WORM storage outside the control plane (on AWS: org CloudTrail → an
Object-Locked S3 bucket in a separate log-archive account, with QLDB an option for verifiable gate/mint
records).

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
