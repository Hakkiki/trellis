---
title: Overview
description: What Trellis is, in one breath, and how to read the rest.
---

**Trellis** is a self-hosted platform for authoring, provisioning, and continuously managing cloud
infrastructure (AWS first). You declare *what you want* as a **Posture**; a deterministic **planner**
compiles it into a concrete **Structure**; a **reconciler** keeps reality matching it — with every
action traceable to an explainable plan.

> **Posture → planner → Structure → reconcile loop; manifest-driven; no magic.**

## The metaphor

A **trellis** is a governed shape. A **vine** grows freely *within* that shape. A **gardener** tends it
continuously — pulling weeds, replacing what died, never letting growth escape the form. Governance
shapes the structure, teams grow along it, and self-healing keeps it in form.

## Two honest framings to carry into everything

1. **Proven core vs. the one bet.** Most of Trellis — the reconcile loop, the GitOps merge-as-gate,
   least-privilege execution — is assembled from patterns already proven in production. The single
   research-risk piece is the **Posture→Structure compiler**, and even that ships in a demoted,
   buildable form (vetted blueprints + constraint validation + a cost proof).
2. **The grammar is an ontology, not an engine.** Frame / Cell / Resource *organize and explain* the
   system; they are not a runtime. Build concrete controllers for the fixed, known cloud levels — never
   a generic recursive interpreter.

## How this site is organized

- **[Architecture](/trellis/docs/architecture/)** — the provider-port seam, the package layout, and the
  three deployment targets that let the simulator become the real thing.
- **Concepts** — [Posture & Criticality](/trellis/docs/posture/), [Structure & State](/trellis/docs/state/),
  and [the reconcile loop](/trellis/docs/reconcile/).
- **[Full spec](/trellis/docs/spec/)** — the complete, build-ready specification.
- **[Simulator](/trellis/simulator/)** — feel the model before reading all the detail.
