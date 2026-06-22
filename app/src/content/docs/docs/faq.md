---
title: FAQ
description: Straight answers to what Trellis solves, what it doesn't, what fails and why, and how the hard parts (security, networking, data, integrations) actually work.
---

Straight answers, including the awkward ones. Where this says "today," it means the shipped
artifact: a specification plus the interactive simulator on this site. The cloud is simulated; the
dynamics are real (applies take time, nodes fail, telemetry goes stale, bills drift). The target is a
self-hosted control plane for AWS first. Where the spec defers something, this says so.

## Start with the problem

### What problem does Trellis solve, and why is it needed?

Teams declare infrastructure in one place (Terraform, CloudFormation, scripts) and then spend the rest of
their time fighting the gap between *what they declared* and *what's actually running*. Drift creeps in
out of band. Changes are imperative and opaque: you read 400 lines of HCL and still can't say *why* a
security group exists or *who* authorized it. Spend balloons with no owner. An upgrade to the tooling
itself is a held-breath weekend.

Trellis closes that gap with one loop: Posture → planner → Structure → reconcile.

- You declare what you want (a *Posture*: services, criticality, resilience, regions, budget,
  governance), never how.
- A deterministic planner compiles it into a concrete Structure and emits a plan that is a
  proof: every resource traces to your objective or to a named constraint, with the derivation shown.
- A human approves the plan. Approval mints a credential scoped to just that diff.
- A reconciler holds reality equal to the approved Structure forever. Self-healing is just that loop
  running continuously.

The payoff is no magic: every change is explainable by the plan that authorized it, and "drift" stops
being a chore because correcting it is the loop's normal behavior.

### Why not just use Terraform / Pulumi / CloudFormation?

Those are *authoring and execution* tools. You still write the how, and drift correction is a command you
remember to run. Trellis sits a layer up: you state intent, it solves the structure and proves the
result, and a standing reconciler keeps it true. Underneath, an executor like Terraform could even be the
actuator behind the provider port (see below). Trellis replaces the reasoning and the standing loop, not
necessarily the low-level apply.

### Why not just chat with an AI agent to provision infrastructure just-in-time?

Because that puts the model in the one seat it should never hold: the hand on the cloud. An agent makes a
great driver. Trellis is the road, the rails, and the brakes. A good driver still needs all three.

Walk it through the four action classes above:

- **A chat transcript is not a proof.** Trellis approves a plan, and the plan proves itself: every resource
  traces to a reason, and the credential comes from the signed plan, not from whatever the agent says it
  wants. Approving an English summary is weaker than approving a signed, machine-checkable diff. The summary
  can read clean while the change underneath does something else.
- **It gives the agent standing god-write.** An assistant that provisions on demand needs broad, always-on
  write access to the cloud. Trellis refuses exactly that. It mints a credential scoped to one approved
  diff, and the credential expires. Chat-to-provision instead hands lasting power to a model that answers
  differently every time, at the layer where you most want the same input to produce the same result.
- **It runs no reconcile loop, so it cannot self-heal.** You chat, it provisions, the conversation ends.
  Then a node dies, a certificate expires, a setting drifts, and nothing pulls reality back to what you
  asked for. Trellis runs that loop forever. The loop is where the value lives, and chat-to-provision throws
  it away.
- **One chat surface everyone shares rebuilds the single point of failure.** Trellis slices the blast
  radius per division, so one team's bad day stays contained. Route everyone through one assistant and a
  single bad — or merely confident — action reaches the whole company again.

Put the model where it earns its keep: helping a person write the Posture and read the proof. Those are the
declare and explain ends of the loop. Seat it as the unaudited actuator instead and you get a fast, fluent,
confident operator turning a routine change into an outage, with nothing in its way.

This already happens. Here is a coding agent, mid-session, destroying work it had a direct hand on and
noticing only afterward:

