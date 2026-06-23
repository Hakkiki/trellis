# Implementation readiness & phasing — can we build this for real?

A decision-oriented companion to [`buildability.md`](buildability.md) (*can it be built?*) and the
[`trellis-spec.md`](trellis-spec.md) (*what to build*). This answers the operator's questions before
funding a real AWS build: **are we ready, what's open, what must ship first, how do we phase to stack
wins, and what will it cost to build and test on AWS — with guardrails so it can't run away.**

> **Bottom line.** Yes — we have enough to start, and the right move is **not** "fund the whole platform."
> Fund the **thin proof-carrying slice on real AWS** (Phase 1 below). The spec already resolved every
> *structural* decision; what remains open is *implementation-level* and is best answered by building the
> slice, not by more design. Budget **~$500/mo lean to ~$2.5k/mo realistic** for the dev/test AWS
> footprint, and the cost guardrails are the same machinery Trellis ships (Budget axis + FinOps loop +
> SCPs + circuit breakers) — so building them is dogfooding.

---

## 1. Are we ready to start? — yes, with one reframe

The readiness bar is not "is the design finished" — it's "do we know the ~30% that's risky from the ~70%
that's just work, and do we have a first slice that tells us the truth cheaply." We do, on both counts:

- **The design is build-ready and de-risked.** The spec is self-contained, names its one genuine bet (the
  Posture→Structure compiler) and its *demoted, buildable* form (blueprints + constraint validation +
  bounded leaf tuning), carries a **§20 build sequence**, a 19-invariant guardrail set hardened by an
  eight-reviewer red-team **and** a Munger-inversion kill-path pass, and a candid buildability verdict.
  §21 records that **no structural decisions remain open**.
- **The model is already validated cheaply.** The [simulator](sim/README.md) runs the full
  posture→plan→approve→apply→reconcile loop (with drift, self-heal, break-glass, transitions, FinOps) — the
  "thinnest slice" made tangible, minus real provisioning. The dynamics feel right; the next dollar buys a
  *real* slice, not more modeling.
- **The market window is real but narrow.** The [competitive landscape](trellis-competitive-landscape.md)
  finds **no one** ships the two differentiators — **plan-as-proof derivation** and **change-scoped
  ephemeral credentials** — but everything else (self-hosting, reconcile loop, intent provisioning, policy
  gating) is table stakes, and Humanitec/Crossplane/AWS are a feature-layer away. **Lead with the planner,
  not the loop**, and get the wedge demoable fast. **The window is perishable, not a moat (R7):** the same
  scan flags Humanitec a feature-layer away and some claims at medium confidence — so re-scan competitors
  each phase and treat the *coherent loop*, not any single feature, as the durable advantage.

**The reframe that decides success** (straight from buildability): build **concrete controllers for the
fixed, known cloud levels** and use the grammar only to stay coherent — *do not* build a generic recursive
Frame/Cell interpreter. A team that builds "one engine for everything" drowns; a team that builds named
AWS-level controllers ships.

---

## 2. Open questions — none structural; seven implementation-level

§21 is right that no *structural* decision is open. But "ready to design" ≠ "zero unknowns." These are the
honest **implementation-level** questions the slice exists to answer — none blocks starting; each is
cheaper to answer in code than in argument:

| # | Open question | Why it's open | How we close it |
|---|---|---|---|
| Q1 | **Reconcile substrate: build standalone vs. stand on Crossplane/controller-runtime?** | Crossplane gives a proven reconcile loop + CRDs but *requires a Kubernetes control plane* and couples us to it; standalone keeps the near-stateless/scale-to-zero property (Inv 19) but is more to build. **The one genuine architecture fork.** | A Phase-1 spike building the thin loop both ways — but treat it as a **foundational, hard-to-reverse fork** that determines the whole stack (§6), *not* a throwaway experiment (R8): the output is a decision with an explicit reversibility cost, not a vibe. |
| Q2 | **The IAM-can't-express-"exactly-this-diff" gap.** | Inv 4 hair-cuts diff-scoped creds to *resource-set × action-set* + a re-validate-against-observed check. Whether that residual gap is tight enough in practice is unproven. | Implement the mint + re-validate against a real account; measure the over-grant; it's our #2 differentiator, so this is load-bearing. |
| Q3 | **Which stateful stores get live (RPO≈0) cutover first?** | Replicate→verify→atomic-cutover (§10) is bespoke per engine; we can't do all of RDS/Aurora/DynamoDB/Kafka at once. | Pick one (RDS Postgres) for v1; backup→restore→cutover for the rest. |
| Q4 | **The concrete blast-radius function.** | Invariants 11/17/18 all key off "computed blast radius crosses a posture-set threshold" — the spec leaves the *metric* abstract. | Define a first concrete metric (resources touched × Criticality × irreversibility) in Phase 2; tune against real plans. |
| Q5 | **Provider-quirk surface** — eventual consistency, service quotas, rate limits. | Buildability #5: "the gap between the clean spec and the provider's actual behavior is where most of the ugly work lives." | Bake quota-as-hard-constraint (§5) and snapshot-pinned determinism in from Phase 1; expect iteration. |
| Q6 | **First-customer wedge segment** *(a product question that kills via building-the-wrong-thing)*. | Differentiators favor regulated / audit-heavy / platform-team buyers, but the design-partner target isn't named — and no partner means blueprint #1 fits no real workload and the demo lands on nobody (R9). | **Co-equal with the build, not a later concern:** name 1–2 design partners *as a Phase-1 input*; their workload defines blueprint #1 and *pulls* specific Arc-2 security rows (§4) into Phase 1. |
| Q7 | **EKS vs ECS for the compute battery + the K8s-slice (§6) validation.** | EKS is needed to prove "reconciler managing a reconciler," but it's a cost driver and adds scope. | ECS/Fargate for the first blueprint; add one EKS cluster in Phase 2 to validate the cluster-not-namespace slice. |

