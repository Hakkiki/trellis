# Trellis — architecture & roadmap

How the simulator is organized and what's still missing. The **source of truth is the spec and docs in
[`docs/`](docs/)** (start at the Primer, then §17 Invariants → §18 Architecture → §20 Build sequence).
The spec is a **living document** — it co-evolves with the simulator; building the model here is partly
how we discover what the spec should say.

## The one idea: the provider port

Everything hinges on a single seam.

```
        ┌─────────────────────────────────────────────┐
        │  CONTROL LOOP  (provider-neutral)             │
        │                                               │
        │   posture → planner → structure               │
        │   state = f(desired, observed, health)        │
        │   reconciler (converge toward desired)        │
        │   gate · mint · audit                         │
        └───────────────────────┬─────────────────────┘
                                 │  Provider  (the port: apply/delete/observe)
              ┌──────────────────┼──────────────────┐
              ▼                                      ▼
        SimCloud  (today)                    a real cloud  (later)
        in-memory, real dynamics             same loop above the line
```

The control loop never speaks to a cloud directly — it speaks to `Provider`
([`app/src/sim/provider.ts`](app/src/sim/provider.ts)). Today the only implementation is the in-memory
`SimCloud`; the point of the seam is that going from demo to production is **"add a provider," not
"rewrite the core"** (spec §15).

A non-negotiable corollary (spec, "How to read this"): the Frame/Cell/Resource grammar is an
**ontology, not an engine**. Build concrete controllers for the *fixed, known* cloud levels; do **not**
build a generic recursive interpreter.

## The engine ([`app/src/sim/`](app/src/sim/))

| Module | Responsibility | Spec |
|---|---|---|
| `model.ts` | Domain types: desired/observed **projections**, the **manifest**, **generations**, workload **lifecycle**. | §1, §3, §4, §11 |
| `state.ts` | The **State model** — `state = f(desired, observed, health)`, pure and recomputable; provenance separates progress from drift; per-lifecycle derivation. | §4 |
| `provider.ts` | The **capability-contract port** — the sim↔real seam. | §15 |
| `sim.ts` | The **simulated cloud**: apply latency, node failure, persistent failure, stale telemetry, out-of-band drift; Job phases; External seeding. | buildability "thin slice" |
| `planner.ts` | Posture → Structure + a **plan that is a proof**; solves the objective program over a discrete candidate set; Governance as a hard pre-filter. | §2, §5 |
| `reconcile.ts` | The **reconcile loop**: observe → derive → converge within the envelope. Converge only — never Author. Drift policy, break-glass, circuit breaker. | §7, §9 |
| `engine.ts` | Orchestrates the whole loop (declare → plan → approve → tend) and the audit trail; incidents. | §7, §13 |
| `fleet.ts` | The promotion pipeline (dev → staging → prod). | §11 |
| `store.ts` | IndexedDB persistence (the spec's desired-state store + observed-state history, realized in the browser). | §11, §14 |

The UI (`app/src/components/`) is a thin renderer over the engine: the React simulator island, the
CSS-3D topology stage, and the shadcn primitives.

## Why this fits GitHub Pages

The engine runs **entirely client-side in TypeScript**, with IndexedDB for state — no backend. The Astro
build produces a static `dist/` that [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
publishes to Pages (Source = **GitHub Actions**). A production control plane would be a separate target
(the same model driving a real provider in a customer account) — not on Pages.

## What it does today

Posture (with a real objective solver + Governance gate) → plan that is a proof → the gate (scoped
credential mint) → the reconcile loop with provenance-based drift, self-heal, fail-safe-on-Unknown,
break-glass, and a circuit breaker → Stalled → incident surface. Three workload archetypes (Service,
Job, External). Transitions (expand-contract) and promotion (dev→staging→prod). A CSS-3D topology,
FinOps view, audit trail, and click-through proof.

## What's still missing (the honest gap list)

- **Stateful clusters** — quorum/partition roll-up (1-of-3 down = Degraded-serving) — the remaining
  archetype.
- **Reconciler safety** — change-freeze / maintenance windows; rate-limit and blast-radius breakers
  (only flap→Stalled exists today).
- **Frame roll-up state** — region/frame state aggregated from children, with Resilience-parameterized
  severity (active-active "one region down" = Degraded-serving vs active-passive failover).
- **Views** — security / compliance / health projections and topology recoloring by view.
- **Cost as a live signal** — cost drift (billed vs planned) and budget-breach throttling.
- **Multi-service & ownership** — multiple team-owned Services, a dependency graph, Criticality
  propagation up it, delegation envelopes.
- **TCB / security** — signed plans, independent mint, the security view.
- **Self-upgrade / org-change** — reflexive transitions, M&A multi-root.

These map directly to spec sections; the spec is where we decide what "done" means for each.
