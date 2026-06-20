---
title: Promotion
description: Advancing an immutable, validated version through an ordered pipeline.
---

> **Concept primer** — explains a piece of the model; the normative version is in the [specification](/trellis/docs/spec).

> **Promotion = advancing an immutable, validated version reference through an ordered pipeline of
> environments.**

The base desired state is **environment-blind**; every environment instantiates the **same shape** — same
Criticality, resilience, and regions — so a lower environment is the *prod topology*, not a smaller
stand-in (see [Cost & parity](/trellis/docs/cost-and-parity)). You promote a known-good artifact (vN), so
**what you validated in staging is bit-for-bit what reaches prod.** Environments differ only in the
**version** they run and how aggressively they **park idle capacity** (the elasticity/dormancy tiers — dev
aggressive → prod conservative), which lowers a lower env's *bill* without shrinking its *shape*.

## The one key split

The **artifact is promoted, but the *path* is re-planned per environment.** Prod gets a fresh transition
plan against *prod's* observed state. Promotion state is visible (`dev@v5, staging@v4, prod@v3`), and an
environment hand-modified off its version shows as **Drifted**. Because the shape is identical everywhere,
the fleet also reports a **parity** signal (`parityCheck`): a lower env that ever ran a *smaller* shape
would be flagged, not quietly accepted as a saving.

## In the simulator

The [promotion pipeline](/trellis/promotion/) demonstrates this directly:

- **Cut a version** → it deploys to `dev` (the full prod shape — C0, active-active, multi-region).
- **Promote** it to `staging` and `prod` — each re-plans the path and converges against its own simulated
  cloud. The shape is identical; `dev` simply carries the **aggressive** tiers, so it bills less.
- Cut a newer version and watch `dev@v2` sit ahead of `prod@v1`.
- **Hand-edit** an environment and watch it flip to *drifted off its version* — the reconciler then
  corrects it back to the promoted artifact.
