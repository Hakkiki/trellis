# Git-substrate red-team — the five-jobs seams

A focused stress-test of **one word doing five jobs**. In Trellis, "Git" is not the developer workflow —
it is load-bearing architecture (spec §11, §12; Invariants 3, 12, 13, 14). This pass asks the narrow
question the broad inversion (`trellis-redteam.md`) did not: *where do the seams between Git's five roles
leak?* The obvious attacks on the manifest store were already foreclosed there (K6 out-of-band mutation,
K11 Git-as-SPOF, K12 schema migration, K13 malicious merge, K18 floor-loosening → Invariants 12/13/14).
The interesting failures are not attacks on one role — they are **mismatches between two roles that share
the word "Git."**

This file is the consolidated, scored findings record; the spec is revised against it (new
**Invariants 20–26**). Scoring matches the inversion bundle: **✓ foreclosed**, **◑ partial** (residual
risk), **➕ GAP → invariant** (real gap, folded into the spec).

## The five jobs

| # | Job | Mechanism | Spec |
|---|---|---|---|
| J1 | **Desired-state store** | the manifest *is* the repo; `state = f(desired, observed, health)` | §11, §12 |
| J2 | **Generation / provenance** | a generation **= a commit SHA** (drift-vs-progress) | §11 |
| J3 | **The gate** | **merge = approval**; PR → planner-in-CI posts plan+proof → human merges → reconciler *pulls* | §11, Inv 3 |
| J4 | **Promotion / rollback / ratify** | promote an immutable version ref; rollback = revert commit; break-glass ratify = a commit | §11 |
| J5 | **Meta-DR source** | re-bootstrap from external seed + manifest repo at a signed known-good generation | §12 |

## Headline verdict

The five roles are individually sound and were each hardened by the inversion pass. **The seams are
not.** Three are flat gaps: the gate proves a *different artifact* than it ships (J3 proves the proposal,
merges the result); "approval" is a **forge** fact the reconciler cannot see in **Git** (J3 vs J1); and
the gate that guards the manifest is **itself unguarded by the loop** (J3 is turtles all the way down).
Two more gaps follow from roles the inversion *created*: federation (Inv 12) silently broke
"generation = a commit SHA" (J2), and Git's own mutability (GC, force-push, history rewrite) undermines
the immutability that J2/J5 assume. The partials are liveness couplings — the emergency and recovery
paths (J4/J5) quietly depend on the very substrate that may be down.

## CRITICAL — the three gate seams (➕)

**G1 — The proof binds the proposal; the gate ships the merge.** *(J3 ↔ J2)* The planner runs in CI on
the **PR head**; the thing that becomes the generation is the **merge commit** — the PR *plus* whatever
else landed on the base branch meanwhile. The plan+proof a human approved was computed against a tree
that **is not what the reconciler pulls.** Two non-commutative PRs, each proved against base, both merge,
and the combined desired state was **never proved together.** "merge = approve" silently assumes
*merged-tree == proved-tree*; semantic merges, base drift, and concurrent merges all break it. This is
the sharpest hole: the approved proof does not bind the generation it supposedly approves. → **Inv 20.**

**G2 — "Approval" is a forge semantic; the reconciler reads Git.** *(J3 ↔ J1)* The reconciler **pulls Git
objects** — commits, trees, blobs. It does *not* see PRs, reviews, CODEOWNERS, or required checks: those
live in the forge (GitHub/GitLab), not in the object store. Signed commits (Inv 14) prove the **author**,
never that **the gate was passed.** Nothing in the Git *content* distinguishes "merged through the gate"
from "pushed directly by someone with write." The entire authority of "merge = approval" rests on mutable
forge configuration the reconciler must take on faith. → **Inv 21** (an in-band attestation binding
generation-SHA → completed gate, verifiable without the forge).

**G3 — The gate's own configuration is unreconciled desired state (turtles).** *(J3 reflexive)* Branch
protection, required status checks, CODEOWNERS / commit authority, signed-commit enforcement,
no-force-push, history retention — **all** of it is forge configuration held by whoever has repo-admin.
Inv 14 calls it a "non-loosenable floor," but **nothing reconciles the floor.** The one mechanism that
guards the manifest is the one thing outside the loop that guards everything else — hand-configured,
drift-prone, an *ungated gate.* → **Inv 22** (the gate's protection posture is itself declared and
reconciled; drift on it is high-Criticality).

## CRITICAL — the two roles the inversion created (➕)

