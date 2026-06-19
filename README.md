# Trellis

**Trellis** is a self-hosted platform for authoring, provisioning, and continuously managing cloud
infrastructure (AWS first). You declare *what you want* as a **Posture**; a deterministic **planner**
compiles it into a concrete **Structure**; a **reconciler** keeps reality matching it — every action
traceable to an explainable plan.

> **Posture → planner → Structure → reconcile loop; manifest-driven; no magic.**

The complete design is in [`docs/`](docs/) — start with [`docs/trellis-spec.md`](docs/trellis-spec.md).
This repository is the build that grows from it.

## Two things live here

| Path | What | Stack |
|---|---|---|
| [`app/`](app/) | The **full-blown simulator + docs site** (deploys to GitHub Pages). Declare a posture, approve a plan, watch the reconciler heal — all client-side, IndexedDB-backed. | Astro · Starlight · shadcn/ui · Tailwind v4 · TypeScript |
| [`model/`, `state/`, `provider/`, `reconcile/`](model/) | The **Go reference spine** — the canonical reconcile semantics with tests proving them. | Go |

The TypeScript engine in `app/src/sim/` is a **faithful mirror** of the Go reference, so the showcase
and the canonical implementation cannot silently diverge. Run `cd app && npm install && npm run dev` for
the simulator, or `go test ./...` for the reference.

## The strategy: one core, simulated first, then real

The whole codebase is organized around a single seam — the **provider port**
([`provider/provider.go`](provider/provider.go)). The control loop (state model, reconciler, and
later the planner and gate) is written **once, provider-neutral**, and talks only to that port.

- The **simulator** is a `Provider` backed by an in-memory fake cloud
  ([`provider/sim`](provider/sim)) whose *dynamics are real* — apply latency, failures, drift, stale
  telemetry.
- The **real platform** is the *same* loop driving a future `aws` provider against a real cloud.

That is what "a simulator that can turn into the real thing" means concretely: you don't rewrite the
core to go from demo to production — you implement one more provider behind the port. See
[`ARCHITECTURE.md`](ARCHITECTURE.md), including how the browser UI and GitHub Pages fit.

## What's built so far — the reconcile spine (spec §20, step 1)

```
go test ./...      # state derivation, drift detection, self-heal, fail-safe, break-glass
go run ./cmd/trellisctl   # watch the loop converge, correct drift, and self-heal in the terminal
```

| Package | Role |
|---|---|
| [`model`](model) | core domain types — desired/observed projections, manifest, generations |
| [`state`](state) | the State model: `state = f(desired, observed, health)`, derived, never stored (§4) |
| [`provider`](provider) | the capability-contract port (§15) — the sim↔real seam |
| [`provider/sim`](provider/sim) | the simulated cloud with real dynamics |
| [`reconcile`](reconcile) | the continuous converge-toward-desired loop (§9); Converge only, never Author |
| [`cmd/trellisctl`](cmd/trellisctl) | terminal driver for the spine |

Invariants honored already: determinism (pure derivation), *desired state changes only through Author*
(the reconciler never invents desired state), provenance-based drift detection, fail-safe on Unknown,
and break-glass freeze. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full roadmap against the
spec's §20 build sequence.
