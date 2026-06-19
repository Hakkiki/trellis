# Changelog

All notable changes to Trellis. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
The simulator deploys continuously from `main`, so entries are grouped by date rather than release.

## Unreleased

### Added

- **Topology that scales to many services**: the 3D stage no longer crowds every service into the same
  cells. By default it shows a **grouped overview** — one tile per service per region (name · state ·
  resource count) — and you **tap a tile (or a service chip) to drill into that one service's full
  edge→app→data weave**. A single-service environment skips straight to the weave. The grid view filters
  to the focused service too. Readable no matter how many services you own.
- **Onboarding & UI polish**: a collapsible **guide** at the top (what it is · how to drive it · what's
  included) plus a **guided tour** (driver.js) that walks the whole loop in plain English. The 3D stage
  now **auto-fits its container** (no more overflow on phones), with **pinch-to-zoom** on touch and
  hover-reveal **zoom/reset controls** on desktop. Long audit/proof text wraps instead of forcing
  horizontal scroll.
- **Self-upgrade — the control plane managing itself (§16)**: the TCB (planner · proof · gate · catalog ·
  reconciler) is modeled as a Criticality-0 self-environment. Propose a self-upgrade on a component and
  it's a transition gated at the **highest bar (dual-control / sealed-root)**, then canaried in. A
  **faulty** upgrade bricks the component — and bricking the **reconciler disables the workload loop**
  (the one change the loop can't heal itself); recovery is the **meta-DR re-bootstrap** from the external
  seed + the last-good generation. Surfaced in a new control-plane panel; while the loop is down the
  topology still observes reality but reconciles nothing.
- **Security View (§7)**: a 4th topology lens — a trust/exposure projection. Each resource is tiered
  **exposed** (internet-facing edge), **sensitive** (data/stateful crown jewels), or **internal** (app),
  and flagged **at-risk** when it's a third-party dependency (outside the TCB), an exposed surface without
  per-service isolation (C2/C3 colocation), or crown jewels without compliance coverage. The legend
  follows the lens; the tier is computed on the engine snapshot.
- **Cost as a live signal (§13)**: cost is now an *observed* signal, not just a planner input. A **Cost
  spike** injects billed-vs-planned **cost drift** (billed ≫ planned); when billed spend exceeds budget
  it's a **budget-breach** that pages on-call and — by posture (`alert` vs `block`) — **blocks further
  provisioning** until reconciled. The budget bar overlays billed over planned, the Owners tab shows
  per-owner billed-vs-planned, and a breach banner offers a one-click reconcile.
- **Multi-service & ownership (§6)**: an environment now owns **several Services**, each with its own
  Criticality (e.g. a C0 `payments-api` beside a C3 `internal-dashboard`), sharing one budget. The
  planner solves the **shared-budget objective across Services** — floor each, then greedily upgrade by
  score until the budget is spent. State and spend **attribute up the Service → environment tree**: a new
  **Owners** tab shows each owner's roll-up state, $/mo, and share of budget, and the 3D stage wires each
  Service's tier chain independently. The Posture editor manages the Service list (add/remove, per-service
  Criticality). Legacy single-service sessions are synthesized from the old intent/criticality.
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
