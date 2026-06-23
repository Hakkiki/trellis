# Third-party integrations — a brainstorm

*Status: brainstorm / design exploration, not yet spec.* A companion to
[`implementation-readiness.md`](implementation-readiness.md). The question: **how does Trellis make
deploying and governing third-party software easy**, when today every vendor is a bespoke,
ticket-driven snowflake? Grounded in primitives the spec already has — the **External** workload (§1),
**Weave** + **Governance-gates-Weave** (§3/§6), the **supply-chain TCB** (§7), and the **two-plane model**
([readiness §3](implementation-readiness.md)).

> **Thesis.** Today, integrating a vendor is a pile of manual security groups, IAM grants, scans, and
> renewals — effort that scales with vendor count and rots. Trellis should make the **integration itself a
> declared, governed, reconciled artifact**: you author an *Integration Profile*, and the planner compiles
> the network plumbing, the least-privilege exceptions, the data-exchange contract, and the supply-chain
> gate — `posture → plan + proof → approve → reconcile`, same loop as everything else. Common vendors ship
> as **pre-vetted profiles in the catalog** (the "Helm chart, pass params, go" experience — generalized
> past Helm).

---

## 1. The organizing frame: open-loop vs closed-loop

Every third party sits somewhere on one spine — **how much of it runs where we can govern its runtime.**
This is the lens to think in.

| | **Closed-loop** | **Open-loop** |
|---|---|---|
| **Where it runs** | in our cloud (we provision it) | the vendor's cloud (we consume it) |
| **Spec primitive** | a **Service / Component** from an *external supply chain* | an **External** node (§1) — observe-only |
| **What we can govern** | full lifecycle: provision · scan artifact · CVE-gate · least-priv creds · traffic-inspect · self-heal | only the **boundary**: network path · scoped creds · data contract · exception grants · observe |
| **What we *can't*** | (little — it's ours) | scan its internals, reconcile it, inspect E2E-encrypted traffic |
| **Governance leans on** | the artifact + the runtime | **attestation** (SOC2/ISO) + boundary controls + data minimization |

**The strategic principle:** *maximize the closed-loop surface, minimize and tightly contain the open-loop
surface.* Wherever the vendor offers a choice — PrivateLink vs public, agent vs pure-SaaS, self-hosted tier
vs SaaS tier — **prefer the option that converts open-loop into closed-loop**, because closed-loop is
governable. And, mirroring §15's lock-in reporting, make **open-loop exposure a measured, reported
property** per integration — not a silent accumulation.

**Two-plane tie-in (the trap):** a third party is **Plane 2** (workload tier) — Trellis governs the
*integration*, never implements the vendor. The hazard (readiness R13): an open-loop SaaS quietly becoming a
**Plane-1 synchronous dependency** (an observability or identity vendor the control plane *needs* to
function). The one rule applies — a third party may never sit on the control plane's synchronous-fate path;
if a control-plane function consumes a vendor, it must be **fail-static / pull-and-cache** (Inv 12).

The highest-risk version is subtle (red-team TPI8): a **platform-team-adopted** observability / alerting /
identity SaaS — e.g. the Datadog example below — that the control plane quietly comes to *depend* on. The
control plane's own observability must stay **fail-static and on an independent channel** (Inv 15), never
solely a vendor. And open-loop exposure is a **posture-set budget with a breach action** (block new
open-loop integrations above a threshold / escalate the gate), not just a reported number (TPI6).

---

## 2. The deployment-model zoo (and how Trellis handles each)

The "ideal" (a parameterized Helm chart) is one of five common shapes. The loop column says how much is
closed vs open.

| Model | What the vendor ships | Loop | Trellis's move |
|---|---|---|---|
| **A · In-cluster (Helm)** | a parameterized Helm chart | **closed** | Trellis owns the cluster as a resource (§6); the chart is a **pinned, signed catalog entry**; pass posture-derived params, admit via the supply-chain gate. The idiomatic happy path. |
| **B · AMI / non-idiomatic EC2** | an AMI or a bespoke EC2 recipe | **closed (opaque)** | provision the instance(s) as **Structure**; wrap with least-priv instance role, SG, patch/replace lifecycle. Artifact is opaque → scan the AMI + require a vendor SBOM + a runtime agent (see §5). |
| **C · AWS-service-backed** | needs specific AWS services (MSK, EKS, S3, IAM roles) | **closed** | the vendor's *dependencies* become Trellis-provisioned Structure with governed config (encryption, residency, least-priv). The vendor app is B or A on top. |
| **D · Hybrid SaaS (agent + backend)** | an **agent** we run + their **SaaS** backend | **mixed** | the **agent is the leverage point** — closed-loop (run it, scan it, least-priv it, push policy into its footprint); the backend is open-loop (boundary-govern it). |
| **E · Pure SaaS** | an API only | **open** | an **External** node: govern the egress path, the scoped vendor credential, the data contract, the exception grants; **observe** health; no artifact to scan → attestation. |

