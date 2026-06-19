---
title: FAQ
description: The honest answers — what problem Trellis solves, what it doesn't, what fails and why, and how the hard parts (security, networking, data, integrations) actually work.
---

Straight answers, including the uncomfortable ones. Where this says "today," it means the shipped
artifact — a specification plus the interactive simulator on this site. The cloud is **simulated**; the
dynamics are **real** (applies take time, nodes fail, telemetry goes stale, bills drift). The target is a
self-hosted control plane for **AWS first**. Where the spec defers something, this says so.

## Start with the problem

### What problem does Trellis solve, and why is it needed?

Teams declare infrastructure in one place (Terraform, CloudFormation, scripts) and then spend the rest of
their time fighting the gap between *what they declared* and *what's actually running*. Drift creeps in
out of band. Changes are imperative and opaque — you read 400 lines of HCL and still can't say *why* a
security group exists or *who* authorized it. Spend balloons with no owner. An upgrade to the tooling
itself is a held-breath weekend.

Trellis closes that gap with one loop: **Posture → planner → Structure → reconcile.**

- You declare **what** you want (a *Posture*: services, criticality, resilience, regions, budget,
  governance) — never **how**.
- A deterministic **planner** compiles it into a concrete **Structure** and emits a **plan that is a
  proof**: every resource traces to your objective or to a named constraint, with the derivation shown.
- A human **approves** the plan. Approval mints a credential scoped to *exactly that diff*.
- A **reconciler** holds reality equal to the approved Structure forever. Self-healing is just that loop
  running continuously.

The payoff is **no magic**: every change is explainable by the plan that authorized it, and "drift" stops
being a chore because correcting it is the loop's normal behavior.

### Why not just use Terraform / Pulumi / CloudFormation?

Those are *authoring and execution* tools — you still write the how, and drift correction is a command you
remember to run. Trellis sits a layer up: you state intent, it **solves** the structure and **proves** the
result, and a standing reconciler keeps it true. Underneath, an executor like Terraform could even be the
actuator behind the provider port (see below). Trellis replaces the reasoning and the standing loop, not
necessarily the low-level apply.

## Who it's for

### Who is this for?

Platform and infrastructure teams (platform engineering, SRE, cloud/DevOps) running a multi-team cloud
org who want **declared, proof-carrying, self-healing infrastructure** with real delegation and
governance. It assumes a customer-owned management account and a hierarchical org (org → accounts →
regions → teams).

### Who is it *not* for?

Be clear-eyed — the spec fences scope on purpose:

- **Not active multi-cloud.** Exactly one provider executes at a time (AWS first), implemented richly;
  others are *mapped* against the capability contract but built on demand. This is provider-risk
  mitigation, not "deploy the same thing to three clouds at once."
- **Not an edge platform.** Thousands of intermittently-connected sites need a disconnected,
  eventually-consistent reconciler — a different core model.
- **Not a workload-behavior controller.** Trellis governs *infrastructure authority*, not what your code
  does at runtime (egress filtering, anomaly detection live outside the model).
- **Not a global optimizer.** It uses a catalog of vetted blueprints ("catalog, not search"), not a
  solver that invents novel topologies on the request path.

If you want a turnkey PaaS that also writes your app, builds your images, and runs your CI — that's not
this. Trellis governs the ground your services run on.

## The wrecking ball

### What happens when the planner can't find a feasible plan?

It **fails loudly with the binding constraint** — never silently invents. Example: "no realization fits
$8k/mo; the cheapest structure meeting your C0 + active-active floor is $8.6k/mo — raise the budget or
lower the floor." You see exactly which constraint bound the problem and what would unblock it. Try it:
set a tiny budget in the simulator and Plan.

### What does the reconciler do when it *can't* fix something?

It refuses to flail. Three guardrails you can watch in the simulator:

- **Fail-safe on Unknown.** If telemetry goes stale, state becomes `Unknown` and the loop *holds* — it
  never acts on blind data.
