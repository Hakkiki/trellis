# Trellis concept map — red-team synthesis

Eight independent reviewers stress-tested `cloud-platform-concepts.md` (the doubled lenses —
parsimony ×2, security ×2 — converged independently, which is the strongest signal). This file
is the consolidated, prioritized findings record; the concept doc is being revised against it.

## Headline verdict

The **spine survives** (Posture → planner → Structure → reconcile loop; Frame/Cell + `accepts`/`fits`
as the delegation/credential/admission guardrail; Substance projection; provider contract; GitOps
merge-as-gate). Four structural problems are real, two are flat contradictions, the security model is
**assertive not inherent**, the solver's tractability claim is broken by §16/§17, the grammar silently
assumes 3-tier web apps, and several load-bearing capabilities/personas are missing. §22's "complete
and internally consistent" is conceptually true, engineering-wise false.

## Convergence (highest confidence — multiple independent agents)

- **Security (both):** "assertively secure, not inherently secure." Root cause: planner, proof, gate,
  catalog, reconciler are an **unhardened trusted computing base**; every "it's a proof / statically
  checkable" claim trusts a checker inside the blast radius of what it checks. Both prescribed applying
  the doc's own maker-checker / parity-gate / external-audit discipline to the platform core.
- **Parsimony (both):** ~15 advertised concepts reduce to ~6–8. Same cuts named: "7 axes" → 4 posture +
  compiled structure; Zone = distinction without a difference; Bulkhead = coined noun for an `isolation`
  value; §12 action-model + §13 privilege-lattice + actuator-grid = one idea ×3; §15 rungs / §19 patterns
  = one "catalog-not-search" discipline restated.
- **Determinism vs recompute-from-observed** (§15 vs §19): flagged independently by implementability and
  observability.

## CRITICAL

1. **Security — harden the TCB.** Crown-jewel paths: compromise planner/CI → plan whose human-readable
   proof reads benign while the minted credential scope is attacker-chosen (human approves prose, mint
   trusts a machine field — confused deputy); compromise reconciler → continuous org-wide standing write
   that *resists human remediation* (out-of-band fixes read as drift, get stomped); poison a central
   blueprint → backdoor realized everywhere. Fixes: independent scope-derivation at mint time (not handed
   over by planner); sign the plan artifact + bind approval to the signature; dual-planner parity; signed
   generation stamps; partition the reconciler like actuators + external kill-switch; sign the catalog;
   extend §20's external immutable audit from genesis to ALL runtime privileged actions; require the
   break-glass second to be outside the requesting team; bound the Frozen/ratify debt with escalation.
2. **Buildability — §16/§17 silently reintroduce the graveyard §15 avoids.** Criticality propagation (§16)
   is a fixpoint over the dependency graph (with cycles); colocate↔isolate (§17) is facility-location /
   quadratic-assignment — both NP-hard and *global*. The leaves are no longer independent. Fix: demote
   §16/§17 from "solved by the solver" to **authored-and-validated** (human declares Tier/isolation;
   planner only checks consistency and fails loud).
3. **Determinism is over-claimed against live telemetry.** Scope it to a *pure function of (manifest
   generation + pinned provider-state snapshot + pinned pricing version)*; add hysteresis to avoid
   plan-thrash. "Same provider state" is unachievable against eventually-consistent reads.
