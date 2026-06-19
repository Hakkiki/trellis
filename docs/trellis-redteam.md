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

---

# Inversion stress test — how to kill Trellis

A second pass using **Munger's inversion**: instead of "how does Trellis succeed?", ask *"how would we
**guarantee** Trellis causes the exact catastrophe it exists to prevent?"* — then design each kill-path
shut. The promises an attacker targets: **(P1) containment** (no company-wide outage), **(P2) no magic**
(every change authorized), **(P3) least privilege** (no standing god-write), **(P4) convergence**
(self-heal to declared state), **(P5) recoverability** (meta-DR).

Each kill-path is scored **✓ foreclosed** (already shut), **◑ partial** (mitigated, residual risk), or
**➕ GAP → invariant** (real gap; folded into the spec). The six GAPs became spec **Invariants 11–16**.

## Family 1 — re-centralize the SPOF (defeats P1)

| # | Kill-path (the "attack recipe") | Status | Defense / new invariant |
|---|---|---|---|
| K1 | Divisions pull the catalog **live at runtime**, or pins drift to `latest`, so one bad publish auto-deploys everywhere | ➕ **Inv 12** | immutable signed pins, no floating tags, **transitive** pins, pull-and-cache |
| K2 | Make the **external audit / Governance floor a hard runtime dependency** → an audit outage becomes a company-wide reconciler freeze | ➕ **Inv 12** | shared surfaces are **fail-static** (last-known-good when source unreachable); may not block liveness |
| K3 | Slice the control planes but **centralize the operators** — one team pushes upgrades to all instances on one toolchain | ➕ **Inv 12 + §16** | standing *push* power (incl. human/operator tooling) is sliced too; shared tooling is pulled-and-pinned, never pushed fleet-wide |
| K4 | A platform-service division (identity/DNS) is depended on **synchronously by all with no graceful degrade** | ◑ partial | Criticality propagation forces dep ≥ consumer; Weave sync edges contained (circuit-break/degrade). *Residual:* a declared degraded-mode per cross-boundary edge is guidance, not yet an invariant |
| K15 | A **battery that auto-updates internally** (`image:latest`) ships poison org-wide despite a pinned catalog entry | ➕ **Inv 12** | pins are **transitive** — a pinned entry pins its own deps; supply-chain provenance verified at admission |

## Family 2 — turn self-healing into self-harm (defeats P1/P4)

| # | Kill-path | Status | Defense / new invariant |
|---|---|---|---|
| K8 | Push an **approved-but-bad generation**; the standing-write reconciler rolls it to its whole managed set **instantly** (the original outage, reproduced inside one division) | ➕ **Inv 11** | convergence is **progressive** (canary→waves), **health-gated**, **auto-rollback** on regression, blast-radius breaker; an approved change may **not** reach a whole blast radius at once |

## Family 3 — defeat the gate / make the proof meaningless (defeats P2/P3)

| # | Kill-path | Status | Defense / new invariant |
|---|---|---|---|
| K5 | Socially defeat the gate — proof too long/frequent → rubber-stamp; alarm fatigue | ➕ **Inv 18** (third pass) | **ration attention by blast radius** — trivial/reversible/in-catalog runs under a standing human-authored auto-merge policy; high-blast-radius escalates (independent second, dual-control); **proof legibility is a hard gate** (unreadable proof fails). Remainder: discipline in setting the policy + writing legible proofs |
| K6 | Mutate desired state out of band so the reconciler "heals" toward the attacker's change | ✓ foreclosed | Inv 3 (Author-only); signed commits + branch protection; reconciler converge-only |
| K7 | **Confused deputy** — hand the mint an attacker-chosen scope inside a benign proof | ✓ foreclosed | Inv 4 — mint **re-derives** scope from the signed generation; never consumes the planner's asserted scope |
| K13 | Compromise a maintainer / misconfigured branch protection → a malicious merge is "authorized" (merge *is* the gate) | ➕ **Inv 14** | **separation of duties** (approver ≠ author; high blast radius → second approver outside the team); repo-protection is a **non-loosenable floor** |

## Family 4 — brick the control plane / defeat meta-DR (defeats P5)

| # | Kill-path | Status | Defense / new invariant |
|---|---|---|---|
| K9 | Bad self-upgrade disables the healer, with the **kill-switch or recovery path living inside the system that's down** | ➕ **Inv 13** | recovery is **out-of-band** — every recovery dependency reachable with the system fully down; never transits the failed system |
| K10 | Lose the **seed / signing key to a single human or single key** | ➕ **Inv 13** | root + signing authority are **M-of-N** |
| K11 | Make **Git the new SPOF** — one shared manifest store; down → every reconcile blind | ◑/➕ | desired state is **per-domain** (Git is a role, not shared infra); Inv 12 fail-static → reconciler keeps converging to last-good when the store is unreachable |
| K12 | Irreversible **schema migration** of the desired-state store bricks state | ✓ foreclosed | §16 — schema migration is a gated, reversible transition |
| K14 | Compromise the **catalog signing key** → every consumer trusts poison | ➕ **Inv 13** (custody) | signing authority **M-of-N**, rotatable; a single org-wide-trusted key is forbidden |

