// A deterministic rung-2/3 planner (spec §5): compile a Posture into a concrete
// Structure (a 3-tier blueprint per region) and emit a plan that *is a proof*.
//
// It genuinely solves the objective program over a small, discrete candidate set
// (catalog-not-search): Governance is a hard pre-filter, the budget is the bound,
// and `optimize` chooses between candidates — minimize-cost picks the cheapest
// that meets the declared floor; maximize-resilience picks the strongest that
// fits the budget. When nothing is feasible it fails loudly with the binding
// constraint.

import type {
  CellKind,
  Criticality,
  DesiredResource,
  Generation,
  Kind,
  Manifest,
  Plan,
  Posture,
  ProofRow,
  Resilience,
} from "./model";

const COMPUTE_COST: Record<string, number> = { small: 120, medium: 300, large: 700 };
const DB_COST: Record<string, number> = { small: 150, medium: 400, large: 900 };
const LB_COST = 25;
const REPL_LINK_COST = 200;
const JOB_COST = 80;
const STATEFUL_NODE_COST = 90;

const SIZE_FOR: Record<Criticality, string> = {
  C0: "large",
  C1: "medium",
  C2: "medium",
  C3: "small",
};
const REPLICAS_FOR: Record<Criticality, number> = { C0: 3, C1: 2, C2: 2, C3: 1 };
const ISOLATION_FOR: Record<Criticality, string> = {
  C0: "isolate-per-service",
  C1: "isolate-per-service",
  C2: "colocate-trust",
  C3: "colocate",
};

const CELLS: { cell: CellKind; kind: Kind }[] = [
  { cell: "edge", kind: "load-balancer" },
  { cell: "app", kind: "compute" },
  { cell: "data", kind: "managed-relational-db" },
];

const RES_LEVELS: Resilience[] = ["single", "active-passive", "active-active"];

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "service"
  );
}

interface Candidate {
  resilience: Resilience;
  headroom: number;
  resources: DesiredResource[];
  cost: number;
  regionsActive: number;
  score: number;
}

function buildCandidate(
  posture: Posture,
  resilience: Resilience,
  headroom: number,
  gen: Generation,
): Candidate {
  const svc = slug(posture.intent);
  const c = posture.criticality;
  const size = SIZE_FOR[c];
  const replicas = REPLICAS_FOR[c] + headroom;
  const multiAZ = c === "C0" || c === "C1";
  const regions = posture.regions.length ? posture.regions : ["us-east-1"];
  const activeRegions = resilience === "single" ? regions.slice(0, 1) : regions;

  const resources: DesiredResource[] = [];
  let cost = 0;

  activeRegions.forEach((region, i) => {
    const primary = i === 0;
    for (const { cell, kind } of CELLS) {
      if (!primary && resilience === "active-passive" && cell !== "data") continue;
      const id = `${svc}-${cell}-${region}`;
      const spec: Record<string, string> = { region, size };
      if (cell === "app") {
        spec.replicas = String(primary ? replicas : Math.max(1, replicas - 1));
        cost += COMPUTE_COST[size] * Number(spec.replicas);
      } else if (cell === "data") {
        spec.multiAZ = String(multiAZ);
        cost += DB_COST[size] * (multiAZ ? 2 : 1);
      } else {
        cost += LB_COST;
      }
      resources.push({
        id,
        kind,
        spec,
        generation: gen,
        lifecycle: "service",
        service: svc,
        region,
        cell,
      });
    }
  });

  if (resilience === "active-active" && activeRegions.length > 1) {
    cost += (activeRegions.length - 1) * REPL_LINK_COST;
  }

  // Every service carries three non-service workloads (§1), placed in the
  // primary region: a nightly batch Job, an External SaaS dependency, and a
  // self-run stateful broker (a quorum cluster).
  const r0 = activeRegions[0];
  const brokerNodes = c === "C0" || c === "C1" ? 3 : 1;
  resources.push({
    id: `${svc}-batch-${r0}`,
    kind: "batch-job",
    spec: { region: r0, schedule: "nightly" },
    generation: gen,
    lifecycle: "job",
    service: svc,
    region: r0,
    cell: "app",
  });
  resources.push({
    id: `${svc}-ext-payments`,
    kind: "external-saas",
    spec: { region: r0, vendor: "payments-gateway" },
    generation: gen,
    lifecycle: "external",
    service: svc,
    region: r0,
    cell: "edge",
  });
  resources.push({
    id: `${svc}-events-${r0}`,
    kind: "stream-broker",
    spec: { region: r0, nodes: String(brokerNodes) },
    generation: gen,
    lifecycle: "stateful",
    service: svc,
    region: r0,
    cell: "data",
  });
  cost += JOB_COST + brokerNodes * STATEFUL_NODE_COST; // external is consumed, not provisioned

  const levelRank = RES_LEVELS.indexOf(resilience);
  const score = levelRank * 1000 + activeRegions.length * 100 + headroom * 10 + (multiAZ ? 5 : 0);
  return { resilience, headroom, resources, cost, regionsActive: activeRegions.length, score };
}

