# Changelog

All notable changes to Trellis. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
The simulator deploys continuously from `main`, so entries are grouped by date rather than release.

## Unreleased

### Added

- **Topology Views (§13)**: a `state · cost · health` lens toggle that recolors the same Structure —
  State reads the lifecycle, Cost is a $/mo heatmap (cheap→costly, anchored to the fleet max, with
  per-card $ labels), Health collapses the lifecycle into healthy / degraded / at-risk / unknown. The
  legend follows the lens. Projections, derived — never authoritative.
- **Frame roll-up state (§4)**: a region's state is the worst-of the Service + Stateful workloads it
  contains, and the environment rolls up from its regions — read by Resilience (active-active keeps
  serving from the healthy region; active-passive fails over; single is user-visible). Region frames on
  the 3D stage and the grid headers are tinted by their roll-up, and the header carries an `env · State`
  badge with a one-line note.
- **Reconciler safety (§9)**: a change-freeze / maintenance window (holds non-emergency Converge), a
  blast-radius breaker (halts + pages on mass remediation, with operator Proceed), plus the existing
  flap breaker. Region outages no longer hit the third-party External (outside our failure domain).
- **"What's new" surface**: a build stamp (date · commit) in the footer, a hero pill, and a
  `/docs/changelog` page — so the live site always shows what's deployed.
- **Stateful clusters**: a self-run quorum broker (the 4th workload archetype) with an `Unavailable`
  state when quorum is lost.
- **Developer workflow**: `CLAUDE.md` agent guide; PR-gated CI (`ci.yml`: lint + typecheck + test +
  build); Biome (format + lint); lefthook pre-commit/pre-push hooks; `.nvmrc` (Node 22); PR template;
  this changelog.
- **Workload archetypes**: Jobs (run-to-completion) and External (observe-only) alongside Services.
- **Honest loop**: the planner solves the objective program (minimize-cost / maximize-resilience);
  Governance is a hard pre-filter that can reject a plan; a circuit breaker trips to Stalled and raises
  an incident surface; click-through per-resource proof.
- **Promotion pipeline** (dev → staging → prod) with per-environment re-planning and drift-off-version.
- **Branding**: hero landing, logo, shadcn nav + mobile drawer, Starlight branding.
- **CSS-3D topology stage**, transitions (expand-contract), FinOps view, audit trail.
- **Reconcile spine**: Posture → plan+proof → gate → reconcile, `state = f(desired, observed, health)`,
  provenance-based drift, self-heal, fail-safe on Unknown, break-glass; IndexedDB persistence.

### Fixed

- Simulator crashed for returning visitors whose saved IndexedDB posture predated newer fields; the
  restored posture is now normalized over `DEFAULT_POSTURE`.

### Changed

- The spec and docs in `docs/` are the **source of truth** (a living document). Removed the early Go
  reference spine and the "faithful mirror" framing.
