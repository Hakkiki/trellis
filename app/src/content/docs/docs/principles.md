---
title: Principles
description: The twelve convictions that shape Trellis — why the platform is built the way it is, and what it refuses to give up.
---

> **The convictions** — why Trellis is shaped the way it is, in plain language. Not a normative
> reference; the rigor lives in the [specification](/trellis/docs/spec) and its invariants.

Trellis is built on a short list of convictions, not preferences. Each one explains why the platform is
shaped the way it is: why the control plane slices itself, why a plan has to prove itself, why what's
*allowed* can't be traded away. None of it is decoration. Read these twelve and the rest of the system
makes sense — it follows from a few things Trellis won't give up. Each one is a plain claim you could say
out loud, with its reasoning underneath: the same shape as a Trellis plan.

## The twelve

### 1. One team's bad day should stay one team's bad day

A routine, change-managed upgrade to a shared service shouldn't be able to take down the whole company.
But it does, over and over, because everyone leans on the same thing. So Trellis makes containment the
spine, not an afterthought. Slice the blast radius per division, and a failure can't cross a boundary it
has no business crossing. One division's worst day stays one division's.
([See it contained vs. company-wide →](/trellis/blast-radius))

### 2. Two good states can have no safe road between them

A target only has to be valid at the end. A path has to keep availability, your data, and your SLOs true
at every step along the way. A change can be unsafe even when both ends are flawless. You don't redefine a
live database in place; you stand up the new one, replicate, cut over, then retire the old. So Trellis
plans the road, not just where it ends: ordered, reversible, gated steps, each carrying its own undo.

### 3. The boundary you pick is the blast radius you keep

You don't choose containment in the abstract. You choose it the moment you decide where the wall goes. A
separate account, a shared VPC, a Kubernetes namespace — each one leaves a different fate still shared,
and whatever a boundary still shares is the blast radius you didn't actually eliminate. The grain is the
guarantee. Same knob. ([Where the boundary goes →](/trellis/docs/operating-model))

### 4. The control plane obeys the rule it enforces

If shared services are the danger, then one central control plane governing every division is the biggest
single point of failure in the company. It holds standing write across all of it. So Trellis slices
itself too: each division runs its own instance, on its own upgrade cadence, against its own accounts.
The thing that enforces containment has to be contained.

### 5. Only a human moves the goalposts

Desired state changes through exactly one door: a human authoring intent. Everything else only moves
reality toward that intent. The [reconciler](/trellis/docs/reconcile) holds the line, but it never decides
where the line goes. The machine takes the relentless part — watching, correcting, holding reality
steady. You keep the part that needs judgment: what should be true in the first place.

### 6. Every change carries its own proof

A plan is an argument, not a promise. Every resource in it traces to a reason — why it exists, and what
authorized it — so the plan is its own proof. You approve the reasoning, not just the result. No magic:
nothing reaches your cloud that the plan can't explain.

### 7. A plan that can't be built tells you why

When what you asked for won't fit — the budget can't buy active-active, or the constraint won't hold —
Trellis doesn't quietly ship something close and hope you don't notice. The plan fails loudly, names the
constraint that's binding, and shows you the price of yes: raise the budget by $X, and active-active
becomes feasible. A tool that papers over the impossible is one you can't trust with the possible.

### 8. Governance is a wall, not a dial

You trade cost against resilience, size against budget. Those are real trade-offs, and they're yours to
make. What's *allowed* is not one of them. Governance runs first and throws out every disallowed plan
before cost or speed get a vote. It's never a line item you can trade down for a cheaper answer. Some
limits are walls, not dials. You build inside them. You don't haggle with them.

### 9. Breaking glass buys time, never permission

The gate can't run and something's on fire, so you break glass: a time-boxed, dual-controlled override
that changes reality right now. It freezes reconciliation on what it touched and owes a debt — ratify the
change through the normal gate, or revert it. Break-glass buys you time to act. It never hardens into
permission, and it never moves desired state.

### 10. You set how much it matters; the system sets the rest

You declare four things — what it's for, how it must survive, what it may cost, what's allowed — and each
one stays independent, owned by the people who should own it. Then you turn one dial,
[Criticality](/trellis/docs/posture), and the rest moves together: a C0 service earns multi-AZ, more
replicas, and tighter isolation; a C3 tool colocates and stays cheap. Say once how much it matters, and
the structure and the bill move as one.

### 11. A proof nobody can read is magic by another name

A plan that's a proof fails the instant you can't read it. An unreadable proof asks you to trust it
blindly, which is the one thing the model exists to kill. So legibility is a correctness property here,
not a polish item: every plan opens with a one-line headline and honest detail underneath. If the person
approving can't follow the argument, the gate never really ran.

### 12. Self-service shouldn't mean self-operate

Self-service usually means handing a team raw cloud and wishing them luck. Trellis gives each division its
full stack — source control, CI/CD, secrets, DNS, privileged access — provisioned and self-healed for
them, with nothing to install and no cloud to operate. The enterprise governs lightly: curate a vetted
catalog, set the guardrails, and let each division declare a posture and drive. Set the rails; let them
drive.

## Where to go next

- **[The case](/trellis/docs/the-case)** — the three-minute version of the problem these convictions answer.
- **[The specification](/trellis/docs/spec)** — the normative source of truth, and the 19 invariants that
  make each conviction a rule a builder can't break.
- **[The simulator](/trellis/simulator/)** — feel the loop these principles describe: declare, plan,
  approve, reconcile, fail, heal.
