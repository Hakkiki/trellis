// A guided walkthrough of the simulator, powered by driver.js (the same tour
// library lattice uses). Steps target elements by id; any step whose target
// isn't on the page yet (e.g. the topology before you've applied a plan) is
// skipped, so the tour is safe to start at any time.

import { type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";

const STEPS: { sel: string; title: string; description: string }[] = [
  {
    sel: "#tour-posture",
    title: "1 · Declare a Posture",
    description:
      "Start here. Say what you want in plain terms — the services you own and how critical each is, how resilient, which regions, the budget. You declare intent; Trellis works out the structure.",
  },
  {
    sel: "#tour-tiers",
    title: "2 · Set the cost levers",
    description:
      "Elasticity (stateless) and dormancy (stateful) say how eagerly idle capacity is parked — aggressive parks fast, conservative keeps a warm floor. They lower a lower environment's bill without changing its shape, so dev stays prod-like. Savings come from utilization, not from a smaller dev.",
  },
  {
    sel: "#tour-plan",
    title: "3 · Plan, then approve",
    description:
      "Plan compiles your Posture into a concrete structure — and the plan is its own proof, tracing every resource to a reason. Approve & apply mints a scoped credential and starts the loop.",
  },
  {
    sel: "#tour-topology",
    title: "4 · Watch it converge",
    description:
      "The loop drives reality to match the plan and holds it there. Drag to orbit; pinch or scroll to zoom. Every node is a live resource with its own state — including Dormant, when idle capacity is parked.",
  },
  {
    sel: "#tour-views",
    title: "5 · Change the lens",
    description:
      "Recolor the same topology by state, cost, health, or security. One structure, four questions — nothing moves, only the meaning of the colors.",
  },
  {
    sel: "#tour-inject",
    title: "6 · Break something — or park it",
    description:
      "Fail a node, drift a config, take out a region, or spike a cost, then watch the loop self-heal. Park a resource to scale it to zero (it reads Dormant, not down — the loop holds, never wakes it), or trigger a cold resume to see the warm-up path. When the loop genuinely can't fix something, it trips a breaker and raises an incident instead of flailing.",
  },
  {
    sel: "#tour-effectiveness",
    title: "7 · Cost vs value",
    description:
      "The Value tab is the honest denominator: cost ÷ value served, not cost ÷ budget. Value is demand actually met by live capacity, weighted by Criticality and discounted when run hot — served well, not just served. Spend that serves nothing is flagged ineffective, and a right-sizing proposal you can accept at the gate shrinks the shared shape so it's cheaper for the same workload.",
  },
  {
    sel: "#tour-breakglass",
    title: "8 · Break glass — on evidence",
    description:
      "Break-glass is the one move the loop never derives — it's your judgment. Before you override, this reads back what the loop believes about the selected resource, so you decide on evidence, not panic. A freeze owes a debt that shows on the incident surface until you Ratify it; open the glass too often and the surface flags the gate, not you.",
  },
  {
    sel: "#tour-owners",
    title: "9 · Follow the ownership",
    description:
      "Spend and health roll up to each owning service and on to the environment. This is the read-side of the ownership tree — who owns what, and what it costs.",
  },
  {
    sel: "#tour-controlplane",
    title: "10 · The loop manages itself",
    description:
      "The control plane is just another Criticality-0 environment. Propose a self-upgrade, clear the highest gate (dual-control), and — if it goes bad — recover with a re-bootstrap.",
  },
];

export function startTour() {
  const steps: DriveStep[] = STEPS.filter((s) => document.querySelector(s.sel)).map((s) => ({
    element: s.sel,
    popover: { title: s.title, description: s.description },
  }));
  if (!steps.length) return;
  // Honor the OS "Reduce Motion" setting — no slide/scroll animation.
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  driver({
    showProgress: true,
    animate: !reduceMotion,
    overlayColor: "#0a0705",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    steps,
  }).drive();
}