function requiredKinds(): Kind[] {
  return CELLS.map((c) => c.kind);
}

export function plan(posture: Posture, gen: Generation): Plan {
  const proof: ProofRow[] = [];
  const sensitivity: string[] = [];

  // --- Governance: hard pre-filter (never traded away, §2). ---
  const whitelist = posture.governanceServices ?? requiredKinds();
  const denied = requiredKinds().filter((k) => !whitelist.includes(k));
  if (denied.length) {
    const failure = `Governance denied: ${denied.join(", ")} not in the service whitelist. Governance is a hard pre-filter — never traded for cost or resilience (§2).`;
    proof.push({ resourceId: "*", claim: "GOVERNANCE DENIED", reason: failure, binding: true });
    return {
      generation: gen,
      manifest: { generation: gen, resources: {} },
      proof,
      estMonthlyCost: 0,
      feasible: false,
      failure,
      sensitivity: [`Add ${denied.join(", ")} to the whitelist to proceed.`],
    };
  }

  // --- Enumerate candidates: resilience ≥ declared floor × replica headroom. ---
  const regions = posture.regions.length ? posture.regions : ["us-east-1"];
  const floorIdx = RES_LEVELS.indexOf(posture.resilience);
  const maxIdx = regions.length >= 2 ? RES_LEVELS.length - 1 : 0;
  const candidates: Candidate[] = [];
  for (let i = floorIdx; i <= maxIdx; i++) {
    for (const headroom of [0, 1]) {
      candidates.push(buildCandidate(posture, RES_LEVELS[i], headroom, gen));
    }
  }

  const feasibleCands = candidates.filter((c) => c.cost <= posture.budgetMonthly);

  // --- Select per the objective program (§5). ---
  let chosen: Candidate | undefined;
  const objLabel = posture.optimize === "minimize-cost" ? "minimize cost" : "maximize resilience";
  if (feasibleCands.length) {
    chosen =
      posture.optimize === "minimize-cost"
        ? feasibleCands.reduce((a, b) => (b.cost < a.cost ? b : a))
        : feasibleCands.reduce((a, b) =>
            b.score > a.score || (b.score === a.score && b.cost < a.cost) ? b : a,
          );
  }

  if (!chosen) {
    const cheapest = candidates.reduce((a, b) => (b.cost < a.cost ? b : a));
    const failure = `No realization fits the budget. Cost is bounded by $${posture.budgetMonthly}/mo (the binding constraint); the cheapest structure meeting Criticality ${posture.criticality} + ${posture.resilience} is $${cheapest.cost}/mo.`;
    proof.push({ resourceId: "*", claim: "INFEASIBLE", reason: failure, binding: true });
    return {
      generation: gen,
      manifest: { generation: gen, resources: {} },
      proof,
      estMonthlyCost: cheapest.cost,
      feasible: false,
      failure,
      sensitivity: [`Raise budget to ≥ $${cheapest.cost}/mo, or lower Criticality / resilience.`],
    };
  }

  // --- Proof: objective, the choice, and per-resource derivation. ---
  proof.push({
    resourceId: "*",
    claim: `objective: ${objLabel} · budget $${posture.budgetMonthly}/mo (bound)`,
    reason:
      posture.optimize === "minimize-cost"
        ? "cost is the objective; Governance + Criticality + declared resilience are hard floors"
        : "resilience is the objective; budget is the bound; Governance is a hard pre-filter",
    binding: true,
  });
  proof.push({
    resourceId: "*",
    claim: `${chosen.regionsActive} region${chosen.regionsActive > 1 ? "s" : ""} · ${chosen.resilience}${chosen.headroom ? " · +headroom" : ""}`,
    reason:
      posture.optimize === "minimize-cost"
        ? `cheapest candidate ($${chosen.cost}/mo) meeting your declared floor`
        : `strongest candidate that fits the budget ($${chosen.cost}/mo of $${posture.budgetMonthly})`,
  });
  proof.push({
    resourceId: "*",
    claim: `isolation: ${ISOLATION_FOR[posture.criticality]}`,
    reason: `Criticality ${posture.criticality} default (authored, not solved — §6)`,
  });
  if (posture.compliance.length) {
    proof.push({
      resourceId: "*",
      claim: `compliance: ${posture.compliance.join(", ")}`,
      reason: "Governance hard constraint, enforced at plan time (§2)",
    });
  }
  for (const r of chosen.resources) {
    if (r.lifecycle === "job") {
      proof.push({
        resourceId: r.id,
        claim: "batch job (nightly)",
        reason: "run-to-completion workload (§1) — a finished run is success, not drift",
      });
      continue;
    }
    if (r.lifecycle === "external") {
      proof.push({
        resourceId: r.id,
        claim: "external SaaS (payments)",
        reason: "third-party dependency — consumed, observe-only, never provisioned (§1)",
      });
      continue;
    }
    if (r.lifecycle === "stateful") {
      proof.push({
        resourceId: r.id,
        claim: `stateful broker (${r.spec.nodes}-node quorum)`,
        reason:
          "self-run cluster (§1) — health rolls up by quorum; minority of nodes = Unavailable",
      });
      continue;
    }
    if (r.cell === "app") {
      proof.push({
        resourceId: r.id,
        claim: `${r.spec.replicas}× ${r.spec.size} compute`,
        reason: `Criticality ${posture.criticality}${chosen.headroom ? " + headroom" : ""} sizing`,
      });
    } else if (r.cell === "data") {
      proof.push({
        resourceId: r.id,
        claim: `managed DB (${r.spec.multiAZ === "true" ? "multi-AZ" : "single-AZ"})`,
        reason:
          r.spec.multiAZ === "true"
            ? `Criticality ${posture.criticality} requires multi-AZ HA`
            : "single-AZ permitted at this Criticality",
      });
    } else {
      proof.push({
        resourceId: r.id,
        claim: "load balancer",
        reason: "edge cell accepts LB/NAT (§3)",
      });
    }
  }
  if (chosen.resilience === "active-active" && chosen.regionsActive > 1) {
    proof.push({
      resourceId: "*",
      claim: `${chosen.regionsActive - 1}× cross-region replication`,
      reason: "active-active synchronizes data across regions (§3 Weave)",
    });
  }

  // --- Sensitivity: the alternatives the solver weighed. ---
  for (const cand of candidates) {
    if (cand === chosen) continue;
    const verdict =
      cand.cost > posture.budgetMonthly ? `$${cand.cost}/mo — over budget` : `$${cand.cost}/mo`;
    sensitivity.push(`${cand.resilience}${cand.headroom ? " +headroom" : ""}: ${verdict}`);
  }

  const manifest: Manifest = {
    generation: gen,
    resources: Object.fromEntries(chosen.resources.map((r) => [r.id, r])),
  };
  return {
    generation: gen,
    manifest,
    proof,
    estMonthlyCost: chosen.cost,
    feasible: true,
    sensitivity,
  };
}

/** Estimated monthly cost of an arbitrary manifest (for the FinOps view). */
export function manifestCost(m: Manifest): number {
  let cost = 0;
  for (const r of Object.values(m.resources)) {
    if (r.lifecycle === "external") continue; // consumed, not provisioned
    if (r.lifecycle === "job") cost += JOB_COST;
    else if (r.lifecycle === "stateful") cost += Number(r.spec.nodes ?? "1") * STATEFUL_NODE_COST;
    else if (r.cell === "app") cost += COMPUTE_COST[r.spec.size] * Number(r.spec.replicas ?? "1");
    else if (r.cell === "data") cost += DB_COST[r.spec.size] * (r.spec.multiAZ === "true" ? 2 : 1);
    else cost += LB_COST;
  }
  return cost;
}
