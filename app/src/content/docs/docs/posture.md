---
title: Posture & Criticality
description: What a human declares, and the one dial that moves it all together.
---

A **Posture** is what a human declares: the desired intent and constraints for an environment. It has
four axes, each independently swappable and each owned by a distinct audience.

| Axis | The question | Owned by |
|---|---|---|
| **Intent** | what is this environment *for*? | requesting team |
| **Resilience** | how must it survive and change? | SRE / ops |
| **Budget** | what may it cost? | owner / finance |
| **Governance** | what is *allowed*? | security / compliance |

Governance is always a hard constraint, never traded away. The operator declares which input is the
objective and which are bounds; Governance stays a hard pre-filter, never an objective term.

## Criticality — the magnitude dial

Criticality (C0 = mission-critical through C3 = best-effort) is a posture preset: one dial that
expands into a coordinated bundle across the other axes. In the simulator it sets:

- resilience aggressiveness (C0 means multi-AZ, more replicas, larger sizes),
- the default `isolation` granularity (C0 isolates per service; C3 colocates),
- gate rigor and break-glass scope.

Precedence is explicit. An operator's explicit `optimize:` declaration overrides the Criticality
preset, which overrides the system default.

Try it in the [simulator](/trellis/simulator/): switch C0 to C3 and re-plan to see the structure and
cost move together.

## Cost without losing parity

Lower environments cost less by parking idle capacity, not by shrinking the shape, so dev stays
prod-like while still saving money. Two utilization levers (`elasticity` for stateless compute,
`dormancy` for stateful services) realize the Budget objective without touching the Resilience shape. See
[Cost & parity](/trellis/docs/cost-and-parity).

The [specification](/trellis/docs/spec) is the normative version of all of this.
