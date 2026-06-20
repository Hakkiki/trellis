# Trellis

**Trellis** is a self-hosted platform for authoring, provisioning, and continuously managing cloud
infrastructure (AWS first). You declare *what you want* as a **Posture**; a deterministic **planner**
compiles it into concrete infrastructure; a **reconciler** keeps reality matching it — with every action
traceable to an explainable plan.

> **Posture → planner → Structure → reconcile loop; manifest-driven; no magic.**

This bundle is **design documentation, not code** — the complete, build-ready specification plus its
provenance and brand. Carry it into a fresh repository and build from it.

## What's inside

| File | What it is | Read it for |
|---|---|---|
| `trellis-spec.md` | **The build-ready specification.** Self-contained — needs nothing else. | Building. Start at the overview, then §17 Invariants → §18 Architecture → §20 Build sequence. |
| `trellis-redteam.md` | An eight-reviewer adversarial critique. | The known risks and trade-offs, and why decisions went the way they did. |
| `trellis-breakglass-redteam.md` | A focused inversion red-team of the **break-glass trigger** — the one transition Trellis never derives. | Why break-glass feels mysterious, the six sensations that open the glass, and how the trigger (not the machinery) gets abused. |
| `trellis-brainstorm.md` | The original discovery-ordered design brainstorm. | Rationale / provenance — **superseded by the spec for building.** |
| `buildability.md` | A candid "can this really be built?" assessment. | A reality check before you commit — what's proven, where it could fail, and how to de-risk it. |
| `logo/` | SVG marks, lockups (light/dark), favicon. | Brand. |
| `deck/` | A 12-slide overview deck (cuoio theme). Open `deck/trellis-deck.pdf` to view; or render `deck/trellis-deck.md` with any Marp tool — it ships its themes, runtime, and an agent kit so you (or an AI) can keep editing it. | The pitch / onboarding on-ramp. |
| `sim/` | A single-file, CSS-3D **behavioral simulator** — open `sim/index.html`. Declare a posture, approve a plan, then inject failures, drift, outages, and break-glass and watch the reconciler heal. Simulated cloud, real dynamics. | Feel the model before building it — the interactive thin slice. |

## Start here

1. Read `trellis-spec.md` top-to-bottom once — it opens with a **Primer** (a short "life of a service"
   story plus the key diagrams) that frames the whole system before the detail. Diagrams render inline in
   any Markdown viewer that supports Mermaid (e.g. GitHub).
2. Internalize the two honest framings in its overview *before* writing any code:
   - **Proven core vs. the bet** — most of Trellis is assembled from patterns already proven in practice
     (reconcile loop, GitOps, least-privilege execution); the **Posture→Structure compiler** is the one
     novel, research-risk piece. Build the core first.
   - **The grammar is an ontology, not a runtime** — Frame/Cell/Resource and the recursion *organize and
     explain* the system; they are not an engine. Build concrete controllers for the fixed, known cloud
     levels — do **not** build a generic recursive interpreter.
3. Build in the order of spec **§20 Build sequence**.

## Brand

The motif is a sibling to its design-language origin: a diamond **trellis** (the structure) with a **vine**
trained up it (living growth) and a blossom at the tip — *Governance shapes the structure, teams grow
freely along it, self-healing keeps it in form.* Marks are dark-mode aware; the wordmark is set in Fraunces.

- `logo/trellis-mark.svg` — the mark (auto light/dark)
- `logo/trellis-lockup.svg` · `logo/trellis-lockup-dark.svg` — wordmark lockups
- `logo/trellis-favicon.svg` — minimal mark for small sizes
