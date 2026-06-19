# Trellis — agent guide

Orientation for working in this repo productively. Read this first; don't re-derive the workflow each
session.

## What this is

Trellis is a self-hosted cloud control plane: **Posture → planner → Structure → reconcile loop**. What
ships today is a **client-side simulator + docs site** (Astro) that models the behavior and proves the
value of the model. The cloud is simulated; the dynamics are real.

## Source of truth

The **spec and docs in [`docs/`](docs/) are the source of truth** — a **living document**, not yet
final. It co-evolves with the simulator: when they disagree, the spec wins; when the simulator teaches
us something, update the spec. There is no other "canonical" implementation to mirror.

## Layout

- `app/` — the simulator + docs site (the Node project; all commands run here).
  - `app/src/sim/` — the engine: `model`, `state`, `provider`, `sim` (the fake cloud), `planner`,
    `reconcile`, `engine`, `fleet`, `store` (IndexedDB).
  - `app/src/components/` — the React UI (simulator island, 3D stage, shadcn primitives).
  - `app/src/content/docs/` — Starlight documentation pages.
- `docs/` — the specification bundle (source of truth) + brand assets.

## Commands (run from `app/`)

| Command | What |
|---|---|
| `npm run dev` | local dev server (inner loop) |
| `npm run test` | vitest (fast unit/engine tests) — the inner loop gate |
| `npm run test:watch` | vitest in watch mode |
| `npm run lint` / `npm run lint:fix` | Biome check / autofix (format + lint) |
| `npm run typecheck` | `astro check` (types across `.astro` + TS) |
| `npm run check` | lint + typecheck + test — run before pushing |
| `npm run build` | static build to `dist/` |
| `npm run preview` | serve the built site |

## Inner loop & gates

1. Work with `npm run dev` + `npm run test:watch`.
2. Before committing: `npm run lint:fix`.
3. Before pushing: **`npm run check`** (lint + typecheck + test) and `npm run build`. CI runs the same;
   don't push red. (A lefthook pre-push hook runs these as a backstop — fix failures, never `--no-verify`.)

## Conventions

- **One feature = one branch → one PR** into `main`. Don't stack chains.
- **Commits:** `area(scope): summary` (e.g. `sim(planner): solve objective program`). Record
  user-visible changes in [`CHANGELOG.md`](CHANGELOG.md) as they land.
- **PRs:** use the template; keep CI green; merging is the user's gate — ask before merging.
- Keep `app/src/sim/` the implementation and the UI a thin renderer over the engine snapshot.

## Deploy

Merging to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds
`app/` and publishes to GitHub Pages — **live at https://hakkiki.github.io/trellis/**. Pages **Source
must be "GitHub Actions"** (not "Deploy from a branch", which would serve raw Jekyll). The base path is
`/trellis`; use `import.meta.env.BASE_URL` for links/assets, never hardcode.

## Definition of done

Implemented, **lint+typecheck+test green**, built, docs/CHANGELOG updated, and verified — not "it
compiles." Prefer adding a test that locks new behavior.

## Autonomy

Do settled steps without asking (branch, lint, test, open PR, drive CI green). Reserve questions for
genuine forks (architecture, product direction, irreversible actions). Before asking, check whether this
file or the spec already answers it.

## Gotchas (learned the hard way)

- **Persisted state evolves.** Sessions in IndexedDB may predate newer `Posture`/schema fields. Always
  normalize a loaded posture over `DEFAULT_POSTURE` (`{ ...DEFAULT_POSTURE, ...saved }`) so missing keys
  never crash the UI.
- **Biome scope:** it handles JS/TS/JSON only here — `.astro`, Tailwind CSS, and Markdown are excluded
  (see `app/biome.json`).
- **Don't hand-edit `app/dist/`** — it's generated.