![Two messages from a coding agent. First: "I made a mistake — I ran git reset --hard with the responsive/pinch fixes still uncommitted on the working tree, which discarded them. Let me verify what's actually on disk and re-apply." After checking disk state, second: "Confirmed — disk is back at the #41 state; my changes were lost. Let me branch first (so it can't happen again), then re-apply the responsive + pinch-guard fixes."](../../../assets/agent-git-reset-hard.jpeg)

*The agent ran `git reset --hard` over uncommitted work and wiped it out. It checked, confirmed the changes
were gone, and fell back to re-applying them from memory. No plan, no approval, no proof, and nothing to
roll back to. Move that same hand from a working tree to a cloud organization and you have the outage. The
point is not "don't use agents." It is that an agent's reach over live state belongs behind declare, prove,
and reconcile — not in place of them.*

## Who it's for

Platform and infrastructure teams (platform engineering, SRE, cloud/DevOps) running a multi-team cloud
org who want declared, proof-carrying, self-healing infrastructure with real delegation and
governance. It assumes a customer-owned management account and a hierarchical org (org → accounts →
regions → teams).

### Who is it *not* for?

The spec fences scope on purpose:

- **Not active multi-cloud.** One provider executes at a time (AWS first), implemented richly; others are
  *mapped* against the capability contract but built on demand. This is provider-risk mitigation, not
  "deploy the same thing to three clouds at once."
- **Not an edge platform.** Thousands of intermittently-connected sites need a disconnected,
  eventually-consistent reconciler, a different core model.
- **Not a workload-behavior controller.** Trellis governs *infrastructure authority*, not what your code
  does at runtime (egress filtering and anomaly detection live outside the model).
- **Not a global optimizer.** It uses a catalog of vetted blueprints ("catalog, not search"), not a
  solver that invents novel topologies on the request path.

If you want a turnkey PaaS that also writes your app, builds your images, and runs your CI, that's not
this. Trellis governs the ground your services run on.

## When things go wrong

### What happens when the planner can't find a feasible plan?

It fails loudly with the binding constraint and never silently invents. Example: "no realization fits
$8k/mo; the cheapest structure meeting your C0 + active-active floor is $8.6k/mo. Raise the budget or
lower the floor." You see which constraint bound the problem and what would unblock it. Try it:
set a tiny budget in the simulator and Plan.

### What does the reconciler do when it *can't* fix something?

It refuses to flail. Three guardrails you can watch in the simulator:

- **Fail-safe on Unknown.** If telemetry goes stale, state becomes `Unknown` and the loop *holds*; it
  never acts on blind data.
- **Flap breaker → Stalled.** A self-heal that never sticks (a root-cause failure the loop can't fix)
  trips a circuit breaker to `Stalled` and raises an incident for a human, instead of stomping
  forever.
- **Blast-radius breaker.** If a single pass would remediate a large share of the fleet (e.g. a region
  outage), it halts and pages rather than mass-stomping; an operator explicitly proceeds.

### Isn't a control plane with standing write access one giant blast radius?

Yes, that's the central hazard, and the spec turns the same maker-checker discipline on the core (the
"trusted computing base": planner, proof, gate, catalog, reconciler). The named failure modes and their
mitigations:

- **The planner is a confused deputy.** A compromised planner could show a benign proof while minting an
  attacker-chosen scope. → A separate mint authority re-derives the credential scope from the signed
  manifest, never from a field the planner asserts; plans are signed and approval binds to the bytes.
- **The reconciler is steerable by drift.** It holds the only standing god-write, and attacker-induced
  "drift" could be stomped into place. → Change-kinds are bounded at the *credential* layer; generation
  stamps are signed; remediation volume is rate-limited and anomaly-alerted; destructive convergence
  needs human confirm; and there's an out-of-band kill-switch the reconciler cannot disable.
- **The catalog is a supply-chain bomb.** Blueprints are trusted by every plan. → Entries are signed and
  versioned, consumers pin versions, and a catalog change is a highest-rigor dual-control action that
  re-plans dependents.
