---
title: Architecture
description: The provider-port seam, the engine, and how the simulator is organized.
---

The source of truth is the [specification](/trellis/docs/spec), a living document that co-evolves with
this simulator. The simulator implements the spec, and building it is partly how the spec gets refined.

## The provider port

The whole engine hinges on a single seam. The control loop — state model, reconciler, planner — talks
only to a `Provider` interface.

```
   CONTROL LOOP  (provider-neutral)
   posture → planner → structure
   state = f(desired, observed, health)
   reconciler (converge toward desired)
            │  Provider  (the port)
            │  apply / delete / observe / observeAll
      ┌─────┴─────┐
   SimCloud      (a real cloud, later)
   (today)
```

Going from demo to production is "add a provider," not "rewrite the core." That is the spec's provider
strategy (§15) used as the primary architectural lever. The corollary holds firm: the
Frame/Cell/Resource grammar is an ontology, not an engine. Trellis builds concrete controllers for the
fixed cloud levels, never a generic recursive interpreter.

## The engine (`app/src/sim/`)

- `model.ts` — domain types: desired/observed projections, manifest, generations, workload lifecycle.
- `state.ts` — the State model: `state = f(desired, observed, health)`, pure and recomputable.
- `provider.ts` — the capability-contract port.
- `sim.ts` — the in-memory cloud with real dynamics (apply latency, failure, drift, stale telemetry).
- `planner.ts` — Posture → blueprint → a plan that is a proof; solves the objective program;
  Governance is a hard pre-filter.
- `reconcile.ts` — the converge-toward-desired loop; Converge actions only, never Author.
- `engine.ts` — orchestrates the loop and the audit trail; incidents.
- `fleet.ts` — the promotion pipeline (dev → staging → prod).
- `store.ts` — IndexedDB persistence (the spec's desired-state store and observed-state history).

## Why GitHub Pages works

The engine runs entirely client-side in TypeScript, with IndexedDB for state, so there is no backend
to deploy. The Astro build produces a static site that a GitHub Actions workflow publishes to Pages. A
production control plane would be a separate target — the same model driving a real provider in a
customer account — not on Pages.
