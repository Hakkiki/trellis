---
title: Promotion
description: Advancing an immutable, validated version through an ordered pipeline.
---

Promotion advances an immutable, validated version reference through an ordered pipeline of
environments.

The base desired state is environment-blind; each environment instantiates it with its own posture
overrides (the cascade: dev = C3, prod = C0). You promote a known-good artifact (vN), so what you
validated in staging is bit-for-bit what reaches prod.

## The key split

The artifact is promoted, but the path is re-planned per environment. Prod gets a fresh transition
plan against prod's observed state, because prod is not staging. Promotion state is visible
(`dev@v5, staging@v4, prod@v3`), and an environment hand-modified off its version shows as Drifted.

## In the simulator

The [promotion pipeline](/trellis/promotion/) demonstrates this directly:

- **Cut a version** — it deploys to `dev` (C3, single region).
- **Promote** it to `staging` (C2, active-passive) and `prod` (C0, active-active). Each re-plans for
  its own criticality and converges against its own simulated cloud.
- Cut a newer version and watch `dev@v2` sit ahead of `prod@v1`.
- **Hand-edit** an environment and watch it flip to drifted off its version; the reconciler then
  corrects it back to the promoted artifact.

The [specification](/trellis/docs/spec) is the normative version.
