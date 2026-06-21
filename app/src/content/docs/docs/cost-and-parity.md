---
title: "Cost & parity — elasticity and dormancy"
description: Why cost is cost-effectiveness (a continuously reconciled property), not a one-time optimization — and how Trellis lets dev and staging cost less without losing prod parity, via two utilization levers (elasticity for stateless, dormancy for stateful), the AWS service split, and the guardrails that keep determinism and consistency intact.
---

> **Applied decision & guidance** — extends and applies the [specification](/trellis/docs/spec) (the source of truth); not itself normative. The first engine slice is built; what is and isn't — see [Status](#status-what-the-engine-implements).

The business always wants to shut down unused compute and run dev cheaper than prod. Engineers always
need to test against a **prod-like** environment. These pull in opposite directions only if you save
money by making lower environments **smaller**. Trellis takes a different position.

## Cost-effectiveness, not cost optimization

"Cost optimization" is a verb sold as a noun. You can *run* an optimization; you cannot *be* optimized and
walk away. Spend drifts off the moment demand, prices, or business priorities move — and they never stop
moving — so an "optimized" environment is unoptimized by next week. Selling the operation as a delivered
state is the marketing sin. Trellis is in the business of **cost-effectiveness: a property held
continuously, not a saving banked once.**

This is the same argument Trellis makes about everything else. A desired state decays; that is *why* there
is a reconcile loop and not just a planner. Cost is no exception — it is one more property the loop must
**hold against drift**, with disturbances (demand spikes, price changes, a new business driver) that never
quit. Optimization is **open-loop** — solve once, leave. Effectiveness is **closed-loop** — track a moving
setpoint, reject disturbances. Open-loop control of a system with disturbances is *guaranteed* to drift
off; that drift is exactly what "we optimized your spend 30%" quietly becomes.

**Effective needs a denominator.** Effective relative to *what?* — value delivered: SLOs, throughput,
revenue. Pure cost *minimization* is seductive because it drops the denominator (cheaper is always
"better" if you never say better *at what*), and that is precisely why it is wrong. Put the denominator
back and the optimum **moves**: on Black Friday the cost-effective act is to spend *more*, immediately. A
system tuned to minimize cost gets that catastrophically backwards. Cost-effectiveness is a ratio you hold
while *both* terms move under you — non-stationary by nature, never "done."

**Over-optimization eats the slack you need to respond.** The headroom you cut to look optimal is the same
option-value that absorbs the next business driver. Optimize hard enough and you *lower* effectiveness,
because you optimized away the ability to react. Effectiveness has to price in the option to move.

### What this means for the engine today — honestly

The levers in the rest of this page are, right now, the **static, plan-time** version — the floor of the
idea, not the finished one:

- the planner's `minimize-cost` objective solves **once**, at plan time;
- the elasticity/dormancy tiers are fixed **by environment** (dev = aggressive), not driven by observed
  demand — a label is not a loop;
- the only continuously cost-aware thing in the model, **cost-drift detection** (§13, billed vs planned),
  *observes and flags* but never **regulates**: it sees that you've drifted off the setpoint, but it
  neither corrects toward it nor tracks the setpoint as it moves.

Making this honest is a model change, not a tuning pass. Cost-effectiveness becomes a **reconciled
property**: (1) a **value/outcome term** in the loop so "effective" has a denominator; (2) the cost
setpoint treated as a **live Posture input** that moves with business drivers, not a static budget; and
(3) the tiers driven by **observed demand**, not an env label. Until then, read "savings" on this page as
the *plan-time estimate* it is.

## The position: parity of *shape*, savings from *utilization*

Make dev cheaper by shrinking its topology — fewer replicas, one region, `single` resilience — and you
get the classic parity gap: dev can never exhibit prod's failure modes (replication conflicts,
multi-region latency, failover), so bugs hide until prod. The savings and the parity trade directly
against each other.

