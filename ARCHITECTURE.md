# Trellis — architecture & build roadmap

This document explains how the code is organized, why it is organized that way, and the order it grows
in. It assumes you've read [`docs/trellis-spec.md`](docs/trellis-spec.md) (start at its Primer, then
§17 Invariants → §18 Architecture → §20 Build sequence).

## The one idea: the provider port

Everything hinges on a single seam.

```
        ┌─────────────────────────────────────────────┐
        │  CONTROL LOOP  (provider-neutral, write once) │
        │                                               │
        │   posture → planner → structure               │
        │   state = f(desired, observed, health)        │
        │   reconciler (converge toward desired)        │
        │   gate · mint · audit                         │
        └───────────────────────┬─────────────────────┘
                                 │  provider.Provider  (the port)
                                 │  Apply / Delete / Observe / ObserveAll
              ┌──────────────────┼──────────────────┐
              ▼                                      ▼
     provider/sim  (today)                   provider/aws  (later)
     in-memory fake cloud,                   real cloud, real IAM/STS,
     real dynamics                           same loop above the line
```

The control loop never speaks to a cloud directly. It speaks to `provider.Provider`. The simulator and
the real platform are two implementations of that one interface — so going from demo to production is
**"add a provider," not "rewrite the core."** This is the spec's provider strategy (§15) used as the
primary architectural lever from day one.

A non-negotiable corollary (spec, "How to read this"): the Frame/Cell/Resource grammar is an
**ontology, not an engine**. We build concrete controllers for the *fixed, known* cloud levels. We do
**not** build a generic recursive interpreter. The grammar keeps us coherent; it is not the runtime.

## Package layout

| Package | Responsibility | Spec |
|---|---|---|
| `model` | Domain types: the desired and observed **projections**, the **manifest**, **generations**. Provider-neutral (capability-intent kinds, not `aws_*`). | §3, §4, §11 |
| `state` | The **State model** — `state = f(desired, observed, health)`, a pure recomputable function. Provenance (generations) separates authored progress from drift. | §4 |
| `provider` | The **capability-contract port** — the sim↔real seam. | §15 |
| `provider/sim` | The **simulated cloud**: in-memory, but apply has latency, nodes fail, telemetry goes stale, changes drift. | buildability "thin slice" |
| `reconcile` | The **reconcile loop**: observe → derive state → converge gaps within the envelope. **Converge actions only** — never Author. | §7, §9 |
| `cmd/trellisctl` | Terminal driver for the spine. | §20 step 1 |

## Three deployment targets, one core

The same Go core compiles to three places — this is the answer to "Go is a backend, the simulator is a
UI, how does that fit GitHub Pages?"

| Target | Build | Where it runs | Purpose |
|---|---|---|---|
| **CLI** | `go build ./cmd/trellisctl` | a dev terminal | tests, demos, the spine driver (today) |
| **Browser / WASM** | `GOOS=js GOARCH=wasm` | static page (GitHub Pages) | the **public simulator UI**, powered by the *real* core |
| **Native server** | `go build` (server cmd, later) | customer's management account | the **production control plane** against `provider/aws` |

### How the UI and GitHub Pages fit

The "simulator" is two different things that were worth separating:

1. **The behavioral/UX simulator** — the existing [`docs/sim/index.html`](docs/sim/index.html): a
   browser visualization (the **Experience** axis of the spec — the operator's view). This is what
   belongs on GitHub Pages: a static page, no server.
2. **The simulation *core*** — the Go reconcile loop + `provider/sim`. This is the part that "turns
   into the real thing."

They connect without ever needing a server behind GitHub Pages, via **Go → WebAssembly**:

```
   Go core (model + state + reconcile + provider/sim)
        │  compiled with GOOS=js GOARCH=wasm
        ▼
   trellis-sim.wasm  ─────────────►  loaded by index.html on GitHub Pages
        │  exposes step()/inject-drift()/fail-node() to JS
        ▼
   the CSS-3D UI renders the State/topology the *real* loop produces
```

So the browser simulator is driven by the **identical** reconcile loop and State derivation that will
later run server-side against AWS — not a separate JavaScript reimplementation that can drift from the
real behavior. GitHub Pages stays a plain static host (`index.html` + `.wasm` + assets); there is no
backend to deploy. The current `docs/sim/index.html` is a hand-written behavioral mock; the next UI
step is to swap its faked dynamics for calls into the WASM core, keeping its visuals.

(For production the console is *not* on Pages — it talks to the native server over an API. Pages hosts
the public, offline simulator only.)

## Build sequence (spec §20) — status

1. **Core reconcile spine** — desired-state model, generations, drift detection, State model,
   converging against a fixed hand-written manifest. **✅ done (this commit).**
2. **Rung-0/1 planner** — Posture → blueprint select/parameterize → plan+proof, deterministic; then
   rung-2 composition. *(next)*
3. **Gate + GitOps** — planner in CI posts plan+proof; merge = approval; reconciler pulls; show the
   realized resource diff.
4. **Authorization + credential mint + TCB hardening** — four action classes; `authorized-by`
   three-way intersection; independent mint (scope re-derived from signed generation); plan signing;
   reconciler fleet partitioning + kill-switch; catalog signing; external append-only audit. Bootstrap
   (§12) builds alongside.
5. **Transition planning** — two-stage solve (target, then path); migration-pattern catalog;
   reversible gated steps; Data Protection (backup/PITR).
6. **FinOps / Views / incident** — projection layer along the Frame tree; cost-drift loop; alert
   routing + incident surface; reconciler safety (change-freeze + circuit breakers).
7. **Self-upgrade + org-change** — transitions applied reflexively (highest gate).

## Invariants honored by the spine today (spec §17)

- **Determinism** — `state.Derive` is a pure function of its inputs.
- **Desired state changes only through Author** — the reconciler performs *Converge* actions only; it
  never mutates the manifest.
- **Provenance-based drift** — Progressing vs Drifted is decided by generation, not gap size.
- **Fail-safe on Unknown** — stale telemetry → `Unknown`; the reconciler holds, never acts on stale
  data (with a staleness budget as the seed of the liveness backstop).
- **Break-glass freeze** — a frozen resource suspends reconciliation (the debt is repaid via Author).

Hardening invariants (TCB independent verification, signed plans/catalog, external audit) arrive with
step 4 — they are deliberately *not* faked earlier.
