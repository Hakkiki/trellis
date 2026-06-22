---
title: The reconcile loop
description: The one law, the four action classes, and self-healing.
---

```
solve → PLAN (+ proof) → human approves → apply → reconcile → (drift / change) → re-solve
```

The human-approves-the-plan step is the platform's one gate. Prior approval never carries forward to a
different plan. Self-healing is this loop running continuously instead of once.

## The law

> **Desired state changes only through *Author*; everything else *Converges* toward it.**

Every action is exactly one of four classes, and the class is the authority and the gate:

| Class | Mutates | Who | Gate |
|---|---|---|---|
| **Author** | desired state (the manifest) | humans only | always — plan + proof + approval |
| **Converge** | reality toward desired state | the reconciler | pre-authorized (the approved envelope) |
| **Observe** | nothing | anyone in scope | none (read-only) |
| **Break-glass** | reality, *outside* the gate | elevated human | emergency — time-boxed, dual-control |

The reconciler is the only holder of standing write, bounded to its managed set and the change-kinds
the posture permits. Approval mints an ephemeral, plan-scoped credential: the approved plan is the
capability.

## Break-glass buys time, not permission

When the gate can't run, an operator breaks glass. This is a time-boxed, dual-controlled override that
freezes reconciliation on the touched resources (the Frozen state) and owes a ratify-or-revert debt,
repaid through the normal Author gate. It changes reality temporarily, never desired state.

Drive all of this in the [simulator](/trellis/simulator/): inject drift, fail a node, cut telemetry,
and break glass, then watch the loop respond, with every action landing in the audit trail. The
[specification](/trellis/docs/spec) is the normative version.