Instead, keep the **desired shape identical across environments** — same replica counts, same regions,
same `resilience` — and take the savings from **not running the full shape while nobody is using it**.
Lower environments burst to the prod-like footprint when a test actually exercises them, then settle back
toward zero when idle. You get parity of *capability* and savings from *duty cycle*. dev's database is
not a *smaller* database; it is the *same* database, asleep.

What differs across environments is therefore **not the shape** but **how eagerly we park idle
capacity** — a single new concern that realizes the **Budget** objective without touching the
**Resilience** shape. (See the four orthogonal axes in [Posture & Criticality](/trellis/docs/posture).)

## Two levers, one vocabulary

Idle capacity comes in two flavours, so there are two levers — deliberately sharing the **same three-tier
scale** so there is one idea to learn, applied twice:

| Lever | Governs | Mechanism | Tiers |
|---|---|---|---|
| **`elasticity`** | stateless compute | horizontal scale via ASG / Karpenter, floor to zero | `aggressive` · `balanced` · `conservative` |
| **`dormancy`** | stateful services | pause compute, keep durable storage | `aggressive` · `balanced` · `conservative` |

## The class boundary is already in the engine

Which lever applies to a resource is **not a new judgement** — the engine already draws the line. A
resource "holds state" exactly when (`engine.ts`):

```ts
const sensitive = cell === "data" || lifecycle === "stateful";
```

So: **`sensitive === false` → elasticity class; `sensitive === true` → dormancy class.** Every kind the
planner emits lands unambiguously on one side:

| Kind | cell | lifecycle | `sensitive` | Class |
|---|---|---|---|---|
| `load-balancer` | edge | service | no | **Elasticity** |
| `compute` | app | service | no | **Elasticity** |
| `batch-job` | app | job | no | *ephemeral — zero-when-idle by nature* |
| `external-saas` | edge | external | n/a | *not provisioned — no lever* |
| `managed-relational-db` | data | service | **yes** | **Dormancy** |
| `stream-broker` | data | stateful | **yes** | **Dormancy** |

Note the subtlety: Trellis's `stateful` *lifecycle* (a self-run quorum cluster) is **not** the whole
dormancy class. A managed DB is lifecycle `service` but still data-bearing. "Holds durable state" is the
right test, and `sensitive` already captures it.

## Explicit position on AWS services

Provider-neutral kinds map to AWS as follows (the [provider crosswalk](/trellis/docs/provider-crosswalk)
holds the full contract). The point of this section is to be **unambiguous about which lever owns which
service**, including the awkward cases.

### Elasticity class (stateless — scale, including to zero)

| AWS service | Position |
|---|---|
| **EKS managed node groups + Karpenter**, EC2 ASGs, ECS/Fargate services | The lever's real target. `aggressive` = min 0, eager consolidation, fast scale-down. |
| **Lambda, App Runner, Fargate-on-demand** | *Already scale-to-zero by platform.* The lever is a **no-op** — Trellis records them as "natively elastic" and does not manage what the platform already does. |
| **ALB / NLB** | **Stays up, never parked.** Elastic by capacity-unit and ~free at idle; "scaling an LB to zero" would break the environment's addressability. Elasticity class, but the floor is never zero. |

### Dormancy class (stateful — pause, never shrink-below-safe)

| AWS service | Position |
|---|---|
| **Aurora / RDS** (`managed-relational-db`) | `aggressive` = Aurora Serverless v2 scale-to-zero (auto-pause/resume) or `rds stop`. **Pause-is-not-delete is mandatory** — storage is the source of truth and never leaves; only the engine sleeps. |
| **DynamoDB on-demand** | *Pay-per-request, idle ≈ $0.* **No lever** (natively elastic), same posture as Lambda. |
| **MSK / self-run Kafka / Amazon MQ** (`stream-broker`) | **Dormancy is all-or-nothing.** A quorum cluster must never drop *below quorum* to save money — that trades consistency for cost. Aggressive dormancy pauses the **entire** cluster when idle; it never runs a partial, under-quorum cluster. (MSK Serverless is the platform-managed realization.) |
| **ElastiCache (Redis / Memcached)** | Dormancy class, with a carve-out: a cache is **reconstructible state, not a source of truth.** It tolerates the *most* aggressive dormancy — **delete-and-recreate**, not just pause — because losing a warm cache costs latency, not correctness. **This is the only place destroying state is safe; it must never be extended to a database.** |

