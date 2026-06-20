# Changelog

All notable changes to Trellis. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
The simulator deploys continuously from `main`, so entries are grouped by date rather than release.

## Unreleased

### Added

- **Spec §11 — the deploy bridge (observer model, trust handshake, CI/CD-agnostic).** Realigns the seam to
  how teams actually deploy. Trellis **never reads the team's git and never runs their canary**: teams
  declare a posture (maker-checker gated) and get a `trellis.yaml` + provisioned infra, then deploy from
  **their own CI/CD** — GitLab, GitHub, Bitbucket, any OIDC-issuing pipeline — and **notify** Trellis, which
  **honors** the (leased) window and **observes** App-Cell health. Adds the **trust handshake**: the CI job
  presents a short-lived **OIDC** token, Trellis verifies it and mints a credential scoped to that **App
  Cell only**; the **deploy binding** (which identity may ship which Service) is **checker-approved**, never
  self-asserted. The release contract (`strategy`/`steps`/`bake`/`healthy_when`) lives **in the team's
  pipeline**, not `trellis.yaml`; Trellis observes outcomes. Includes a CI/CD-agnostic walkthrough and a
  trust red-team (spoofed notify, cross-service write, self-granted rights, honor-abuse, token replay — each
  closed; honest residual: Trellis sees infra-visible health, not app SLOs). Reframes Invariant 27
  (admission via verified identity + scoped credential, not an in-path adapter) and the rollout state
  machine (states Trellis **observes**; the team's tool drives). Completes the posture example with
  `optimize`.

### Fixed

- **Owners panel is honest about who ships.** The release controls were labelled "Ship", which implied
  teams deploy *from the Trellis UI* — backwards. They are now an explicit **simulate · Deploy / Deploy ✗**,
  with a caption making the real flow plain: releases run through each team's **own CI/CD pipeline** (it
  calls `trellis release`); Trellis **observes** the rollout, it does not trigger it — the buttons stand in
  for that pipeline so you can watch a rollout (and a bad deploy self-revert). Spec §11 gains a matching
  rationale — **"Aware, not passive — why the platform observes the rollout"** — arguing why observation is
  load-bearing (self-heal to the live version, keep the two loops from colliding, tell an app bug from an
  infra fault, govern admission, stay the honest map): *observe-and-govern, never trigger.*

- **Diagram viewer, verified in a real browser.** Fixes found by driving headless Chromium against the
  built site (`scripts/verify-viewer.mjs`): the full-screen overlay now **fits and centres** the diagram
  on open (it had opened at natural size in the top-left corner); the cloned SVG is given an explicit
  viewBox-based size with Mermaid's `max-width` cap removed, so it **zooms without a ceiling** and stays
  crisp (max zoom raised to 40×); and the inline toolbar buttons are now **equal-size squares in a row**
  with full-screen rightmost. Verified: 9/9 diagrams render with no syntax errors, overlay opens above
  the header with body-scroll lock, wheel/drag/deep-zoom/reset/code-tab/Esc all work, and the overlay
  fills the viewport in mobile landscape — no console errors.



- **Interactive diagram viewer.** Every rendered Mermaid diagram now has an on-brand toolbar: open it in
  a full-screen overlay (ideal in landscape on mobile) and view/copy its source. The overlay supports
  pan + zoom through one Pointer-Events path — drag-to-pan and pinch-to-zoom on touch, wheel-to-zoom and
  click-drag-pan on desktop, double-tap/click to reset. Pan/zoom maths is pure and unit-tested
  (`diagram-viewer.ts`, `diagram-viewer.test.ts`).
- **User-journey diagrams.** Three Mermaid `journey` diagrams on the Roles page give an easier-to-read
  "day in the life" view alongside the sequence diagrams — for the service engineer, the platform
  operator, and the break-glass responder.

### Changed

- **FAQ: dropped the redundant "Who is this for?" heading.** It sat directly under the "Who it's for"
  section heading and repeated it. The audience paragraph now hangs straight off the section, with "Who is
  it *not* for?" kept as the contrast.

