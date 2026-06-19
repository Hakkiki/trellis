---
title: Architecture
description: The provider-port seam, the engine, and how the simulator becomes the real thing.
---

## The one idea: the provider port

The whole codebase hinges on a single seam. The control loop — state model, reconciler, planner — is
written **once, provider-neutral**, and talks only to a `Provider` interface.

```
   CONTROL LOOP  (write once)
   posture → planner → structure
   state = f(desired, observed, health)
   reconciler (converge toward desired)
            │  provider.Provider  (the port)
            │  apply / delete / observe / observeAll
      ┌─────┴─────┐
   SimCloud      AwsProvider
   (today)        (later)
```

Going from demo to production is **"add a provider," not "rewrite the core."** This is the spec's
provider strategy (§15) used as the primary architectural lever from day one.

## Two implementations of the loop

| Implementation | Language | Where it runs | Purpose |
|---|---|---|---|
| **Reference spine** | Go | CLI / tests | the canonical semantics, with tests proving them |
| **Simulator engine** | TypeScript | the browser (this site) | the full-blown interactive showcase |

The TypeScript engine is a *faithful mirror* of the Go reference, so the showcase and the canonical
implementation cannot silently diverge. Both encode the same `state = f(desired, observed, health)`,
the same provenance-based drift detection, and the same reconcile rules.

## The simulator engine (this site)

- `sim/model.ts` — provider-neutral domain types (desired/observed projections, manifest, generations).
- `sim/state.ts` — the State model: a pure function, never stored.
- `sim/provider.ts` — the capability-contract port.
- `sim/sim.ts` — the in-memory cloud with **real dynamics** (apply latency, node failure, drift, stale telemetry).
- `sim/planner.ts` — a rung-0/1 planner: Posture → blueprint → plan that *is a proof*.
- `sim/reconcile.ts` — the converge-toward-desired loop; **Converge actions only**, never Author.
- `sim/engine.ts` — orchestrates the whole loop and the audit trail.
- `sim/store.ts` — **IndexedDB** persistence: the spec's desired-state store and observed-state history,
  realized in the browser so a session survives a reload.

## Why GitHub Pages works

The simulator is a static site (Astro + Starlight + shadcn). The simulation runs entirely client-side
in TypeScript, with IndexedDB for state — **no backend to deploy.** The production control plane is a
separate target (the same model, driving a real provider, running in a customer account); only the
public simulator lives on Pages.