## The tier cascade

Environment sets the **default** tier; the *shape* stays identical across all three (that is the parity
invariant). Only the eagerness to park moves:

| | dev *(aggressive)* | staging *(balanced)* | prod *(conservative)* |
|---|---|---|---|
| **Elasticity** | min 0, fast scale-down, eager consolidation | short warm floor — **still exercises the scale path under load** | warm headroom, disruption budgets, never zero |
| **Dormancy** | DB auto-pause on short idle; cache may be discarded | pause on longer idle — **must still exercise resume** | never pauses; full HA, full quorum |

> Tier is a *default keyed off environment*, but the honest variable is **duty cycle, not env name**. A
> never-idle shared dev saves nothing from `aggressive` (and pays a cold-start tax); an idle-90% seasonal
> *prod* wastes money on `conservative`. So the tier is **overridable per service**, the way Criticality
> already is.

## Guardrails (the failure modes this must avoid)

This lever is only safe if it respects the following invariants. Each is the inverse of a way it
backfires — see the [inversion stress test](/trellis/docs/hardening) for the house style.

1. **`Dormant` is a first-class state, not an outage.** A paused DB has quorum `0/3`; a scaled-to-zero
   service has zero replicas. Today both read as **down**. The reconcile loop must distinguish
   *intentional dormancy* from failure — never page on it, never flag it as drift, and **never auto-wake
   it to reconcile** (that fights the lever and thrashes: wake → idle → pause → looks like drift → wake).
2. **Parity is an enforced invariant, not a slogan.** The desired *shape* (replicas, regions, resilience)
   must be identical across environments; only the tier may differ. Shrinking a lower environment's
   desired count is **drift** and is flagged — otherwise "more aggressive in dev" silently decays back
   into "smaller in dev," the exact thing this design exists to prevent.
3. **Dormancy pauses; it never shrinks below safe and never deletes durable state.** Quorum is
   all-or-nothing; database storage is untouchable; only reconstructible state (caches) may be discarded.
4. **Resume is data-consistent, not behaviour-identical.** A resumed Aurora has a cold buffer pool,
   recomputed plans, and **dropped connections / rolled-back in-flight transactions.** The "DB went away
   and came back" path is real; it must be a *tested* path (exercised in staging), not one aggressive dev
   pausing trains engineers to ignore until prod's first failover.
5. **Staging is load-exercised, not just parked.** The gate only counts if the scale-up-under-load and
   resume-under-connection-storm paths actually run there. Prod never pauses, so staging is the last place
   to catch a bad wake-up before users do.
6. **Cost stays honest.** Provisioned-max remains the **deterministic ceiling** the budget feasibility
   check is gated on. Duty-cycle savings are a **separate, clearly-labelled estimate** — never the number
   the planner trusts for feasibility. (Note also: Aurora Serverless v2 costs *more per ACU* than
   provisioned, so `aggressive` can *raise* cost on a steadily-busy environment — another reason tier
   follows duty cycle, not env name.)
7. **Resume is guarded against denial-of-wallet.** Scale-from-zero is a cost amplifier a single request
   can trigger; resume must be rate-limited so a prober or attacker can't run up the bill on an aggressive
   environment.

## Status: what the engine implements

The first slice — the two guardrails everything else depends on — is now in the simulator:

- **`Posture` carries `elasticity` and `dormancy` tiers**, and the fleet cascade varies them by
  environment (dev `aggressive` → staging `balanced` → prod `conservative`); `parkClass()` assigns each
  resource its lever from the same `sensitive = cell === "data" || lifecycle === "stateful"` test.
- **First-class `Dormant` state** (guardrail 1): a parked resource (`engine.park()` / `wake()`) derives
  `Dormant` — *before* any health/quorum reading, so a paused DB (quorum 0) or a scaled-to-zero service
  reads parked, not down. The reconciler **holds** on `Dormant`: it never wakes it, never counts it as
  drift, and never trips the blast-radius breaker on it. Parked capacity is a settled steady state.
