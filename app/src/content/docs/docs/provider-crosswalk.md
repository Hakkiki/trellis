---
title: "Provider crosswalk (AWS → GCP / Azure)"
description: Execute AWS now, think ahead. The provider-neutral capability contract mapped to AWS (the column we build) with the GCP and Azure equivalents documented as the crosswalk — built only when the time comes.
---

> **Applied decision & guidance** — extends and applies the [specification](/trellis/docs/spec) (the source of truth); not itself normative.

We're **fully committed to AWS** for the implementation — one provider, executed richly. But the
vocabulary, Topology, and Structure stay **provider-neutral**, expressed against a **capability
contract**. This page is the escape hatch: the contract mapped to AWS (the column we build) with the GCP
and Azure equivalents written down so adding a provider later is **an additive, parity-gated adapter —
never a rewrite.**

> **The rule (spec §15):** exactly one provider executes at a time. Implement the AWS column; the rest is
> the documented crosswalk, built on demand. This is provider-risk mitigation, *not* active multi-cloud.

A capability with no clean equivalent is **lock-in exposure** — call it out (the **Notes** column) rather
than pretend the abstraction is leak-free.

## Compute

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| VMs | EC2 | Compute Engine | Virtual Machines | clean |
| Autoscaling group | EC2 Auto Scaling | Managed Instance Group | VM Scale Sets | clean |
| Functions | Lambda | Cloud Functions | Functions | clean |
| Serverless containers | Fargate | Cloud Run | Container Apps | clean |
| Managed Kubernetes | EKS | GKE | AKS | clean (but see [the K8s boundary](/trellis/docs/operating-model#trellis-and-kubernetes-where-the-line-is)) |

## Networking

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| Virtual network | VPC | VPC | VNet | clean |
| Private service access | PrivateLink | Private Service Connect | Private Link | semantics differ; the per-service sync edge maps, the constraints don't |
| Peering | VPC Peering | VPC Network Peering | VNet Peering | clean |
| Hub / transit | Transit Gateway | Network Connectivity Center | Virtual WAN | clean-ish |
| Firewall | Security Groups / NACLs | Firewall Rules | Network Security Groups | model differs (stateful vs rule tables) |

## Storage

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| Object | S3 | Cloud Storage | Blob Storage | clean |
| Block | EBS | Persistent Disk | Managed Disks | clean |
| File | EFS | Filestore | Azure Files | clean |
| Immutable / WORM (audit) | S3 Object Lock | Bucket Lock | Blob immutability | clean — needed for the [audit store](/trellis/docs/faq) |

## Data

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| Managed relational | RDS / Aurora | Cloud SQL / AlloyDB | Azure SQL / DB for PostgreSQL | **Aurora has no exact twin — lock-in exposure** |
| Key-value / document | DynamoDB | Firestore / Bigtable | Cosmos DB | consistency models differ; not a drop-in |
| Cache | ElastiCache | Memorystore | Cache for Redis | clean (Redis/Memcached) |
| Streaming / queue | Kinesis / SQS / MSK | Pub/Sub | Event Hubs / Service Bus | semantics differ (ordering, delivery) |
| Warehouse | Redshift | BigQuery | Synapse | clean concept, very different engines |

## Identity *(the hardest to port)*

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| Access control | IAM | Cloud IAM | RBAC + Entra ID | **resource-policy + STS model vs IAM bindings vs RBAC scopes — the credential-mint design is the least portable part** |
| Org hierarchy | Organizations / OUs / accounts | Resource Manager (folders / projects) | Management Groups / Subscriptions | **the division boundary changes shape: account → project → subscription** |
| Workload identity | IAM Roles + STS + OIDC | Workload Identity Federation | Managed Identities / Workload Identity | concept maps; mechanics differ |
| Ephemeral creds | STS | STS / short-lived SA tokens | Entra tokens | maps |
| Org guardrails | Service Control Policies | Organization Policy | Azure Policy | **the SCP "can't be escaped" property has near-equivalents, but the enforcement model differs** |
| Landing zone | Control Tower | Cloud Foundation Toolkit | Landing Zones (CAF) | maps at the pattern level |

## Secrets · Certs · DNS

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| Secret store | Secrets Manager / SSM Parameter Store | Secret Manager | Key Vault | clean |
| Certificates | ACM | Certificate Manager | Key Vault certs / App Service certs | clean |
| Managed DNS | Route 53 | Cloud DNS | Azure DNS | clean |
| Service discovery | Cloud Map | Service Directory | Private DNS / discovery | maps |

## Delivery (CI/CD)

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| Pipelines | CodePipeline / CodeBuild | Cloud Build | Azure DevOps / GitHub Actions | clean |
| Artifact / image registry | ECR / CodeArtifact | Artifact Registry | Container Registry / Artifacts | clean |
| Managed Git (manifest store) | CodeCommit *(closed to new customers)* | Cloud Source Repos *(deprecated)* | Azure Repos | **managed Git is fading on all three — prefer external GitHub/GitLab; [Git is a role, not a product](/trellis/docs/faq)** |

## Traffic (load balancing / edge)

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| L7 load balancer | ALB | HTTP(S) Load Balancing | Application Gateway | clean |
| L4 load balancer | NLB | Network Load Balancing | Load Balancer | clean |
| CDN / edge | CloudFront | Cloud CDN | Front Door / CDN | clean |
| API gateway | API Gateway | API Gateway / Apigee | API Management | feature sets differ |
| Service mesh | App Mesh | Cloud Service Mesh | (Istio-based) | **mesh offerings churn across all three — treat as a thin, swappable layer** |

## Observability & Governance

| Capability | AWS *(built)* | GCP | Azure | Notes |
|---|---|---|---|---|
| Metrics / logs | CloudWatch | Cloud Monitoring / Logging | Monitor / Log Analytics | clean (the Views layer emits *to* these) |
| Tracing | X-Ray | Cloud Trace | Application Insights | clean |
| Audit trail | CloudTrail | Cloud Audit Logs | Activity Log / Monitor | clean |
| Verifiable ledger | QLDB | *(no direct equiv)* | SQL Ledger / Confidential Ledger | **lock-in exposure — QLDB has no GCP twin; fall back to WORM object storage + hash-chaining** |
| Config / compliance | Config + Security Hub | Security Command Center | Policy + Defender for Cloud | maps at the capability level |

## Where the mapping leaks — read this

The contract is clean for most buckets, but be honest about the seams that would cost real work to port:

- **Identity is the hardest.** AWS's resource-policy + STS + assume-role model, GCP's IAM bindings, and
  Azure's RBAC scopes are genuinely different. The **plan-scoped ephemeral credential mint** — the heart
  of the security model — is the least portable piece, and the first thing a second adapter must prove.
- **The org/boundary shape changes.** "One account per division" becomes "one **project** per division"
  (GCP) or "one **subscription** per division" (Azure). The [grain decision](/trellis/docs/operating-model)
  survives; the unit's name and limits don't.
- **Some services have no twin** — Aurora, DynamoDB's exact semantics, QLDB. These are explicit lock-in
  exposure; a port either picks the nearest fit (and accepts behavior drift) or avoids the service.
- **Managed Git is fading everywhere** — so the manifest store should lean on external GitHub/GitLab
  regardless of cloud (see the [Git FAQ](/trellis/docs/faq)).

## What "execute now, think ahead" buys you

- **Now:** we build the **AWS column** richly and ship — no multi-cloud tax, no lowest-common-denominator
  compromises.
- **Later:** adding GCP or Azure is **a new adapter against the same capability contract, parity-gated**
  against AWS — additive, not a rewrite. This page is the starting crosswalk for that adapter.
- **Always:** the contract keeps the vocabulary provider-neutral, so a Posture and its proof don't name
  AWS resource types — they name *what a resource is for*. The escape hatch stays open without anyone
  paying to keep two clouds live.
