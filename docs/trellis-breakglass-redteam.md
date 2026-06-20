# Break-glass triggers — red-team & inversion

A focused stress-test of the **one transition Trellis never derives**. Companion to
[`trellis-redteam.md`](trellis-redteam.md) (which red-teams the break-glass *machinery* and the SPOFs);
this one red-teams the **decision to open the glass** — the trigger. Source-of-truth ties: spec §4 (state
model), §7 (break-glass machinery), §13 (incident surface), Invariants 11/15/18.

## The crux: break-glass is the only un-derived transition

Every other edge in the state machine (spec §4) is a pure function of observed reality:

| Transition | Derived trigger (`f(desired, observed, health)`) |
|---|---|
| → Drifted | *unauthored* divergence (provenance) |
| → Degraded | health fails |
| → Unknown | telemetry stale |
| → Stalled | error / timeout / Governance veto |
| **→ Frozen** | **break-glass — a human judgment. No `f()`.** |

`Converged --> Frozen: break-glass` has no sensor behind it. In the simulator this is explicit:
`engine.breakGlass(id)` is an imperative call an operator makes; nothing *fires* it
(`app/src/sim/engine.ts:339`). **That is why break-glass feels mysterious — there is no trigger to point
at.** The trigger is a *sensation in a human under incident stress*, and an undecided sensation is an
unaudited, untrainable, un-red-teamable decision. The mystery is itself the vulnerability.

Spec §7:888 lists four crisis *conditions* but frames them as post-hoc justifications, not as a decision
discipline an operator can recognize in the moment. Red-team gap **G3** already named the hole: "incident
mgmt — *the vast middle between self-heal and break-glass*."

## The sensations — what makes a human reach for the glass

The break-glass decision is always *"I must change reality, outside the gate, now."* Six distinct
sensations produce it. Separating them matters because they have **different correct responses**, and
**three of the six should usually NOT open the glass**.