---

## 3. Two planes — Trellis's own stack vs. the app-team delivery stack

A distinction that organizes everything below — and conflating the two is a concrete failure mode (it is
what made "use MSK as the event system" tempting). There are **two stacks**:

| | **Plane 1 — Trellis's own stack** | **Plane 2 — the app-team delivery stack** |
|---|---|---|
| **Whose concern** | the team *building* Trellis | the product / data teams *shipping on* Trellis |
| **What it is** | the control-plane subsystems + the tech they're built from | the capability **batteries** + **blueprints** + workload archetypes |
| **How you get it** | you bootstrap/build it (then Trellis self-hosts it as C0, §12) | a team **Authors a Posture** → Trellis provisions + governs it |
| **In this doc** | **§4 (subsystems) + §7 (tech stack)** | **§5 (capability map)** |
| **Examples** | Go/gRPC/Python/TS · reconcile substrate · planner · mint · gate-CI · signed catalog · external audit · self-observability | compute runtimes · RDS/lakehouse · dbt-Jobs · messaging · app CI/CD · BI · DNS/certs/LB |
| **Property** | near-stateless, broker-free, cheap, **in the TCB** (Inv 9/15/19) | provisioned + governed; **workload tier**; behind the capability contract (§15) |

**The membrane** between them is the capability contract (§15) + Component/blueprint definitions: Plane 1
exposes Plane 2 only through signed catalog entries; teams touch Plane 2 by authoring posture and **never
touch Plane 1's internals**. That membrane *is* the §5 self-service boundary.

**The one rule (the general form of the MSK pushback — red-team R13):**
> **Never let a Plane-2 workload tool become a Plane-1 control-plane dependency.**

The control plane must stay near-stateless / broker-free / cheap (Inv 19) and off any shared
synchronous-fate dependency (Inv 12). Importing a teams-facing battery (Kafka/MSK, a lakehouse, a team
database) into the control-plane backbone recreates the SPOF the spec forbids.

**Same tool, two roles** — several technologies appear in *both* planes in different trust scopes, which is
exactly why they get confused:

| Capability | Plane 1 role (Trellis itself) | Plane 2 role (app teams) |
|---|---|---|
| **CI/CD** | the **gate** — planner runs in CI, merge = approval | the **Delivery battery** — teams' app pipelines |
| **Artifact registry** | signed **catalog** + control-plane images | teams' **app image** registry |
| **Eventing** | control coordination: gRPC + SQS (NATS if needed) — **never Kafka** | the **messaging battery** — Kafka/MSK as *one* option |
| **Observability** | Trellis **observes itself** (Inv 15) | the **Observability battery** teams consume |
| **Datastore** | leader-lock + observed-state history (minimal) | the **Data bucket** — RDS, lakehouse |
| **Secrets** | control-plane **signing keys** | the **Secrets battery** for teams |

**This *locates* the agnostic-vs-best-in-class tension.** Be **decisive in Plane 1** (one product, you own
it, few touch it — pick best-in-class and *commit*; the only mandatory seam is the cloud provider, §15) and
**pluralistic in Plane 2** (many teams, heterogeneous needs — best-in-class as the *default blueprint*,
alternatives **behind the contract**). Different answers per plane; the model tells you which is which.
Data-tier tools (dbt, lakehouse, catalog, BI) are **Plane 2** — Trellis *provisions and governs* them, it
does not *implement* them; the open seam to pick first is **Apache Iceberg**.

**Inversion check (red-team of this model).** Three ways the two-plane lens itself misleads — and the
sharpenings that foreclose them (red-team R14):

- **It is a lens, not a wall (TP1).** Trellis manages *itself* as a C0 environment (§12, §16), so Plane 1
  is *eventually* a Plane-2 workload — the recursion is the point (it is what makes meta-DR and self-upgrade
  possible). Build Plane 1 so it is **governable as a Plane-2 workload** (dogfood), never as an ungovernable
  snowflake.
- **The "one rule" forbids tenant-coupling, not shared tool *types* (TP3).** The control plane legitimately
  *uses* Git, an OCI registry, S3, a lock store — tools that also appear in Plane 2. The rule is precise:
  **no tenant-provisioned battery instance on the control plane's *synchronous critical path***; shared
  infra it does use is **fail-static, pull-and-cache, version-pinned** (Inv 12), never a synchronous-fate
  dependency.