- **FAQ entries rewritten to the plain-English, read-aloud bar.** The two newest answers — "Why not just
  chat with an AI agent to provision infrastructure just-in-time?" and "Can different divisions run on
  different clouds?" — were rewritten in active voice, with the throat-clearing ("the honest reply," "the
  short answer," "point by point," "this isn't hypothetical") removed and the em-dash-heavy phrasing cut
  back into short sentences that read cleanly out loud. Same argument and links; cleaner delivery.

- **Roles page rewritten for clarity and plain English.** The "day in the life of a change" section now
  states outright that Git is the front door of the control plane, not a way around it: the engineer
  authors in Git, the planner and reconciler are the control plane, the PR does nothing on its own, and
  only the reconciler holds standing write into the cloud. Names the maker-checker pattern where
  dual-control already appears (service teams propose, the security author clears). Prose moved to active
  voice with the em-dash-heavy phrasing cut back so it reads cleanly out loud.

- **Roles page diagram accuracy (red-team fix).** The responsibility map wrongly drew the second
  write-arrow into a division's cloud as an *External vendor* "break-glass" path — contradicting the spec
  (break-glass is the responder's, dual-controlled — §7/Inv 14) and the page's own vendor section. The
  map now shows the two write paths as the **reconciler** and the **break-glass responders** (added as a
  node), with the vendor routed through the loop as an ephemeral, scoped credential. The service-team
  flow also now shows the planner/plan-proof step before the gate.

### Fixed

- **Broken Mermaid diagrams on the Roles page.** They threw `Syntax error in text` in production: a
  `classDef` used `fill:rgba(...)` (Mermaid's classDef parser rejects the `(`) and a sequence message
  contained a `;` (a statement separator). Converted tints to 8-digit hex and removed the `;`. Added
  `scripts/validate-mermaid.mjs` (real Mermaid parse under jsdom) wired into `npm run check`, so CI and
  the pre-push hook now fail on any unparseable diagram.

- **Invariants 20–26 — the manifest-substrate hardening set (Git red-team).** A focused fourth red-team
  pass (`docs/trellis-redteam-git.md`) stress-tested the **five jobs the word "Git" does** in the spec
  (desired-state store, generation/provenance, the merge gate, promotion/rollback, meta-DR source) and
  found ten leaks in the *seams between the roles*. Folded into seven new invariants: the proof must bind
  the **merged** generation, not the proposal (20); the reconciler must verify **gate-passage by an in-band
  attestation** because "approval" is a forge fact it cannot read in Git (21); the **gate's own config is
  reconciled**, not hand-held outside the loop (22); generations are **immutable, retained,
  collision-resistant** (23); a **federated generation is a coordinated vector**, Git having no cross-repo
  atomicity (24); the manifest substrate is **never on the liveness or recovery-blocking path** (25); and
  promotion is **ordered and override-proved** (26).

### Added

- **FAQ: what foundational layers Trellis owns.** A new "Where it fits" entry answering directly whether
  Trellis owns the **security baseline** and sets up **OUs, accounts, VPCs, and Kubernetes** — with an
  ownership table per layer and the one boundary that matters (Trellis owns the *cluster as a resource*;
  the in-cluster loop owns workloads). Pulls the answers that were scattered across Bootstrap and the
  Operating model into one place, and keeps the spec-design-vs-simulator line honest.

- **Spec §15 + FAQ: "Can different divisions run on different clouds?"** Clarified the provider rule in
  [spec §15] — "one provider at a time" is scoped **per execution path / per desired state**, so with the
  per-division control-plane slicing it reads **per-instance**: distinct divisions *may* target distinct
  providers (*federated single-cloud divisions*, still not active multi-cloud). A companion FAQ entry works
  the consequence: the cost — building/parity-gating each adapter, losing the single org-root/SCP governance
  floor to a multi-root / trust-federation boundary, forking the catalog, cross-cloud Weave edges — fences
  it to the separate-root (M&A / strict-regulatory) posture, never "spread one estate across clouds for
  resilience."

- **FAQ: "Why not just chat with an AI agent to provision infrastructure just-in-time?"** A new entry
  answering the sharpest objection to a control plane head-on — provisioning-by-conversation isn't an
  alternative to Trellis, it's a faster way to cause the 2&nbsp;a.m. outage it prevents (a transcript isn't
  a proof, it hands the agent standing god-write, there's no reconcile loop, and one chat surface is the
  re-centralized SPOF). The throughline: the agent belongs at the *declare-and-explain* ends of the loop,
  not as the unaudited actuator. Illustrated with a real screenshot of a coding agent admitting it ran
  `git reset --hard` over uncommitted work — an irreversible destructive action with no plan, approval, or
  recovery, which is exactly the failure mode the action model forecloses.

- **The simulator now demonstrates the break-glass trigger discipline.** Two engine-driven additions make
  the spec's new §7/§13 claims visible in the model: (§13) the break-glass control now surfaces *the loop's
  current belief about the selected resource* — its State and the reconciler's own reason (e.g. "drift:
  unauthored change, correcting") plus the generation it's converging toward — so the operator decides on
  evidence, not panic, and can tell "the loop is fighting me" from "the loop is right"; (§7) **break-glass
  *rate* is now a first-class gate-health signal** — computed from the persisted audit log (survives
  reload, no extra state). The **§13 incident surface** is now the single home for the override loop: it
  rolls up Stalled and Frozen (break-glass debt) resources, each row showing the loop's belief and the
  right action (Resolve root cause / Ratify the debt), and it carries the break-glass *rate* banner —
  "check the gate, not the operator" — since the spec routes that signal *via* §13. So an override is
  decided on evidence, the Frozen debt is loud (never a silent un-healed hole), and a miscalibrated gate
  is visible. A new **guided-tour step** walks break-glass → debt → ratify. Locked by four engine tests.

- **Break-glass triggers — inversion red-team.** A new doc
  ([`docs/trellis-breakglass-redteam.md`](docs/trellis-breakglass-redteam.md)) reasons about the one state
  transition Trellis never derives: `Converged → Frozen` has no `f(desired, observed, health)` behind it —
  it's a human judgment, which is *why* break-glass feels mysterious. It names the **six sensations** that
  make an operator reach for the glass (and shows only three are clean triggers — the rest have cheaper
  correct responses), then runs **Munger inversion** on the trigger itself (B1–B7): the machinery is
  well-defended, but the *decision* to open the glass is the unguarded surface — economic trigger-inflation
  (B1), fog-of-war misreads (B6), and the missing trigger taxonomy (B7). The three trigger gaps are now
  **folded into the spec** (§7 + §13) — no change to the break-glass machinery: §7 gains the six-sensation
  trigger table (only three sensations should open the glass; the rest route to scope-freeze /
  observe-only / liveness escalation) and makes break-glass *rate* a first-class gate-health signal; §13's
  incident surface now shows the reconciler's reasoning *before* an override, so the most dangerous
  triggers are decided on evidence, not panic.

- **Release inner loop wired into the live engine + UI.** `Engine` now drives a `ReleaseRuntime` each
  `tick()` alongside the reconcile loop: an `Engine.ship(slug, broken)` ships a release into a Service's
  App Cell (strategy by Criticality — C0/C1 canary, else rolling), the gate-check handshake holds rollouts
  during a change-freeze (Blocked), and the running version + active rollout state surface per Service in
  the snapshot (`ServiceRollup.version` / `.rollout`). The Owners panel gains **Ship** / **Ship ✗**
  controls and a live rollout badge; a new `Release` audit class records ship / healthy / rolled-back.
  Three engine tests lock it: a good release advances the version with the env undisturbed, a broken
  release self-reverts (version holds, no `STALLED`, env stays converged), and a change-freeze parks the
  rollout in Blocked. The §11 inner/outer separation now runs in the actual simulator, not just a unit
  test.

- **Simulator models the release inner loop (`sim/release.ts`).** Teaches the engine the §11 rollout
  state machine — `Pending → Blocked → Progressing ⇄ Verifying → {Healthy | RolledBack | Superseded}` —
  as a `ReleaseRuntime` that holds each Service's running version while the existing `Reconciler` owns the
  Cell *shape*. Models canary steps, Criticality-bounded strategies (Invariant 27: C0 cannot big-bang
  roll), the gate-check hold (Blocked), and latest-wins supersede. A new test (`sim/release.test.ts`, 9
  cases) **proves the inner/outer-loop separation holds in code**: a failed rollout self-reverts to the
  last-healthy version and the reconciled App Cell stays `Converged` with the flap breaker never engaging
  — a bad deploy is the team's `RolledBack`, not the platform's `Stalled`. Verifies in code what spec
  §11 + Invariants 20–22 assert.

- **Spec §11 — the platform↔app seam + single-team authoring.** Two additions to *Manifest lifecycle and
  promotion*. (1) **One manifest, environments as values:** for a single team owning one app there is one
  manifest, with dev/staging/prod as inline posture overlays on a shared environment-blind base —
  separate manifests track *ownership boundaries, never environments*, and the per-environment Structure
  is compiled, not authored. Independent gating comes from the per-environment plan, not file separation.
  (2) **The platform↔app seam:** how a team's CI/CD pipeline consumes provisioned infra — the
  **coordinates** export (`trellis env coordinates`, derived not committed), **workload identity** bound
  to the App Cell (the app resolves secret refs via its own scoped identity, never handling the value),
  and the **gate-check** temporal handshake (`trellis env gate-check`) as the sole coupling between the
  fast app-delivery loop and the slow gated reconcile loop. Closes the previously-implicit gap between a
  converged Structure and the deploy targets a pipeline needs.

- **Spec §11 — the App Cell's release interface (what `app_target` is).** Deepens the seam: `app_target`
  is a provider-neutral **deploy contract** (`trellis release …`), not an ECS/k8s handle — a release
  adapter (a runtime capability) realizes it. Establishes **two nested loops** (Trellis converges Cell
  *shape*; the runtime converges the running *version*; moving the artifact is not drift), the Criticality
  cascade reaching delivery (substrate isolation + permitted rollout strategy per C-level), **team-defined
  readiness** distinct from infra Health, and **two rollbacks/two owners** (release revert vs. posture
  revert). Includes a non-normative AWS v1 realization (Fargate/ECS or EKS, ECR digests).

- **Spec §11 — multiple Services in one environment.** Scopes the seam to a Service: the Service (not the
  environment) is the unit sized, isolated, and deployed. Criticality is a function of **(Service ×
  environment)** via the §2 cascade (environment default → per-Service override — e.g. `internal-dashboard`
  stays C3 even in a C0 prod), so isolation and release substrate differ per Service within one
  environment. Coordinates and releases are **keyed by (environment, Service)** (`trellis release
  payments-prod/payments-api …`); Services **promote independently** (no environment lockstep) while a
  posture change re-plans the whole environment against its shared budget. Service discovery rides the same
  export, gated by Weave adjacency (§7).

- **Spec §11 — the release rollout state machine (the inner loop formalized).** Models a release as the
  workload-altitude analogue of §4's Job mode — a finite, **derived-not-stored** terminal progression:
  `Pending → Blocked → Progressing ⇄ Verifying → {Healthy | RolledBack | Superseded}`, with a Mermaid
  state diagram. The canary is the Progressing⇄Verifying cycle; **latest-wins** supersedes in-flight
  rollouts. Key boundary made explicit: a failed rollout **self-reverts to the last-healthy version below
  the outer loop**, so the App Cell returns to Converged on the prior artifact and the reconciler's
  self-heal/flap breaker (§9) never engages — a bad deploy is the team's RolledBack, not the platform's
  Stalled. On Healthy, the runtime's current-version pointer advances and the Service returns to
  converge-and-hold.

- **Spec §11 — worked end-to-end example.** A single trace promoting `payments-api` v7 through
  dev → staging → prod that exercises the whole seam: per-environment plans → provision → coordinates →
  build-once → per-Service release. The prod release **parks in `Blocked`** while a posture migration
  expands `eu-west-1` (the temporal handshake), then a **failed canary bake self-reverts to `RolledBack`**
  below the outer loop (the reconciler never engages), and the team **fixes forward to v8**. Includes a
  Mermaid sequence diagram of the prod arc and a per-environment version table; `internal-dashboard` rides
  along untouched to show per-Service promotion.

- **Spec §11/§17/§21 — fifth inversion pass on the app-delivery seam (red team).** Applied Munger
  inversion to the new seam and hardened the findings into **Invariants 27–30**: (27) the fast loop is
  approval-ungated but **admission-governed** — the workload identity can write only through the release
  adapter, which enforces the handshake (closes the bypass/TOCTOU hole); (28) **promotion is authored
  intent**, not derived, and staging-green below the target Criticality is not prod-proof; (29) **data
  changes are expand-contract and Data-Protection-gated**, decoupled from the code release; (30) **the
  catalog is the routine extension point**, with catalog velocity a watched signal against shadow-infra
  re-centralization. Also corrected two defects in the §11 prose: the single-manifest example now shows
  Governance/budget as **inherited and sealed** (`inherits:`, narrow-only under Invariant 6) rather than
  team-authored, and `gate-check` is now **adapter-enforced admission** rather than an advisory pipeline
  step. Recorded as the fifth pass in §21 with honest residuals named.

- **Roles & responsibilities — a day in the life.** A new page mapping the nine personas (Platform Owner,
  Security/Governance author, Division/Product lead, Platform Operator, Service/Eng teams, Break-glass
  responders, Auditor, FinOps, External vendor) to the model: each one's mandate, what it owns, what it
  must *not* touch, and a day in its life — with six themed Mermaid diagrams (the responsibility map, the
  day-in-the-life of a change, catalog publish→promote, canaried self-upgrade, break-glass, the ship
  flow). The throughline: many people author and approve; exactly one loop (plus a sealed break-glass)
  writes, contained to its division.

- **Mermaid diagrams now render inline, themed to brand.** A small remark plugin turns ` ```mermaid `
  fences into live diagrams (bypassing the code-block styler), and a curated client runtime applies the
  Trellis "cuoio" palette — warm dark + gold, with **light/dark variants that re-theme live** on toggle —
  lazy-loaded only on pages that have a diagram. Instantly upgrades the spec's 8 diagrams from grey code
  blocks to on-brand visuals; the foundation for diagram-rich pages going forward.

- **Invariants 18 & 19 — the last two inversion residuals hardened.** (18) **Gate rigor scales to blast
  radius; the proof must be legible** — attention is rationed: trivial, reversible, in-catalog changes run
  under a standing human-authored auto-merge policy, high-blast-radius changes escalate (independent
  second, dual-control), and an unreadable proof *fails the gate* — foreclosing alarm fatigue and
  rubber-stamping by design. (19) **The control plane is cheap by construction, and its cost is a
  first-class signal** — each per-division instance is near-stateless and scale-to-zero, with its own cost
  surfaced as a FinOps signal, so the economic pull to collapse back into one SPOF is visible and governed,
  not silent. Reconciled the glossary / §9 "one gate" wording so the floor-case auto-merge doesn't read as
  contradicting per-plan approval. Inversion-hardened set is now **11–19**. Promoted maker/checker.

- **Invariant 17 — independent corroboration above a blast-radius threshold.** Promoted the inversion's
  honest *compiler-bet* residual (K22) into a concrete rule: for a plan whose computed blast radius crosses
  a posture-set threshold, a **second, independently-implemented planner** must reproduce the same realized
  diff, and the proof must carry **named real-world checks** (provider-quota, residency,
  dependency-criticality, re-validate-against-observed) — not internal consistency alone; divergence fails
  loud. This applies Invariant 15 ("the checker outside the blast radius") to the planner itself. It
  **shrinks, not eliminates**, the Posture→Structure compiler bet — an honest mitigation, not a solved
  claim. Inversion-hardened set is now **11–17**. Promoted maker/checker.

- **Inversion stress test + six new invariants.** Applied Munger's inversion — *"how would we guarantee
  Trellis causes the exact catastrophe it exists to prevent?"* — enumerated every kill-path, scored each
  Foreclosed / Partial / Gap, and folded the genuine gaps into the normative spec as **Invariants
  11–16**: (11) **progressive/reversible convergence** — the reconciler never does a fleet-wide write, so
  even an *approved* bad change can't go company-wide; (12) **no floating fate / fail-static shared
  surfaces** — immutable signed transitive pins, run from cache when the source is down; (13)
  **out-of-band recovery** with M-of-N root/signing custody; (14) **separation of duties** on a
  non-loosenable gate floor; (15) **self-observability + attested signals** (the checker sits outside the
  blast radius); (16) **bounded by the lease** — never start a write you can't finish within its
  plan-scoped credential's lifetime (re-mint / wait / refuse), with idempotent-resumable apply as the
  backstop. New public page *"Inversion stress test"* (Architecture & decisions); the raw kill-path
  enumeration (K1–K23) lives in the off-site red-team bundle. Promoted maker/checker.
- **Spec promotions** — three decisions that had been living as applied-decision pages are now folded
  into the **normative specification** (canonical `docs/trellis-spec.md` and the site mirror, kept
  byte-identical): (1) **control-plane partitioning** — the enforcer is not exempt; anything with
  standing write is sliced to the containment boundary, with a new **Invariant 10**; (2) the
  **Kubernetes boundary** — Trellis owns the cluster as a resource, the in-cluster GitOps loop owns
  workloads, slice at the cluster not the namespace (§6); (3) the control plane keeps **no consensus
  store of its own** — desired state in Git, audit external, live State derived (§12/§18). Promoted
  maker/checker; recorded in §21 provenance.
- **Docs split into three genres** to reduce cognitive load and keep the story coherent: a *narrative*
  (the case / use case), the *model* (concept primers), *applied decisions* (operating model, bootstrap,
  crosswalk, architecture), and the *normative specification* (the source of truth). The sidebar is
  regrouped to match, and every page now carries a one-line **status banner** declaring which genre it
  is — "Concept primer", "Applied decision & guidance", "Source of truth", or "Narrative" — so a reader
  always knows whether a page is canon or commentary. No spec contradictions (verified maker/checker).

### Changed

- **Blast-radius demo** (`/blast-radius`): the pitch money-shot — the *same* bad upgrade to a shared
  service rolled out two ways, a shared instance everyone depends on (100% blast radius) vs one instance
  per division (contained to one, recovers from last-good). A purpose-built illustration, in the nav and
  linked from the case + landing. Built maker/checker (genericized the vendor name, simplified state,
  fixed projector-readability, removed dead classes per the review).
- **"The case" page** (Start here): a three-minute, exec/investor-readable narrative — the 2 a.m.
  shared-service outage, why HA doesn't help, the declare→prove→reconcile insight, slicing the blast
  radius per division (control plane included), the per-division-platform wedge, what's proven today
  (the simulator) vs. what's deferred, and what building it takes. Written maker/checker (drafted, then
  independently reviewed for integrity/coherence/persuasion before merge).
- **"Trellis and Kubernetes" section** (in the operating model): where the two control loops divide —
  Trellis manages the cluster (version, nodes, add-ons), the in-cluster GitOps loop owns the workloads,
  never overlapping; slice at the cluster, not the namespace; with the honest costs (cluster sprawl, the
  upgrade/API-compat seam). The FAQ's Kubernetes answer links to it.
- **Provider-crosswalk page** (Concepts): the provider-neutral capability contract mapped to **AWS (built)
  → GCP → Azure** across all twelve buckets — the documented escape hatch for "execute AWS now, think
  ahead." Honest about where the mapping leaks (identity / the credential mint, the org boundary
  account→project→subscription, no-twin services like Aurora and QLDB, fading managed Git). Linked from
  the FAQ's provider-neutral answer.
- **Bootstrap & footprint page** (Concepts): how Trellis gets installed the first time — the one-time,
  externally-rooted, dual-controlled ceremony (seed once → discover read-only → plan+prove → approve the
  minimal scoped write → seal the root) — and what it needs standing to run (workload identity; a
  delegated-admin position unprivileged for writes; STS-minted, plan-scoped, ephemeral credentials; a
  small near-stateless footprint of compute + Git + external audit + a lock table + a secrets store).
  Plus per-division bootstrap and meta-DR. A concise FAQ entry links to it.
- **Operating-model page**: the "how" companion to the use case — choosing a division's isolation grain
  (the org / account / VPC / namespace ladder, and why a namespace fails the blast-radius test),
  synchronous-only coupling as the healthy kind, and the key move: **slice the control plane too** (each
  division runs its own Trellis; only a signed, versioned, pulled catalog + SCP guardrails + external
  audit stay shared). Linked from Concepts and the use-case page.
- **Use-case page ("Why Trellis")**: a genericized worked example — how a single shared service becomes a
  company-wide single point of failure (a careful active-active upgrade with 100% blast radius), and how
  per-division environments contain it without making teams operate their own cloud (platform curates the
  catalog + governance; divisions declare a Posture; upgrades canary per-environment with meta-DR).
  Linked from the docs sidebar and the landing "Explore" cards.
- **FAQ — "Do we have to run our own Git?"**: Git is a *role* (versioned manifest store + merge-as-gate),
  not a product mandate — managed (GitHub/GitLab) or AWS CodeCommit (note: closed to new customers since
  mid-2024) or self-hosted; the store is Trellis's own and per-division (not shared Git infra, and
  distinct from GitLab-as-a-workload); and it's a *soft* dependency — Git down pauses changes, not running
  infra.
- **FAQ — "Does Trellis need a database, etcd, or Consul?"**: a new entry making the design choice
  explicit — no consensus store of its own (desired state is Git, audit is an external append-only log,
  live state is derived), which is what keeps each per-division control-plane instance near-stateless and
  re-bootstrappable; the only real need is a lightweight lock for reconciler leader-election, not Consul/etcd.
- **FAQ — "Where does the live console get 'down' / 'in transition' from?"**: a signal→source table —
  live status is *derived* (`f(desired, observed, health)`) from Git + fresh telemetry, never read from a
  stored status field; the timeline comes from the external append-only audit; stale telemetry → Unknown
  (degrades honestly instead of lying green).
- **FAQ — "Where does the audit log live, and what's the storage?"**: the required properties (external,
  append-only/immutable, written at action time) and the AWS mapping — org CloudTrail → an Object-Locked
  (WORM) S3 bucket in a separate, SCP-fenced log-archive account, with QLDB an option for verifiable
  gate/mint records; honest that the simulator's IndexedDB audit is a local stand-in, not that design.
- **FAQ**: a thorough, spec-grounded docs page that answers the hard questions in plain English — what
  problem Trellis solves and why; who it's for and explicitly not for; what fails and why (the TCB
  hazards and their mitigations); cross-region connectivity and healing; the security model; who manages
  database replication; the relationship to GitOps / Kubernetes / S3 / Terraform; platform vs application
  pipelines; integrations; how third-party "batteries" are included; cost, incidents, org-change; and an
  honest "what's real vs simulated / what's deferred."
- **Reduced-motion support**: honors the OS "Reduce Motion" setting — the pulsing nodes, flowing weave
  wires, glow, and the guided tour's animation all stand down (state still reads through color;
  orbit/zoom is unaffected).
- **Polish pass**: the guided tour popovers are now **themed to the Trellis palette** (no more stock
  white box); the landing page is refreshed (current "what's new" pill, cost-drift / ownership /
  self-upgrade stress cards); a **Reset** control clears saved state for a clean demo; the **overview
  service tiles tint by the active lens** (cost / health / security) and show $/mo in the cost lens; and
  the 3D stage is **GPU-composited** (`will-change` + `contain`) so orbit/zoom stays smooth.
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