- **A bad self-upgrade can brick the loop.** Upgrading the control plane can disable the very thing that
  would heal it. → It runs at the highest gate (sealed-root / dual-control),
  canaried; recovery is meta-DR: re-bootstrap from a signed external seed plus a known-good generation.
  (The simulator's "Control plane" panel lets you trip and recover this.)
- **Bootstrap is circular.** The platform can't provision its own first credential. → The root of trust
  is necessarily external (the provider root plus a human IdP), used once in a sealed ceremony, then
  locked away.

### What actually fails, and how do I see it?

Everything above is injectable in the simulator's Inject reality panel: fail a node, drift a config,
take out a region, lose telemetry, force a hard (root-cause) failure, spike a cost, or break-glass. Watch
the loop heal what it can and escalate what it can't.

## Networking & data

### How is cross-region connectivity managed and healed?

Connectivity is a Structure facet the spec calls the Weave: the connectivity graph (DNS, load
balancing, peering, transit gateways, service mesh, cross-region replication) drawn *over* the placement
tree. It carries typed edges, sync (request/response) and async (pub/sub). Because it crosses
containment boundaries by design, it's modeled separately from the region/account tree.

Healing is the same reconcile loop: a region's health rolls up from its resources, and crucially the
roll-up is read through your Resilience choice. Active-active reads "one region down" as
*Degraded-but-serving* (keep routing to the healthy region); active-passive reads the same fact as a
*failover trigger*. So the Posture defines what "healthy" *means*, not just the shape. You can see this in
the simulator: take out a region and watch the environment badge resolve to "serving from N healthy" vs a
failover, depending on resilience.

### Who manages the database and its replication?

It depends on the workload type, and Trellis distinguishes two:

- **Provider-managed data** (e.g. a managed relational DB): the provider runs replication and failover;
  Trellis provisions it to your posture (multi-AZ at high criticality) and observes its health.
- **Self-run stateful clusters** (brokers, search, quorum stores): Trellis models these as a quorum
  roll-up. All nodes healthy = Converged, a majority serving = Degraded, a minority = Unavailable
  (quorum lost). Select the broker in the simulator and "Fail node" twice to watch 3/3 → 2/3 → 1/3.

Two more things the spec is firm about:

- **Backup ≠ HA.** Replication protects against *infrastructure* failure but faithfully replicates a
  corruption or a `DROP TABLE`. Backup / point-in-time-restore protects against *logical* error. A C0
  service provisions both, via a Data Protection battery whose cadence and retention are derived from
  criticality.
- **Live migrations choose a path, not a jump.** Moving a live datastore is *replicate → verify → atomic
  cutover* for high criticality (zero-loss, expensive) or *backup → restore → cutover* for the
  downtime-tolerant tiers. Never an unsafe instantaneous redefinition.

### Does Trellis need a database, etcd, or Consul of its own?

No, and that's deliberate. Trellis keeps no consensus store of its own:

- **Desired state** lives in Git: a commit SHA *is* the generation. Git is already durable,
  replicated, and externally hosted, so there's nothing to run a quorum over.
- **Observed state and audit** live in an external append-only store (outside the control plane): a
  log, not a coordinated key-value store.
- **Live State** is derived, recomputed as `f(desired, observed, health)`, never stored as ground
  truth. There is no authoritative state DB to keep consistent.

So there's no etcd, no Consul, no Raft cluster in Trellis's brain. This matters because it's what
makes [slicing the control plane](/trellis/docs/operating-model) cheap: a Trellis instance is
near-stateless compute. Kill it and re-bootstrap from Git plus the external seed (meta-DR). If it needed its
own etcd, every per-division instance would carry a stateful quorum cluster to operate, the exact
fragile SPOF we're trying to avoid. (Contrast Kubernetes, which *does* need etcd; Trellis pushes
durability out to Git instead.)

The one real need is coordination, not storage: don't let two reconcilers act on the same resource.
That's leader-election / locking, satisfied with a lightweight primitive (e.g. a DynamoDB conditional-write
lock, or a single active reconciler per Frame scope), not a reason to stand up Consul or etcd.

