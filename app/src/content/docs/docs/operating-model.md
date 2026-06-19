---
title: "Operating model: boundaries & slicing the control plane"
description: How to pick a division's isolation grain (org / account / VPC / namespace), why the boundary you choose is the blast-radius guarantee you get, and why each division should run its own Trellis instead of one central control plane.
---

The companion to [Why Trellis](/trellis/docs/use-case). That page makes the case for per-division
environments; this one is the *how* — where the boundary goes, why synchronous-only coupling is the
healthy kind, and why the control plane itself gets sliced too.

## The boundary is a choice — and the choice is the guarantee

Trellis does not hard-code where a division's boundary lives. That's deliberate: the boundary is a
**placement decision driven by Criticality**, not a baked-in assumption. A C0 division can earn its own
AWS organization; a C3 internal tool might be fine sharing an account.

But "we don't care where the boundary is" is only true for the *abstraction*. Operationally you care a
great deal, because:

> **Whatever fate a boundary still shares is the blast radius you did not actually eliminate.**

The grain you pick *is* the containment guarantee. They're the same knob.

## The grain ladder

Strongest isolation first. Read the third column as "the blast radius that remains."

| Grain | What's isolated | What's still shared (residual blast radius) | Central governance |
|---|---|---|---|
| **Separate AWS org** | billing, root, SCPs, trust, quotas, control plane | almost nothing | hardest — a multi-root / trust-federation problem |
| **Separate account** (in your OUs) | IAM, quotas/limits, account-level events | the org root + SCPs — which is *good*, that's your lever | **easy** — SCPs + delegated admin (the landing-zone pattern) |
| **Separate VPC** (one account) | network only | IAM, quotas, billing, the account's control plane | medium |
| **k8s namespace** | network policy + RBAC (softly) | the cluster: API server, etcd, node pool, **and the upgrade cycle** | medium |

### Why a namespace fails the blast-radius test

If the reason you're splitting is that a shared service's **upgrade** took everyone down, look at the
last row. Every namespace shares **one cluster control plane and one upgrade cycle.** A cluster upgrade,
an etcd corruption, an API-server outage, or a bad operator rollout takes **all namespaces down at
once.** That isn't isolation — it's the original shared single point of failure wearing a Kubernetes hat,
and the cluster upgrade is the new company-wide change.

Namespaces are a fine answer to a *different* question — density and cost under multi-tenancy. They are
the wrong grain when the goal is **blast-radius containment.**

### The recommendation

- **Default: account-per-division**, grouped into OUs by domain. Strong isolation (separate IAM, quotas,
  blast radius) *and* you keep the central lever (SCPs + delegated admin + the approved-services
  whitelist).
- **Separate org**: reserve for the genuinely highest-isolation cases — strict regulatory separation, or
  a real M&A / divestiture boundary. Strongest wall; gives up easy central governance.
- **VPC-only**: acceptable for *low-criticality* divisions that can live with sharing an account's fate.
  Never for something you split *because* of blast radius.
- **Namespace**: not for this goal.

## Trellis and Kubernetes: where the line is

Kubernetes is the trickiest thing to "slice and manage," for one reason: **Kubernetes is itself a
reconciler.** It has the same closed loop Trellis has — declared state in etcd, controllers driving
reality to match, its own RBAC and god-write. So this is *a reconciler managing a reconciler*, and whether
it works comes down entirely to **where you draw the line between the two loops.**

Draw it like this:

- **Trellis owns the cluster *as a resource*** — its existence, version, node groups, networking,
  pod-identity (IRSA), and the platform add-ons (CNI, CSI, DNS, autoscaler, the GitOps agent). This is
  infrastructure authority.
- **Kubernetes owns what runs *inside*** — Deployments, pods, autoscaling, services. That's workload
  runtime behavior, which Trellis deliberately leaves alone.

Get that boundary right and it's clean: two loops, layered, each authoritative in its own domain. Get it
wrong and you hit the classic failure of every "manage k8s from outside" tool — **two reconcilers
fighting over the same object**, each undoing the other. The rule that prevents it: *Trellis stops at the
cluster API and platform add-ons; in-cluster GitOps (Argo/Flux) owns workloads; they never overlap.*