- **The planes are an *ownership* axis, not a *sequencing* axis (TP5).** "Plane 1 is what you build" must
  **not** be read as "build the whole control plane first, expose capabilities later" — that is the cathedral
  failure. Phase 1 cuts **vertically through both planes** (a thin Plane 1 + one blueprint's Plane 2 together).

Two operating cautions: keep Plane-1 *decisiveness* honoring the one mandatory seam (the cloud provider,
§15) — decisive ≠ AWS-hardcoded (TP2); keep Plane-2 *pluralism* **curated and finite** (best-in-class
default + a vetted alternative set behind the contract), never anything-goes sprawl. The membrane (the
capability contract) is the **only** coupling — no privileged Plane-1 team gatekeeping battery creation, or
the §5 self-service promise reverts to tickets (TP6). And where the trust boundary allows, **one** deployment
serves both planes via tenancy/RBAC (one registry with P1 + P2 projects), not two stacks — separate only at
real trust lines (eventing: gRPC/SQS for P1, never the shared Kafka) (TP7).

---

## 4. Must / Should / Nice — what services ship when  *(Plane 1 — the control-plane subsystems to build)*

The spec's 12 capability buckets (§18) and v1 in/out (§19) become a MoSCoW once you weight them by **(a)
the two uncontested differentiators** and **(b) what it takes to run one real workload end-to-end on AWS.**
"Service" here = subsystem + the batteries it needs.

### Must-have — the differentiated spine + one workload's worth of batteries
*(Phases 1–2; this is the product. Without these there is no Trellis.)*

- **Core reconcile spine** — desired-state store (Git), one reconciler, actuators, the State model
  (`state = f(desired, observed, health)`), generations, drift detection. *(§20.1)*
- **Planner rungs 0→2 with plan-as-proof** — deterministic against pinned inputs; the proof is mandatory.
  **This is differentiator #1 — lead with it.** *(§20.2)*
- **GitOps gate** — planner in CI posts plan+proof + the realized resource diff; merge = approval;
  reconciler pulls. *(§20.3)*
- **Authorization + independent mint + change-scoped ephemeral credentials** — the four action classes, the
  `authorized-by` three-way intersection, scope re-derived from the signed generation.
  **This is differentiator #2.** *(§20.4)*
- **Bootstrap / sealed root** — the one external trust anchor; built alongside the mint. *(§12)*
- **A minimal battery set to run one blueprint** (a 3-tier web Service): **Compute · Networking ·
  Identity/IAM · Secrets · DNS · Certs · Traffic(LB)** — enough for one real workload, not all twelve buckets.
- **TCB hardening essentials** — signed plans + approval-bound-to-signature, signed generation stamps,
  external append-only audit, reconciler partitioning + out-of-band kill-switch, catalog signing. *(§7, Inv 9)*

### Should-have — credible-v1 trust, right after the first revenue slice
*(Phase 2–3; needed before a serious customer trusts it with prod.)*

- **Transition planning + Data Protection** — two-stage solve (target, then path), migration-pattern
  catalog, reversible gated steps, backup/PITR, one live stateful cutover. *(§10, §20.5)*
- **FinOps / Views / incident + reconciler safety** — cost-drift loop + budget-breach throttle, projection
  Views, alert routing + incident surface, change-freeze + circuit breakers (rate-limit/flap/blast-radius).
  *(§13, §20.6)*
- **Compliance evidence** — retained observed-state history → attestation packages. *(§14)*
- **More batteries** — Storage · Data (managed RDS/Aurora) · Observability · Delivery (CI/CD).
- **Per-plan parity above the blast-radius threshold** (Inv 17) and **drift policy** (`enforce|warn|ignore`).

### Nice-to-have — later maturity / elegant edges
*(Phase 3–4; differentiate at scale, not at launch.)*

- **Self-upgrade + org-change / M&A multi-root**, **control-plane partitioning per isolation domain** at full
  strength (Inv 10), **compliance attestation export**. *(§16, §20.7)*
- **Second provider adapter** (GCP/Azure) — *deferred and measured*, build only on demand. *(§15)*
- **Full build-time dual-planner parity**, **rung-4 bounded per-leaf optimization** (v2), **vendor-hosted SaaS
  control plane**.

### Explicitly out (v1) — say no on purpose
Global topology optimization (rung-4 whole-structure), solver-optimized placement/Criticality, request-path
AI blueprint generation, active multi-cloud, edge, runtime workload-behavior controls. *(§19)*

---

## 5. Day-one capability map — what teams leverage, and what makes security say yes  *(Plane 2 — what app teams consume)*

§3 is the *subsystem* view (what we build). This is the *adoption* view (what a team gets, and what lets
security delegate). The test the spec is built to pass: a platform fails the moment "self-service" is
secretly a ticket to the platform team, or security gates by **reviewing every change** instead of
**authoring an envelope once**. A capability is genuinely self-service only when a team invokes it via
**Author (a PR) inside its delegated `accepts`/`fits` envelope**, with the platform present as **golden
paths + guardrails** — and security says yes because it trusts the **proof + mint + audit**, not the team's
diligence. Two questions to apply to every row:

1. **Self-service test** — can a team invoke it via a PR inside its envelope, platform-as-guardrails only?
   *(If routine use needs a platform ticket → it's self-operated; fix with a blueprint + the auto-merge
   floor, Inv 18.)*
2. **Say-yes test** — can security delegate it by authoring the envelope once and trust enforcement?
   *(If security must review each instance → governance bottleneck.)*

**Day-one cut:** **`M`** = Phase 1 (day one) · **`S`** = Phase 2 (soon) · **`L`** = Phase 3+ (later); tags
align with §4 and the §6 phasing. The **`M`** rows ≈ the Phase-1 adoption checklist.

### Arc 1 — leverage on day one

**Theme 1 · Declare & provision**
- **`M`** Self-service workload declaration — Posture per Service, infra without bespoke IaC (§2, §6).
- **`M`** Golden-path blueprint catalog (≥1 blueprint) — select + parameterize (§5 rungs 0–2).
- **`M`** Plan-as-proof *preview* — "what will exist and why" before apply (§5).
- **`S`** Environments + promotion pipeline — promote an immutable validated version dev→stg→prod (§11).

**Theme 2 · Compute & serve traffic** *(the minimum to run something reachable)*
- **`M`** Compute (containers / serverless / VMs) · **`M`** Traffic/LB · **`M`** DNS · **`M`** Certs (§18).
- **`M`** Service discovery + ingress/egress (basic).

**Theme 3 · Data & state** *(teams own their data — §6)*
- **`M`** One managed relational store — the first blueprint needs persistence (Q3: RDS Postgres).
- **`S`** Data Protection battery — backup/PITR/retention, posture-derived (§10).
- **`S`** Stateful migration: backup→restore→cutover · **`L`** live replicate→verify→cutover (§10).
- **`S`** Data-residency enforcement (**`M`** if a regulated design partner) — Governance hard constraint (§2).

**Theme 4 · Connectivity (Weave)**
- **`M`** Service-to-service connectivity — declared reachability (§3).
- **`M`** Default-deny adjacency + self-service allowed crossings — planner compiles SG/route/IAM, proves
  admit/deny (§6).
- **`L`** Cross-region / replication links — active-active is C0 (§3).

**Theme 5 · Delivery & change safety** *(trust the autonomy)*
- **`M`** Self-healing within the approved envelope (§9).
- **`S`** Progressive delivery — rolling/canary/blue-green, auto-rollback, blast-radius breaker (§10, Inv 11).
- **`S`** Transitions as reversible gated paths (§10) · **`S`** team-controlled change-freeze windows (§9).

**Theme 6 · Observe, cost & operate**
- **`M`** Per-team audit trail — who/why/when (§7, TCB-essential).
- **`S`** Views — health/SLO, cost, security, compliance, incident (§13).
- **`S`** FinOps — per-team allocation, budget, cost-drift, showback (§13).
- **`S`** Incident mgmt — alert routing by Frame+Criticality, on-call, runbooks (§13).

### Arc 2 — security & security-adjacent (the "say yes" surface)

**Theme 7 · Identity, access & secrets**
- **`M`** Workload identity, no long-lived keys — STS/OIDC (§12).
- **`M`** Change-scoped ephemeral credentials — mint scoped to exactly the diff, expires (Inv 4;
  *differentiator #2*).
- **`M`** Secrets store battery — referenced, never in Git (§11).
- **`M`** Human RBAC scoped to the Frame (§7).

**Theme 8 · Guardrails & policy** *(the anti-ticket engine)*
- **`M`** Governance contract — whitelist, compliance regime, permissions, residency, declared once (§2).
- **`M`** Admission at the gate — `accepts`/`fits` + three-way `authorized-by`, auto-reject with proof (§7).
- **`M`** Monotonic-tightening delegated envelopes — org floor + team tightening; how a team *gets* its
  sandbox (§8, Inv 6).
- **`S`** Gate rigor scales to blast radius — **auto-merge below the floor** (Inv 18); *the single
  highest-leverage anti-ticket capability — pull forward; needs the Q4 blast-radius metric.*
- **`S`** Drift policy — `enforce | warn | ignore` per scope (§4).

**Theme 9 · Supply-chain & artifact trust**
- **`M`** Signed, versioned catalog + transitive pins — no `latest` (Inv 12; part of the TCB spine).
- **`S`** Signed images + SBOM + CVE gate at admission (**`M`** if regulated) (§7).
- **`S`** Provenance / attestation.

**Theme 10 · Compliance & audit**
- **`S`** Retained observed-state history — evidence over time (§14).
- **`S`** Continuous compliance evidence / attestation packages (§14).
- **`S`** Independent auditor read access, split from Security (§7).

**Theme 11 · Break-glass & recovery** *(teams need a defined emergency exit)*
- **`M`** Scoped, time-boxed, dual-controlled break-glass — ratify-or-revert debt (§7).
- **`M`** Out-of-band kill-switch (Inv 13) · **`S`** meta-DR re-bootstrap (§12).

**Net:** the **`M`** rows are the Phase-1 adoption bar — enough for a team to *declare → run → serve →
observe* a real workload, and enough for security to delegate an envelope it trusts. The one item to pull
forward from **`S`** is the **auto-merge-below-floor** policy (Inv 18): without it, routine changes queue
behind a human and the platform quietly reverts to "self-operated."

> **Two red-team caveats on this MoSCoW.** **(R10)** `M` is the bar for a real *tenant*, not the *thin
> slice* — read literally, "build all of `M`" is the boil-the-ocean killer §1 warns against. Phase 1 builds
> only the **`M`-subset the first blueprint transitively requires** (one compute kind + LB + DNS + certs +
> one store + secrets + identity + gate/mint + audit + the governance envelope); the rest of `M` waits for
> the first real tenant. **(R11)** the cut is **partner-dependent** — a regulated wedge (Q6) *pulls* Arc-2
> rows (signed images / SBOM / CVE, compliance evidence) from `S` into `M`, because security can't say yes
> without them.

---

## 6. Phasing to stack wins and reach market faster

Each phase ships something **demoable or sellable** — the antidote to the #1 killer (boiling the ocean).
The order front-loads the two differentiators so the wedge is provable before the platform is finished.

| Phase | Theme | Ships (the win) | Roughly |
|---|---|---|---|
| **0 — Model** *(done)* | Prove the dynamics | Spec + simulator → design-partner on-ramp | now |
| **1 — Provable provisioning** | The wedge | **One blueprint, real AWS**: posture → plan+proof → gate → diff-scoped cred → apply → reconcile + self-heal. Demonstrates **both** uncontested differentiators on one account. Land 1–2 design partners. | a few months, small team |
| **2 — Trustworthy v1** | Production-credible | TCB hardening + transitions + Data Protection + FinOps/Views/incident + a few more batteries. First paying customer in bounded scope. | a couple of quarters |
| **3 — Platform** | Multi-team scale | Self-upgrade, org-change, control-plane partitioning, more blueprints, compliance attestation. | maturity |
| **4 — Reach** | Optional breadth | Second provider adapter (if demanded), rung-4 leaf optimization, SaaS option. | on demand |

**Why this order beats the §20 sequence verbatim:** §20 is dependency-correct; this is *market*-correct —
it pulls the planner-proof and diff-scoped creds (the only things competitors lack) into Phase 1 so the
demo sells, while deferring the elegant edges (M&A, multi-cloud, self-upgrade) that buyers won't pay extra
for yet. The dependencies are preserved; the emphasis is moved to the differentiators.

**Time-to-market reality** (from buildability): a useful real slice in **months**; a credible v1 in **~a
couple of years with a funded team**; the elegant edges **later**. Phase 1 is the cheap truth-teller.

**Phase-1 exit criteria — guard against demo theater (R2/R4).** "The proof is reviewable and the loop feels
good" is a *UX* bar — necessary, not sufficient. Phase 1 is derisked only when, on a **real** AWS account,
the slice also: (a) has a minted credential **denied by AWS IAM** when it attempts an out-of-scope action
(Q2, differentiator #2 — *proven*, not asserted); (b) converges correctly through a **real async /
eventually-consistent** resource lifecycle (Q5, Inv 7); and (c) **detects and corrects a real out-of-band
drift**. A slice that demos the happy path but skips these has tested none of the 20% §7 calls load-bearing
— that is theater, not derisking. This also keeps the *market-first* order honest: front-loading the
differentiators for the demo must still prove the **hard kernel**, not a pretty proof over a shallow planner.

**Kill / no-go criteria — the off-ramp (R3).** buildability's "you learn cheaply if it's clumsy" only works
if stopping is allowed. Do **not** advance past the Phase-1 gate if: the proof is not legibly reviewable by
a non-author (Inv 18); the diff-scoped credential can't be clamped tightly enough to be meaningfully
least-privilege (Q2 fails); or deterministic-plan ↔ real-cloud reconciliation is too flaky to trust (Q5
unbounded). Each is a *stop-and-rethink*, not a *push-through* — surfacing them cheaply is the slice's job.

---

## 7. Tech stack — not settled, but a sensible default with clear roles  *(Plane 1 — what Trellis is built from)*

**Nothing in the spec or any doc names an implementation language — deliberately** ("*the grammar is an
ontology, not a runtime*"; "*build concrete controllers for the fixed, known cloud levels*"). The only code
that exists is the simulator (TypeScript / Astro / React / Node), which is a docs+sim site, **not** the
control plane. So a **Go / gRPC / Python / Node** stack is a reasonable default to *ratify*, not a recorded
decision. Each maps cleanly onto §18/§7:

| Layer | Language | Why it fits |
|---|---|---|
| **Reconciler fleet · actuators · mint · gate** (the privileged spine) | **Go** | Lingua franca of cloud infra (controller-runtime, Crossplane, AWS SDK, operators). Great concurrency for converge loops; static binaries + low memory directly serve Inv 19 (*near-stateless, scale-to-zero, cheap*). The **hands + the loop**. |
| **Internal wire between the partitioned fleet** | **gRPC + protobuf** | §7/§18 are a fleet of partitioned least-privilege services that must talk over **authenticated** channels (Inv 15). Protobuf gives typed, **versioned** contracts — exactly what self-upgrade's version-skew tolerance (§16) needs — plus mTLS and streaming for the observe path. The §15 **capability contract** is naturally proto service definitions. The **nervous system**. |
| **Planner / solver · catalog-time · FinOps analytics** | **Python** | The planner is an explainable objective solver (rungs, bounded leaf optimization, constraint validation); Python owns that ecosystem (OR-Tools, PuLP, z3, scipy). Unprivileged control plane — the **brain**. |
| **Console · Views · proof rendering** (Experience) | **Node / TypeScript** | The spec makes operator **Experience** a *correctness property* (the Function·Form·Substance·Finish lineage; Inv 18 — *an unreadable proof fails the gate*). The simulator already proves this stack. The **eyes**. |

**How they connect:** the Python planner emits a signed plan+proof → the Go **mint re-derives** the
credential scope from the *signed generation* (Inv 4 — never trusts the planner's asserted scope) → Go
actuators apply → all over gRPC/mTLS → Node renders the proof + Views for the human gate. The language split
*reinforces* the confused-deputy firewall (§7): the planner literally cannot hand the mint a scope across a
typed service boundary.

**Two things to decide consciously before locking it:**

1. **It's downstream of Q1 (Crossplane vs. standalone).** Crossplane/controller-runtime ⇒ you're committed
   to **Go + Kubernetes controllers**, and the internal contract becomes **CRDs / the k8s API**, not your own
   gRPC fleet. Standalone ⇒ the gRPC-fleet design is the right shape. **Don't lock the wire protocol before
   the Phase-1 spike resolves Q1.**
2. **The planner language is a real tradeoff.** Python buys the solver ecosystem, but the planner is *in the
   TCB*, where determinism (Inv 1) + reproducible builds (Inv 9) + dual-planner parity (Inv 17) reward build
   reproducibility — Python's weakest area. Either accept stronger pinning discipline for a Python planner, or
   do the planner in **Go** and keep Python for *offline* catalog-time solving only. Bonus: Inv 17 *wants* two
   independent planner implementations above the blast-radius threshold — a Go + Python pair is a **feature**
   there, not redundancy.

---

## 8. Test strategy — how far LocalStack/Testcontainers get you (and where they stop)

> **Verdict.** LocalStack + Testcontainers carry the inner loop and most of CI, but they **cannot replace a
> small, ephemeral real-AWS account.** They cover ~80% of the *test count* — but it's the **low-risk 80%**.
> The 20% they're structurally blind to is exactly where the two differentiators and the biggest failure
> modes live (buildability #5: "*the gap between the clean spec and the provider's actual behavior is where
> most of the ugly work lives*"). Reaching "80% done" without real AWS means 80% confidence on the *least*
> risky 80%.

**Three fidelity tiers:**

- **Tier 0 — pure logic, no cloud** *(every commit; the bulk)*: the **planner** (Inv 1 makes it a pure
  function of pinned inputs — it must *not* touch live cloud), the State function, drift detection,
  authorization (`authorized-by ∩ accepts ∩ role`), proof generation, transition-pattern selection. The
  simulator already proves this tier. ~90% of unit tests need nothing.
- **Tier 1 — LocalStack + Testcontainers** *(per-PR CI)*: actuator **API-contract tests** (right call, right
  args, idempotent), apply-step idempotency/resumability against a fake, the GitOps gate end-to-end, basic
  reconcile against a fake provider. Testcontainers also covers the non-AWS deps (Postgres, a Git server, the
  bus) and runs LocalStack itself. Catches "the code talks to AWS correctly."
- **Tier 2 — real AWS, ephemeral + guarded** *(nightly / pre-merge / the Phase-1 slice)*: small in test
  *count*, but it's the risk coverage — bounded by the §8 Budgets-Actions / SCP / nuke guardrails.

**Why Tier 2 is non-negotiable** — mocks return *instantly, consistently, and without enforcing policy*, so
every novel claim sits in the gap that creates:

| Spec claim | Why a mock is blind to it |
|---|---|
| **Diff-scoped least-privilege creds** (Inv 4 — *differentiator #2*) | LocalStack doesn't faithfully evaluate IAM denies; only real STS/IAM proves AWS *enforces* the minted scope. Validating this **is** the point. |
| **State model: Unknown / confidence-decay / staleness budgets** (Inv 7) | Built for **eventual consistency + async** (RDS ~15 min, IAM propagation, intermediate states); a mock is instant + consistent, so those paths never fire. |
| **Quota / throttling as a hard planner constraint** (§5, Q5) | LocalStack enforces no quotas and doesn't throttle. |
| **Multi-account Org · SCP floor · cross-account assume-role** (§8, §12, Inv 6) | SCP *enforcement* and real cross-account trust — the security backbone — barely exist in mocks. |
| **Leased apply** (Inv 16) | Needs real STS session expiry + real long-running ops. |
| **Stateful live cutover, RPO≈0** (§10) | Bespoke real RDS cross-region replication mechanics; zero signal from a mock. |
| **Cost-drift loop** (§13) | Real billing/Cost Explorer (mock the *pricing* for the planner; actual-vs-planned needs real bills). |

*(One exception in your favor: the EKS / reconciler-managing-a-reconciler slice (§6) is well-served by a
local **kind/k3s** cluster — better than LocalStack — so that piece can be largely local.)*

**The architectural unlock:** §15's provider **capability contract** + Inv 1's snapshot boundary mean you're
building a provider abstraction with a fake backing *anyway*. So write **contract tests that run the same
suite against both the fake/LocalStack and real AWS** — "the same agreement discipline that keeps the
reconciler honest" (§15), applied to your test doubles: cheap fidelity where the contract holds, the real
account catching where it doesn't.

---

## 9. What it costs to build and test on AWS — monthly

Two distinct buckets people conflate. **These are engineering estimates with assumptions stated, not
quotes** — actuals depend on always-on vs. ephemeral discipline, region count, and EKS-vs-ECS.

> ⚠️ **This is *AWS* spend, not the cost to build Trellis.** The dominant cost of the build is **payroll** —
> a funded team for ~2 years (buildability) — i.e. **~3 orders of magnitude** more than the figures below.
> Never quote the monthly AWS number as the build cost; it is a sliver. The only claim it supports is that
> the *running* footprint is cheap by construction (Inv 19), which is a different and narrower claim (R1).

### 9a. The Trellis control plane itself (dev/test)
The spec makes this *cheap by construction* — near-stateless, no consensus store, scale-to-zero (Inv 19):

| Item | Choice | ~$/mo |
|---|---|---|
| Compute (planner/reconciler/actuators) | Lambda + a small Fargate task for the poll loop | 30–150 |
| Desired-state store | GitHub (external) | 0–20 |
| External append-only audit | S3 Object-Lock + CloudTrail | 5–30 |
| Secrets / signing | Secrets Manager + KMS keys | 15–60 |
| Observed-state history | S3 / CloudWatch / Timestream | 10–50 |
| Leader-election lock | DynamoDB (trivial) | 1–5 |
| Networking | **VPC endpoints over a NAT gateway** (NAT is the silent ~$32/mo+egress trap) | 5–70 |
| **Control plane subtotal** | | **~$70–400** (≈ $150 typical) |

### 9b. The managed/test infrastructure Trellis provisions
Where cost actually lives — exercising a full C0 active-active stack. Per persistent test environment:

| Driver | Note | ~$/mo |
|---|---|---|
| RDS Multi-AZ + cross-region read replica | dominant; one engine for v1 | 200–500 |
| Compute (ECS/Fargate; EKS adds ~$73/cluster control plane) | ECS first, one EKS in Phase 2 | 100–400 |
| NAT gateways (multi-AZ × multi-region) | the second silent killer | 70–200 |
| Cross-region data transfer | active-active replication | 50–200 |
| ALB ×2, Route53, ACM, KMS, misc | | 40–90 |
| **Per persistent C0 env subtotal** | | **~$500–1,400** |

### 9c. Blended monthly (build + test)

| Posture | Assumptions | ~$/mo |
|---|---|---|
| **Lean** | scale-to-zero control plane; **ephemeral** test envs torn down after each run; ECS not EKS; single-region most of the time | **~$400–800** |
| **Realistic** | control plane always-on + one persistent integration env + ephemeral C0 multi-region bursts + one EKS cluster | **~$1,000–2,500** |
| **Heavy** | multiple always-on multi-region C0 envs, continuous load, EKS everywhere | **$3,000–6,000+** |

**Cost levers (in priority order):** (1) make test envs **ephemeral** — spin up, validate, tear down
(Trellis itself enables this); (2) **VPC endpoints over NAT**; (3) **ECS before EKS**; (4) **single-region by
default**, burst to multi-region only for the active-active tests; (5) **one** stateful engine in v1.

**Two costs the ephemeral lever can't touch (from the red-team).** **(R5)** The **org substrate** — AWS
Organizations / Control Tower / multi-account / SCPs (the §8-delegation + §12-bootstrap backbone) — is
*persistent and slow*: account create/close is rate-limited, closed accounts linger ~90 days, Control Tower
is heavyweight to stand up. Budget it as a standing cost + a setup-time tax, separate from the nukeable
workload envs. **(R6)** Until Trellis's own guardrails (§10) are trustworthy, **they don't protect the dev
account** — they're the thing under construction, and a reconciler bug (our own code) can provision a
fortune before its breaker exists. Run the build on **external AWS-native guardrails** (Budgets Actions
hard-stop, SCP instance/region denials, low per-account limits) until the platform's own can be trusted.

---

## 10. Guardrails — and yes, building them *is* the product

Cost (and blast-radius) guardrails come in two layers. The happy accident: **the spec-native guardrails are
the same machinery the test-account guardrails need — so building Trellis builds its own guardrails
(dogfooding).**

### 10a. Spec-native guardrails (already designed — §13, §17)
- **Budget is a planner constraint**, not a bolt-on alarm — the structure is shaped to fit the budget, and a
  **budget-breach throttles or blocks provisioning** (§13). *(This is itself a differentiator — competitors
  gate on budget* after *authoring; Trellis compiles against it.)*
- **Reconciler circuit breakers** — remediation rate-limit, flap detection, **blast-radius breaker** that
  halts a wave touching > X% of a scope (§9, Inv 11). An approved mistake **can't** go company-wide.
- **Least-privilege ephemeral, plan-scoped credentials** (Inv 4) and **leased applies** (Inv 16) cap what any
  actuator can do and for how long.
- **Governance hard constraints + `accepts`/`fits` admission** reject out-of-policy resources *with a proof*
  before they're ever provisioned.
- **Change-freeze** windows govern the autonomous reconciler (§9).

### 10b. AWS-account cost guardrails for the build (standard, ship day one)
- **AWS Budgets + Budget Actions** — per-account and per-tag budgets that **auto-stop/deny** at threshold.
- **SCPs** — deny expensive instance families, deny non-approved regions, require tagging — the org-floor
  (monotonic-tightening, Inv 6) applied to *our own* dev org.
- **Cost Anomaly Detection** + billing alerts — catch the runaway before the invoice.
- **Mandatory tagging** (cost-center/env) enforced as a Governance rule → per-tag budgets (§13).
- **Ephemeral-env teardown automation** (e.g. `cloud-nuke`) + an **instance scheduler** to stop dev
  resources off-hours — the single biggest real-world saver.

**Net:** the build is bounded both *technically* (blast-radius breakers, leased least-privilege creds) and
*financially* (Budgets Actions + SCPs + anomaly detection + ephemeral teardown). A runaway is foreclosed by
design, not vigilance.

---

## 11. Red-team — how this assessment kills the build (Munger inversion)

Turning the spec's own discipline on this document: not "is the plan good?" but **"how would we *guarantee*
the build fails while following this readiness doc to the letter?"** Each kill-path is scored **✓ guarded**
(the doc already forecloses it), **◑ partial** (named, residual remains), or **➕ GAP → fixed** (a real hole
in *this* doc, now patched in the section noted). Strongest finding first.

| # | Kill-path (follow the doc and die) | Status | Defense / fix |
|---|---|---|---|
| **R1** | **Read "$500–2.5k/mo" as the cost to build Trellis.** The doc's most concrete number answers "AWS monthly spend," but a funder conflates it with *build* cost — ~1000× larger (a funded team for ~2 years). The project is funded on a false premise and runs dry at 10% done. | ➕ GAP → §9 | Added a loud caveat: **the dominant cost is payroll, not AWS**; the monthly figure is a sliver and must never be quoted as build cost. The only claim it supports is that the *running* footprint is cheap (Inv 19). |
| **R2** | **Demo theater passes for derisking.** Phase 1's success bar ("proof reviewable, loop feels good") is a *UX* bar. Ship a happy-path demo on one account, declare "derisked," then die in Phase 2 on the 20% §8 calls load-bearing (IAM enforcement, eventual consistency, multi-account, stateful). | ➕ GAP → §6 | Added **Phase-1 exit criteria**: the slice must hit the hard 20% on real AWS — an IAM-*denied* out-of-scope action, an async/eventually-consistent convergence, a real drift-stomp — not just a legible proof. |
| **R3** | **No off-ramp → sunk-cost march.** The doc only says how to proceed, never when to stop; buildability's "you learn cheaply if it's clumsy" is never operationalized, so a failing Phase 1 continues anyway. | ➕ GAP → §6 | Added explicit **kill / no-go criteria** at the Phase-1 gate. |
| **R4** | **Front-loading the differentiators front-loads the research risk.** §6 pulls the two *least-proven* pieces (the compiler bet + the unmeasured IAM-diff gap, Q2) into Phase 1 for *market* reasons; if Phase 1 must also *sell*, the temptation is to fake the hard kernel (a pretty proof over a shallow planner). | ➕ GAP → §6 | Named the tension; Phase 1's job is the **hard kernel** (sound proof + genuinely clamped credential), enforced by R2's exit criteria — not a demo veneer. |
| **R5** | **"Ephemeral test envs" doesn't apply to the org substrate.** §9's lean estimate leans on spin-up/tear-down, but AWS **Organizations / Control Tower / multi-account / SCP** testing (the §8 delegation + §12 bootstrap backbone) is *persistent and slow*: account create/close is rate-limited, closed accounts linger ~90 days, Control Tower is heavyweight. The cheap number assumes away the un-nukeable part. | ➕ GAP → §9 | Added: budget a **persistent org/Control-Tower substrate** as a standing cost + setup-time tax the ephemeral lever can't touch. |
| **R6** | **Building the cost guardrails *with* the cost guardrails.** §10's breakers (budget, blast-radius, FinOps) are the *thing under construction* — they don't protect the dev account until they work, and a reconciler bug (our own code) can provision a fortune before its breaker exists. | ➕ GAP → §9/§10 | Added: until Trellis's own guardrails are trusted, the dev account runs on **external AWS-native guardrails** (Budgets Actions hard-stop, SCP instance/region denials, low account limits), never the half-built ones. |
| **R7** | **The white space is perishable, treated as durable.** §1 leans on an *uncontested* moat from a June-2026 scan that itself flags Humanitec "a feature-layer away" and some claims medium-confidence. A 2-year build toward a moat a rival closes in month 6. | ➕ GAP → §1 | Added: the window is **perishable** — re-scan competitors each phase; the durable advantage is the *coherent loop*, not any single feature (the competitive doc's own conclusion). |
| **R8** | **"2-week spike" understates the Crossplane fork.** Q1 reads as a cheap experiment, but §7 says it *determines the whole stack* and is near-irreversible if found late. A breezy spike picks wrong and Phase 2 is a rewrite. | ➕ GAP → §2 | Re-framed Q1 as a **foundational, hard-to-reverse fork**; the spike must output a decision with an explicit reversibility cost, not a vibe. |
| **R9** | **Defer the wedge customer as "product, not engineering."** Q6's parenthetical demotes the one question that kills by *building the wrong blueprint*: no partner → Phase 1 demos to nobody and blueprint #1 fits no real workload. | ➕ GAP → §2 | Re-rated Q6 to **co-equal with the build** — a named design partner is a Phase-1 *input*, their workload defines blueprint #1. |
| **R10** | **The "M" set is a platform, not a thin slice.** §5 tags ~20 capabilities **M** ("day one"), but §1/§6 promise a *thin* slice — read literally, "day-one Must" = boil the ocean = the #1 killer. | ◑ partial → §5 | Clarified: Phase 1 builds only the **M-subset the first blueprint transitively requires**; the rest of M is "day-one for a real *tenant*," deferred to the first real tenant. |
| **R11** | **Security says yes to a half-guarded surface.** Arc 1 (self-service) ships fast while some Arc-2 items (signed images/SBOM/CVE, compliance evidence) are **S** — but the likely wedge (regulated/audit-heavy) needs those *day one*, so security says no, or yes to something not yet safe. | ◑ partial → §5 | Reinforced: the wedge segment (Q6) **pulls** specific Arc-2 rows into Phase 1 — the MoSCoW is partner-dependent, not fixed (§5 already flags "**M** if regulated"). |
| **R12** | **Python in the TCB festers as "ratify later."** §7 flags the planner-language reproducibility tradeoff (Inv 9) but defaults to nothing; "decide later" + Python's weak build-reproducibility = a TCB invariant quietly compromised for dev convenience. | ◑ partial → §7 | Standing guidance: in the TCB, **reproducibility (Inv 9) outranks ecosystem convenience** — bias the planner to Go, keep Python offline (catalog-time) until proven reproducible. |
| **R13** | **Import a Plane-2 workload tool into the Plane-1 backbone** (the general form of the MSK mistake): make a teams-facing battery — Kafka/MSK, a lakehouse, a team DB — a control-plane dependency, recreating the near-stateless/no-SPOF violation the spec forbids (Inv 12/19). | ➕ GAP → §3 | Promoted to the **§3 "one rule"**: never let a Plane-2 tool become a Plane-1 dependency; the control plane stays broker-free/near-stateless, batteries are provisioned per-tenant behind the contract. |
| **R14** | **The two-plane model itself misleads.** Read as a *wall* it denies the self-hosting recursion (Plane 1 is eventually a Plane-2 workload, §12/§16) → no dogfood, no meta-DR; read as a *sequence* it becomes build-P1-first (the cathedral); and the absolute "one rule" is violated day-one by Git/OCI/S3 and then discarded. | ➕ GAP → §3 | Added an **inversion check** to §3: *lens-not-wall* (build P1 as a governable P2 workload), *ownership-not-sequencing* (Phase 1 cuts vertically through both), and a *sharpened rule* (no tenant-provisioned battery on the synchronous critical path; shared infra is fail-static/pinned). Residual cautions (TP2/6/7): provider-seam, curated P2, single-deployment-with-tenancy. |

**What the inversion produced.** Eleven genuine holes in this assessment (R1–R9, R13–R14), patched in the
sections noted; three residuals (R10–R12) named and bounded. Two headlines: **the most dangerous artifact in
this document is its cheapest number** — the AWS cost — because it invites funding the build on a sliver of
its true cost (R1 is the direct fix); and the most dangerous *architectural* temptation is collapsing the two
planes — letting a Plane-2 battery become a Plane-1 dependency (R13), or rigidly walling them so Trellis
can't host itself (R14) — both foreclosed by the §3 model + its inversion check.

---

## 12. The one-paragraph answer

We have enough to start; the only honestly-open questions are implementation-level (led by the
build-vs-Crossplane substrate fork) and are cheapest to answer by **building Phase 1**, not by more design.
The must-haves are the differentiated spine (reconcile loop + plan-as-proof planner + diff-scoped credential
mint + gate) plus exactly the batteries one real workload needs; transitions, FinOps, and TCB-hardening are
should-haves right behind it; self-upgrade, org-change, and multi-cloud are nice-to-haves for later.
Phasing front-loads the two things no competitor ships so the wedge is demoable in months. Day-one
adoption turns on the **`M`** capability rows (§5) — a team can declare→run→serve→observe a real workload
by PR inside a delegated envelope, and security says yes because it authors that envelope once and trusts
the proof + mint + audit rather than reviewing each change; skip the auto-merge-below-floor lever and the
"self-service" quietly reverts to tickets. The stack isn't settled — **Go for the spine, gRPC/protobuf for the fleet wire, Python for the solver, Node/TS for the
console** is a sensible default to ratify, but it's downstream of the Crossplane fork and the
planner-language reproducibility tradeoff. **LocalStack + Testcontainers carry the inner loop and most of
CI, but can't replace a small ephemeral real-AWS account** — the 20% they can't mock (IAM enforcement,
eventual consistency, quotas, cross-account trust, real cost) is the load-bearing part. A dev/test AWS
footprint runs **~$500/mo lean to ~$2.5k/mo realistic**, and the guardrails that keep it there are the same
Budget-constraint, circuit-breaker, and least-privilege mechanisms Trellis exists to provide — so we build
them once and use them twice.