- **Flap breaker → Stalled.** A self-heal that never sticks (a root-cause failure the loop can't fix)
  trips a circuit breaker to `Stalled` and raises an **incident** for a human, instead of stomping
  forever.
- **Blast-radius breaker.** If a single pass would remediate a large share of the fleet (e.g. a region
  outage), it **halts and pages** rather than mass-stomping; an operator explicitly proceeds.

### Isn't a control plane with standing write access one giant blast radius?

Yes — that's the central hazard, and the spec turns the same maker-checker discipline on the core (the
"trusted computing base": planner, proof, gate, catalog, reconciler). The named failure modes and their
mitigations:

- **The planner is a confused deputy.** A compromised planner could show a benign proof while minting an
  attacker-chosen scope. → A separate **mint authority re-derives the credential scope from the signed
  manifest**, never from a field the planner asserts; plans are signed and approval binds to the bytes.
- **The reconciler is steerable by drift.** It holds the only standing god-write, and attacker-induced
  "drift" could be stomped into place. → Change-kinds are bounded at the *credential* layer; generation
  stamps are signed; remediation volume is rate-limited and anomaly-alerted; destructive convergence
  needs human confirm; and there's an out-of-band **kill-switch the reconciler cannot disable**.
- **The catalog is a supply-chain bomb.** Blueprints are trusted by every plan. → Entries are signed and
  versioned, consumers pin versions, and a catalog change is a highest-rigor dual-control action that
  re-plans dependents.
- **A bad self-upgrade can brick the loop.** Upgrading the control plane is the one change that can
  disable the thing that would heal it. → It runs at the **highest gate** (sealed-root / dual-control),
  canaried; recovery is **meta-DR**: re-bootstrap from a signed external seed + a known-good generation.
  (The simulator's "Control plane" panel lets you trip and recover this.)
- **Bootstrap is circular.** The platform can't provision its own first credential. → The root of trust
  is **necessarily external** (the provider root + a human IdP), used once in a sealed ceremony, then
  locked away.

### What actually fails, and how do I see it?

Everything above is injectable in the simulator's **Inject reality** panel: fail a node, drift a config,
take out a region, lose telemetry, force a hard (root-cause) failure, spike a cost, or break-glass. Watch
the loop heal what it can and escalate what it can't.

## Networking & data

### How is cross-region connectivity managed and healed?

Connectivity is a Structure facet the spec calls the **Weave** — the connectivity graph (DNS, load
balancing, peering, transit gateways, service mesh, cross-region replication) drawn *over* the placement
tree. It carries typed edges: **sync** (request/response) and **async** (pub/sub). Because it crosses
containment boundaries by design, it's modeled separately from the region/account tree.

Healing is the same reconcile loop: a region's health rolls up from its resources, and — crucially — the
**roll-up is read through your Resilience choice.** Active-active reads "one region down" as
*Degraded-but-serving* (keep routing to the healthy region); active-passive reads the same fact as a
*failover trigger*. So the Posture defines what "healthy" *means*, not just the shape. You can see this in
the simulator: take out a region and watch the environment badge resolve to "serving from N healthy" vs a
failover, depending on resilience.

### Who manages the database and its replication?

It depends on the workload type — and Trellis distinguishes two:

- **Provider-managed data** (e.g. a managed relational DB): the provider runs replication and failover;
  Trellis provisions it to your posture (multi-AZ at high criticality) and observes its health.
- **Self-run stateful clusters** (brokers, search, quorum stores): Trellis models these as a **quorum
  roll-up** — all nodes healthy = Converged, a majority serving = Degraded, a minority = **Unavailable**
  (quorum lost). Select the broker in the simulator and "Fail node" twice to watch 3/3 → 2/3 → 1/3.

Two more things the spec is firm about:

- **Backup ≠ HA.** Replication protects against *infrastructure* failure but faithfully replicates a
  corruption or a `DROP TABLE`. Backup / point-in-time-restore protects against *logical* error. A C0
  service provisions **both**, via a Data Protection battery whose cadence and retention are derived from
  criticality.
- **Live migrations choose a path, not a jump.** Moving a live datastore is *replicate → verify → atomic
  cutover* for high criticality (zero-loss, expensive) or *backup → restore → cutover* for the
  downtime-tolerant tiers — never an unsafe instantaneous redefinition.

## Security

### How does security actually work?

The model has exactly **four action classes**, and one law: *desired state changes only through Author;
everything else converges toward it.*

| Class | Changes | Who | Gate |
|---|---|---|---|
| **Author** | desired state (the manifest) | humans | always — plan + proof + approval |
| **Converge** | reality toward desired | the reconciler | pre-authorized: the human approved the *envelope* |
| **Observe** | nothing | anyone in scope | none (read-only) |
| **Break-glass** | reality, outside the gate | elevated humans | emergency only — time-boxed, dual-control, logged |

The mechanics that make it real:

- **The approved plan *is* the capability.** Approval mints an **ephemeral credential scoped to exactly
  the diff** — the actuator does what the proof says and nothing else, then the credential expires. An
  independent mint authority re-derives that scope from the signed generation, with a re-validate against
  observed state immediately before apply.
- **Break-glass buys time, not permission.** Above a boundary scope the second approver must be *outside*
  the requesting team. When the window expires the reconciler doesn't auto-revert (that would re-open the
  bleed) — it **freezes** the touched resources and raises a mandatory **ratify-or-revert** through the
  normal Author gate. The simulator models this exactly.
