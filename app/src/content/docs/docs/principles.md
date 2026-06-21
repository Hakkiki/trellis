---
title: Principles
description: The twelve convictions that shape Trellis — why the platform is built the way it is, and what it refuses to give up.
---

> **The convictions** — why Trellis is shaped the way it is, in plain language. Not a normative
> reference; the rigor lives in the [specification](/trellis/docs/spec) and its invariants.

Trellis is built on a short list of convictions, not preferences. Each one explains why the platform is
shaped the way it is — why the control plane slices itself, why a plan has to prove itself, why what's
*allowed* can't be traded away. None of it is decoration. Read these twelve and the rest of the system
stops reading as a pile of features and starts reading as the consequence of a few things Trellis refuses
to give up.

## The twelve

### 1. One team's bad day should stay one team's bad day

A routine, change-managed upgrade to a shared service shouldn't be able to take down the whole company —
but it does, constantly, because everyone leans on the same thing. Trellis treats **containment as the
spine**, not a feature bolted on after. Slice the blast radius per division, so one division's worst day —
or its upgrade — can't reach another's. ([See it contained vs. company-wide →](/trellis/blast-radius))

### 2. Two good states can have no safe road between them

A target only has to be valid at the end; a *path* has to keep availability, data integrity, and your
SLOs true at every step in between. A change can be unsafe even when the before and after are both
flawless — you don't redefine a live database in place, you stand up the new, replicate, cut over, retire
the old. So Trellis plans the **road, not just the destination**: ordered, reversible, gated steps, each
carrying its own undo.

### 3. The boundary you pick is the blast radius you keep

You don't choose containment in the abstract; you choose it the moment you decide where the wall goes. A
separate account, a shared VPC, a Kubernetes namespace — each leaves a different fate still shared, and
whatever fate a boundary still shares is the blast radius you didn't actually eliminate. The grain *is*
the guarantee. Same knob. ([Where the boundary goes →](/trellis/docs/operating-model))

### 4. The control plane obeys the rule it enforces

If shared services are the danger, then one central control plane governing every division is the mother
of all shared single points of failure — it holds standing write across the entire company. So Trellis
slices itself too: each division runs its own instance, on its own upgrade cadence, against its own
accounts. The thing that enforces containment has to be contained.

### 5. Only a human moves the goalposts

Desired state changes through exactly one door — a human authoring intent. Everything else only converges
reality *toward* that intent; the [reconciler](/trellis/docs/reconcile) holds the line but never decides
where the line goes. The machine carries the relentless part — watching, correcting, holding reality
equal — and you carry the part that needs judgment: what should be true in the first place.

### 6. Every change ships with its own proof

A plan isn't a promise, it's an argument. Every resource in it traces to a reason — why it exists, what
authorized it — so the plan is its own proof, and a human approves the **reasoning**, not just the result.
No magic: nothing lands in your cloud that the plan can't explain.

### 7. A plan that can't be built tells you why

When what you asked for won't fit — the budget can't buy active-active, the constraint won't hold —
Trellis doesn't quietly ship something close and hope you don't notice. The plan **fails loudly**, names
the binding constraint, and shows you the price of yes: *raise the budget by $X and active-active becomes
feasible.* A tool that papers over the impossible is one you can't trust with the possible.

### 8. Governance is a wall, not a dial

You trade cost against resilience, size against budget — real trade-offs, yours to make. What's *allowed*
is not on that table. Governance is a hard pre-filter applied **before** anything gets optimized, never a
term you can trade down for a cheaper plan. Some constraints are walls: you build inside them, you don't
negotiate with them.

### 9. Breaking glass buys time, never permission

When the gate can't run and something's on fire, an operator breaks glass — a time-boxed, dual-controlled
override that changes reality right now. It freezes reconciliation on what it touched and owes a debt:
ratify it through the normal gate, or revert. Break-glass buys you **time to act**; it never quietly
hardens into permission, and it never moves desired state.

### 10. You set how much it matters; the system sets the rest

You declare four things — what it's for, how it must survive, what it may cost, what's allowed — and they
stay independent, each owned by the people who should own it. Then you turn one dial,
[Criticality](/trellis/docs/posture), and the rest moves together: a C0 service earns multi-AZ, more
replicas, tighter isolation; a C3 tool colocates and stays cheap. One statement of how much this matters,
and the structure and the bill move as one.

### 11. A proof nobody can read is magic with better manners

A plan that's a proof fails the instant a human can't read it — an unreadable proof is exactly the opaque
"just trust it" the whole model exists to kill. So **legibility is a correctness property** here, not
polish: every plan leads with a one-line headline and honest drill-down. If the person approving can't
follow the argument, the gate didn't really run.

### 12. Self-service shouldn't mean self-operate

"Self-service" usually means handing a team raw cloud and wishing them luck. Trellis gives each division
its full stack — source control, CI/CD, secrets, DNS, privileged access — provisioned and self-healed for
them, with nothing to install and no cloud to operate. The enterprise governs lightly: curate a vetted
catalog, set the guardrails, and let divisions declare a posture and drive.

## Where to go next

- **[The case](/trellis/docs/the-case)** — the three-minute version of the problem these convictions answer.
- **[The specification](/trellis/docs/spec)** — the normative source of truth, and the 19 invariants that
  make each conviction a rule a builder can't break.
- **[The simulator](/trellis/simulator/)** — feel the loop these principles describe: declare, plan,
  approve, reconcile, fail, heal.
