---
title: Structure & State
description: What the planner compiles, and the derived live condition of every resource.
---

## Structure — the planner's output

A **Structure** is what the planner compiles a Posture into. It has three facets:

- **Topology** — the containment **tree**: org → account → region → AZ → network boundary → resource.
- **Weave** — the connectivity **graph** drawn over the tree: DNS, load balancing, replication.
- **Substance** — the resource definitions (config/spec).

## State — derived, never stored

The live condition of a resource is **derived**, not authored:

```
state = f(desired, observed, health)
```

a pure, recomputable function. That is "no magic" applied to state: every state is explainable by
showing its inputs. `desired` (spec, version-stamped by its generation) and `observed` (status,
timestamped for freshness) are two **projections** — not states themselves.

### The named states

| State | Meaning |
|---|---|
| **Converged** | matches spec and alive — the goal |
| **Converging** | an *authored* change rolling out |
| **Drifted** | an *unauthored* divergence — the reconciler corrects it |
| **Degraded** | correct but unhealthy → self-heal |
| **Stalled** | can't converge — needs a human |
| **Frozen** | reconciliation suspended (break-glass) — debt outstanding |
| **Unknown** | observation stale/missing — *cannot assert* (fail-safe) |

### Two non-obvious rules

- **Progressing vs Drifted is decided by provenance, not gap size.** Desired state is versioned by
  **generation**: converging *toward generation N* is good; diverging *from N with nothing pending* is
  drift. The simulator demonstrates this directly.
- **Unknown is fail-safe and first-class.** Stale telemetry → Unknown, never assumed-Converged. The
  reconciler holds — it never acts on stale data — with a per-Criticality staleness budget as the
  liveness backstop.