And as *workloads*? A division can absolutely run Consul or etcd for its own services; Trellis treats
them as stateful quorum clusters (the quorum roll-up above). That's the division's choice for their stack,
not a dependency of the control plane.

### Do we have to run our own Git?

No. Git is a role, not a product mandate. Trellis needs *a desired-state store with Git's properties*:
versioned history (a commit SHA *is* the generation), branch protection plus required review (so merge is
the gate), durability, and an API/webhooks so the planner can post the plan-as-proof as a PR check. Any
host that offers those fills the role.

- **Managed Git you don't operate** (GitHub, GitLab SaaS, Bitbucket Cloud), authenticated via OIDC
  (no long-lived keys). Usually the easiest path; HA is someone else's problem.
- **AWS-native:** CodeCommit is the cleanest conceptual fit, IAM-native, in-account, no third party.
  But note AWS closed CodeCommit to new customers in mid-2024; if you already have it, use it,
  otherwise reach for managed GitHub/GitLab or a small self-hosted Git in-account.
- **Self-hosted**, only if you have a reason (air-gap, residency). Then don't make one central server a
  company-wide SPOF: slice it per division, or use managed.

Two things worth pinning down:

- **This store is Trellis's own, and per-division, not shared Git infrastructure.** It holds the
  *manifests* the control plane reconciles, sliced per Trellis instance like everything else. Don't
  confuse it with GitLab-as-a-workload (the source-control product Trellis *provisions for a
  division's app code*). Same family of tool, completely different role.
- **It's a soft dependency.** If the manifest Git is down you can't *merge new changes*, but running infra
  keeps reconciling against last-applied state; your services don't fall over. Contrast Kubernetes plus
  etcd, where etcd down means the cluster brain is down. So "which Git" is a lower-stakes decision than it
  feels, and it's what makes meta-DR work (re-bootstrap from the manifest repo).

### Where does the live console get "down" or "in transition" from?

Not from a stored status field, because there isn't one. The console is a read-only View, and State is
derived, never stored as ground truth: `State = f(desired, observed, health)`, recomputed every loop
pass. So what you see comes from three places depending on the signal:

| What the console shows | Where it comes from | Computed or stored? |
|---|---|---|
| **"down"** (Degraded / Unavailable) | the **Observe plane** — live provider telemetry, health checks, quorum reports — run through `derive()` | **computed** (observed input read fresh, never trusted from a store) |
| **"in transition"** (Converging) | **provenance** — the desired generation (a Git commit SHA) vs the observed applied generation | **computed** |
| **"drifted"** | observed spec ≠ desired at the *same* generation | **computed** |
| **"stale → Unknown"** | the observation is older than the freshness budget (fail-safe) | **computed** |
| **the timeline** — what changed, when, who authorized it | the **external append-only audit log** | **stored** |
| **roll-ups** (region / env / owner) | worst-of the derived child states, up the Frame tree | **computed** |

The incident surface is the last two stitched together: the blast-radius rollup of
Degraded/Stalled/Frozen (derived) joined to the time-correlated audit log (stored). Actions and
observability are duals.

Why derive instead of store? Because a stored "status: healthy" field happily lies long after the thing
died. A derived state can't: if telemetry goes stale, the derived state is Unknown (fail-safe), and
that's what the console shows. It degrades faithfully instead of staying green. "Live" is therefore only as
fresh as the last observation; the reconciler loop sets the cadence, and Trellis renders the projection
through your existing observability tooling rather than rebuilding a streaming dashboard.

In this simulator it's literally `engine.snapshot()` recomputed each tick: every resource's state is
derived from the simulated cloud's observed state plus the manifest, and the audit list is the stored
trail. Same shape as the real thing: derived live state plus a durable audit trail.

## Security

### How does security actually work?

The law is simple: desired state changes only through Author; everything else converges toward it. The
model has four action classes: Author, Converge, Observe, and Break-glass. See
[the reconcile loop](/trellis/docs/reconcile) for the full table of who does what and at which gate.

The mechanics that make it real:

- **The approved plan *is* the capability.** Approval mints an ephemeral credential scoped to just
  the diff. The actuator does what the proof says and nothing else, then the credential expires. An
  independent mint authority re-derives that scope from the signed generation, with a re-validate against
  observed state immediately before apply.
- **Break-glass buys time, not permission.** Above a boundary scope the second approver must be *outside*
  the requesting team. When the window expires the reconciler doesn't auto-revert (that would re-open the
  bleed); it freezes the touched resources and raises a mandatory ratify-or-revert through the
  normal Author gate. The simulator models this exactly.
