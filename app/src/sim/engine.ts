// The simulator engine: orchestrates the full Trellis loop the UI drives —
// declare Posture → plan (+proof) → approve (gate + mint) → reconcile → tend
// (drift, self-heal, break-glass). It composes the planner, the SimCloud
// provider, and the Reconciler, and records an audit trail (the §7 duality:
// every action emits a record of who/why).

import type { CellKind, Lifecycle, Manifest, Plan, Posture, ResourceID } from "./model";
import { manifestCost, plan as runPlanner } from "./planner";
import { Reconciler, type Status } from "./reconcile";
import { SimCloud } from "./sim";
import type { State } from "./state";

export type AuditClass = "Author" | "Converge" | "Observe" | "Break-glass" | "Gate";

export interface AuditEntry {
  tMs: number;
  cls: AuditClass;
  actor: string;
  verb: string;
  target: string;
  reason: string;
}

export interface ResourceView {
  id: ResourceID;
  service: string;
  region: string;
  cell: CellKind;
  kind: string;
  lifecycle: Lifecycle;
  size: string;
  replicas: number;
  state: State;
  detail?: string; // e.g. quorum "2/3 nodes" for stateful clusters
}

export type Phase = "empty" | "planned" | "applied";

export interface Incident {
  id: ResourceID;
  region: string;
  service: string;
  cell: CellKind;
}

export interface EngineSnapshot {
  tMs: number;
  phase: Phase;
  posture: Posture;
  plan: Plan | null;
  resources: ResourceView[];
  audit: AuditEntry[];
  incidents: Incident[];
  costNow: number;
  budget: number;
  overBudget: boolean;
  converged: boolean;
  appliedGen: number;
}

export const DEFAULT_POSTURE: Posture = {
  intent: "payments-api",
  criticality: "C0",
  resilience: "active-active",
  regions: ["us-east-1", "eu-west-1"],
  budgetMonthly: 8000,
  optimize: "minimize-cost",
  compliance: ["pci-dss", "soc2"],
  governanceServices: ["load-balancer", "compute", "managed-relational-db"],
};

export class Engine {
  private cloud = new SimCloud({ applyLatency: 2 });
  private rec = new Reconciler(this.cloud, { driftPolicy: "enforce", stalenessBudgetMs: 5000 });
  private gen = 0;
  private appliedGen = 0;
  private posture: Posture;
  private plan: Plan | null = null;
  private manifest: Manifest | null = null;
  private statuses: Status[] = [];
  private prevState = new Map<ResourceID, State>();
  private audit: AuditEntry[] = [];

  constructor(posture: Posture = DEFAULT_POSTURE) {
    this.posture = posture;
  }

  getPosture(): Posture {
    return this.posture;
  }

  /** Author (proposal): compile a posture into a plan + proof. Not yet applied. */
  declare(posture: Posture): Plan {
    this.posture = posture;
    this.gen += 1;
    this.plan = runPlanner(posture, this.gen);
    this.log(
      "Author",
      "team",
      "propose",
      `gen ${this.gen}`,
      this.plan.feasible
        ? `plan: ${Object.keys(this.plan.manifest.resources).length} resources, $${this.plan.estMonthlyCost}/mo`
        : `INFEASIBLE: ${this.plan.failure}`,
    );
    return this.plan;
  }

  /** The gate: approve the current plan = merge. Mints a scoped credential. */
  approve(): boolean {
    if (!this.plan?.feasible) return false;
    this.manifest = this.plan.manifest;
    this.appliedGen = this.plan.generation;
    // External dependencies are discovered, not provisioned (observe-only, §1).
    for (const r of Object.values(this.manifest.resources)) {
      if (r.lifecycle === "external") this.cloud.seedExternal(r);
    }
    this.log(
      "Gate",
      "approver",
      "approve+merge",
      `gen ${this.appliedGen}`,
      "human approved the signed plan",
    );
    this.log(
      "Author",
      "mint",
      "mint-credential",
      `${Object.keys(this.manifest.resources).length} resources`,
      "ephemeral credential scoped to the approved diff",
    );
    return true;
  }

  /** One reconcile pass + advance the simulated cloud. */
  tick() {
    if (!this.manifest) return;
    this.statuses = this.rec.step(this.manifest, this.cloud.now());
    this.recordTransitions();
    this.cloud.tick();
  }

  private recordTransitions() {
    for (const s of this.statuses) {
      // Jobs cycle through phases by design; don't spam the audit with them.
      const lc = this.manifest?.resources[s.id]?.lifecycle;
      if (lc && lc !== "service") continue;
      const prev = this.prevState.get(s.id);
      if (prev !== s.state) {
        this.prevState.set(s.id, s.state);
        if (prev === undefined) continue; // first sight: no narrative noise
        const msg = transitionNote(prev, s.state, s.reason);
        if (msg) this.log("Converge", "reconciler", msg.verb, s.id, msg.reason);
      }
    }
  }

  // ---- Operator events ------------------------------------------------------

