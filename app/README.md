# Trellis — simulator & docs (web)

A full-blown, static, client-side simulator and documentation site for Trellis. Built with **Astro** +
**Starlight** (docs) + **shadcn/ui** (React) + **Tailwind v4**, with **IndexedDB** for state. Deploys
to GitHub Pages — no backend.

```bash
npm install
npm run dev      # local dev server
npm run test     # vitest — the simulation engine
npm run build    # static build → dist/
```

## What's here

- `src/sim/` — the **simulation engine** in TypeScript: a faithful mirror of the Go reference spine
  (`../model`, `../state`, `../provider`, `../reconcile`). Same `state = f(desired, observed, health)`,
  same provenance-based drift detection, same reconcile rules — plus a rung-0/1 **planner** so the
  showcase covers the full Posture → plan+proof → approve → reconcile loop.
- `src/components/sim/Simulator.tsx` — the interactive React island.
- `src/components/ui/` — shadcn/ui primitives.
- `src/content/docs/` — Starlight documentation (overview, architecture, concepts, full spec).
- `src/sim/store.ts` — IndexedDB persistence (declared posture + audit trail survive reloads).

See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for how this relates to the Go reference and the path to
the real platform.