- **The root of trust is external.** Bootstrap is a one-time, dual-controlled ceremony seeded by the
  provider root + a human IdP, which then seals itself. The control plane runs on workload identity, not
  standing secrets.
- **Audit lives outside the control plane.** A compromised control plane can't be trusted to log its own
  changes honestly, so every privileged action is written to an external, append-only store.

### What is the "security" lens in the simulator?

A read-only projection (a *View*) of trust/exposure: each resource is tiered **exposed** (internet-facing
edge), **sensitive** (data/stateful crown jewels), or **internal**, and flagged **at-risk** when it's a
third-party dependency (outside your TCB), an exposed surface without per-service isolation, or crown
jewels without compliance coverage.

## Where it fits

### Is this for infra/DevOps, or does it deploy my services too?

It's the **platform / infrastructure layer.** You declare a **Service** (e.g. "payments-api" at C0) and
Trellis provisions and maintains the ground it runs on — compute, data, networking, identity, certs, DNS,
load balancing, observability. You keep your existing **CI/CD** for application code. The seam is clean:
Trellis *gates* what may run (Governance can require signed images + SBOM + a CVE check) but does not build
your images or execute your deploy pipeline. It governs infrastructure authority; your pipeline governs
your artifact.

So: it supports your services by giving them a declared, healing, owned home — not by replacing the
pipeline that ships their code.

### How does it relate to GitOps, Kubernetes, S3, and Terraform?

- **GitOps — it *is* GitOps.** Git is the desired-state store; a commit is an Author action; the
  **planner runs in CI and posts the plan+proof as the PR check**; **merge is the approval gate**; the
  reconciler pulls the merged manifest. Generation = commit SHA, which is how drift-vs-progress is told
  apart.
- **Kubernetes — a different layer.** Trellis provisions infrastructure; it isn't a workload scheduler. A
  cluster (or what runs on it) is something Trellis can stand up and govern, not something it replaces. Your
  pods schedule on capacity Trellis maintains.
- **S3 — a capability, not a special case.** Object storage is one realization of the **Storage** bucket;
  on AWS that's S3, chosen by the planner from the catalog.
- **Terraform — a possible actuator.** Trellis is provider-neutral at the vocabulary/Structure level and
  talks to a cloud only through a **provider port**. A Terraform/OpenTofu adapter could implement that port;
  Trellis still owns the intent, the proof, the gate, and the standing loop.

### Is it really provider-neutral, or is that marketing?