4. **Fail-safe-Unknown vs self-healing liveness** (§14): region telemetry down → reconciler freezes
   *exactly when failover is needed*. Needs confidence-decay + per-Tier staleness budget + a liveness
   backstop (escalate to human after T, don't hold silently forever).
5. **No observability of Trellis itself** (only of managed infra) — the planner/reconciler/gate/actuators
   are unobserved. Biggest blind spot; ties to the TCB finding.

## In-motion contradictions (pick a side — resolutions adopted)

- **Determinism vs recompute-from-observed** → determinism is per-recompute given pinned inputs; the path
  is recomputed but the *strategy/pattern is pinned* (transition intent); **re-approval required when a
  re-planned path materially diverges** from the approved one.
- **Tier-preset vs objective-role authority** (§16 vs §5) → precedence: explicit operator `optimize:`
  declaration **overrides** the Tier preset, which overrides the system default.
- **Criticality-up vs isolation-down** (§16 vs §17) → separate the two meanings Tier carried: criticality
  propagation raises a shared dependency's **protection level** (HA/backup/change-rigor), it does NOT pull
  it into a consumer's isolation domain. A shared Tier-0 dependency stays shared, isolated *as its own
  unit*, with Tier-0 protection.
- **Governance-at-gate vs per-Frame delegation** (§21 vs §8) → the contract is **composed**: org sets
  non-negotiable floors (central); delegated parents may *tighten, never loosen* within their subtree; the
  gate enforces the composition (monotonic tightening).

## Concept inflation — cuts (parsimony)

"7 axes" → 4 posture + compiled structure; **Zone** → a Governance-derived trust attribute on a Cell;
**Bulkhead** → an `isolation` value (not a noun-concept); merge §12 action-model + §13 privilege-lattice
into one authorization model (static check + minted credential, two faces); state the catalog-not-search
discipline once; move **Data Protection** into §9 (batteries); demote "Environment Zero" and
"chaos = render path" to phrases.

## Naming corrections

- **Fabric** → collides with industry "network fabric"; rename (candidate **Weave**) AND demote from axis
  to a structural facet.
- **Tier** (criticality) → rename **Criticality / Grade / Class**; and fix §2's "TIER 1/TIER 2" labels
  (the doc breaks its own law there) → "Posture plane / Structure plane."
- **Component** is re-overloaded (batteries §9 vs workload unit §16) → workload unit becomes **Service**;
  keep Component for the capability/battery sense.
- **Substance** over-stretched to carry a live state machine → keep Substance = config/spec; lift live
  **State** (Condition) to its own concept.
- **Tile** → **Resource** (a database is not a tile).
- **brain / hands** → use the doc's own precise terms: **control plane / actuators**.
- **lens** → collides with AWS Well-Architected Lenses, and a cost/security view is a projection not a
  re-skin → **View / Projection**.
- **Trellix** (security vendor) is one letter from **Trellis** — trademark check.
- **Intent** carries three jobs (purpose + criticality-magnitude + function-typing) — name the sub-facets.

## Missing scope (add)

- **Workload archetypes** — async/event-driven (pub/sub Fabric edge), **batch/jobs (finite-lifecycle,
  run-to-completion — NOT reconciled-forever; the closed loop mis-models these)**, stateful clusters,
  monoliths, SaaS-consumed, edge. Highest-leverage flexibility fix; the grammar silently assumes 3-tier.
- **Org change** — M&A (multi-root!), re-org, ownership transfer, team split/merge — built on ownership,
  the most volatile axis. Treat re-parenting as a gated, proof-carrying transition.
- **Personas** — FinOps/finance, exec/reporting, incident responder, auditor (split from security),
  external contractor/vendor. Currently unserved.
- **Capabilities/gaps** — G1 FinOps/cost-allocation/showback (cost drift untracked — the loop is open on
  its most-watched dimension); G2 provider quota/service-limit as a hard planner constraint; G3 incident
  mgmt / on-call / alert routing (the vast middle between self-heal and break-glass); G4 Trellis's own
  self-upgrade (can't use the loop to replace the loop); G5 compliance evidence/attestation over time
  (§14 "never store state" can't produce it); G8 change-freeze / maintenance-window governance of the
  autonomous reconciler; G9 tagging/metadata governance; G12 data residency/sovereignty (constrains
  placement + §19 cross-region backup); G13 supply-chain / image provenance / SBOM; G14 day-2 ergonomics
  (a proof nobody can read is magic by another name).
- **A real Views/lenses subsystem** (cost/security/health aggregation along the Frame tree) — not a
  one-line "= Finish" hand-wave.
- **Reconciler self-protection** — flap detection, remediation rate-limit, blast-radius circuit breaker.
- **Progressive-delivery / failover mechanics** — weighted/health-gated shift, SLO-burn auto-rollback,
  split-brain/fencing/quorum (currently one-line labels).
- **App-deploy vs infra-converge** — resolve the two-pipeline reality (§12/§21 conflate them).

## Honest claim downgrades

§22 "complete and internally consistent" → conceptually complete on its chosen axes, engineering-wise
incomplete; "plan is a proof" → genuine at solve-time, slogan elsewhere; §18 "dodges the LCD trap" →
*defers and measures* it; "never act on stale data" → a safety/**liveness** tradeoff, not pure safety.
