---
title: "Inversion stress test: how we tried to kill Trellis"
description: We didn't ask how Trellis succeeds. We applied Munger's inversion — how would we guarantee Trellis causes the exact catastrophe it exists to prevent? — enumerated every kill-path, and designed each one shut. The genuine gaps became new spec invariants.
---

> **Applied decision & guidance** — extends and applies the [specification](/trellis/docs/spec) (the source of truth); not itself normative. The invariants it produced **are** normative — see [§17](/trellis/docs/spec).

Charlie Munger's rule: *"All I want to know is where I'm going to die, so I'll never go there. Invert,
always invert."* So we did not ask "how does Trellis win?" We asked the opposite:

> **How would we *guarantee* Trellis causes the very catastrophe it exists to prevent — a company-wide
> outage, an unrecoverable control plane, an unauthorized change that looks authorized?**

Then we walked every kill-path and made sure the design forecloses it. The genuine gaps this surfaced
became **new normative invariants** (spec [§17](/trellis/docs/spec), Invariants 11–15). This page is the
distilled version; the raw red-team enumeration lives in the off-site design bundle.

## The promises an attacker would target

Inversion only works if you name what success *is*, then attack each promise:

1. **Containment** — no shared failure can take the whole company down.
2. **No magic** — every change traces to a plan a human authorized.
3. **Least privilege** — no standing god-write; writes are ephemeral and plan-scoped.
4. **Convergence** — self-healing drives reality to the declared state.
5. **Recoverability** — if the control plane dies, it comes back (meta-DR).

Each kill-path below is one concrete way to defeat one promise. Each is marked **✓ already foreclosed**
(the model already shut it) or **➕ newly hardened** (the inversion found a real gap; we added an invariant).

## Kill-path 1 — Re-centralize the single point of failure without noticing

This is the original sin — the shared service whose upgrade took everyone down, sneaking back in.

- **Make a shared surface a live, synchronous dependency** — divisions pull the catalog at runtime, or pin
  drifts to `latest`, so one bad publish auto-deploys everywhere. **➕ newly hardened (Inv 12):** every
  shared reference is an immutable signed version, **never a floating tag**, pins are **transitive**, and
  consumers run from **last-known-good when the source is unreachable**. Shared surfaces are
  pull-and-cache, **never synchronous-fate**. No shared service sits on a division's critical write path.
- **Make the audit or governance floor a hard runtime dependency** — the reconciler freezes when the audit
  is unreachable, so an audit outage becomes a company-wide freeze. **➕ newly hardened (Inv 12):** the
  same fail-static rule — shared surfaces may not block liveness.
- **Centralize the operators** — slice the control planes but have one team push upgrades to all of them on
  one toolchain. **➕ newly hardened (Inv 12 + [§16](/trellis/docs/spec)):** anything with standing push
  power across domains — *including human/operator tooling* — is sliced too; the shared tooling is
  pulled-and-pinned, never pushed fleet-wide.

## Kill-path 2 — Turn self-healing into self-harm

The subtlest one. The gate approved a change; it just happened to be bad.

- **Push an approved-but-bad generation and let the reconciler roll it out everywhere it owns, instantly.**
  This is the original outage reproduced *inside a single division* — careful approval doesn't help if the
  rollout is simultaneous. **➕ newly hardened (Inv 11):** convergence is **progressive and reversible** —
  canary → waves, **health-gated**, with **automatic rollback** on regression and a blast-radius breaker
  that halts the wave. **An approved change still may not reach a whole blast radius at once.** This is the
  most important hardening on the page: even a mistake that passes the gate must not be company-wide.

## Kill-path 3 — Make the gate a rubber stamp

- **Bypass the gate through the reconciler** — mutate desired state out of band so the standing-write
  reconciler "heals" toward your change. **✓ already foreclosed:** desired state changes only through
  Author ([Inv 3](/trellis/docs/spec)); out-of-band repo writes are caught by signed commits + branch
  protection; the reconciler is converge-only.
- **Confused deputy at credential mint** — hand the mint an attacker-chosen scope inside a benign-looking
  proof. **✓ already foreclosed ([Inv 4](/trellis/docs/spec)):** the mint **re-derives** scope from the
  signed generation; it never consumes a scope the planner asserts.