Honestly: **neutral in concept, AWS-first in practice.** The grammar, Topology, and Structure are
expressed against a provider-neutral **capability contract** (twelve buckets: Compute · Networking ·
Storage · Data · Identity · Secrets · Certs · DNS · Delivery/CI · Traffic/LB · Observability ·
Governance). Today one provider is implemented richly (AWS); others are documented crosswalks built on
demand. Adding a provider is *additive* (a new adapter against the same contract, parity-gated), never a
rewrite — but don't expect three live clouds on day one.

### What integrations does it have, or will it have?

- **Git** as the desired-state store and gate (any Git host).
- **An external append-only audit store** for every privileged action (outside the control plane).
- **Your observability / BI tools.** The **Views** layer computes projections/rollups (cost, health/SLO,
  security posture, compliance, incident) along the ownership tree and **emits to the tools you already
  use** for rendering and ad-hoc query — it deliberately does *not* reimplement a query engine or
  dashboarding.
- **A secrets store** (manifests reference secrets, never hold values).
- **The provider** itself (AWS first) for compute/data/identity/etc.

### What about "batteries" outside your domain — third-party things you don't run?

Two disciplined moves, both visible in the model:

- **External workloads are first-class but observe-only.** A third-party SaaS (a payments API, an
  observability vendor) is a node in the dependency/Weave graph: Trellis governs the *integration* to it
  (an egress edge, a Governance allow, a consumed API key) and includes it in criticality propagation (its
  outage affects you) — but its state is **observed, never reconciled.** Trellis can't heal Stripe, and
  it doesn't pretend to. You can see this as the "SAAS · observe-only" node in the topology.
- **Fence the scope; emit to existing tools.** Wherever a capability is better served by something that
  already exists (dashboards, BI, a vendor's own console), Trellis **governs admission and emits signals**
  rather than rebuilding the tool. The point is to be the system of *authority and proof*, not to absorb
  the whole ecosystem.

## Cost, incidents, and change

### How is cost handled — is "budget" just a planner input?

It's both an input *and* a live signal. Spend **attributes up the ownership tree** (resource → service →
environment). Billed cost is observed like any other signal, so **cost drift** (billed vs planned) is
detected the same way config drift is, and a **budget-breach** either alerts or — by posture — **blocks
further provisioning** until it's reconciled. The simulator's cost lens, the Owners tab, and the "Cost
spike" injection demonstrate the whole loop.

### What happens to incidents — the middle ground between self-heal and break-glass?

A `Stalled` / `Degraded` / `Frozen` resource routes by **ownership tree + criticality** to an on-call
owner, and surfaces as an **incident view**: the blast-radius rollup joined to the time-correlated audit
log (actions and observability are duals). Runbooks bind to failure classes; break-glass is invocable from
the incident surface, scoped to the blast radius.

### What about org changes — re-orgs, M&A?

The org tree isn't static, so each change is itself a gated, proof-carrying transition: **ownership
transfer** re-parents a subtree (atomically re-pointing delegation, credential scoping, repo ownership,
and criticality propagation); **team split/merge** re-partitions envelopes and on-call routing; and
**M&A** federates two sealed roots (or migrates one under the other) as an explicit, gated trust-merge —
the one deliberate relaxation of the single-root assumption.

## Honesty

### Is this real, or a demo?

Today it's a **specification plus this client-side simulator** — there is no production AWS implementation
yet. But the simulator isn't a slideshow: the engine implements the real state model, planner objective,
reconcile loop, breakers, ownership rollups, cost signal, and self-upgrade, and the failure dynamics are
genuine. It's built so the same engine could grow into the real thing behind the provider port.

### What's deferred or weakest right now?

- **Planner depth.** Today it selects + composes + parameterizes from a catalog with heuristic leaf
  sizing — not a true optimizer. Real bounded leaf optimization is later work.
- **One provider.** AWS first; everything else is a mapped crosswalk, not a live integration.
- **Catalog generation is human-authored.** Novel blueprints are an offline, reviewed, catalog-time
  activity — never invented on the request path.

If a claim here sounds too clean, assume it's the *design intent* and check the spec section it links to —
the full specification is the source of truth, and it's a living document.
