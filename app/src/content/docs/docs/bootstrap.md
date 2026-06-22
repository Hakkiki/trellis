---
title: "Bootstrap & footprint"
description: How Trellis gets installed the first time (the externally-rooted bootstrap ceremony), and what privileges and resources it needs standing to run.
---

Everything else hangs from this part, and it's the genuinely hard bit, because bootstrap is the one moment that happens outside the gated loop. It answers two questions: how does Trellis get *installed*, and what does it need *standing* to run?

## The chicken-and-egg problem

Trellis writes to the cloud using ephemeral credentials it mints from approved plans. But the very first time there is no org, no credentials, and no Trellis to approve anything. The platform can't provision its own initial authority; that's circular. So bootstrap is necessarily a one-time act *outside* the loop, anchored in a root of trust that lives outside the system it bootstraps. That single moment outside the gated machine is where the whole chain of derived, scoped, ephemeral authority hangs from.

## Installing the first time — the ceremony

Bootstrap is the loop's first iteration, with privilege *earned visibly* rather than granted up front:

1. **Seed = an external, minimal root.** The AWS management-account root user plus a human IdP (Identity Center / external OIDC). This is the only all-powerful credential, and it's used *once*.
2. **Stand up the audit first.** The external append-only / WORM audit store (org CloudTrail to Object-Locked S3 in a separate log-archive account) is created before anything else, because it has to record genesis itself.
3. **Read-only discovery.** The bootstrap actor gets *read-only* first: it discovers the existing org/accounts and proposes.
4. **Plan = proof.** It emits a plan of what it would set up: the OUs, the log-archive account, the delegated-administrator identity foundation, and the control plane's own account plus workload identity. A human reviews the proof.
5. **Human approves → scoped write.** Approval grants the *minimal* scoped write to lay that foundation down. Dual-controlled, logged to the external audit.
6. **Seal the root.** Once the delegated-admin foundation exists, the seed seals itself: root MFA in a safe, no access keys, never used again. Re-opening it is a break-glass-scope event.

From that point on Trellis runs on earned, scoped, ephemeral authority, never the root.

## What it needs standing to run

The footprint is deliberately small, because state lives in Git and the external audit, or is otherwise [derived](/trellis/docs/faq) rather than stored. Two buckets.

### Privileges — identity, not standing secrets

- Authenticates via **workload identity**: an instance/task role (EC2/ECS/EKS) or OIDC federation (e.g. GitHub Actions to IAM role). No long-lived access keys.
- Holds a delegated-administrator position in AWS Organizations, enough to *discover* and to *mint*, but its standing identity can't write.
- Actual writes use **ephemeral STS credentials scoped to the approved plan's diff** (resource-set × action-set), minted by the independent mint authority and expiring after apply. Cross-account work is scoped role-assumption into each managed account.
- The standing exception the spec names is the reconciler's standing write for continuous convergence. It's bounded at the *credential* layer, rate-limited, anomaly-alerted, human-confirmed on destructive changes, and behind an out-of-band kill-switch it cannot disable.

### Resources it needs to run

| Resource | What for | Notes |
|---|---|---|
| **Compute** | run the planner / gate / reconciler loop | modest, near-stateless — serverless (Lambda + EventBridge/Step Functions) or a small ECS/EKS service |
| **Git** (external SCM) | desired state | a commit SHA is the generation; a *role*, not a product — managed (GitHub/GitLab/CodeCommit) or self-hosted, Trellis-owned and per-division. See the [FAQ](/trellis/docs/faq) |
| **External WORM audit store** | the immutable action log | CloudTrail → Object-Locked S3 in a separate log-archive account |
| **STS** | mint plan-scoped ephemeral credentials | the actuator's authority |
| **A small lock table** (e.g. DynamoDB) | reconciler leader-election | the only stateful bit, and it's trivial |
| **A secrets store** (e.g. Secrets Manager) | referenced by manifests, never held | values never live in Git |
| **AWS Organizations + Control Tower** | the substrate | OUs, account factory, SCP guardrails |

That's the whole footprint: a bit of compute, a delegated-admin identity, STS, a lock table, read access to its scope, and two external stores (Git and audit). Cheap to run, cheap to re-bootstrap.

## Least standing privilege, in one view

- Standing privilege is minimal: read/discovery across its scope plus the right to mint scoped creds.
- Write privilege is ephemeral and plan-scoped: minted per approved diff, expires after apply.
- The root is sealed: used once, never again; re-opening is break-glass.
- The reconciler's standing write is the deliberate exception: bounded at the credential layer, rate-limited, kill-switchable, human-confirmed on destructive convergence.

## Per-division bootstrap

Because each division runs its [own Trellis](/trellis/docs/operating-model), each instance bootstraps separately from the external seed into its own account(s). The *enterprise* bootstrap stands up the org, the log-archive account, the SCP guardrails, and the signed catalog; each division's Trellis then earns scoped authority within its own accounts. No division depends on a central control plane being up.

## Meta-DR — why the small footprint matters

The control plane is itself a Criticality-0 environment described by a manifest in external SCM. So if it's destroyed, you can re-bootstrap it from the external seed, the manifest repo, and the external audit. There's no snowflake state to lose, which is exactly why keeping the footprint small and near-stateless is a security property, not just an efficiency one.

## Caveats

- Greenfield is clean; brownfield is the work. Bootstrapping a fresh org is the tidy path above. Adopting Trellis into an *existing* org with live accounts is a discovery-and-reconcile exercise: it has to map what's already there before it can hold it.
- Bootstrap gets the highest ceremony precisely because it's outside the gate: dual-control, sealed root, audit seeded first. It's the riskiest single operation in the whole system.
- As always, this is the spec design; the simulator on this site does not implement a real AWS bootstrap.

## Summary

A one-time, dual-controlled, externally-rooted ceremony lays down the org, audit, and a delegated-admin identity, then seals the root. After that, Trellis runs on near-stateless compute with read/discovery plus STS-minted, plan-scoped, ephemeral writes, never standing god-power. The [specification](/trellis/docs/spec) is the source of truth.
