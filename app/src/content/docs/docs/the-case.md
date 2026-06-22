---
title: "Why Trellis"
description: The problem worth funding, the insight, the wedge, what's proven today, and what it takes to build — the short version for someone deciding whether to back this.
---

Trellis is a self-hosted platform for authoring, provisioning, and continuously managing cloud
infrastructure, AWS first. You declare *what you want* as a **Posture**; a deterministic **planner**
compiles it into a concrete **Structure**; a **reconciler** keeps reality matching it. Every action
traces back to a plan a human approved.

> **Posture → planner → Structure → reconcile loop. Manifest-driven. No magic.**

The name carries the idea. A trellis is a governed shape. A vine grows freely within that shape. A
gardener tends it — pulling weeds, replacing what died, never letting growth escape the form.
Governance sets the shape, teams grow along it, and self-healing keeps it in form.

The rest of this page is the case for backing it. Depth lives one click down; the
[FAQ](/trellis/docs/faq) answers the hard questions, and the [specification](/trellis/docs/spec) is
the source of truth.

## The problem: one team's bad day becomes everyone's

Large orgs centralize the obvious things: one privileged-access service, one CI/CD, one DNS, one
source-control platform. Every division depends on them. It feels efficient until one of them has a
bad day, and then everyone does. A shared service is a single point of failure with a company-wide
blast radius.

Here is the outage many orgs have lived. A routine, change-managed upgrade to a shared
service, running **active-active** across regions, takes down the entire company. Hours of outage. A
war room. A post-mortem that concludes "we followed the process." The process was not the problem.

High availability did not save them, and it was never going to. HA protects against *infrastructure*
failure: a node dies, a region drops, traffic shifts to the healthy side. But an upgrade is a
**change**, and a careful active-active rollout faithfully applies that change to both actives.
Replication replicates the bad change too. Two valid states can have no safe instantaneous transition
between them. So "more redundancy" is the wrong lever. The right levers are **containment** (a failure
cannot cross a boundary it has no business crossing) and **safe change** (roll forward progressively,
prove it, step back if it goes wrong).

Underneath all of this, cloud operations are still drift-chasing: imperative scripts, opaque changes,
no proof of *why* a resource exists or *who* authorized it, and humans manually reconciling reality to
intent.

## The insight: two moves that compound

**Make every change declare, prove, and reconcile.** You declare what you want. A planner compiles it
into a plan that is its own proof — every resource traces to a reason. A human approves. A reconciler
then holds reality equal to the approved plan, indefinitely. Drift stops being a chore because
correcting it is the loop's normal behavior.

**Slice the blast radius per division, including [the control plane
itself](/trellis/docs/operating-model).** Each division gets its own environment and its own copy of
the loop. Only a few signed, pulled things stay shared: a vetted catalog, the org guardrails, and the
external audit. One division's failure — or upgrade — cannot reach another.
[See it: the same bad upgrade, contained vs. company-wide →](/trellis/blast-radius)

Most approaches stop at the first move. GitOps and landing zones bolt governance onto a still-shared
control plane. Trellis makes containment the spine and slices the control plane too, so the thing that
enforces safety cannot itself become the company-wide failure.

## The wedge: per-division platforms nobody has to operate

This is also how you get adoption. Each division declares a Posture — "we're a C1 division, these
services, this resilience, this budget" — and Trellis provisions and maintains their whole environment
from the catalog. Source control, CI/CD, secrets, DNS, privileged access, all self-healed for them.

The catch that usually stalls this fix: **nobody wants to operate their own cloud.** No division wants
to own AWS accounts, patch GitLab, run its own DNS, or chase infrastructure drift. That is not their
value-add, and doing it badly is how you get the next outage. So Trellis splits ownership. The platform
team curates a vetted catalog and sets guardrails once; divisions declare intent and drive. Divisions
never touch raw AWS, never install GitLab, never write the IAM, never chase drift.

The thesis: centralized governance, decentralized blast radius, self-service that is not
self-operate. Land in one division, prove it, expand across the org.

## Two framings to carry into everything

**A proven core, and one bet.** Most of Trellis (the reconcile loop, GitOps merge-as-gate,
least-privilege execution) is assembled from patterns already proven in production. The single
research-risk piece is the Posture→Structure compiler, and even that ships in a buildable form: vetted
blueprints, constraint validation, and a cost proof.

**The grammar is an ontology, not an engine.** Frame, Cell, and Resource organize and explain the
system; they are not a runtime. Trellis builds concrete controllers for the fixed, known cloud levels,
never a generic recursive interpreter.

## Why now

- A single shared-service failure is increasingly a board-level event. Outage cost and regulatory
  pressure keep raising the stakes.
- The cloud primitives this needs — org guardrails, scoped ephemeral identity, landing zones — are
  finally mature enough to do this cleanly.
- The model is no longer a whiteboard. It runs as an interactive simulator.

## What's proven today, and what isn't yet

Today, Trellis is a specification plus a working simulator. The simulator models the whole loop:
declare, plan, approve, reconcile, fail, heal, and the control plane upgrading itself. Plans fail
loudly with the binding constraint instead of inventing magic. The cloud is simulated; the dynamics
(latency, node failure, stale telemetry, cost drift) are real.

The hard questions are answered in the open: what fails and why, the security and credential model,
where state and the audit live, how it bootstraps, and how it ports across clouds. See the
[FAQ](/trellis/docs/faq) and the [operating model](/trellis/docs/operating-model).

What is not built yet: a control plane pointed at a live AWS organization. We are committed to AWS
first. The path is to build the implementation behind the provider port the model already calls for;
the [crosswalk to other clouds](/trellis/docs/provider-crosswalk) is an escape hatch, not a
multi-cloud tax. We lead with what is true because a skeptical sponsor rewards candor and punishes its
absence.

## What building it takes

1. Implement the **AWS column** of the capability contract behind the provider port.
2. Stand up the **bootstrap and reconcile spine** against a real organization. The
   [footprint](/trellis/docs/bootstrap) is deliberately small and near-stateless.
3. **Pilot in one division.** Prove the contained-blast-radius outcome against a real shared-service
   upgrade, then expand.

## See it in the simulator

The behaviors this case relies on are all live in the [simulator](/trellis/simulator):

- **Self-upgrade** — propose an upgrade, clear a dual-control gate, watch it canary, and recover a bad
  one with re-bootstrap. This is the shared-service-upgrade story, contained.
- **Blast-radius breaker** — take out a region and watch the loop halt and page instead of mass-stomping.
- **Ownership rollups** — see spend and health attribute to each owning service in the Owners tab.
- **Governance** — toggle a service out of the whitelist and watch the plan fail loudly, never silently.

## How to read this site

- **Start here** — this page for the why; the [FAQ](/trellis/docs/faq) for straight answers.
- **The model** — the concept primers: [Posture & Criticality](/trellis/docs/posture),
  [Structure & State](/trellis/docs/state), [the reconcile loop](/trellis/docs/reconcile),
  [Promotion](/trellis/docs/promotion), and [Roles](/trellis/docs/roles).
- **Architecture & decisions** — the [operating model](/trellis/docs/operating-model),
  [bootstrap](/trellis/docs/bootstrap), the [inversion stress test](/trellis/docs/hardening), the
  [provider crosswalk](/trellis/docs/provider-crosswalk), and the
  [architecture](/trellis/docs/architecture).
- **Reference** — the [full spec](/trellis/docs/spec), the source of truth.

A routine change should never be able to take down the company. Trellis makes that structurally hard,
and gives every team a self-healing platform they do not have to operate, so people spend their time on
the work that matters instead of keeping the lights on.