- **The parity invariant** (guardrail 2): `parityCheck()` compares the desired *shape* across
  environments (excluding the promoted version and the tier), so a lower env that runs a *smaller* shape
  — fewer replicas, a dropped resource — is flagged, while a different release tag is not.

- **The fleet cascade is now a single shape.** dev, staging, and prod share the same Criticality,
  resilience, and regions (the prod topology) and the same provisioned **budget ceiling** — they differ
  only in the version they run and their elasticity/dormancy tiers. The fleet snapshot carries a live
  **`parity`** signal (`parityCheck` over the deployed envs), so a lower env that ever ran a *smaller*
  shape is flagged rather than accepted as a saving.
- **Savings are visible via an expected-cost estimate.** `expectedCost()` discounts a parkable resource's
  bill by its tier (a clearly-labelled duty-cycle estimate), so dev (aggressive) bills less than prod
  (conservative) for the *identical* shape. Per guardrail 6 this is **never** the number feasibility gates
  on — that stays the provisioned ceiling (`manifestCost`).
- **Resume has latency** (guardrail 4): a woken resource warms through a cold-start window (`Converging`)
  before it is live — data-consistent, but not free — and the path is tested.
- **A demand-driven utilization loop.** `engine.autoscale()` runs every tick: it **parks** a parkable
  resource once it has been observed idle past its **tier** threshold (`aggressive` parks quickly,
  `conservative` never — a warm floor) and **resumes** it when demand returns. Parking is no longer an
  env label or a manual call — it's driven by the observed idle signal, the first move from a static tier
  toward a control loop.
- **Cold resume is a tested failure path** (guardrail 4): `engine.coldResume()` brings a resource back
  **Degraded** — dropped connections / cold buffers — and the reconciler must self-heal it. Not a free
  instant wake.
- **The denial-of-wallet guard** (guardrail 7): more than a few resumes in a trailing window is treated
  as **resume thrash** (a flapping signal or an attacker forcing cold starts); the guard **pins the
  resource warm** and alerts, because churn costs more than a warm floor. Surfaced in the snapshot
  (`walletGuard`) and cleared by `resolveWalletGuard()`.
- **A temporal demand model (axis 1, declared half).** `autoscale()` is no longer blind to time: it reads
  the `schedule` on a Job (`schedule.ts` turns it into a recurring demand window on the job's same-Frame
  neighbours) and **pre-warms ahead of predicted demand** and **refuses to park into it** — so the DB
  isn't parked at 11:58 and cold-started by the midnight job. Conservative stays a hands-off warm floor.
- **Right-sizing from observed utilization (axis 2), as a gate-ratified proposal.** `rightsizing.ts`
  recommends the smallest size covering the observed **peak** load + headroom, honouring the binding
  resource and the distribution (never the naive "50% = waste"). `snapshot().rightSizing` surfaces the
  proposal; `acceptRightSizing()` is the owner's gate action that sets a **shared** size override and
  re-plans — so a shrink cascades with parity preserved, and cost drops for the same workload.
- **The value term (axis 3): cost ÷ value served.** `engine.setDemand()` feeds offered demand; the engine
  records how much each Service's *serving* compute actually met (parked/cold/degraded serves nothing),
  Criticality-weighted. `snapshot().value` + `costPerValue` make the headline **cost-vs-value** (not
  numerator-only cost-vs-budget), flag spend that serves nothing as `ineffective`, and the levers consult
  it — the autoscaler won't park a serving Service, right-sizing won't shrink below served demand. Now
  right-sizing for the same workload *measurably* raises effectiveness (lower cost per value).

Effectiveness requires reading three signals **through time** and acting on each, surfacing every decision
to the owner as a proposal (the machine proposes from observed reality; the owner ratifies at the gate —
so the gate declaration stops being a one-time blind guess and becomes a living, evidence-backed
schedule). **Axis 1 now has its declared half; axes 2 and 3 are still open.**

