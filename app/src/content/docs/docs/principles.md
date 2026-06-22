---
title: Principles
description: The twelve convictions that shape Trellis — why the platform is built the way it is, and what it refuses to give up.
---

> **The convictions** — why Trellis is built the way it is, in plain language. The rigor lives in the
> [specification](/trellis/docs/spec).

Trellis runs on a short list of convictions, not preferences. Each one makes a claim, then backs it up right
underneath, the same shape as a Trellis plan. The twelve aren't features. They're the few things Trellis
won't give up.

## The twelve

### 1. One team's bad day should stay one team's bad day

A failure should stay where it starts. Share the same systems and it never does: one wrong move from
someone who never should have had that access takes out a team, then an org, then the whole company. So box
every failure inside its own team or org. Then a break stays a break in one place, not a company-wide
outage.

### 2. The danger is the jump, not the landing

Every change to a running system moves it from one working state to another, and both ends can be perfectly
safe while the move between them is not. The risk lives in the change itself, not the before or the after.
You can't swap a database under live traffic and hope. So never jump to the new state. Get there in small
steps, each one safe on its own, each one you can undo.

### 3. Where you draw the line decides what fails together

Anything inside the same boundary fails together. When one part goes, all of it goes. So the boundary you
draw is the size of your worst outage. Put many teams inside one and a single failure takes them all. Give
each team its own and a failure stays with that team. There's no separate dial for how much can fail at
once. You set that when you decide where the boundary goes.

### 4. Trellis has to follow its own rules

If shared systems are the danger, then one central tool that controls every team is the most dangerous thing
of all. It can change everything, so a bad update to it takes down everyone. So Trellis runs a separate copy
for each team, and each one updates on its own schedule. The tool that keeps everyone safe doesn't get to be
the exception.

### 5. Only a human moves the goalposts

Off hours, people are off living their lives. A system that needs someone awake at 2 a.m. to stay healthy is
a system you built wrong. Plan for that. Don't blame them for it. So the machine does the tireless work on
its own: it watches everything, fixes what slips, and holds the line all night. But it never invents the
goal. It only steers toward what a person already decided. People decide what should be true. The machine
keeps it true.

### 6. Every change shows its work

Don't change anything just because you trust it. Every change has to show why it exists and what allowed it.
You approve the reasoning, not just the result. A change that can't explain itself doesn't happen.

### 7. A plan that can't be built tells you why

When a system can't do what you asked, it owes you a straight answer. The dangerous move is the quiet one:
handing you something close and letting you believe it's what you wanted. So a plan that can't be built says
so out loud. It names what's blocking it, and what would change the answer: raise the budget by $500 and it
fits. If a tool hides what it can't do, don't trust what it can.

### 8. Safety rules are walls, not dials

Some things you trade. Cost against reliability, speed against budget: those calls are yours. Security and
compliance are not on that list. You don't loosen a safety rule to make a plan cheaper or faster. It holds
no matter what else has to give. Build inside those walls. Don't bargain with them.

### 9. Break glass to act now, not to skip the rules

When the normal process can't run and something's on fire, you need to act right now. So you break the
glass: an emergency override, signed by two people, that changes things this second. It doesn't make the
change approved. Once the fire's out, you owe an answer: make it official the normal way, or undo it.
Recovering from one of these can take days, and the people at home pay for that week too. It's a last
resort, not a shortcut.

### 10. You set how much it matters; the system sets the rest

Cheap is only cheap until you count what it costs you later. A bargain that dies in three years costs more
than the tool that lasts seventeen. So price nothing in a vacuum. Decide how much a thing matters, and let
its protection and its cost follow from that. What matters most earns real protection and real money. What
barely matters stays small and cheap. Set the importance once, and the rest falls in line.

### 11. If you can't follow the plan, you can't approve it

A plan you can't read just asks you to trust it blindly, and trusting blindly is exactly what this whole
approach throws out. So here, a readable plan is a correct plan, not a polished one. Every plan opens with a
one-line summary, and you can dig into the detail underneath. If the person signing off can't follow the
argument, the approval didn't really happen.

### 12. Self-service shouldn't mean self-operate

Letting people use their own infrastructure is not the same as making them run it. Hand someone a system
they're not ready to operate and you've set them up to fail, and the sharp ones refuse it for exactly that
reason. So earn their yes by making it safe: training wheels on the bike, and someone running alongside to
catch it when a wheel wobbles. Let them use it and steer it. Don't make them keep it alive. You set the
guardrails. They drive.

## Go deeper

[The case](/trellis/docs/the-case) · [the spec and its invariants](/trellis/docs/spec) · [the simulator](/trellis/simulator/).