The **Integration Profile** (below) is the one manifest that captures *which model* plus the cross-cutting
axes — so onboarding collapses to "fill the profile," not "open ten tickets."

**The hybrid agent is the liability point, not just the leverage point (red-team TPI3).** It runs *vendor
code* with *our creds* inside *our perimeter* — the ideal lateral-movement pivot, and a supply-chain hit on
the agent image is an instant insider. Treat it as **untrusted-by-default and most-sandboxed**: its own
microsegment, egress only to the vendor backend, short-lived workload identity (no standing creds), and
anomaly-monitored.

---

## 3. The Integration Profile — one declared artifact

A signed, versioned catalog entry (a specialization of a Component, §1) that declares the integration along
every axis. The planner compiles it into the concrete plumbing + proof. Sketch:

```yaml
integration: datadog-apm
class: hybrid-saas              # helm | ami-ec2 | aws-backed | hybrid-saas | pure-saas
loop: mixed                    # closed | open | mixed
deployment:
  agent:                       # the closed-loop footprint (if any)
    pattern: helm
    chart: datadog/datadog@3.x # pinned + cosign-verified
    runs_in: cluster/observability
  backend: saas                # the open-loop part
connectivity:
  egress: { path: privatelink, endpoints: [api.datadoghq.com] }   # privatelink > public-allowlist > peering
  ingress: none               # none | webhook | agent-callback
  inspection: required-or-prove   # required | required-or-prove | none
data_exchange:
  outbound: [metrics, traces, logs]
  classification: [non-pii]
  residency: us               # hard Governance constraint (§2)
  pii: deny                   # DLP: no PII may traverse
supply_chain:
  signature: required(cosign)
  sbom: required(cyclonedx)
  cve_gate: { block: high, warn: medium }
  rescan: continuous
exceptions:                   # least-priv capability grants, gated + proven
  - { grant: read, capability: cloudwatch:metrics, scope: account/observability,
      proof: "APM needs CW metrics for host correlation" }
governance:
  whitelist: approved
  vendor_attestation: [soc2, iso27001]   # stands in for scanning the open-loop part
```

`Author` it as a PR → the planner emits the SGs, PrivateLink endpoint, IAM grants, DLP/egress rules, and the
scan gate, **with a proof** ("egress via PrivateLink because `inspection: required-or-prove` + `pii: deny`;
CW-read granted because exception X"). Approve = merge = a scoped credential applies it; the reconciler holds
it. **The integration is now a first-class, drift-corrected, audited object** — not a forgotten console
change.

**Enforced vs asserted — the honesty the profile must keep (red-team TPI1/TPI5).** The profile and its proof
must *visibly separate* **enforced** controls — compiled into SG / IAM / PrivateLink / route, actually
guaranteed — from **asserted** ones — vendor attestation, `pii: deny` on traffic we can't inspect — which are
merely declarative. For open-loop, residency is enforced on *placement + path* (strong) but payload-level PII
control is only as strong as feasible DLP (weak). A green profile must never imply a guarantee it can't keep.
Profiles are **signed + transitively pinned** (chart / image / AMI *digests*, Inv 12) — no floating vendor
versions, and a profile change re-plans dependents (TPI4) — and carry a gated **escape hatch** for
un-profileable vendors (max-audited, time-boxed, with a debt to convert to a profile) so the genuinely weird
ones stay *inside* governance instead of routing around it (TPI7).

---

## 4. Connectivity & network posture

Default-deny adjacency (§6) is the baseline; every third-party edge is an **explicit, provable crossing**.
Preference order, best→worst for governability:

1. **PrivateLink / VPC endpoint** — vendor traffic never touches the public internet; closed-loop-ish path.
   *Prefer this whenever the vendor offers it.*
2. **VPC peering / Transit Gateway** — for vendors with a presence we can peer to.
3. **Public egress, FQDN/IP allowlist** — locked to specific endpoints, never `0.0.0.0/0`.
4. **Inbound** (webhooks, agent call-backs, vendor scanners reaching in) — the riskiest; least-priv,
   authenticated, rate-limited, single-Frame-scoped, max-audited.

Direction matters: **egress-only** is far safer than **bidirectional**; the profile declares direction and
the planner refuses an undeclared one. This *is* "Governance gates Weave" applied to vendors.

---

## 5. Traffic inspection — require it, but prove the fallback when you can't

You want to require inspection; honestly, **it's often infeasible** (TLS pinning, E2E encryption, vendors
that forbid MITM, pure-SaaS over the public internet). The spec already says packet-level inspection is a
*runtime control, out-of-model* (§7/§19) — but **whether it's required, and what stands in when it can't
run, is squarely in-model** (Governance + proof). Resolution:

