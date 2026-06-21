---
title: Principles
description: The twelve convictions that shape Trellis — why the platform is built the way it is, and what it refuses to give up.
---

> **The convictions** — why Trellis is built the way it is, in plain language. The rigor lives in the
> [specification](/trellis/docs/spec).

Trellis runs on a short list of convictions, not preferences. Each one is a plain claim with the reasoning
right under it — the same shape as a Trellis plan: state it in a line, back it up underneath. Read the
twelve and the system stops looking like a pile of features and starts looking like the few things Trellis
won't give up.

## The twelve

### 1. One team's bad day should stay one team's bad day

When everyone shares the same systems, one team's mistake becomes everyone's outage — all it takes is one
wrong command from someone who never should have had the keys. So Trellis gives each team its own separate
setup, walled off from the rest. When something breaks, it breaks in one place instead of taking down the
whole company.

### 2. The risky part is the change, not the result

Two setups can both be perfectly healthy, and the move from one to the other can still take you down — the
danger is in the switch itself. You can't rebuild a running database in place; you stand up a new one, copy
the data over, switch traffic, then retire the old. So Trellis doesn't just pick the end state, it plans a
safe route there: small steps, each one you can undo if it goes wrong.

### 3. Where you draw the line decides what fails together

How much goes down when something breaks depends entirely on where you put the walls. Two teams in the same
Kubernetes cluster still share one fate — when the cluster goes, they both go. Give each team its own
account and they fail on their own. The line you draw is the promise you get to make; there's no separate
setting for it.

### 4. Trellis has to follow its own rules

If shared systems are the danger, then one central tool controlling every team is the most dangerous thing
of all — it can write to everything, so a bad update to it takes down everyone. So Trellis runs a separate
copy for each team, each updated on its own schedule. The thing that keeps failures contained can't be the
one exception to it.

### 5. Only a human moves the goalposts

Nobody should be counted on at 2 a.m. — you're paid for forty hours, not for the pager going off at three.
So the machine does the tireless work: watching everything, fixing what drifts, holding the line all night.
But it only ever steers toward what a person already decided. People decide what should be true; the system
keeps it true.

### 6. Every change explains itself

A plan should be an argument you can check, not a promise you have to take on faith. Every piece of it
points back to a reason — why this exists, what allowed it — so you're approving the reasoning, not just
the outcome. Nothing shows up in your cloud that the plan can't account for.

### 7. A plan that can't be built tells you why

Ask for something that won't fit — say, full redundancy on a tiny budget — and Trellis won't quietly hand
you something close and let you assume it's what you wanted. It stops, tells you exactly what's blocking it,
and what would unblock it: *add $500 and this becomes possible.* A tool that hides what it can't do can't be
trusted with what it can.

### 8. Safety rules are walls, not dials

You're free to trade cost against reliability, or speed against budget — those are real choices, and they're
yours. But what's *allowed* — the security and compliance rules — isn't one of them. Trellis checks those
first and throws out any plan that breaks them, before cost or speed ever get a say. You build inside those
walls. You don't bargain with them.

### 9. Break-glass buys time, never permission

Sometimes the normal process can't run and something's on fire, so someone breaks the glass: an emergency
override, signed off by two people, that changes things right now. It comes with a debt — once the fire's
out, you either make the change official the normal way or you undo it. Recovery from one of these can take
days, and the people at home pay for that week too. It's a last resort, not a shortcut.

### 10. You set how much it matters; the system sets the rest

Cheap is only cheap until you count what it costs you later — the bargain that dies in three years is dearer
than the tool that lasts seventeen. So instead of pricing every piece, you say how much each thing matters.
Mark a service business-critical and Trellis spreads it across data centers and locks it down; mark a
throwaway tool low and it stays small and cheap. You set the importance; the cost and the design follow.

### 11. If you can't follow the plan, you can't approve it

A plan you can't actually read just asks you to trust it blindly — which is the very thing this whole
approach exists to kill. So being readable isn't a nice-to-have here, it's part of being correct: every plan
opens with a one-line summary you can dig underneath. If the person signing off can't follow the argument,
the approval didn't really happen.

### 12. Self-service shouldn't mean self-operate

Hand people their own cloud before they're ready and disaster follows — and the sharp ones know it, so they
say no, and they're right to. You earn their yes by making it genuinely safe: it's training wheels on the
bike, with you running alongside to catch it when a wheel wobbles. Each team gets its full set of tools,
kept running for them, with nothing to babysit. You set the guardrails; they drive.

## Go deeper

[The case](/trellis/docs/the-case) · [the spec and its invariants](/trellis/docs/spec) · [the simulator](/trellis/simulator/).