- **Compromise a maintainer, or leave branch protection misconfigured on one repo** — a malicious merge is
  "authorized" because merge *is* the gate. **➕ newly hardened (Inv 14):** **separation of duties** — the
  approver is never the author; above a blast-radius threshold the second approver is **outside the owning
  team**; and the repo-protection posture is a **governed, non-loosenable floor**, not a per-repo option.

## Kill-path 4 — Brick the control plane and defeat recovery

- **Ship a self-upgrade that disables the thing that would heal it, with the kill-switch or the recovery
  path living *inside* the system that's down.** **➕ newly hardened (Inv 13):** every recovery dependency
  — the external seed, a known-good prior generation, the kill-switch, the audit — must be reachable and
  operable **with the control plane fully down**; recovery never transits the failed system.
- **Lose the root, or the catalog signing key, to a single person or a single key.** **➕ newly hardened
  (Inv 13):** root and signing authority are **M-of-N** — no single human, no single key.
- **Make Git the new SPOF** — one shared manifest store; if it's down, every reconcile is blind. **◑ /
  ➕:** desired state is **per-domain** (Git is a role, not shared infra), and Inv 12's fail-static rule
  means the reconciler keeps converging to its last-good generation when the store is unreachable.

## Kill-path 5 — Make Trellis observe a lie

- **Spoof telemetry** so the reconciler believes "converged" when it isn't (stops healing) or "drifted"
  when it isn't (stomps good state). **➕ newly hardened (Inv 15):** observed signals are **authenticated**;
  unauthenticated or anomalous telemetry is treated as **Unknown, never trusted** ([Inv 7](/trellis/docs/spec));
  a destructive converge needs **corroborating** signals, not one source.
- **Break the read path so the console shows green during a real outage** — operators blind exactly when it
  matters. **➕ newly hardened (Inv 15):** Trellis **observes itself** on an independent channel, so a
  broken or lying telemetry path is itself visible. **No component is the sole verifier of its own
  correctness** — the checker sits outside the blast radius.

## Kill-path 6 — Erode governance from the top

- **Hold root and quietly loosen the SCP floor** — the "can't be escaped" guardrail is escapable by
  whoever holds root. **➕ newly hardened (Inv 14):** loosening the org governance floor is itself a
  **reflexive, highest-gate, dual-controlled, externally-audited** change ([§16](/trellis/docs/spec)) —
  never a single root action.

## The honest residual

Inversion hardens; it doesn't make a system invincible. What remains, stated plainly:

- **The compiler is still the bet.** A Posture→Structure compiler can emit a subtly wrong Structure that
  *passes* its proof — a proof shows internal consistency, not real-world correctness. We ship it demoted
  (blueprints + validation + bounded tuning), with dual-planner parity available as hardening above a
  blast-radius threshold (the spec keeps it optional), but this is the genuine research risk, not solved.
- **Social defeat is real.** A proof nobody reads is magic by another name; alarm fatigue defeats any human
  gate. The mitigation is to **ration attention by blast radius** — auto-handle the trivial, escalate only
  what's significant — but discipline, not just design, keeps the gate meaningful.
- **Economics can re-centralize.** If running N control planes is too expensive, teams will collapse them
  back into one. The near-stateless, self-managing footprint ([§12](/trellis/docs/spec)) is what keeps the
  sliced model cheaper than the SPOF it replaces — but it's a pressure to watch, not a law.

## The five invariants this produced

Folded into the normative spec ([§17](/trellis/docs/spec), 11–15):

| # | Invariant | Kill-path it shuts |
|---|---|---|
| 11 | **Convergence is progressive and reversible** — never a fleet-wide write | Approved-but-bad change going company-wide |
| 12 | **No floating fate; shared surfaces are fail-static** — immutable signed pins, transitive, run from cache | A shared surface becoming a synchronous SPOF |
| 13 | **Recovery is out-of-band** — every recovery dependency works with the system down; M-of-N custody | Bricking the control plane irrecoverably |
| 14 | **Separation of duties; the gate floor can't be self-loosened** | A malicious-but-"authorized" change; root eroding the floor |
| 15 | **The checker sits outside the blast radius** — self-observability, attested signals | Acting on a spoofed or broken telemetry path |

In one line: **we found where Trellis would die, and built so it can't go there.**
