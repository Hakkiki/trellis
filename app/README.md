# Trellis — simulator & docs (web)

A full-blown, static, client-side simulator and documentation site for Trellis. Built with **Astro** +
**Starlight** (docs) + **shadcn/ui** (React) + **Tailwind v4**, with **IndexedDB** for state. Deploys
to GitHub Pages — no backend.

The **source of truth is the spec/docs in [`../docs/`](../docs/)** (a living document, still being
refined). This app implements it; the two co-evolve.

```bash
npm install
npm run dev      # local dev server
npm run test     # vitest — the simulation engine
npm run build    # static build → dist/
```

## What's here

- `src/sim/` — the **simulation engine** in TypeScript: the domain model, the State derivation
  (`state = f(desired, observed, health)`), the provider port, the in-memory `SimCloud`, the planner
  (Posture → plan+proof), and the reconcile loop. Covers the full Posture → plan+proof → approve →
  reconcile loop, plus promotion and workload archetypes.
- `src/components/sim/Simulator.tsx` — the interactive React island.
- `src/components/ui/` — shadcn/ui primitives.
- `src/content/docs/` — Starlight documentation (overview, architecture, concepts, full spec).
- `src/sim/store.ts` — IndexedDB persistence (declared posture + audit trail survive reloads).

See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for how the engine is organized and what's still missing.
