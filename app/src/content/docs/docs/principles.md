---
title: Principles
description: The twelve convictions that shape Trellis — why the platform is built the way it is, and what it refuses to give up.
---

> **The convictions** — why Trellis is built the way it is, in plain language. The rigor lives in the
> [specification](/trellis/docs/spec).

Trellis runs on a short list of convictions, not preferences. Each one states a claim and backs it up right
underneath, the same shape as a Trellis plan. Read the twelve and you'll see the system isn't a pile of
features. It's the few things Trellis won't give up.

## The twelve

### 1. One team's bad day should stay one team's bad day

When everyone shares the same systems, one team's mistake becomes everyone's outage. One wrong command from
someone who never should have had the keys, and the whole company is down. So Trellis gives each team its
own setup, walled off from the rest. Now when something breaks, it breaks in one place.

### 2. The risky part is the change, not the result

Two setups can both be perfectly healthy, and the move between them can still take you down. The danger is
in the switch itself. You can't rebuild a running database in place. You stand up a new one, copy the data
over, move the traffic, then retire the old. So Trellis doesn't just pick the end state. It plans a safe
route there: small steps, and you can undo each one if it goes wrong.

### 3. Where you draw the line decides what fails together

How much goes down when something breaks depends on where you put the walls. Put two teams in the same
Kubernetes cluster and they share one fate: when the cluster goes, they both go. Give each team its own
account and they fail on their own. Where you put the wall is the whole decision. There's nothing else to
set.

### 4. Trellis has to follow its own rules

If shared systems are the danger, then one central tool that controls every team is the most dangerous thing
of all. It can change everything, so a bad update to it takes down everyone. So Trellis runs a separate copy
for each team, and each one updates on its own schedule. The tool that keeps everyone safe doesn't get to be
the exception.

### 5. Only a human moves the goalposts

Don't count on anyone at 2 a.m. Your job is forty hours a week, not the pager going off at three. So the
machine does the tireless work: it watches everything, fixes what slips, and holds the line all night. But
it only ever steers toward what a person already decided. People decide what should be true. The system
keeps it true.

### 6. Every change explains itself

A plan should be an argument you can check, not a claim you just trust. Every piece of it points back to a
reason: why this exists, and what allowed it. So you approve the reasoning, not just the result. Nothing
reaches your cloud that the plan can't explain.

### 7. A plan that can't be built tells you why

Ask for something that won't fit, like full redundancy on a tiny budget, and Trellis won't quietly hand you
something close and let you assume it's what you asked for. It stops. It tells you what's blocking it, and
what would clear the block: *add $500 and this becomes possible.* A tool that hides what it can't do can't
be trusted with what it can.

### 8. Safety rules are walls, not dials

Trade cost against reliability, or speed against budget; those choices are yours. But the security and
compliance rules are not on the table. Trellis checks them first and throws out any plan that breaks them,
before cost or speed get a say. You build inside those walls. You don't bargain with them.

### 9. Break-glass buys time, never permission

Sometimes the normal process can't run and something's on fire, so someone breaks the glass. Two people sign
off, and the override changes things right now. It comes with a debt: once the fire's out, you either make
the change official the normal way or you undo it. Recovering from one of these can take days, and the
people at home pay for that week too. It's a last resort, not a shortcut.

### 10. You set how much it matters; the system sets the rest

Cheap is only cheap until you count what it costs you later. The bargain that dies in three years costs more
than the tool that lasts seventeen. So instead of pricing every piece, you say how much each one matters.
Call a service business-critical and Trellis spreads it across data centers and locks it down. Call a
throwaway tool low and it stays small and cheap. You set the importance, and the cost and the design follow.

### 11. If you can't follow the plan, you can't approve it

A plan you can't read just asks you to trust it blindly, and trusting blindly is exactly what this whole
approach throws out. So here, a readable plan is a correct plan, not a polished one. Every plan opens with a
one-line summary, and you can dig into the detail underneath. If the person signing off can't follow the
argument, the approval didn't really happen.

### 12. Self-service shouldn't mean self-operate

Hand people their own cloud before they're ready and disaster follows. The sharp ones know it, so they say
no, and they're right to. You earn their yes by making it safe: put training wheels on the bike, and run
alongside to catch it when a wheel wobbles. Each team gets a full set of tools, and Trellis keeps them
running, with nothing to babysit. You set the guardrails. They drive.

## Go deeper

[The case](/trellis/docs/the-case) · [the spec and its invariants](/trellis/docs/spec) · [the simulator](/trellis/simulator/).