- **The root of trust is external.** Bootstrap is a one-time, dual-controlled ceremony seeded by the
  provider root plus a human IdP, which then seals itself. The control plane runs on workload identity, not
  standing secrets.
- **Audit lives outside the control plane.** A compromised control plane can't be trusted to log its own
  changes faithfully, so every privileged action is written to an external, append-only store.

### How does Trellis get installed, and what does it need to run?

The first install is a one-time, externally-rooted bootstrap ceremony, because the platform can't
provision its own initial authority (that's circular). The standing footprint after that is deliberately
small: workload identity (no long-lived keys), a delegated-administrator position that's unprivileged
for writes, and STS-minted, plan-scoped, ephemeral credentials for the actual changes. It runs on
near-stateless compute plus Git (desired state), the external append-only audit, a tiny lock table, and a
secrets store. The full detail (the ceremony, the privilege model, the resource list, per-division
bootstrap, and meta-DR) is on the [Bootstrap & footprint](/trellis/docs/bootstrap) page.

### Where does the audit log live, and what's the storage?

The spec fixes the *properties*; the product is mapped through the provider contract. Required properties:

- **External**, outside the control plane's write authority, so a compromised control plane can't
  rewrite its own history. This is the whole reason it's separate.
- **Append-only / immutable**: you add records, never edit or delete them (within retention).
  Tamper-evident, ideally hash-chained.
- **Written at the moment of action, by the mint/gate.** Each privileged action (Author approval,
  credential mint, break-glass, self-upgrade, even bootstrap genesis) emits its record as it happens.

It is not the control plane's database, and not a queryable state store. It's a durable, ordered log.

On AWS the canonical realization, in a Control Tower / landing-zone setup:

- org-level CloudTrail → an S3 bucket in a separate, locked log-archive account (every API action,
  every account, one central trail);
- S3 Object Lock (WORM) on that bucket, write-once-read-many, for true immutability; even an admin
  can't delete within the retention window;
- a separate account fenced by SCPs, so the control plane (and even org admins) *cannot* delete or
  rewrite it. The "external" property is enforced by AWS, not by trust;
- CloudTrail log-file validation (digest/hash files) for tamper-evidence;
- for the platform's own gate/mint decision records (the "who approved which proof"), optionally
  Amazon QLDB, a purpose-built, cryptographically verifiable, immutable ledger.

In short: an org CloudTrail trail landing in a WORM-locked S3 bucket in a separate log-archive
account (with QLDB an option for verifiable gate/mint records). Retention/lifecycle archives to Glacier
per compliance; within retention it's immutable. It must exist and be seeded at bootstrap, before the
control plane is trusted with anything.

In this simulator the audit is in-memory plus IndexedDB: browser-local and overwrite-on-save, the
*opposite* of external/append-only. The entries are real (the engine records who/why per action); their
storage is a stand-in, not the WORM-in-a-separate-account design the architecture calls for.

### What is the "security" lens in the simulator?

A read-only projection (a *View*) of trust/exposure: each resource is tiered exposed (internet-facing
edge), sensitive (data/stateful crown jewels), or internal, and flagged at-risk when it's a
third-party dependency (outside your TCB), an exposed surface without per-service isolation, or crown
jewels without compliance coverage.

## Where it fits

### Is this for infra/DevOps, or does it deploy my services too?

It's the platform / infrastructure layer. You declare a Service (e.g. "payments-api" at C0) and
Trellis provisions and maintains the ground it runs on: compute, data, networking, identity, certs, DNS,
load balancing, observability. You keep your existing CI/CD for application code. The seam is clean:
Trellis *gates* what may run (Governance can require signed images plus SBOM plus a CVE check) but does not
build your images or execute your deploy pipeline. It governs infrastructure authority; your pipeline
governs your artifact.

So it supports your services by giving them a declared, healing, owned home, not by replacing the
pipeline that ships their code.

### How does it relate to GitOps, Kubernetes, S3, and Terraform?

- **GitOps: it *is* GitOps.** Git is the desired-state store; a commit is an Author action; the
  planner runs in CI and posts the plan+proof as the PR check; merge is the approval gate; the
  reconciler pulls the merged manifest. Generation = commit SHA, which is how drift-vs-progress is told
  apart.
- **Kubernetes: a different layer.** Trellis provisions infrastructure; it isn't a workload scheduler. A
  cluster (or what runs on it) is something Trellis can stand up and govern, not something it replaces. Your
  pods schedule on capacity Trellis maintains. Because Kubernetes is *itself* a reconciler, the boundary
  matters: Trellis manages the cluster (version, nodes, add-ons); the in-cluster loop owns the workloads.
  See [Trellis and Kubernetes](/trellis/docs/operating-model#trellis-and-kubernetes-where-the-line-is) for
  where the line is and why you slice at the cluster, not the namespace.
- **S3: a capability, not a special case.** Object storage is one realization of the Storage bucket;
  on AWS that's S3, chosen by the planner from the catalog.
- **Terraform: a possible actuator.** Trellis is provider-neutral at the vocabulary/Structure level and
  talks to a cloud only through a provider port. A Terraform/OpenTofu adapter could implement that port;
  Trellis still owns the intent, the proof, the gate, and the standing loop.

### Does Trellis own baseline security, and does it set up OUs, accounts, VPCs, and Kubernetes?

Yes — laying down the **governed foundation** is precisely Trellis's job, not a prerequisite you bring.
The whole point is that you declare intent and Trellis owns the structure underneath it: the org layout,
the accounts, the network boundaries, the security baseline, and clusters-as-resources are all reconciled
through the same **Posture → plan → reconcile** loop as everything else. The one boundary worth memorizing
is on Kubernetes — Trellis owns the cluster, not what runs inside it.

| Layer | Does Trellis own it? | What that means — and where it stops |
|---|---|---|
| **Baseline security / guardrails** | **Yes** | Governance authors *authorization intent* — what MAY connect — and the planner compiles it into the concrete SCP / IAM / security-group / route set. The org sets non-negotiable **floors**; delegated parents may *tighten, never loosen*; the gate enforces the composition. This is the security baseline, owned and proof-carrying. |
| **OUs** | **Yes** | The org root is the top **Frame**; Admin carves OUs as part of structure. Bootstrap stands up the OU layout via AWS Organizations + Control Tower. |
| **Accounts** | **Yes** | Accounts are Frames too. Bootstrap provisions the log-archive account, the delegated-admin identity foundation, and the control plane's own account; the account factory provisions managed accounts thereafter. **Default grain: account-per-division.** |
| **VPCs / networking** | **Yes** | A VPC / network boundary is a Frame; the planner provisions it and the typed connectivity (the **Weave** — DNS, LB, peering, transit) drawn over the placement tree, and heals it through the same loop. |
| **Kubernetes** | **The cluster, yes — workloads, no** | Trellis owns the cluster *as a resource*: its existence, version, node groups, networking, pod-identity (IRSA), and platform add-ons (CNI, CSI, DNS, autoscaler, the GitOps agent). It **stops at the cluster API**; the in-cluster loop (Argo/Flux) owns Deployments, pods, and Services. Slice at the **cluster**, not the namespace. See [Trellis and Kubernetes](/trellis/docs/operating-model#trellis-and-kubernetes-where-the-line-is). |

Two honest qualifiers:

- **Greenfield vs. brownfield.** On a fresh org Trellis lays the foundation down cleanly. Adopting it into
  an *existing* org with live accounts is a **discovery-and-reconcile** exercise first — it maps what's
  already there before it holds it. See [Bootstrap & footprint](/trellis/docs/bootstrap).
- **Spec design vs. the simulator.** Everything above is the **spec** (the source of truth). The
  client-side simulator on this site deliberately models the *loop* at the resource level (compute, data,
  load balancers, jobs, stateful clusters) and **does not** simulate the org / account / VPC / cluster
  provisioning — the cloud is simulated, the dynamics are real.

### Is it really provider-neutral, or is that marketing?

Neutral in concept, AWS-first in practice. The grammar, Topology, and Structure are
expressed against a provider-neutral capability contract (twelve buckets: Compute · Networking ·
Storage · Data · Identity · Secrets · Certs · DNS · Delivery/CI · Traffic/LB · Observability ·
Governance). Today one provider is implemented richly (AWS); others are documented crosswalks built on
demand. Adding a provider is *additive* (a new adapter against the same contract, parity-gated), never a
rewrite, but don't expect three live clouds on day one. The
[provider crosswalk](/trellis/docs/provider-crosswalk) maps every capability to AWS, GCP, and Azure and
calls out where the mapping leaks (identity, the org boundary, Aurora/QLDB): the documented escape hatch,
built on demand.

### Can different divisions run on different clouds (one on AWS, another on GCP)?

Yes, but it lands you in the maximum-isolation corner, not the easy one. And it is not active multi-cloud;
the two are different things.

The answer comes from two rules the spec states separately. The provider rule (spec §15) governs *one
execution path of one desired state*: "a second provider, once built, is just another execution path of the
**same** desired state." The [operating model](/trellis/docs/operating-model#slice-the-control-plane-too)
slices the control plane to the division, so each division runs its own Trellis instance, against its own
accounts, with its own desired state and its own bootstrap. Put the two together and "one provider at a
time" becomes a per-instance rule: each instance runs one provider richly, and nothing forces every
division onto the same one. So divisions can pick their own cloud. Call it **federated single-cloud
divisions**. No single desired state spans clouds, and nothing drops to a lowest common denominator — each
division gets one cloud's primitives in full.

The bill is real, and every line of it pushes you toward a separate-org boundary:

- **You pay for every adapter you use.** A GCP division means someone builds the GCP column and brings it
  to parity with AWS, including the credential mint — the
  [least-portable piece](/trellis/docs/provider-crosswalk). Mixing clouds doesn't dodge that cost; it
  commits you to several rich implementations instead of one.
- **You lose the single governance floor.** The operating model shares one set of rails: the org root and
  its SCPs, under one tenancy root. AWS and GCP share no root and no common policy floor, so governance
  becomes a multi-root, trust-federation problem — the kind the
  [grain ladder](/trellis/docs/operating-model) reserves for strict-regulatory or M&A splits. You go from
  one floor to one floor per cloud, each held to parity.
- **The shared catalog splits or doubles.** Blueprints carry provider bindings, so a cross-cloud catalog
  either keeps per-provider entries or each division forks its own. Forking buys maximum isolation and gives
  up central governance.
- **Cross-division links become cross-cloud links.** A sync edge from an AWS division to a GCP one runs over
  a cross-cloud route with weaker private-connectivity guarantees, since PrivateLink and Private Service
  Connect don't share the same constraints.

So the model allows it. It is the logical end of slicing everything to the division. But it drops you in the
separate-org, forked-catalog, multi-root corner: maximum isolation, minimum central governance. That fits a
real M&A or regulatory split, where two divisions were never going to share a root. It is the wrong tool for
"spread our infrastructure across three clouds for resilience," which is the lowest-common-denominator trap
§15 exists to refuse.

Spec §15 now states the per-instance reading outright, so this guidance applies the spec rather than
stretching it. It stays hypothetical for now: the first adapter (AWS) isn't built yet, and the multi-root
governance it needs is fenced to the separate-root case.

### What integrations does it have, or will it have?

- **Git** as the desired-state store and gate (any Git host).
- **An external append-only audit store** for every privileged action (outside the control plane).
- **Your observability / BI tools.** The Views layer computes projections/rollups (cost, health/SLO,
  security posture, compliance, incident) along the ownership tree and emits to the tools you already
  use for rendering and ad-hoc query. It deliberately does *not* reimplement a query engine or
  dashboarding.
- **A secrets store** (manifests reference secrets, never hold values).
- **The provider** itself (AWS first) for compute/data/identity/etc.

### What about "batteries" outside your domain — third-party things you don't run?

Two disciplined moves, both visible in the model:

- **External workloads are first-class but observe-only.** A third-party SaaS (a payments API, an
  observability vendor) is a node in the dependency/Weave graph: Trellis governs the *integration* to it
  (an egress edge, a Governance allow, a consumed API key) and includes it in criticality propagation (its
  outage affects you), but its state is observed, never reconciled. Trellis can't heal Stripe, and
  it doesn't pretend to. You can see this as the "SAAS · observe-only" node in the topology.
- **Fence the scope; emit to existing tools.** Wherever a capability is better served by something that
  already exists (dashboards, BI, a vendor's own console), Trellis governs admission and emits signals
  rather than rebuilding the tool. The point is to be the system of *authority and proof*, not to absorb
  the whole ecosystem.

## Cost, incidents, and change

### How is cost handled — is "budget" just a planner input?

It's both an input *and* a live signal. Spend attributes up the ownership tree (resource → service →
environment). Billed cost is observed like any other signal, so cost drift (billed vs planned) is
detected the same way config drift is, and a budget-breach either alerts or, by posture, blocks
further provisioning until it's reconciled. The simulator's cost lens, the Owners tab, and the "Cost
spike" injection demonstrate the whole loop.

### What happens to incidents — the middle ground between self-heal and break-glass?

A `Stalled` / `Degraded` / `Frozen` resource routes by ownership tree + criticality to an on-call
owner, and surfaces as an incident view: the blast-radius rollup joined to the time-correlated audit
log (actions and observability are duals). Runbooks bind to failure classes; break-glass is invocable from
the incident surface, scoped to the blast radius.

### What about org changes — re-orgs, M&A?

The org tree isn't static, so each change is itself a gated, proof-carrying transition: ownership
transfer re-parents a subtree (atomically re-pointing delegation, credential scoping, repo ownership,
and criticality propagation); team split/merge re-partitions envelopes and on-call routing; and
M&A federates two sealed roots (or migrates one under the other) as an explicit, gated trust-merge,
the one deliberate relaxation of the single-root assumption.

## What's real, and what's deferred

### Is this real, or a demo?

Today it's a specification plus this client-side simulator; there is no production AWS implementation
yet. But the simulator isn't a slideshow: the engine implements the real state model, planner objective,
reconcile loop, breakers, ownership rollups, cost signal, and self-upgrade, and the failure dynamics are
genuine. It's built so the same engine could grow into the real thing behind the provider port.

### What's deferred or weakest right now?

- **Planner depth.** Today it selects, composes, and parameterizes from a catalog with heuristic leaf
  sizing, not a true optimizer. Real bounded leaf optimization is later work.
- **One provider.** AWS first; everything else is a mapped crosswalk, not a live integration.
- **Catalog generation is human-authored.** Novel blueprints are an offline, reviewed, catalog-time
  activity, never invented on the request path.

If a claim here sounds too clean, assume it's the *design intent* and check the spec section it links to.
The full specification is the source of truth, and it's a living document.
</content>
</invoke>
