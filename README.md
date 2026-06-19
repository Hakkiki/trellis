# Trellis

**Trellis** is a self-hosted platform for authoring, provisioning, and continuously managing cloud
infrastructure (AWS first). You declare *what you want* as a **Posture**; a deterministic **planner**
compiles it into a concrete **Structure**; a **reconciler** keeps reality matching it — every action
traceable to an explainable plan.

> **Posture → planner → Structure → reconcile loop; manifest-driven; no magic.**

## Source of truth

The **specification and docs in [`docs/`](docs/) are the source of truth** — start with
[`docs/trellis-spec.md`](docs/trellis-spec.md). It is a **living document**: it has not necessarily
reached final form, and it co-evolves with the simulator as we figure things out. When the simulator and
the spec disagree, the spec wins — and when the simulator teaches us something, the spec gets updated.

## The simulator ([`app/`](app/))

A full-blown, **client-side simulator + documentation site** that deploys to GitHub Pages — no backend.
Declare a posture, read the plan's proof, approve it, then watch the reconcile loop converge and
self-heal as you inject drift, failures, outages, and break-glass.

- **Live:** https://hakkiki.github.io/trellis/
- **Stack:** Astro · Starlight (docs) · shadcn/ui · Tailwind v4 · TypeScript · IndexedDB
- **Run it:** `cd app && npm install && npm run dev` · **Test:** `npm run test` · **Build:** `npm run build`

The cloud is *simulated* but the **dynamics are real** (apply latency, node failure, out-of-band drift,
stale telemetry). The engine is organized around a single seam — the **provider port**
([`app/src/sim/provider.ts`](app/src/sim/provider.ts), spec §15): the control loop talks only to a
`Provider`, so the same loop that drives the in-memory `SimCloud` today could later drive a real cloud.

## What the simulator covers today

- **Posture → plan that is a proof** — a deterministic planner that solves the objective program
  (minimize-cost / maximize-resilience within budget), with Governance as a hard pre-filter and loud
  failure on the binding constraint.
- **The gate** — approve = mint a scoped credential (audited).
- **The reconcile loop** — `state = f(desired, observed, health)`, provenance-based drift, self-heal,
  fail-safe on Unknown, break-glass freeze/ratify, and a circuit breaker that trips to Stalled with an
  incident surface.
- **Workload archetypes** — Service (reconcile-and-hold), Job (run-to-completion), External (observe-only).
- **Transitions** — re-plan/re-approve rolls out as expand-contract.
- **Promotion** — an immutable version advancing dev → staging → prod, re-planned per environment.
- **A CSS-3D topology**, FinOps view, audit trail, and click-through proof.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how it's organized and what's still missing.
