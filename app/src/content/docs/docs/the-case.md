---
title: "The case"
description: The three-minute version — the problem worth funding, the insight, the wedge, what's proven today, and what it takes to build.
---

The short, plain version for someone deciding whether this is worth backing. Depth lives one click down;
this page is the arc.

> **In one line:** Stop one team's bad day from becoming everyone's. Give each division a self-healing
> platform with a **contained blast radius** — governed centrally, operated by almost no one.

## The 2 a.m. story everyone has lived

It's the outage many large orgs have lived: a routine, change-managed, **active-active** upgrade to a
shared service — privileged access, CI/CD, DNS, source control — takes down the **entire company.** Hours
of outage. A war room. A post-mortem that concludes "we followed the process." The process wasn't the
problem.

## Why it keeps happening

- **Shared services are single points of failure with a company-wide blast radius.** Everyone depends on
  them, so when one has a bad day, everyone does.
- **High availability doesn't save you,** because the thing that broke wasn't infrastructure — it was a
  *change*, and a careful active-active rollout faithfully replicates the bad change to both sides.
- **Cloud operations are still drift-chasing.** Imperative scripts, opaque changes, no proof of *why* a
  thing exists or *who* authorized it, and humans manually reconciling reality to intent.

## The insight

Two moves, and they compound:

1. **Make every change declare → prove → reconcile.** You declare *what* you want; a planner compiles it
   into a plan that is *its own proof* (every resource traces to a reason); a human approves; a reconciler
   holds reality equal to it, forever. No magic — every change is explainable by the plan that authorized
   it, and "drift" stops being a chore because correcting it is the loop's normal behavior.
2. **Slice the blast radius per division — including [the control plane
   itself](/trellis/docs/operating-model).** Each division gets its own environment and its own copy of
   the loop. Only a few signed, pulled things stay shared — a vetted catalog, the org guardrails, and the
   external audit. One division's failure — or upgrade — **cannot reach another.**

Where most approaches stop at move 1 — GitOps and landing zones bolt governance onto a *still-shared*
control plane — Trellis makes **containment the spine** and slices the control plane too, so the thing
that enforces safety can't itself become the company-wide failure.

## The wedge: per-division platforms

This is also how you get adoption. Teams get their full stack — source control, CI/CD, secrets, DNS,
privileged access — **provisioned and self-healed for them**, without operating raw cloud or installing
anything. The enterprise governs *lightly*: it curates a vetted catalog and sets guardrails; divisions
declare a posture and drive. **Centralized governance, decentralized blast radius, self-service that
isn't self-operate.** Land in one division, prove it, expand across the org.

## Why now

- A single shared-service failure is **increasingly a board-level event** — outage cost and regulatory
  pressure keep raising the stakes.
- The cloud primitives this needs — org guardrails, scoped ephemeral identity, landing zones — are
  **finally mature** enough to do it cleanly.
- The model is **no longer a whiteboard** — it runs as an interactive simulator.

## What's proven today

- A **working, interactive simulator** models the whole loop — declare, plan, approve, reconcile, fail,
  heal, and even the control plane upgrading *itself*. Plans fail *loudly* with the binding constraint
  rather than inventing magic. The cloud is simulated; the dynamics — latency, node failure, stale
  telemetry, cost drift — are **real.**
- The **hard questions are already answered in the open**: what fails and why, the security and credential
  model, where state and the audit live, how it bootstraps, and how it ports across clouds. See the
  [FAQ](/trellis/docs/faq) and the [operating model](/trellis/docs/operating-model). That's the homework
  most pitches skip — and the fastest way to earn a technical sponsor's trust.

## What it honestly is — and isn't yet

**Today:** a specification plus a working simulator that proves the dynamics. **Not yet:** a control plane
pointed at a live AWS organization. We're **fully committed to AWS first**; the path is to build the
implementation behind the provider port the model already calls for — the [crosswalk to other
clouds](/trellis/docs/provider-crosswalk) is documented as an escape hatch, not a multi-cloud tax. We lead
with what's true because a skeptical sponsor rewards honesty and punishes its absence.

## What building it takes

1. Implement the **AWS column** of the capability contract behind the provider port.
2. Stand up the **bootstrap + reconcile spine** against a real organization (the
   [footprint](/trellis/docs/bootstrap) is deliberately small and near-stateless).
3. **Pilot in one division**, prove the contained-blast-radius outcome against a real shared-service
   upgrade, then expand.

## The one-line case, again

A routine change should never be able to take down the company. Trellis makes that structurally
impossible — and gives every team a self-healing platform they don't have to operate — so people spend
their time on the work that matters, not on keeping the lights on.
