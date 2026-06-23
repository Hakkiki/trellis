---
title: What's new
description: Recent changes to the Trellis simulator, newest first.
---

What's shipped to the live simulator, newest first. The footer shows the exact build (date · commit) currently deployed.

## Docs review: fewer pages, plainer voice

Red-teamed the docs and cut them back to pages that earn their keep. The old "The case" and "Why Trellis — use case" pages, plus the overview, are merged into a single [Why Trellis](/trellis/docs/the-case) narrative. The sidebar is regrouped into Start here, The model, Architecture & decisions, and Reference. The per-page genre banners are gone, the FAQ no longer re-derives the bootstrap and security pages, and every page is rewritten in plain, active voice with far less bold and fewer em-dashes.

## Diagrams you can open, zoom, and read as journeys

Every Mermaid diagram now carries a small toolbar: **open it full-screen** (great in landscape on a
phone) and **view/copy its source**. The full-screen view supports pan and zoom everywhere — pinch and
drag on touch, wheel-zoom and click-drag on desktop, double-tap to reset. The
[Roles](/trellis/docs/roles) page also gains three **user-journey** diagrams (the service engineer's,
the operator's, and the break-glass responder's day) as an easier-to-read companion to the sequence
diagrams.

We also red-teamed the diagrams against the spec: the responsibility map had drawn the second
write-path into a division's cloud as an external-vendor "break-glass," which contradicts the model
(break-glass is the responder's, and dual-controlled). It now correctly shows the two write paths as the
**reconciler** and the **break-glass responders**, with vendors routed through the loop as ephemeral,
scoped credentials. (And a CI gate now parses every diagram, so a broken one can't ship again.)

## Roles & responsibilities — a day in the life

New [Roles & responsibilities](/trellis/docs/roles) page covering nine personas (platform owner, security/governance author, division lead, platform operator, service teams, break-glass responders, auditor, FinOps, external vendor), each with its mandate, boundaries, and a day-in-the-life, told through six Mermaid diagrams. Throughline: many author and approve; one loop (plus sealed break-glass) writes, contained to its division.

## Mermaid diagrams, themed to brand

Mermaid diagrams now render inline across the docs, themed to the "cuoio" palette with light/dark variants that re-theme on toggle. The spec's eight diagrams are now on-brand visuals.

## Closing the last residuals — Invariants 18 & 19

The final two residuals from the inversion are now invariants. **Invariant 18** rations attention by blast radius: trivial reversible changes auto-merge, big changes escalate, and an unreadable proof fails the gate. **Invariant 19** keeps each per-division control plane near-stateless and scale-to-zero with its own cost surfaced as a signal. The inversion-hardened set is now 11–19; what remains is genuine remainder, not unaddressed gaps.

## Bounding the compiler bet — Invariant 17

The Posture→Structure compiler could emit a Structure that's subtly wrong but passes its own proof. **Invariant 17** requires, above a blast-radius threshold, a second independent planner to reproduce the same realized diff plus named real-world checks (quota, residency, dependency-criticality, re-validate-against-observed). It shrinks the bet, not eliminates it. The inversion-hardened set is now 11–17.

## Inversion stress test — six new invariants

Applied Munger's inversion to Trellis: instead of "how does it succeed?", asked "how would we guarantee it causes the catastrophe it exists to prevent?", walked every kill-path, designed each shut. The gaps became normative Invariants 11–16, most notably progressive, reversible convergence (the reconciler never does a fleet-wide write) and leased applies (never begin a write you can't finish within its credential's lifetime). New [Inversion stress test](/trellis/docs/hardening) page tells the story.

## Three decisions promoted into the spec

Three applied-decision pages are now normative spec: control-plane partitioning (anything with standing write is sliced to the containment boundary; Invariant 10), the Kubernetes boundary (Trellis owns the cluster, the in-cluster GitOps loop owns the workloads; slice at the cluster), and the control plane keeping no consensus store of its own (desired state in Git, audit external, live State derived).

## Docs, in three genres

Docs are sorted into genres: the narrative (The case, Why Trellis), the model (concept primers), applied decisions (operating model, bootstrap, provider crosswalk, architecture), and the specification. The sidebar is regrouped to match, and each page carries a one-line status banner naming its genre.

## Trellis and Kubernetes

The [operating model](/trellis/docs/operating-model#trellis-and-kubernetes-where-the-line-is) now defines where Trellis ends and Kubernetes begins. Trellis manages the cluster (version, nodes, add-ons); the in-cluster GitOps loop owns the workloads. Slice at the cluster, not the namespace, since a namespace shares the cluster's control plane and upgrade fate. Includes the costs (cluster sprawl; the upgrade/API-compat seam).

## Provider crosswalk

New [provider-crosswalk page](/trellis/docs/provider-crosswalk) maps the provider-neutral capability contract to AWS → GCP → Azure across all twelve buckets. We're committed to AWS; adding GCP or Azure later is an additive, parity-gated adapter, not a rewrite. It's explicit about where the mapping leaks: identity / the credential mint, the org boundary (account → project → subscription), and services with no twin (Aurora, QLDB).

## Bootstrap & footprint

New [Bootstrap & footprint page](/trellis/docs/bootstrap): how Trellis gets installed the first time (a one-time, externally-rooted, dual-controlled ceremony — seed, discover read-only, plan + prove, approve the minimal scoped write, seal the root) and what it needs standing to run (workload identity, an unprivileged delegated-admin position, STS-minted plan-scoped credentials, and a near-stateless footprint: compute + Git + external audit + a lock table + a secrets store). Plus per-division bootstrap and meta-DR.

## Operating model

New [operating-model page](/trellis/docs/operating-model) on the how of per-division platforms: where to put the boundary (the org / account / VPC / namespace grain ladder, and why a namespace is the wrong grain for blast-radius containment), why synchronous-only coupling between divisions is the healthy kind, and the key move: slice the control plane too, so each division runs its own Trellis and only a signed, versioned, pulled catalog stays shared.

## Why Trellis — a use case

New [use-case page](/trellis/docs/the-case): a single shared service (privileged access, CI/CD, DNS, source control) becomes a company-wide single point of failure. A careful active-active upgrade still takes everything down, because HA hardens against infra failure, not a bad change. The fix is per-division environments that contain the blast radius, with a curated catalog + governance so divisions declare intent.

## FAQ

New [FAQ](/trellis/docs/faq) answering the hard questions: what problem Trellis solves and who it's for, what fails and the mitigations, how cross-region connectivity heals, how security works, who manages DB replication, how it relates to GitOps / Kubernetes / S3 / Terraform, the platform/application line, integrations, and what's real vs simulated. Covers "do we have to run our own Git?" (no — Git is a role filled by managed or self-hosted stores; soft dependency), "no etcd or Consul of its own" (desired state is Git, audit external, live state derived), where the live console derives "down/in-transition" status, and where the audit log lives (external append-only/WORM; on AWS, org CloudTrail → Object-Locked S3).

## Reduced-motion support

Trellis now respects the OS Reduce Motion setting. With it on, the topology's pulsing nodes, flowing wires, and glow stop, and the guided tour drops its slide/scroll animation. State still reads through color, and you can still orbit and zoom.

## Polish pass

- Branded tour — the guided-tour popovers now match the dark/amber theme.
- Reset — a control in the guide clears your saved session and starts fresh.
- Lens-aware overview tiles — grouped service tiles tint by the active lens and show $/mo in the cost lens.
- Smoother 3D — the stage is GPU-composited (`will-change` + `contain`).
- Refreshed landing — current "what's new" pill, plus stress cards for cost drift, ownership, and self-upgrade.

## Topology that scales to many services

The 3D stage used to pack every service into the same cells, so more than one overlapped. Now it groups and drills in:

- Overview (default) — each region shows one tile per service (name, roll-up state, resource count).
- Drill in — tap a service tile (or a chip) to open that service's full edge→app→data weave with cross-region replication. Tap All services to go back.
- A single-service environment skips grouping and shows its weave directly; the grid view filters to the focused service too.

## Onboarding & UI polish

- A collapsible guide at the top — what this is, how to drive it, and what's included.
- A guided tour (driver.js) walking through Posture → Plan → Approve → topology → lenses → inject reality → ownership → self-upgrade.
- A 3D stage that auto-scales to its container (no overflow on phones), supports pinch-to-zoom, and shows zoom/reset controls on hover.
- Audit and proof entries wrap cleanly instead of forcing horizontal scroll.

## Self-upgrade — the loop managing itself

The control plane manages itself (spec §16). Its TCB — planner · proof · gate · catalog · reconciler — is a Criticality-0 self-environment, and a Trellis upgrade is a transition on it:

- Propose a self-upgrade and it's gated at the highest bar: dual-control / sealed-root. Two approvals, then a canary rollout.
- The circularity hazard — a faulty upgrade bricks the component. Brick the reconciler and the workload self-heal loop goes down: the topology still observes reality, but nothing reconciles.
- Meta-DR recovery — re-bootstrap from the external seed + last-good generation (never the ordinary loop), and the loop resumes healing.

A control-plane panel shows the five TCB components, the in-flight transition, and the recovery path.

## Security View

A 4th topology lens (spec §7): a trust/exposure projection of the same Structure. Switch the lens to security and every resource is tiered:

- exposed — the internet-facing edge.
- sensitive — data and stateful clusters.
- internal — app compute behind the edge.
- at-risk — flagged when a resource is a third-party dependency, an exposed surface without per-service isolation, or crown jewels without compliance coverage.

The legend follows the lens, on both the 3D stage and the grid.

## Cost as a live signal

Cost was a planner input; now it's a first-class loop signal (spec §13). The simulated cloud bills you, and the bill can diverge from the plan:

- Cost drift — a Cost spike event makes a resource bill 3× its planned cost. The budget bar overlays billed over planned, and the resource is flagged.
- Budget-breach — when billed spend exceeds budget, on-call is paged. By posture (`alert` vs `block`), a breach alerts or blocks further provisioning until reconciled. The Owners tab attributes billed-vs-planned per Service.
- Reconcile — clear the spike and the breach clears, unblocking the gate.

## Multi-service & ownership

An environment now owns more than one Service (spec §6), each with its own Criticality, sharing one budget:

- The planner solves across Services — floors each at its cheapest realization meeting declared resilience, then greedily upgrades by score-per-dollar until the shared budget is spent.
- State and spend attribute up the tree — a new Owners tab shows each Service's roll-up state, monthly cost, and budget share. Fail one Service and only its owner reddens.
- The Posture editor manages the Service list (add/remove, per-service Criticality), and the 3D stage wires each Service's edge→app→data chain independently.

## Topology Views

The topology now has a `state · cost · health` lens toggle (spec §13): the same Structure, recolored by the question you're asking. A View is a read-only projection, never authoritative:

- State — the lifecycle state (default).
- Cost — a $/mo heatmap from cheap to costly, anchored to the most expensive resource, with per-resource dollar labels in the grid.
- Health — collapses the lifecycle into healthy / degraded / at-risk / unknown.

The legend follows the active lens, on both the 3D stage and the grid.

## Frame roll-up state

A Frame (a region, and the whole environment) now shows a state rolled up from its children — worst-of across the Service and Stateful workloads it contains (spec §4):

- Region frames on the 3D stage and grid headers are tinted by their roll-up, with the state named beside the region.
- The environment carries an `env · State` badge, read through Resilience: active-active keeps serving from the healthy region, active-passive fails over to standby, single-region impact is user-visible. Take a region down (Region outage) to watch it.

## Reconciler safety

The reconciler now governs when and how hard it acts (spec §9):

- Change-freeze / maintenance window — toggle a freeze and non-emergency Converge actions are held; drift is recorded but not corrected. Break-glass still overrides per-resource.
- Blast-radius breaker — if a single pass would remediate a large share of the fleet, it halts and pages instead of mass-stomping; an operator clicks Proceed.
- (Plus the existing flap breaker: a self-heal that never sticks trips to Stalled.)

## Stateful clusters

The last workload archetype: a self-run stateful broker (a quorum cluster, distinct from the provider-managed DB). Health rolls up by quorum — all nodes Converged, a majority serving Degraded, a minority Unavailable. Select the BROKER node and Fail node twice to watch 3/3 → 2/3 → 1/3 and self-heal. Completes the set: Service · Job · External · Stateful.

## Making the loop honest

- The planner actually solves the objective program — `minimize-cost` picks the cheapest realization meeting the floor; `maximize-resilience` upgrades as far as the budget allows. The proof shows the alternatives weighed.
- Governance can reject — toggle a service out of the whitelist and the plan fails with a proof ("Governance denied …"), never traded for cost or resilience.
- Circuit breaker + incidents — a Hard failure flaps, then trips a resource to Stalled and raises an incident with a Resolve action.
- Click-through proof — select any resource to see "why this exists".

## Workload archetypes (Jobs & External)

- Jobs run to completion (Pending → Running → Succeeded) and re-run on schedule — completion is success, not drift.
- External dependencies are observe-only: they degrade but the reconciler never remediates them.

## Promotion pipeline

Cut an immutable version and promote it dev → staging → prod, each environment instantiating it with its own posture overrides and re-planning against its own state. Hand-edit an environment to see it drifted off its version.

## Branding & chrome

A hero landing with the Trellis logo, a shadcn nav bar + mobile drawer, and branded docs.

## The reconcile spine

The foundation: Posture → plan that is a proof → gate → reconcile, with `state = f(desired, observed, health)`, provenance-based drift, self-heal, fail-safe on Unknown, break-glass, transitions (expand-contract), a CSS-3D topology, FinOps, and an audit trail. State persists in IndexedDB.