## Family 5 — observe a lie (defeats P4)

| # | Kill-path | Status | Defense / new invariant |
|---|---|---|---|
| K16 | **Spoof telemetry** → reconciler believes converged (stops healing) or drifted (stomps good state) | ➕ **Inv 15** | observed signals **authenticated**; unauth/anomalous = **Unknown, never trusted**; destructive converge needs **corroboration** |
| K17 | Break the read path so the console shows **green during a real outage** → operators blind when it matters | ➕ **Inv 15** | Trellis **observes itself** on an independent channel (folds red-team #5); no component is the sole verifier of its own correctness |

## Family 6 — erode governance from the top (defeats P1/P2)

| # | Kill-path | Status | Defense / new invariant |
|---|---|---|---|
| K18 | Hold root and **quietly loosen the SCP floor** — the "can't be escaped" guardrail is escapable by whoever holds root | ➕ **Inv 14** | loosening the org Governance floor is a **reflexive, highest-gate, dual-controlled, externally-audited** change (§16) — never a single root action |
| K19 | A division **tightens itself into a corner** (governance forbids everything) → self-DoS | ◑ partial | governance changes are gated transitions; planner proves the tightened posture still admits a valid Structure, else fails loud |

## Family 7 — economic / operational defeat (defeats P1 indirectly)

| # | Kill-path | Status | Defense |
|---|---|---|---|
| K20 | Make **N control planes too expensive** → teams collapse them back into one → re-centralize | ➕ **Inv 19** (third pass) | each instance **near-stateless + scale-to-zero** (N cost ≈ one mostly-idle) and its **own cost is a first-class FinOps signal** (§13) — the temptation is visible and governed. Remainder: a determined org can still choose to re-centralize, but now deliberately and costed |
| K21 | **On-call overload** defeats the human gate + incident routing | ➕ **Inv 18** | §13 routing by Frame+Criticality + Inv 18 attention-rationing (auto-merge trivial below the floor) |

## Family 8 — the compiler bet (defeats P2)

| # | Kill-path | Status | Defense |
|---|---|---|---|
| K22 | Compiler emits a **subtly wrong Structure that passes proof** (proof = internal consistency, not real-world correctness) | ➕ **Inv 17** (second pass; bounds the bet) | demoted rung (blueprints + validation + bounded tuning) **+ Inv 17**: above a blast-radius threshold, a second independent planner must reproduce the **same realized diff** and the proof must carry **named real-world checks** (quota, residency, dependency-criticality, re-validate-against-observed). Divergence fails loud. *Shrinks, not eliminates* — two impls can share a blind spot, or the blueprint itself is wrong. Honest residual research risk, now bounded |

## Family 9 — time / transactionality (defeats P4)

| # | Kill-path | Status | Defense |
|---|---|---|---|
| K23 | Plan-scoped **credential expires mid-apply** → half-applied, inconsistent reality | ➕ **Inv 16** | **leased apply** — a step never starts unless its worst-case duration fits the credential's remaining lifetime + buffer; else **re-mint / wait / refuse**, never start-and-hope. Idempotent + reversible steps are the backstop → an expiry can only leave a *resumable* state. Long ops are initiate-then-poll under a refreshed lease. The credential is the §7/Inv 4 plan-scoped STS session (not the auto-rotated workload identity) |

## What inversion produced

Six genuine gaps → six new normative invariants (spec §17, 11–16): **progressive/reversible
convergence**, **no-floating-fate / fail-static shared surfaces**, **out-of-band recovery + M-of-N
custody**, **separation-of-duties on a non-loosenable gate floor**, **self-observability + attested
signals**, and **leased applies** (never start a write you can't finish within its credential's
lifetime). A **second pass** then promoted the compiler-bet residual (K22) to **Invariant 17** —
independent corroboration (dual-planner parity on the realized diff + real-world proof checks) above a
blast-radius threshold. A **third pass** hardened the last two residuals: **social defeat** (K5/K21) into
**Invariant 18** (gate rigor scales to blast radius; the proof must be legible), and **economic
re-centralization** (K20) into **Invariant 19** (the control plane is cheap by construction and its cost
is a first-class signal) — bringing the inversion-hardened set to **11–19**. What remains is honest
*remainder*, not unaddressed gaps: the compiler bet shrinks-not-vanishes, policy/proof discipline must be
exercised, and a determined org can still choose to re-centralize (now deliberately and costed).
The headline: **the inversion confirms the spine and closes the "even an approved mistake can't go
company-wide" gap — Invariant 11 is the direct answer to the original 100%-blast-radius outage.**