**Slice at the cluster, not the namespace.** A cluster's control plane, etcd, and upgrade are a shared
fate for *everything in it* — so a namespace-per-division shares the cluster's loop and upgrade, which is
the original single point of failure again. A **cluster-per-division** contains it. (On a managed service
like EKS, AWS runs the control plane and etcd for you — so you don't operate quorum yourself, a real win.)

The two honest costs:

- **Cluster sprawl is the real tension.** N clusters means N node baselines, N add-on stacks, N upgrade
  cadences — exactly the pressure that tempts teams back toward namespaces. Decide it by **Criticality**:
  cluster-per-division where blast radius matters; smaller divisions *may* share a cluster with namespace
  + network-policy isolation, **accepting the weaker guarantee on purpose.**
- **Upgrades are where "infra only" blurs.** Kubernetes removes APIs every minor version, so a cluster
  upgrade can break *workloads*, not just infrastructure. A safe canaried upgrade has to include a
  deprecated-API check — which pokes into workload territory. It's the one genuinely messy seam; budget
  for compat-gating in the upgrade transition. (And keep data *off* the cluster — managed databases, not
  databases-on-k8s — so cluster churn never threatens state.)

In one line: **Trellis manages the cluster; Kubernetes manages what's in it.** Slice at the cluster,
govern the version and add-ons, and let the in-cluster loop own the workloads.

## Synchronous-only coupling is the healthy kind

If divisions talk to each other only **synchronously** — request/response, no shared database, no shared
async bus — they are loosely coupled with **no shared state to corrupt.** A division can fail without
poisoning another's data. In Trellis terms each cross-division call is a **typed sync edge in the Weave**
(route + port) that crosses the containment boundary by design; Trellis provisions and heals those edges.

Two honest notes:

- Sync coupling is a **runtime availability** dependency: if division B is down, A's *calls* to B fail
  right then. But that's contained and recoverable (circuit-break, degrade) — a far healthier failure
  mode than "we all share one service and it died."
- Keep it sync. The moment "sync call to B" quietly becomes "A reads from B's database," you've
  re-introduced shared state and shared fate — the very thing the split was meant to remove.

## Slice the control plane too

Here is the step most designs miss. If shared services are the danger, then **one central Trellis
governing every division is the mother of all shared single points of failure** — it holds standing
god-write across the whole company, and a bad Trellis upgrade would be the same company-wide outage at
the meta-level. **The control plane cannot be exempt from the rule it enforces.**

So each division runs its **own Trellis instance**, against its own accounts, on its own upgrade cadence.
Upgrading one division's control plane — canaried, dual-control, recoverable — **cannot touch** another's.
The thing that enforces containment is itself contained.

This is not a bolt-on. The model already treats the platform as a **Criticality-0 self-environment** that
reconciles itself and is re-bootstrappable from an external seed (meta-DR), and it already calls for
**partitioning the reconciler into a fleet**. Per-division control planes are that partition taken to the
division boundary.

## What stays shared — and why it's safe-shaped

Once the control plane is sliced, the only things still shared are:

- a signed, versioned **catalog** of blueprints + Components (the approved privileged-access service,
  CI/CD, DNS, source control, and the approved cloud services);
- the **org root + SCP guardrails** (the single-root reality);
- the **external append-only audit store.**

The point is that none of these is a live god-write service that can take everyone down. They're
**read-mostly, signed, versioned, and pulled.** The catalog in particular can't become the new SPOF
because:

- entries are signed and versioned, and consumers **pin** them;
- a new catalog version **auto-deploys nowhere** — each division promotes it on its own schedule,
  canaried (the [Promotion](/trellis/promotion) model). A bad publish takes *nobody* down; the division
  that adopts it early blinks and recovers, and the rest simply haven't pinned it yet.

So even the one genuinely shared thing is a **pull-and-promote registry**, not a synchronous-fate
dependency. That's the smallest shared blast radius you can have while still having central governance at
all.

## The same grain decision, one level up

Slice Trellis to match the division boundary:

- **Per-division Trellis + shared catalog/governance** — the sweet spot. The control loop is contained;
  only the signed registry and the SCP rails are shared.
- **One central Trellis** — convenient, but you've rebuilt the SPOF. Avoid it for the same reason you
  avoid namespaces.
- **Per-division Trellis + its own catalog fork** — maximum isolation, loses central governance. Reserve
  for separate-org / M&A / strict-regulatory cases.

## The honest tradeoffs

- **N control planes is N things to run** — but cheap *because Trellis is self-managing* (a C0
  self-environment that reconciles and heals itself), and it's the price of not having a company-wide
  god-write SPOF.
- **Each division needs a clean bootstrap** — its instance earns authority from the external seed; the
  root of trust stays external and sealed.
- **Governance shifts** from "approve every change" to "curate the catalog + set the SCPs." That shift is
  the win, not a cost: enterprise sets the rails, divisions drive, and nobody operates raw cloud *or*
  depends on a central team's control plane being up.

## In one line

**Slice everything with standing write power down to the division; share only what is signed, versioned,
and pulled.** That's the operating model.