| # | Sensation ("what the operator feels") | Underlying condition | Glass the right move? |
|---|---|---|---|
| S1 | "Every time I fix it, the loop reverts it" | out-of-band fix read as drift, enforce-stomped | **Often NO** — freeze the *scope*, or mark observe-only (§4 drift policy); glass only if the fix can't wait for that |
| S2 | "The building's on fire and approval takes 20 min" | gate latency > incident tolerance | **Sometimes** — but this is the most-abused trigger (see B1); first ask if Inv 18 fast-path applies |
| S3 | "The deploy *is* the outage" | approved-but-bad generation converging (K8) | **YES** — but the precise act is *halt convergence* (freeze), which Inv 11 (auto-rollback) should already be doing |
| S4 | "It's holding and won't move" | Stalled, or Frozen-on-Unknown when failover is needed (§4 / red-team #4) | **Usually NO** — this is a liveness backstop / escalation case, not a bypass case |
| S5 | "I can't even propose a change" | gate / CI / mint authority unreachable | **YES** — the gate literally cannot run; this is break-glass's reason to exist |
| S6 | "There's no manifest for 'pull this compromised node now'" | the fix isn't expressible as desired state | **YES** — forensic / containment one-off, outside the envelope by nature |

The honest reading: **only S3, S5, S6 are clean break-glass triggers.** S1 and S4 have cheaper correct
responses (scope-freeze / observe-only; liveness escalation). S2 is *legitimate but is the attack
surface* — it's where break-glass inflates from "rare emergency" into "standing bypass."

## Munger inversion — guarantee break-glass causes the catastrophe it prevents

Break-glass exists so a human can save the system in a crisis the gate can't handle. Invert: *how would we
**guarantee** break-glass becomes the standing bypass of the entire no-magic / least-privilege /
containment model?* Each kill-path scored **✓ foreclosed** / **◑ partial** / **➕ GAP**.

| # | Kill-path (the "attack recipe") | Defeats | Status | Defense |
|---|---|---|---|---|
| **B1** | **Make break-glass the path of least resistance.** Let the normal gate stay slow/painful so every change reskins itself as an "emergency" (S2). Trigger inflation: the bypass *becomes* the workflow | P2 (no magic), P3 (least privilege) | ◑ partial | Inv 18 — ration attention so low-blast-radius Authoring is *fast* (auto-merge below the floor), keeping the emergency path rare. **➕ add:** break-glass frequency is a first-class FinOps/incident signal (§13) — frequent glass = a *miscalibrated gate*, not a hero. Per-actor break-glass budget (§7:907) caps it but does not yet *route the rate as an alarm* |
| **B2** | **Freeze and walk away.** Open the glass, suspend the reconciler, never repay the debt → the resource is silently unmanaged and invisible; drift accumulates behind a Frozen badge | P4 (convergence) | ✓ foreclosed | §7: TTL'd credential, glass **re-seals on expiry**; §4: "Frozen — debt outstanding" is a named, loud state; alert routing (§13) treats freeze + freeze-violation as a routed signal |
| **B3** | **Break-glass as standing god-write.** If the elevated mint is a single human / single key, it is exactly the standing backdoor the whole model removes | P3 | ✓ foreclosed | §7: dual-control; second approver **outside the requesting Frame** above boundary scope; JIT TTL credential held by no one standing; scoped per-Frame, never one global switch (matches redteam CRITICAL #1) |
| **B4** | **Spoof the emergency.** The trigger is a *perception* — poison telemetry (K16) to manufacture the *sensation* of an outage (S3/S4), then harvest a justified out-of-gate write. Authorization-by-vibes | P2 | ◑ partial | Inv 15 — observed signals authenticated; anomalous = Unknown, never trusted. **The act is externally audited regardless of whether the emergency was real** (§7 max-logged) → forensics catch the manufactured emergency *after*. Residual: nothing blocks the *opening* on spoofed perception in the moment; the deterrent is post-hoc + dual-control |
| **B5** | **Let the loop heal the fix away.** Freeze is per-resource but the manual fix spans resources; the un-frozen neighbors read the fix as drift and stomp it mid-incident | P4 | ◑ partial | §7: glass is **scoped**, and the operator opens the scope matching the blast radius. Residual: choosing too-narrow a freeze scope is an operator error the system does not yet catch — *recommend* the planner surface "your fix touches X but only Y is frozen" |
| **B6** | **Decision under fog.** S1 and S3 are indistinguishable from "*I am wrong and the loop is right*" under stress. Break glass on a misread → you **disable the thing that was saving you**, at the worst possible moment | P4 | ➕ **GAP** | §13 incident surface must *show the operator the loop's reasoning before they break glass* — the generation it's converging toward, the proof, *why* it's reverting. The decision must be on evidence, not panic. Today the surface shows state rollups + audit log, not "here is what the reconciler believes and why" |
| **B7** | **No trigger taxonomy → no muscle memory.** Because the trigger was never defined, every operator invents their own threshold: inconsistent, untrainable, unauditable, un-drillable | P1, P2 | ➕ **GAP** | This document's sensation taxonomy (S1–S6) is the fix: make break-glass a *recognized situation with a runbook* (§13 runbooks are catalog entries bound to a failure class), not an improvisation. Bind each sensation to its correct response so S1/S4 stop reaching for glass reflexively |

## What this produces

Break-glass machinery is **well-defended** (B2, B3 foreclosed). The unguarded surface is the **trigger**,
not the mechanism:

- **B1** — the economic pressure that turns the rare path into the default. Mitigated by Inv 18; **gap:
  route break-glass *rate* as a first-class alarm** (a high rate diagnoses the gate, not the operator).
- **B6** — the fog of war. **Gap: the incident surface must expose the reconciler's reasoning** *before*
  the human overrides it, so S1/S3 are decided on evidence.
- **B7** — the missing taxonomy. **Gap: bind the six sensations to their correct responses** so only
  S3/S5/S6 reach for glass and S1/S4 route to the cheaper fix (scope-freeze / observe-only / liveness
  escalation).

The one-line headline: **Trellis hardened the glass but never specified the alarm that should make you
break it — and "any sensation will do" is how the emergency exit becomes the front door.** The fix is a
*decision discipline* (S1–S6 + their correct responses), the loop's reasoning shown at the moment of
decision (B6), and break-glass *rate* watched as a gate-health signal (B1) — three additions to §7/§13,
no change to the machinery.