  injectDrift(id: ResourceID) {
    this.cloud.injectDrift(id, (sp) => {
      sp.size = sp.size === "small" ? "tiny" : "small"; // hand-edit
    });
    this.log("Observe", "human", "hand-edit", id, "out-of-band change (drift) injected");
  }

  failNode(id: ResourceID) {
    this.cloud.failNode(id);
    this.log("Observe", "fault", "node-failure", id, "underlying node died");
  }

  /** A root-cause failure self-heal can't fix → the breaker trips to Stalled. */
  hardFailure(id: ResourceID) {
    this.cloud.failPermanent(id);
    this.log(
      "Observe",
      "fault",
      "hard-failure",
      id,
      "root-cause failure (bad config / quota) — self-heal cannot fix",
    );
  }

  /** Incident response (§13): a human fixes the root cause; the breaker resets. */
  resolveIncident(id: ResourceID) {
    this.cloud.repair(id);
    this.rec.resetBreaker(id);
    this.log(
      "Author",
      "on-call",
      "resolve-incident",
      id,
      "root cause fixed; circuit breaker reset, reconciliation resumes",
    );
  }

  regionOutage(region: string) {
    const hit = this.cloud.regionOutage(region);
    this.log("Observe", "fault", "region-outage", region, `${hit.length} resources degraded`);
  }

  setStale(id: ResourceID, stale: boolean) {
    this.cloud.setStale(id, stale);
    this.log(
      "Observe",
      "fault",
      stale ? "telemetry-loss" : "telemetry-restored",
      id,
      stale ? "observability plane degraded" : "telemetry returned",
    );
  }

  breakGlass(id: ResourceID) {
    this.rec.freeze(id);
    this.log(
      "Break-glass",
      "operator+second",
      "freeze",
      id,
      "dual-control override; reconciliation suspended (debt owed)",
    );
  }

  ratify(id: ResourceID) {
    this.rec.unfreeze(id);
    this.log(
      "Author",
      "operator",
      "ratify",
      id,
      "debt repaid via Author gate; reverting to approved desired state",
    );
  }

  isFrozen(id: ResourceID) {
    return this.rec.isFrozen(id);
  }

  // ---- Snapshot for the UI --------------------------------------------------

  snapshot(): EngineSnapshot {
    const byId = new Map(this.statuses.map((s) => [s.id, s]));
    const resources: ResourceView[] = this.manifest
      ? Object.values(this.manifest.resources).map((r) => ({
          id: r.id,
          service: r.service,
          region: r.region,
          cell: r.cell,
          kind: r.kind,
          lifecycle: r.lifecycle,
          size: r.spec.size,
          replicas: Number(r.spec.replicas ?? "1"),
          state: byId.get(r.id)?.state ?? "Unknown",
          detail: byId.get(r.id)?.detail,
        }))
      : [];
    const costNow = this.manifest ? manifestCost(this.manifest) : 0;
    const phase: Phase = this.manifest ? "applied" : this.plan ? "planned" : "empty";
    const incidents: Incident[] = resources
      .filter((r) => r.state === "Stalled")
      .map((r) => ({ id: r.id, region: r.region, service: r.service, cell: r.cell }));
    return {
      tMs: this.cloud.now(),
      phase,
      posture: this.posture,
      plan: this.plan,
      resources,
      audit: this.audit.slice(-80),
      incidents,
      costNow,
      budget: this.posture.budgetMonthly,
      overBudget: costNow > this.posture.budgetMonthly,
      converged: resources.length > 0 && resources.every(isSettled),
      appliedGen: this.appliedGen,
    };
  }

  /** Restore audit + clock metadata after loading from IndexedDB. */
  hydrate(audit: AuditEntry[]) {
    this.audit = audit;
  }

  private log(cls: AuditClass, actor: string, verb: string, target: string, reason: string) {
    this.audit.push({ tMs: this.cloud.now(), cls, actor, verb, target, reason });
  }
}

/** A workload is "settled" (good steady-state) per its lifecycle: services and
 *  externals when Converged; jobs whenever they aren't Failed (they cycle). */
function isSettled(r: ResourceView): boolean {
  if (r.lifecycle === "job") return r.state !== "Failed";
  return r.state === "Converged";
}

function transitionNote(
  prev: State,
  next: State,
  reason: string,
): { verb: string; reason: string } | null {
  if (next === "Converged") return { verb: "converged", reason: "matches spec and healthy" };
  if (next === "Degraded") return { verb: "degraded", reason: "health check failed" };
  if (next === "Unavailable") return { verb: "quorum-lost", reason: "minority of nodes serving" };
  if (next === "Drifted") return { verb: "drift-detected", reason: "unauthored divergence" };
  if (next === "Converging")
    return {
      verb:
        prev === "Degraded" ? "self-heal" : prev === "Drifted" ? "correcting-drift" : "converging",
      reason,
    };
  if (next === "Unknown")
    return { verb: "telemetry-stale", reason: "holding — fail-safe on Unknown" };
  if (next === "Frozen") return { verb: "frozen", reason: "break-glass" };
  if (next === "Stalled")
    return { verb: "STALLED", reason: "circuit breaker tripped — needs a human (incident raised)" };
  return null;
}
