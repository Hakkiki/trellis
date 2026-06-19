// A deterministic rung-2/3 planner (spec §5): compile a Posture into a concrete
// Structure (a 3-tier blueprint per region, per Service) and emit a plan that
// *is a proof*.
//
// It genuinely solves the objective program over a small, discrete candidate set
// (catalog-not-search): Governance is a hard pre-filter, the budget is the bound
// shared across every Service the environment owns, and `optimize` chooses —
// minimize-cost takes each Service's cheapest realization meeting its floor;
// maximize-resilience greedily upgrades by score across Services until the shared
// budget is exhausted. When nothing is feasible it fails loudly with the binding
// constraint.

import {
  type CellKind,
  type Criticality,
  type DesiredResource,
  type Generation,
  type Kind,
  type Manifest,
  type Plan,
  type Posture,
  type ProofRow,
  type Resilience,
  type ServiceSpec,
  servicesOf,
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

/** The resource-ID slug for a Service name (so the UI can join rollups to it). */
export const serviceSlug = slug;

interface Candidate {
  service: string;
  resilience: Resilience;
  headroom: number;
  resources: DesiredResource[];
  cost: number;
  regionsActive: number;
  score: number;
}

/** Build one realization of a single Service at a given resilience + headroom. */
function buildCandidate(
  svcName: string,
  criticality: Criticality,
  posture: Posture,
  resilience: Resilience,
  headroom: number,
  gen: Generation,
): Candidate {
  const svc = slug(svcName);
  const c = criticality;
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

  // Every Service carries three non-service workloads (§1), placed in the
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
  return {
    service: svcName,
    resilience,
    headroom,
    resources,
    cost,
    regionsActive: activeRegions.length,
    score,
  };
}

function requiredKinds(): Kind[] {
  return CELLS.map((c) => c.kind);
}

/** Enumerate a Service's candidate set: resilience ≥ declared floor × replica
 *  headroom, cheapest first (the deterministic selection order). */
function candidatesFor(
  svc: ServiceSpec,
  posture: Posture,
  floorIdx: number,
  maxIdx: number,
  gen: Generation,
): Candidate[] {
  const out: Candidate[] = [];
  for (let i = floorIdx; i <= maxIdx; i++) {
    for (const headroom of [0, 1]) {
      out.push(buildCandidate(svc.name, svc.criticality, posture, RES_LEVELS[i], headroom, gen));
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

/** Dedupe Service names (slug collisions would clobber resource IDs). */
function uniqueServices(posture: Posture): ServiceSpec[] {
  const seen = new Set<string>();
  const out: ServiceSpec[] = [];
  for (const s of servicesOf(posture)) {
    const key = slug(s.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
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

  // --- Enumerate per-Service candidate sets against the shared bound. ---
  const services = uniqueServices(posture);
  const regions = posture.regions.length ? posture.regions : ["us-east-1"];
  const floorIdx = RES_LEVELS.indexOf(posture.resilience);
  const maxIdx = regions.length >= 2 ? RES_LEVELS.length - 1 : 0;
  const candsByService = services.map((s) => ({
    svc: s,
    cands: candidatesFor(s, posture, floorIdx, maxIdx, gen),
  }));

  // Each Service's floor is its cheapest realization meeting the declared floor.
  const floorCost = candsByService.reduce((sum, { cands }) => sum + cands[0].cost, 0);
  const objLabel = posture.optimize === "minimize-cost" ? "minimize cost" : "maximize resilience";

  if (floorCost > posture.budgetMonthly) {
    const failure = `No realization fits the budget. Cost is bounded by $${posture.budgetMonthly}/mo (the binding constraint, shared across ${services.length} service${services.length > 1 ? "s" : ""}); the cheapest structure meeting every Service's floor is $${floorCost}/mo.`;
    proof.push({ resourceId: "*", claim: "INFEASIBLE", reason: failure, binding: true });
    for (const { svc, cands } of candsByService) {
      proof.push({
        resourceId: "*",
        claim: `${svc.name} (${svc.criticality}) floor: $${cands[0].cost}/mo`,
        reason: `cheapest realization meeting ${posture.resilience}`,
      });
    }
    return {
      generation: gen,
      manifest: { generation: gen, resources: {} },
      proof,
      estMonthlyCost: floorCost,
      feasible: false,
      failure,
      sensitivity: [`Raise budget to ≥ $${floorCost}/mo, or lower Criticality / resilience.`],
    };
  }

  // --- Select per the objective program (§5), sharing the budget. ---
  // Start every Service at its floor, then (maximize-resilience only) greedily
  // apply the single upgrade with the best score gain that still fits the
  // remaining budget, across all Services.
  const chosen = new Map<string, Candidate>();
  for (const { svc, cands } of candsByService) chosen.set(svc.name, cands[0]);
  let spend = floorCost;

  if (posture.optimize === "maximize-resilience") {
    let upgraded = true;
    while (upgraded) {
      upgraded = false;
      let best: { svc: string; cand: Candidate; gain: number; delta: number } | null = null;
      for (const { svc, cands } of candsByService) {
        const cur = chosen.get(svc.name)!;
        for (const cand of cands) {
          const delta = cand.cost - cur.cost;
          const gain = cand.score - cur.score;
          if (gain <= 0 || delta <= 0) continue;
          if (spend + delta > posture.budgetMonthly) continue;
          if (
            !best ||
            gain > best.gain ||
            (gain === best.gain && delta < best.delta) ||
            (gain === best.gain && delta === best.delta && svc.name < best.svc)
          ) {
            best = { svc: svc.name, cand, gain, delta };
          }
        }
      }
      if (best) {
        spend += best.delta;
        chosen.set(best.svc, best.cand);
        upgraded = true;
      }
    }
  }

  const estMonthlyCost = spend;

  // --- Proof: objective, the shared bound, and per-Service derivation. ---
  proof.push({
    resourceId: "*",
    claim: `objective: ${objLabel} · budget $${posture.budgetMonthly}/mo (shared bound)`,
    reason:
      posture.optimize === "minimize-cost"
        ? "cost is the objective; Governance + each Service's Criticality + declared resilience are hard floors"
        : "resilience is the objective; the shared budget is the bound; Governance is a hard pre-filter",
    binding: true,
  });
  proof.push({
    resourceId: "*",
    claim: `${services.length} service${services.length > 1 ? "s" : ""} owned · $${estMonthlyCost}/mo of $${posture.budgetMonthly}`,
    reason: "spend attributes to its owning Service → environment (§6 ownership tree)",
  });
  if (posture.compliance.length) {
    proof.push({
      resourceId: "*",
      claim: `compliance: ${posture.compliance.join(", ")}`,
      reason: "Governance hard constraint, enforced at plan time (§2)",
    });
  }

  const allResources: DesiredResource[] = [];
  for (const { svc } of candsByService) {
    const c = chosen.get(svc.name)!;
    allResources.push(...c.resources);
    proof.push({
      resourceId: "*",
      claim: `service "${svc.name}" (${svc.criticality}): ${c.regionsActive} region${c.regionsActive > 1 ? "s" : ""} · ${c.resilience}${c.headroom ? " · +headroom" : ""} — $${c.cost}/mo`,
      reason: `isolation ${ISOLATION_FOR[svc.criticality]}; ${
        posture.optimize === "minimize-cost"
          ? "cheapest realization meeting its floor"
          : "upgraded as far as the shared budget allowed"
      }`,
    });
    for (const r of c.resources) appendResourceProof(proof, r, svc, c.headroom);
    if (c.resilience === "active-active" && c.regionsActive > 1) {
      proof.push({
        resourceId: "*",
        claim: `${svc.name}: ${c.regionsActive - 1}× cross-region replication`,
        reason: "active-active synchronizes data across regions (§3 Weave)",
      });
    }
  }

  // --- Sensitivity: the alternatives the solver weighed, per Service. ---
  for (const { svc, cands } of candsByService) {
    const cur = chosen.get(svc.name)!;
    for (const cand of cands) {
      if (cand === cur) continue;
      const verdict =
        cand.cost > posture.budgetMonthly ? `$${cand.cost}/mo — over budget` : `$${cand.cost}/mo`;
      sensitivity.push(
        `${svc.name} · ${cand.resilience}${cand.headroom ? " +headroom" : ""}: ${verdict}`,
      );
    }
  }

  const manifest: Manifest = {
    generation: gen,
    resources: Object.fromEntries(allResources.map((r) => [r.id, r])),
  };
  return { generation: gen, manifest, proof, estMonthlyCost, feasible: true, sensitivity };
}

function appendResourceProof(
  proof: ProofRow[],
  r: DesiredResource,
  svc: ServiceSpec,
  headroom: number,
): void {
  if (r.lifecycle === "job") {
    proof.push({
      resourceId: r.id,
      claim: "batch job (nightly)",
      reason: "run-to-completion workload (§1) — a finished run is success, not drift",
    });
    return;
  }
  if (r.lifecycle === "external") {
    proof.push({
      resourceId: r.id,
      claim: "external SaaS (payments)",
      reason: "third-party dependency — consumed, observe-only, never provisioned (§1)",
    });
    return;
  }
  if (r.lifecycle === "stateful") {
    proof.push({
      resourceId: r.id,
      claim: `stateful broker (${r.spec.nodes}-node quorum)`,
      reason: "self-run cluster (§1) — health rolls up by quorum; minority of nodes = Unavailable",
    });
    return;
  }
  if (r.cell === "app") {
    proof.push({
      resourceId: r.id,
      claim: `${r.spec.replicas}× ${r.spec.size} compute`,
      reason: `Criticality ${svc.criticality}${headroom ? " + headroom" : ""} sizing`,
    });
  } else if (r.cell === "data") {
    proof.push({
      resourceId: r.id,
      claim: `managed DB (${r.spec.multiAZ === "true" ? "multi-AZ" : "single-AZ"})`,
      reason:
        r.spec.multiAZ === "true"
          ? `Criticality ${svc.criticality} requires multi-AZ HA`
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

/** Estimated monthly cost of a single resource (the unit the FinOps view tints by). */
export function resourceCost(r: DesiredResource): number {
  if (r.lifecycle === "external") return 0; // consumed, not provisioned
  if (r.lifecycle === "job") return JOB_COST;
  if (r.lifecycle === "stateful") return Number(r.spec.nodes ?? "1") * STATEFUL_NODE_COST;
  if (r.cell === "app") return COMPUTE_COST[r.spec.size] * Number(r.spec.replicas ?? "1");
  if (r.cell === "data") return DB_COST[r.spec.size] * (r.spec.multiAZ === "true" ? 2 : 1);
  return LB_COST;
}

/** Estimated monthly cost of an arbitrary manifest (for the FinOps view). */
export function manifestCost(m: Manifest): number {
  let cost = 0;
  for (const r of Object.values(m.resources)) cost += resourceCost(r);
  return cost;
}