- **`inspection` is a posture knob per integration**, defaulted by Criticality + data-classification (C0 /
  PII-bearing → `required`).
- **`required-or-prove`**: if inspection is feasible (closed-loop egress through a forward proxy / AWS
  Network Firewall / GWLB appliance), enforce it. If **not** feasible, the plan **must prove compensating
  controls** instead — PrivateLink (no public path), a tight FQDN allowlist, DLP at the app boundary,
  data-classification limits on what may traverse, and enhanced flow-logging — and **fail loud** if it can't
  offer them. *Never silently un-inspected.*
- An un-inspectable edge carries a visible **debt** (like a Frozen-state debt, §4/§7) — flagged in the
  proof, compensated, owned, and re-reviewed — not a quiet hole.

So "I'd like to require inspection" becomes a *defaulted, provable posture*, with an honest, named fallback
where physics says no.

---

## 6. Data exchange — a declared contract, residency-checked

Exchanging data with third parties is first-class, not ad-hoc. The profile's `data_exchange` block is a
**contract**: datasets, direction, classification, residency, encryption (in-transit + at-rest), retention,
PII handling. The planner compiles it and **enforces residency as a hard constraint** (§2) — it *refuses* an
exchange that would move EU PII to a non-EU vendor, with a proof, and that includes **cross-region backup**
paths (the §2/§10 residency rule).

Mechanism patterns (catalog entries, Criticality/loop-picked):

| Pattern | Use | Notes |
|---|---|---|
| **Governed S3 exchange bucket** | bulk/file | cross-account bucket policy + KMS + residency-checked replication |
| **API egress (with DLP)** | request/response | FQDN-locked; DLP scans payloads where inspection is feasible |
| **Event stream** | continuous | a *Plane-2 messaging battery* (Kafka/MSK *or* SQS/EventBridge) — never the control plane's bus (R13) |
| **PrivateLink data plane** | high-volume/private | best path; converts open→closed for the data leg |
| **SFTP / managed transfer** | legacy partners | AWS Transfer Family, governed |

---

## 7. Supply chain — scans & CVE, by loop

