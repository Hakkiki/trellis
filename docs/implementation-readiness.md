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
  not the loop**, and get the wedge demoable fast.

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
| Q1 | **Reconcile substrate: build standalone vs. stand on Crossplane/controller-runtime?** | Crossplane gives a proven reconcile loop + CRDs but *requires a Kubernetes control plane* and couples us to it; standalone keeps the near-stateless/scale-to-zero property (Inv 19) but is more to build. **The one genuine architecture fork.** | A 2-week spike in Phase 1 building the same thin reconcile loop both ways; decide on the demoable result. |
| Q2 | **The IAM-can't-express-"exactly-this-diff" gap.** | Inv 4 hair-cuts diff-scoped creds to *resource-set × action-set* + a re-validate-against-observed check. Whether that residual gap is tight enough in practice is unproven. | Implement the mint + re-validate against a real account; measure the over-grant; it's our #2 differentiator, so this is load-bearing. |
| Q3 | **Which stateful stores get live (RPO≈0) cutover first?** | Replicate→verify→atomic-cutover (§10) is bespoke per engine; we can't do all of RDS/Aurora/DynamoDB/Kafka at once. | Pick one (RDS Postgres) for v1; backup→restore→cutover for the rest. |
| Q4 | **The concrete blast-radius function.** | Invariants 11/17/18 all key off "computed blast radius crosses a posture-set threshold" — the spec leaves the *metric* abstract. | Define a first concrete metric (resources touched × Criticality × irreversibility) in Phase 2; tune against real plans. |
| Q5 | **Provider-quirk surface** — eventual consistency, service quotas, rate limits. | Buildability #5: "the gap between the clean spec and the provider's actual behavior is where most of the ugly work lives." | Bake quota-as-hard-constraint (§5) and snapshot-pinned determinism in from Phase 1; expect iteration. |
| Q6 | **First-customer wedge segment** *(product, not engineering)*. | Differentiators favor regulated / audit-heavy / platform-team buyers, but the design-partner target isn't named. | Pick 1–2 design partners alongside Phase 1; their workload shapes blueprint #1. |
| Q7 | **EKS vs ECS for the compute battery + the K8s-slice (§6) validation.** | EKS is needed to prove "reconciler managing a reconciler," but it's a cost driver and adds scope. | ECS/Fargate for the first blueprint; add one EKS cluster in Phase 2 to validate the cluster-not-namespace slice. |

---

## 3. Must / Should / Nice — what services ship when

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

## 4. Phasing to stack wins and reach market faster

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
couple of years with a funded team**; the elegant edges **later**. Phase 1 is the cheap truth-teller — if
the proof is genuinely reviewable and the loop feels good, the rest is large-but-derisked execution.

---

## 5. What it costs to build and test on AWS — monthly

Two distinct buckets people conflate. **These are engineering estimates with assumptions stated, not
quotes** — actuals depend on always-on vs. ephemeral discipline, region count, and EKS-vs-ECS.

### 5a. The Trellis control plane itself (dev/test)
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

### 5b. The managed/test infrastructure Trellis provisions
Where cost actually lives — exercising a full C0 active-active stack. Per persistent test environment:

| Driver | Note | ~$/mo |
|---|---|---|
| RDS Multi-AZ + cross-region read replica | dominant; one engine for v1 | 200–500 |
| Compute (ECS/Fargate; EKS adds ~$73/cluster control plane) | ECS first, one EKS in Phase 2 | 100–400 |
| NAT gateways (multi-AZ × multi-region) | the second silent killer | 70–200 |
| Cross-region data transfer | active-active replication | 50–200 |
| ALB ×2, Route53, ACM, KMS, misc | | 40–90 |
| **Per persistent C0 env subtotal** | | **~$500–1,400** |

### 5c. Blended monthly (build + test)

| Posture | Assumptions | ~$/mo |
|---|---|---|
| **Lean** | scale-to-zero control plane; **ephemeral** test envs torn down after each run; ECS not EKS; single-region most of the time | **~$400–800** |
| **Realistic** | control plane always-on + one persistent integration env + ephemeral C0 multi-region bursts + one EKS cluster | **~$1,000–2,500** |
| **Heavy** | multiple always-on multi-region C0 envs, continuous load, EKS everywhere | **$3,000–6,000+** |

**Cost levers (in priority order):** (1) make test envs **ephemeral** — spin up, validate, tear down
(Trellis itself enables this); (2) **VPC endpoints over NAT**; (3) **ECS before EKS**; (4) **single-region by
default**, burst to multi-region only for the active-active tests; (5) **one** stateful engine in v1.

---

## 6. Guardrails — and yes, building them *is* the product

Cost (and blast-radius) guardrails come in two layers. The happy accident: **the spec-native guardrails are
the same machinery the test-account guardrails need — so building Trellis builds its own guardrails
(dogfooding).**

### 6a. Spec-native guardrails (already designed — §13, §17)
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

### 6b. AWS-account cost guardrails for the build (standard, ship day one)
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

## 7. The one-paragraph answer

We have enough to start; the only honestly-open questions are implementation-level (led by the
build-vs-Crossplane substrate fork) and are cheapest to answer by **building Phase 1**, not by more design.
The must-haves are the differentiated spine (reconcile loop + plan-as-proof planner + diff-scoped credential
mint + gate) plus exactly the batteries one real workload needs; transitions, FinOps, and TCB-hardening are
should-haves right behind it; self-upgrade, org-change, and multi-cloud are nice-to-haves for later.
Phasing front-loads the two things no competitor ships so the wedge is demoable in months. A dev/test AWS
footprint runs **~$500/mo lean to ~$2.5k/mo realistic**, and the guardrails that keep it there are the same
Budget-constraint, circuit-breaker, and least-privilege mechanisms Trellis exists to provide — so we build
them once and use them twice.
