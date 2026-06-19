---
title: Posture & Criticality
description: What a human declares, and the one dial that moves it all together.
---

> **Concept primer** — explains a piece of the model; the normative version is in the [specification](/trellis/docs/spec).

A **Posture** is what a human declares — the desired intent and constraints for an environment,
expressed as four **orthogonal, independently-swappable** axes, each owned by a distinct audience.

| Axis | The question | Owned by |
|---|---|---|
| **Intent** | what is this environment *for*? | requesting team |
| **Resilience** | how must it survive and change? | SRE / ops |
| **Budget** | what may it cost? | owner / finance |
| **Governance** | what is *allowed*? | security / compliance |

**Governance is always a hard constraint** — never traded away. The operator declares which input is
the *objective* and which are *bounds*; Governance is always a hard pre-filter, never an objective term.

## Criticality — the magnitude facet

**Criticality** (C0 = mission-critical → C3 = best-effort) is a **posture preset**: one dial that
expands into a coordinated bundle across the other axes. In the simulator it sets:

- resilience aggressiveness (C0 → multi-AZ, more replicas, larger sizes),
- the default `isolation` granularity (C0 → isolate-per-service; C3 → colocate),
- gate rigor and break-glass scope.

> Precedence is explicit: an operator's explicit `optimize:` declaration overrides the Criticality
> preset, which overrides the system default.

Try it in the [simulator](/trellis/simulator/): switch C0 → C3 and re-plan to see the structure and cost
move together.
