// A deterministic rung-0/1 planner (spec §5): compile a Posture into a concrete
// Structure (a 3-tier blueprint per region) and emit a plan that *is a proof* —
// every resource traced to the objective or a named constraint. It selects and
// parameterizes a vetted blueprint; it does not search (catalog-not-search).
//
// This is the demoted, buildable form of the compiler — the one honest bet of
// the spec, shipped as blueprint-select + parameterize + a cost proof.

import {
  type CellKind,
  type Criticality,
  type DesiredResource,
  type Generation,
  type Manifest,
  type Plan,
  type Posture,
  type ProofRow,
  type Resilience,
} from "./model";

const COMPUTE_COST: Record<string, number> = { small: 120, medium: 300, large: 700 };
const DB_COST: Record<string, number> = { small: 150, medium: 400, large: 900 };
const LB_COST = 25;
const REPL_LINK_COST = 200;

const SIZE_FOR: Record<Criticality, string> = { C0: "large", C1: "medium", C2: "medium", C3: "small" };
const REPLICAS_FOR: Record<Criticality, number> = { C0: 3, C1: 2, C2: 2, C3: 1 };
const ISOLATION_FOR: Record<Criticality, string> = {
  C0: "isolate-per-service",
  C1: "isolate-per-service",
  C2: "colocate-trust",
  C3: "colocate",
};

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "service"
  );
}

const CELLS: { cell: CellKind; kind: string }[] = [
  { cell: "edge", kind: "load-balancer" },
  { cell: "app", kind: "compute" },
  { cell: "data", kind: "managed-relational-db" },
];

interface Built {
  resources: DesiredResource[];
  cost: number;
  proof: ProofRow[];
}

function buildRegionStack(
  svc: string,
  region: string,
  isPrimary: boolean,
  posture: Posture,
  gen: Generation,
): Built {
  const c = posture.criticality;
  const size = SIZE_FOR[c];
  const replicas = REPLICAS_FOR[c];
  const multiAZ = c === "C0" || c === "C1";
  const resources: DesiredResource[] = [];
  const proof: ProofRow[] = [];
  let cost = 0;

  for (const { cell, kind } of CELLS) {
    // Active-passive standby regions carry data (a replica) but no app/edge.
    if (!isPrimary && posture.resilience === "active-passive" && cell !== "data") continue;

    const id = `${svc}-${cell}-${region}`;
    const spec: Record<string, string> = { region, size };
    let rc = 0;
    if (cell === "app") {
      spec.replicas = String(isPrimary ? replicas : Math.max(1, replicas - 1));
      rc = COMPUTE_COST[size] * Number(spec.replicas);
      proof.push({
        resourceId: id,
        claim: `${spec.replicas}× ${size} compute`,
        reason: `Criticality ${c} sets ${replicas} replicas at ${size}`,
      });
    } else if (cell === "data") {
      spec.multiAZ = String(multiAZ);
      rc = DB_COST[size] * (multiAZ ? 2 : 1);
      proof.push({
        resourceId: id,
        claim: `managed DB (${multiAZ ? "multi-AZ" : "single-AZ"})`,
        reason: multiAZ ? `Criticality ${c} requires multi-AZ for HA` : `Criticality ${c} allows single-AZ to save cost`,
      });
    } else {
      rc = LB_COST;
      proof.push({ resourceId: id, claim: "load balancer", reason: "edge cell accepts LB/NAT (§3)" });
    }
    cost += rc;
    resources.push({ id, kind, spec, generation: gen, service: svc, region, cell });
  }
  return { resources, cost, proof };
}

export function plan(posture: Posture, gen: Generation): Plan {
  const svc = slug(posture.intent);
  const regions = posture.regions.length ? posture.regions : ["us-east-1"];
  const resilience: Resilience = posture.resilience;

  const resources: DesiredResource[] = [];
  const proof: ProofRow[] = [];
  let cost = 0;

  // Macro topology shape comes from blueprint selection, never global search.
  const activeRegions =
    resilience === "single" ? regions.slice(0, 1) : regions;

  proof.push({
    resourceId: "*",
    claim: `${activeRegions.length} region${activeRegions.length > 1 ? "s" : ""} (${resilience})`,
    reason:
      resilience === "active-active"
        ? "Resilience active-active → full stack in every region"
        : resilience === "active-passive"
          ? "Resilience active-passive → primary + warm standby data"
          : "Resilience single → one region",
    binding: resilience !== "single",
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
      reason: "Governance hard constraint — pre-filter, never traded (§2)",
    });
  }

  activeRegions.forEach((region, i) => {
    const built = buildRegionStack(svc, region, i === 0, posture, gen);
    resources.push(...built.resources);
    proof.push(...built.proof);
    cost += built.cost;
  });

  if (resilience === "active-active" && activeRegions.length > 1) {
    const links = activeRegions.length - 1;
    cost += links * REPL_LINK_COST;
    proof.push({
      resourceId: "*",
      claim: `${links}× cross-region replication`,
      reason: "active-active requires synchronized data across regions (§3 Weave)",
    });
  }

  const manifest: Manifest = {
    generation: gen,
    resources: Object.fromEntries(resources.map((r) => [r.id, r])),
  };

  // Feasibility against budget. Budget is the bound when minimizing cost (§5).
  const feasible = cost <= posture.budgetMonthly;
  const sensitivity: string[] = [];
  let failure: string | undefined;

  if (!feasible) {
    failure = `No realization of this posture fits the budget. Cost is the objective and budget $${posture.budgetMonthly}/mo is the binding constraint: the cheapest structure meeting Criticality ${posture.criticality} + ${resilience} is $${cost}/mo.`;
    sensitivity.push(`Raise budget to ≥ $${cost}/mo to make this posture feasible.`);
    if (resilience === "active-active") sensitivity.push(`Or drop to active-passive (~−$${REPL_LINK_COST * (activeRegions.length - 1)}/mo + smaller standby).`);
    proof.push({ resourceId: "*", claim: "INFEASIBLE", reason: failure, binding: true });
  } else {
    const slack = posture.budgetMonthly - cost;
    sensitivity.push(`$${slack}/mo budget slack remains.`);
    if (resilience !== "active-active") sensitivity.push(`Raise to active-active: +~$${REPL_LINK_COST}/mo per extra region.`);
    if (posture.criticality !== "C0") sensitivity.push(`Tighten to C0 (large, 3×, multi-AZ): higher cost, tighter SLOs.`);
  }

  return { generation: gen, manifest, proof, estMonthlyCost: cost, feasible, failure, sensitivity };
}

/** Estimated monthly cost of an arbitrary manifest (for the FinOps view). */
export function manifestCost(m: Manifest): number {
  let cost = 0;
  for (const r of Object.values(m.resources)) {
    if (r.cell === "app") cost += COMPUTE_COST[r.spec.size] * Number(r.spec.replicas ?? "1");
    else if (r.cell === "data") cost += DB_COST[r.spec.size] * (r.spec.multiAZ === "true" ? 2 : 1);
    else cost += LB_COST;
  }
  return cost;
}
