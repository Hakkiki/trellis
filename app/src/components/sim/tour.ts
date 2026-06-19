// A guided walkthrough of the simulator, powered by driver.js (the same tour
// library lattice uses). Steps target elements by id; any step whose target
// isn't on the page yet (e.g. the topology before you've applied a plan) is
// skipped, so the tour is safe to start at any time.

import { type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";

const STEPS: { sel: string; title: string; description: string }[] = [
  {
    sel: "#tour-posture",
    title: "1 · Declare a Posture",
    description:
      "Start here. Say what you want in plain terms — the services you own and how critical each is, how resilient, which regions, the budget. You declare intent; Trellis works out the structure.",
  },
  {
    sel: "#tour-plan",
    title: "2 · Plan, then approve",
    description:
      "Plan compiles your Posture into a concrete structure — and the plan is its own proof, tracing every resource to a reason. Approve & apply mints a scoped credential and starts the loop.",
  },
  {
    sel: "#tour-topology",
    title: "3 · Watch it converge",
    description:
      "The loop drives reality to match the plan and holds it there. Drag to orbit; pinch or scroll to zoom. Every node is a live resource with its own state.",
  },
  {
    sel: "#tour-views",
    title: "4 · Change the lens",
    description:
      "Recolor the same topology by state, cost, health, or security. One structure, four questions — nothing moves, only the meaning of the colors.",
  },
  {
    sel: "#tour-inject",
    title: "5 · Break something",
    description:
      "Fail a node, drift a config, take out a region, or spike a cost. Then watch the loop self-heal — or, when it genuinely can't, trip a breaker and raise an incident instead of flailing.",
  },
  {
    sel: "#tour-owners",
    title: "6 · Follow the ownership",
    description:
      "Spend and health roll up to each owning service and on to the environment. This is the read-side of the ownership tree — who owns what, and what it costs.",
  },
  {
    sel: "#tour-controlplane",
    title: "7 · The loop manages itself",
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
  driver({
    showProgress: true,
    overlayColor: "#0a0705",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    steps,
  }).drive();
}
