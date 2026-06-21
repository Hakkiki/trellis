---
title: Principles
description: The twelve convictions that shape Trellis — why the platform is built the way it is, and what it refuses to give up.
---

> **The convictions** — why Trellis is built the way it is, in plain language. The rigor lives in the
> [specification](/trellis/docs/spec).

Trellis runs on a short list of convictions, not preferences. Each one is a claim and its proof — the
shape of every Trellis plan: say it in a line, back it underneath. Read the twelve and the rest of the
system stops looking like features and starts looking like the few things Trellis won't give up.

## The twelve

### 1. One team's bad day should stay one team's bad day

Share an environment long enough and you meet the person who has root and shouldn't — and one careless
command makes their bad day everyone's. So Trellis makes containment the spine: slice the blast radius per
division, people included. One team's worst day stays one team's.

### 2. Two good states can have no safe road between them

A target only has to be valid at the end; a path has to stay safe at every step to it. A change can break
you when both ends are perfect — you can't swap a live database in place. So Trellis plans the road, not
just the destination: ordered, reversible steps, each with its own undo.

### 3. The boundary you pick is the blast radius you keep

You don't choose containment in the abstract. You choose it when you decide where the wall goes. A
separate account, a shared VPC, a namespace — each leaves a different fate shared, and whatever a boundary
shares is the blast radius you didn't eliminate. The grain is the guarantee. Same knob.

### 4. The control plane obeys the rule it enforces

One central control plane over every division is the biggest single point of failure of all — it holds
standing write across the whole company. So Trellis slices itself too: one instance per division, each on
its own cadence. The thing that enforces containment has to be contained.

### 5. Only a human moves the goalposts

Nobody's paid to be awake at 2 a.m. — forty hours, not the pager at three. So the machine takes the
relentless part: watching, correcting, holding the line all night. But it only ever converges toward what
a human already chose. People move the goalposts; the system runs the field.

### 6. Every change carries its own proof

A plan is an argument, not a promise. Every resource traces to a reason — why it exists, what authorized
it — so you approve the thinking, not just the result. Nothing reaches your cloud that the plan can't
explain. No magic.

### 7. A plan that can't be built tells you why

Ask for the impossible — active-active on a shoestring — and Trellis won't quietly ship something close
and hope. The plan fails out loud, names the binding constraint, and shows the price of yes: raise the
budget $500 and it's feasible. A tool that papers over the impossible can't be trusted with the possible.

### 8. Governance is a wall, not a dial

You trade cost against resilience, size against budget — yours to make. What's *allowed* isn't on the
table. Governance runs first and throws out every illegal plan before cost or speed get a vote. Some
limits are walls: build inside them, don't haggle with them.

### 9. Break-glass buys time, never permission

Break the glass on a real one and recovery takes days, not hours — and the people at home pay for that
week too. That's why it buys time, not permission: a time-boxed, two-person override that owes a debt —
ratify it, or revert it. It changes reality, never intent.

### 10. You set how much it matters; the system sets the rest

Buy cheap and you buy twice — the bargain that dies in three years costs more than the tool that lasts
seventeen. Cost only means something next to value. So you turn one dial, Criticality: a C0 service earns
multi-AZ and tight isolation; a C3 tool colocates and stays cheap. Pay where the value is.

### 11. A proof nobody can read is magic by another name

A proof you can't read asks you to trust it blindly — the exact thing this model exists to kill. So
legibility is a correctness property, not a nicety: every plan opens with a one-line headline and honest
detail underneath. Can't follow the argument? The gate never really ran.

### 12. Self-service shouldn't mean self-operate

Hand people raw cloud they're not ready for and disaster follows — the sharp ones know it and tell you no.
You earn the yes by making it safe: training wheels on the bike, and you running alongside to catch it
when a wheel goes. Each division gets its full stack, self-healed, with nothing to operate. Set the rails;
let them drive.

## Go deeper

[The case](/trellis/docs/the-case) · [the spec and its invariants](/trellis/docs/spec) · [the simulator](/trellis/simulator/).
