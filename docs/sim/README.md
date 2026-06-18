# Trellis — behavioral simulator

**Open `index.html` in any modern browser.** No build, no server, no install.

A single-file (vanilla JS + CSS-3D) interactive model of the Trellis control loop. The cloud is
**simulated** — nothing is provisioned — but the **dynamics are real**: this is the spec's
posture → plan → approve → apply → reconcile loop, made tangible. It is the interactive form of the
"thinnest end-to-end slice" recommended in `../buildability.md`.

## What it models (and where it lives in the spec)

- **Posture → plan** (spec §2, §5) — set Intent / Criticality / Resilience / Regions / Budget; **Plan**
  compiles a deterministic structure and shows a **proof** (every resource traces to the posture).
- **The gate** (§7, §11) — **Approve & apply** mints a (simulated) scoped, ephemeral credential.
- **The reconcile loop + State machine** (§4, §9) — resources converge and then *hold*; each shows its
  state by colour + LED: Converged · Converging · Degraded · Drifted · Stalled · Frozen.
- **Self-healing** (§9) — *Fail a node* / *Region outage* → watch it heal within the approved envelope.
- **Drift** (§4) — *Inject drift* → an out-of-band change is detected and corrected.
- **Break-glass** (§7) — freezes a resource (lock badge); the **Ratify** button repays the debt via Author.
- **FinOps** (§13) — live cost vs. budget; a breach throttles and logs.
- **Views** (§13) — toggle State / Cost / Health to recolour the topology.
- **Transitions** (§10) — change Criticality / Resilience / Regions after applying and it rolls out as an
  **expand-contract path** (nodes appear / retire, logged), not a redefine.
- **Weave** (§3) — connectivity edges (edge → app → data) and the cross-region replication link are drawn.
- **Promotion** (§11) — the dev → staging → prod version lineage; **Promote** advances the immutable
  validated version one stage ("what you validated is what shipped").
- **Sensitivity** — the proof shows what a posture change would cost (e.g. "raise to active-active: +$X").
- **Audit plane** (§12) — every action is logged with *who* and *why*.

The CSS-3D stage renders the containment **Frames** (Org → Region → Cell/subnet) on a tilted plane with
resources as upright billboard cards — the §3 topology, modeled.

## Tips

- It auto-runs a default posture on load so it opens live; change the posture to re-plan as a transition.
- **Drag** the stage to orbit, **scroll** to zoom.
- Self-demos: `?demo=chaos` (failure / outage / break-glass), `?demo=transition` (expand-contract),
  `?demo=promote` (dev → staging → prod). Set an opening camera with `?rx=46&rz=20&zoom=1.1`.

## Honest scope

This models *behavior and UX*, not real infrastructure. It is the cheapest way to feel whether the model
is right before building the real thing (which provisions actual cloud — the multi-year effort in
`../buildability.md`).