**G4 — Generation immutability & retention is assumed, never an invariant.** *(J2, J5)* "Generation = a
SHA" works only if the SHA is immutable **and retained.** But Git GC prunes unreachable commits;
force-push and history rewrite orphan them. A pinned generation — or the **meta-DR known-good target
(§12, J5)** — can simply **vanish.** It collides with secrets: an accidentally-committed secret is
permanent in history, and scrubbing it *requires* the history rewrite that breaks immutability. And the
identifier is cryptographically load-bearing while SHA-1 is collision-exposed (SHAttered-class). →
**Inv 23** (generations immutable, retained, signed, collision-resistant object format; leaks are
rotated, never rewritten — secrets are referenced, never committed, §11/§18).

**G5 — Federation broke "generation = a commit SHA."** *(J2 ↔ Inv 12)* K11's fix made desired state
**per-domain** (Git is a *role*, not shared infra). Good for the SPOF — but now "*the* generation" is a
**vector of SHAs across N repos**, and Git has **no cross-repo atomic commit or revert.** A cross-domain
change is two merges with an inconsistency window; a revert in repo A without B leaves a split state. The
single-SHA generation model quietly assumes a monorepo the architecture no longer has. → **Inv 24** (a
federated generation is an *ordered, jointly-proved, jointly-reversible* vector; the window is planned and
bounded, never assumed-instant).

## Liveness & recovery couplings (◑ partial)

**G6 — Tracking a branch HEAD is itself a floating reference.** *(J2)* Inv 12 forbids `latest` — but
pointing the reconciler at `main` HEAD **is** a floating reference. It must pin a specific SHA per cycle
and advance deliberately, or it inherits the exact floating-fate problem Inv 12 exists to kill. Implied,
not stated. → folded into **Inv 25.**

**G7 — Break-glass-as-commit has a liveness dependency on Git.** *(J4)* Rollback and emergency ratify are
*commits* (§11). But if the manifest store is down — precisely a disaster — you cannot commit, so the
emergency path depends on the thing that may be broken. The spec's "repaid into Git" has the right shape
(act first, record after), but it must be **explicit** that the emergency *action* never blocks on Git
health. → folded into **Inv 25.**

**G8 — Meta-DR needs the Git host genuinely out-of-band.** *(J5)* §12 re-bootstraps from the manifest
repo — but if that repo is self-hosted *inside the account being recovered*, it is not out-of-band
(Inv 13). Forge-hosted vs. Gitea-in-account is the whole game, and the spec does not pin it down. → folded
into **Inv 25.**

**G9 — Promotion smuggling / order-bypass.** *(J4)* "Bit-for-bit what you validated reaches prod" holds
only for the *base artifact* — per-env **posture overrides are separate, mutable desired state** that can
ride along with a version bump. And Git enforces no dev→staging→prod **ordering**; a direct PR to prod's
version ref skips staging unless forge config forbids it. → **Inv 26** (promotion order is gated; overrides
are diffed and proved at each hop).

**G10 — SHA-1 collision exposure.** *(J2)* A generation on SHA-1 is exposed to chosen-prefix collision.
For a security-load-bearing identifier, require SHA-256 object format and signed objects. → folded into
**Inv 23.**

## Already foreclosed by the inversion pass (✓)

| Path | Defense |
|---|---|
| Out-of-band desired-state mutation | Inv 3 (Author-only) + signed commits + branch protection (K6) |
| Git as the single shared SPOF | desired state per-domain; fail-static last-known-good (K11 / Inv 12) |
| Irreversible schema migration of the store | gated, reversible transition (K12 / §10) |
| Malicious merge via compromised maintainer | separation of duties; non-loosenable floor (K13 / Inv 14) |
| Quietly loosening the gate floor | reflexive, highest-gate, dual-controlled, audited change (K18 / Inv 14) |

## What this pass produced

Ten findings on the seams between Git's five jobs, folded into **Invariants 20–26**: the proof binds the
**merged** generation, not the proposal (20); approval is **attested in-band** so the reconciler verifies
gate-passage, not just authorship (21); the **gate's own config is reconciled** (22); generations are
**immutable, retained, collision-resistant** (23); a **federated generation is a coordinated vector** (24);
the manifest substrate is **never on the liveness or recovery-blocking path** (25); and promotion is
**ordered and override-proved** (26). The throughline: *every place Trellis says "Git" it means one of five
different things, and safety lives in the seams between them* — the proof must bind what ships, the
reconciler must verify the gate it cannot see, and the gate must guard itself.