1. **Temporal idle → park (the *when*) — *declared half built*.** Not "idle right now" — a blind point
   sample — but a *model of demand over time*. `autoscale()` now reads the `schedule` Trellis already
   carries on a Job (`schedule.ts` → a recurring demand window on the job's same-Frame neighbours) and
   uses it to **pre-warm before predicted demand** and **refuse to park into** it: it won't park the DB at
   11:58 and cold-start the midnight job, and it wakes a parked DB ahead of the window so it's warm when
   demand lands. A reactive floor still catches unpredicted demand. **Still open:** *inferring* the
   patterns nobody declared — the month-end spike, the weekday ramp — from observed telemetry, rather than
   only honouring declared schedules.

2. **Low utilization → right-size (the *how much*) — *built, as a gate-ratified proposal*.** A resource
   used continuously but at 50% of a `large` isn't idle — it's **overprovisioned**; the action is not park
   but **shrink the SKU**. `rightsizing.ts` recommends the smallest size that still covers the observed
   **peak** load plus headroom, and `engine.setLoad()` feeds it utilization telemetry. It is **not** the
   naive "50% used = 50% waste": it honours the **required headroom** (25% burst room — cut it and the
   next spike breaks SLA), the **binding resource** (it sizes on `max(cpu, mem)`, so 25% CPU at 75% memory
   does *not* shrink), and the **distribution** (it sizes to the windowed **peak**, so a spike blocks a
   shrink the average would wrongly suggest). Crucially it only **proposes** (`snapshot().rightSizing`):
   because the size *is* the parity-held shape, accepting it (`acceptRightSizing()`) is an owner action at
   the gate that sets a **shared** size override and re-plans — cascaded to every environment, parity
   preserved, never a per-env shrink. **Still open:** per-cell granularity (one size covers a Service's
   compute and data today) and driving the proposal from **prod's** utilization in the fleet.

3. **Output vs outcome → the value term (the *what for*) — *built (demand-served, Criticality-weighted)*.**
   Even fully utilized, is the work worth it? This is the **denominator** that makes "effective" measurable.
   `engine.setDemand()` feeds the demand offered to a Service; each tick the engine records how much its
   *serving* compute actually met (parked, cold, or degraded compute serves nothing; under-capacity serves
   only what it can), weighted by Criticality so a C0 unit served outweighs a C3 one. The headline is no
   longer numerator-only: `snapshot().value` and `costPerValue` surface **cost ÷ value served**, a service
   serving nothing is flagged **`ineffective`**, and the levers consult it — the autoscaler **won't park a
   service that's serving**, and right-sizing **won't shrink below the demand it's serving**. So
   right-sizing a service that serves the same demand for less money *measurably raises* effectiveness
   (lower cost per value). **Still open:** demand is injected, not yet derived from real traffic/SLOs, and
   value is *quantity* served (an SLO/quality term — "served *well*" — is the natural next refinement); a
   fully-utilized box doing worthless work still isn't caught unless its demand is recorded as low-value.

Across all three the control action is to **regulate** — hold cost-against-value in band as demand,
prices, and business drivers move — **not** to re-run an optimizer on a timer (which would chase the
cheapest point and strip the very slack effectiveness must preserve). The cost setpoint must **move** with
business drivers (Black Friday spends more, on purpose), as an owner-ratified proposal, not a static
budget. All three axes now have a first cut: axis 1 honours declared schedules (pre-warm, don't park into
demand), axis 2 right-sizes from observed peak utilization (gate-ratified), and axis 3 measures **cost ÷
value served** and makes the levers protect it. The system can finally tell *cost-effective* from *cheap* —
the denominator exists. What remains is making the signals **observed rather than injected** (infer demand
patterns and value from real traffic/SLOs, not `setDemand`/`setLoad`/`setIdle`) and letting the cost
**setpoint move on its own** with business drivers. **The loop is closed; the inputs are still hand-fed.**

One smaller, separate gap: **resume-as-failure is coarse** — a cold resume degrades the resource itself;
it doesn't yet model the *clients'* dropped in-flight transactions as a path the calling service must
survive.
