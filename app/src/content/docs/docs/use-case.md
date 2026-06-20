---
title: "Use case: the shared-service blast radius"
description: Why per-division platforms — how a single shared service becomes a company-wide single point of failure, and how Trellis contains the blast radius without making every team run their own cloud.
---

> **Narrative** — a worked example of the problem and the fix. Not normative; see the
> [operating model](/trellis/docs/operating-model) for the how and the [specification](/trellis/docs/spec)
> for the canon.

The clearest reason Trellis exists. If you run a large org on a few shared services, this is probably
your story too.

## The trap

A big company centralizes the obvious things: one secrets / privileged-access service, one CI/CD, one
DNS, one source-control platform. Every division depends on them. It feels efficient — until it isn't.

These shared services are **single points of failure with a company-wide blast radius**. The day one of
them has a bad day, *everyone* has a bad day.

## The incident that proves it

A routine upgrade to a shared privileged-access service — carefully orchestrated, change-managed,
running **active-active** across regions — still takes down the **entire company**. Blast radius: 100%.

Here's the uncomfortable part: **active-active was never going to save you.** High availability protects
against *infrastructure* failure — a node dies, a region drops, traffic shifts to the healthy side. But
an upgrade is a **change**, and a careful active-active rollout faithfully applies that change to *both*
actives. Replication replicates the bad change too. HA hardens you against the wrong threat.

> Two perfectly valid states can have no safe instantaneous transition. A change can be unsafe even when
> both the before and after are flawless.

So "more redundancy" is the wrong lever. The right levers are **containment** (a failure can't cross
boundaries it has no business crossing) and **safe change** (roll forward progressively, prove it, and be
able to step back).

## The goal — and the catch

The fix most teams reach for is sound: **give each division its own environment** — its own
privileged-access service, its own CI/CD, its own DNS, its own source control. Now a bad upgrade is
contained to one division, not the company. One division's blast radius is *one division*.

But there's a catch, and it's why this usually stalls:

> **Nobody wants to operate their own cloud.** No division wants to own AWS OUs and accounts, stand up
> and patch GitLab, run their own DNS, or chase infrastructure drift. That's not their value-add — and
> doing it badly is how you get the next outage.

You're stuck between a centralized SPOF and a decentralized operations burden nobody signed up for.

## How Trellis resolves the tension

Trellis breaks the trade-off by **splitting ownership cleanly** between a platform/enterprise team and
the divisions:

**The platform team curates once, and owns the core.**

- Reviews and **approves the AWS services** teams may use — a **Governance whitelist** that's a hard
  pre-filter, never traded away for cost or speed.
- Authors a **catalog** of vetted blueprints and Components — the privileged-access service, CI/CD, DNS,
  source control — with safe defaults baked in. This is the "initial set of tools to operate safely."
- Sets lightweight guardrails (criticality tiers, budgets, compliance rules) and lets them propagate.

**Each division declares intent, and gets a self-healing environment.**

- A division declares a **Posture** — "we're a C1 division, these services, this resilience, this budget"
  — and Trellis **provisions and continuously maintains their whole environment** from the catalog.
- They never touch raw AWS, never install GitLab, never write the IAM, never chase drift. They get their
  own isolated stack and spend their time on **value-added work**, not infrastructure plumbing.
- Spend and health **roll up per division** (the ownership tree), so cost and accountability are clear
  without a central team policing every change.

**Changes — especially to the scary shared-stack components — are safe and contained.**

- Each division's services live in **their own environment**, so an upgrade to one division's
  privileged-access service **cannot reach another's**. Containment is the model's spine, not an add-on.
- An upgrade is a **transition**, not a jump: it rolls out **canaried and gated**, one environment at a
  time — never simultaneously everywhere. A **blast-radius breaker** halts and pages if a single change
  would touch too much of the fleet.
- If an upgrade does go bad, recovery is **meta-DR**: restore that one environment to a known-good
  generation. One division blinks; the company doesn't.

That's the whole thesis: **centralized governance, decentralized blast radius, and self-service that
doesn't become self-operate.**

For the *how* — where to put each division's boundary (org / account / VPC / namespace), why synchronous
coupling is the healthy kind, and why each division runs its own Trellis rather than one central one —
see the [operating model](/trellis/docs/operating-model).

## What honestly stays shared

Not everything can — or should — be split, and pretending otherwise is its own risk:

- There is still a **single root of trust** (one sealed identity foundation). The model assumes one root;
  genuine multi-root situations (a merger) are handled as an explicit, gated trust-merge, not a default.
- A few things are legitimately shared (a DNS apex, cross-division trust). The exercise isn't "split
  everything" — it's deciding what **must** be per-division for blast-radius reasons versus what stays
  shared and is made resilient a different way.

Part of adopting this model is that decomposition conversation. It's worth having deliberately.

## See it in the simulator

The behaviors this use case relies on are all live in the [simulator](/trellis/simulator/):

- **Self-upgrade** — propose an upgrade, clear a dual-control gate, watch it canary, and recover a bad
  one with re-bootstrap. (This is the shared-service-upgrade story, contained.)
- **Blast-radius breaker** — take out a region and watch the loop halt-and-page instead of mass-stomping.
- **Ownership rollups** — see spend and health attribute to each owning service in the Owners tab.
- **Governance** — toggle a service out of the whitelist and watch the plan fail loudly, never silently.

## Where this stands today

Trellis is, today, a **specification plus this interactive simulator** — the model is built and provable,
but it is not yet a control plane you can point at your AWS org to fix this next quarter. The point of
this page is that the *model* squarely targets this problem; adopting it means building toward the real
thing behind the provider port. See the [FAQ](/trellis/docs/faq) for the honest "real vs simulated" line.