Direct extension of the §7 TCB control ("signed images + SBOM + CVE gate admitted by Governance — the
catalog-signing discipline extended to what Resources execute"). The catch: **you can only scan what you can
see.**

- **Closed-loop artifacts (Helm images, AMIs, packages):** admission gate = **signature verify (cosign) +
  SBOM (Syft/CycloneDX) + CVE scan (Trivy/Grype) + OPA policy** → block/warn by severity × posture. Plus
  **continuous re-scan**: a new CVE on an already-deployed vendor artifact is a *risk drift* signal — flagged
  and routed, not silently aging. AMIs are the hard case (opaque) → scan the image, require a vendor SBOM,
  and add a runtime agent for what static scan misses.
- **Open-loop (pure SaaS):** **no artifact to scan** → the surface shifts to **vendor attestation** (SOC2 /
  ISO / a vendor-provided SBOM if any), continuous **posture monitoring** of the integration (cred age,
  anomalous access, the External node's health), and treating the **scoped credential + the data leg** as the
  thing to monitor. Honest limit: this is *assertive*, not *inherent*, assurance — the same downgrade the
  spec makes about its own security claims.

---

## 8. Capability exceptions — least-privilege, gated, provable

"Vendor needs to talk to capability X on our infra" (a monitoring vendor reading CloudWatch; a backup vendor
touching S3/KMS; a scanner with cross-account read) is the most dangerous part — and today the most
hand-waved. In Trellis it's a **first-class, gated Author action** (§7): each exception is a least-privilege
grant with a **proof** ("vendor X may read capability Y, scope Z, because …"), minted as a **scoped,
expiring credential** (Inv 4), audited, and re-reviewed. No standing, unscoped vendor access; no console
IAM-role-with-`*` that outlives the reason it was created. The `accepts`/`fits` contract bounds what an
integration may even *request*.

---

## 9. Why this makes it easy (the payoff)

| Today (the pain) | With Trellis |
|---|---|
| each vendor = bespoke SGs, IAM, scans, renewals, tickets | author one **Integration Profile**; the planner compiles the rest |
| security review per vendor, manually | the **proof** shows the realized network/IAM/data diff; gate scales to blast radius (Inv 18) |
| scans run once, then rot | **continuous re-scan**; new CVE = risk-drift signal |
| access grants outlive their reason | **scoped, expiring, proven** exceptions; drift-corrected |
| common vendors re-integrated from scratch | **pre-vetted vendor profiles in the signed catalog** — select + parameterize |
| open-loop exposure accumulates silently | **measured + reported** per integration |

The "Helm chart, pass params, go" dream, generalized: the *integration* — not just the deployment — becomes
a parameterized, governed, reconciled artifact.

---

## 10. Open questions / honest gaps

- **The open-loop scanning gap is real and unclosable.** You cannot CVE-scan a SaaS you don't run; attestation
  + boundary control + data minimization is the ceiling. Be honest that pure-SaaS assurance is *assertive*.
- **Traffic inspection may be infeasible more often than `required-or-prove` makes comfortable** — the
  compensating-controls set needs to be concrete enough to actually substitute, or it's theater.
- **AMI / opaque-artifact scanning** is bespoke per vendor and weaker than image scanning — how far do we go?
- **Vendor profile catalog curation** is an ongoing cost (profiles rot as vendors change) — who owns it, and
  how does a profile pin transitively (Inv 12) when the vendor ships `latest`?
- **The Plane-1-dependency trap (R13)** needs a hard check: forbid any integration from landing on the
  control plane's synchronous path, enforced, not just advised.
- **Hybrid-agent blast radius:** the agent we run for a vendor has *our* creds and *their* code — it's a
  confused-deputy risk; how tightly can we sandbox it?

---

## 11. Red-team — how this integration model fails (Munger inversion)

*"How would adopting this third-party model **guarantee** the catastrophe it's meant to prevent — an
ungoverned, compromised, or data-leaking vendor?"* Scored **✓ guarded** / **◑ partial** / **➕ GAP → fixed**
(folded into the section noted).

| # | Kill-path | Status | Defense / fix |
|---|---|---|---|
| **TPI1** | The Integration Profile makes an open-loop SaaS *look* governed (scan gate, data contract) while nothing is enforced at runtime — teams trust a green checkmark over controls that are merely asserted. | ➕ GAP → §3 | Profile + proof **split enforced controls** (compiled into SG/IAM/PrivateLink — real) **from asserted ones** (attestation, `pii: deny` on E2E traffic — declarative); the gate shows which is which. The "assertive not inherent" trap, integration edition. |
| **TPI3** | The hybrid **agent** — vendor code + our creds inside our perimeter — is the perfect lateral-movement pivot; a supply-chain hit on the agent image = instant insider. | ➕ GAP → §2 | Treat it as **untrusted-by-default, most-sandboxed**: own microsegment, egress only to the vendor backend, short-lived workload identity, anomaly-monitored. Leverage point *and* liability point. |
| **TPI4** | A pre-vetted **profile rots** or pins `latest`; one bad profile auto-deploys a vulnerable vendor everywhere (the §7 catalog supply-chain bomb, vendor edition). | ➕ GAP → §3 | Profiles signed + **transitively pinned** (chart/image/AMI digests, Inv 12); a profile change is a gated, re-planning Author action; no floating vendor versions. |
| **TPI7** | The profile can't express a weird vendor → teams **route around** Trellis ("just give me console access for this one") — recreating the snowflake *outside* governance. | ➕ GAP → §3 | A gated **escape hatch** that keeps un-profileable vendors *inside* the envelope: max-audited, scoped, time-boxed, carrying a **debt** to convert to a profile. Better an ugly governed integration than a clean ungoverned one. |
| **TPI8** | A **platform-team-adopted SaaS** (observability/alerting/identity — the doc's own Datadog example!) quietly becomes a control-plane dependency, defeating R13 from the inside. | ➕ GAP → §1 | Named the **highest-risk Plane-1 vector**; the control plane's own observability must be **fail-static + on an independent channel** (Inv 15), never solely a vendor. |
| **TPI2** | `required-or-prove` inspection degrades to "prove" universally — every vendor claims infeasibility, the escape hatch swallows the rule. | ◑ partial → §5 | Infeasibility must be **proven** (demonstrated TLS-pin), not asserted; compensating set costlier than inspecting where possible; track the **inspected : compensated ratio** as a watched signal. |
| **TPI5** | Residency / `pii: deny` is enforced on the **path** (where the pipe goes) but not the **payload** (what flows) for open-loop/E2E — a stronger guarantee is implied than kept. | ◑ partial → §3/§6 | Stated: residency enforced on **placement + path** (strong); payload PII control only as strong as feasible DLP (weak). Same enforced-vs-asserted split as TPI1. |
| **TPI6** | "Measure open-loop exposure" without teeth = a number that only grows (the §19 visible-but-unstopped analog). | ◑ partial → §1 | Exposure is a **posture-set budget with a breach action** (block new open-loop above threshold / escalate the gate), not a dashboard. |

**Headline:** the model's most dangerous move is **dressing asserted controls as enforced ones**
(TPI1/TPI5) — a governed-*looking* profile over an open-loop SaaS manufactures a false sense of safety. The
enforced-vs-asserted split is the direct fix, and it is the same "assertive, not inherent" honesty the spec
turns on itself. The runner-up: the **hybrid agent** (TPI3) is the one place a third party gets our creds
inside our perimeter — sandbox it like an adversary, not a partner.
