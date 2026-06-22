// The simulator engine: orchestrates the full Trellis loop the UI drives —
// declare Posture → plan (+proof) → approve (gate + mint) → reconcile → tend
// (drift, self-heal, break-glass). It composes the planner, the SimCloud
// provider, and the Reconciler, and records an audit trail (the §7 duality:
// every action emits a record of who/why).

import { ControlPlane, type ControlPlaneView, type TcbId } from "./control";
import {
  type BudgetPolicy,
  type CellKind,
  type Criticality,
  type Lifecycle,
  type Manifest,
  type Plan,
  type Posture,
  parkable,
  parkClass,
  type Resilience,
  type ResourceID,
  servicesOf,
  type Tier,
} from "./model";
import { manifestCost, resourceCost, plan as runPlanner, serviceSlug } from "./planner";
import { Reconciler, type Status } from "./reconcile";
import { type Bake, isTerminal, type RolloutState, type Strategy, TeamRollout } from "./release";
import { isSize, recommendSize, SIZE_CAPACITY, type Size } from "./rightsizing";
import { demandWindowsFor, warmNeeded } from "./schedule";
import { SimCloud } from "./sim";
import { rollup, type State } from "./state";

export type AuditClass = "Author" | "Converge" | "Observe" | "Break-glass" | "Gate" | "Release";

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
  monthlyCost: number; // planned $/mo — tints the cost view
  billedCost: number; // observed $/mo (billed vs planned, §13)
  costDrifted: boolean; // billed > planned — cost drift
  security: SecurityTier; // trust/exposure posture — tints the security view (§7)
  detail?: string; // e.g. quorum "2/3 nodes" for stateful clusters
  reconcilerReason?: string; // the loop's current belief about this resource (§13)
}

/** Security-posture projection (spec §7): where a resource sits in the trust
 *  topology and whether it's adequately defended.
 *  - exposed   — internet-facing edge (the attack surface).
 *  - sensitive — holds state: data / stateful clusters (crown jewels).
 *  - internal  — compute behind the edge (app / jobs).
 *  - at-risk   — a third-party dependency (outside the TCB), an exposed surface
 *                without per-service isolation, or crown jewels without
 *                governance/compliance coverage. */
export type SecurityTier = "at-risk" | "exposed" | "sensitive" | "internal";

export function securityTier(
  cell: CellKind,
  lifecycle: Lifecycle,
  weakIsolation: boolean,
  complianceCovered: boolean,
): SecurityTier {
  const exposed = cell === "edge" || lifecycle === "external";
  const sensitive = cell === "data" || lifecycle === "stateful";
  if (lifecycle === "external") return "at-risk"; // third-party — outside our TCB
  if (exposed && weakIsolation) return "at-risk"; // exposed surface sharing trust
  if (sensitive && !complianceCovered) return "at-risk"; // crown jewels, no coverage
  if (exposed) return "exposed";
  if (sensitive) return "sensitive";
  return "internal";
}

export type Phase = "empty" | "planned" | "applied";

export interface Incident {
  id: ResourceID;
  region: string;
  service: string;
  cell: CellKind;
  reconcilerReason?: string; // the loop's belief — shown before an override (§13)
}

export interface EngineSnapshot {
  tMs: number;
  phase: Phase;
  posture: Posture;
  plan: Plan | null;
  resources: ResourceView[];
  audit: AuditEntry[];
  incidents: Incident[];
  costNow: number; // planned spend
  billedNow: number; // observed/billed spend (§13)
  budget: number;
  overBudget: boolean; // planned over budget
  budgetBreach: boolean; // billed over budget — a live FinOps signal
  canProvision: boolean; // false when breached under a block policy
  budgetPolicy: BudgetPolicy;
  converged: boolean;
  appliedGen: number;
  // Break-glass debt: resources Frozen by an override, surfaced on the §13
  // incident surface so the debt is loud (not a silent un-healed hole).
  frozenDebts: Incident[];
  changeFreeze: boolean;
  blastTripped: boolean;
  // Break-glass *rate* is a first-class gate-health signal (§7): a frequently
  // opened glass diagnoses a miscalibrated gate, not a heroic operator.
  breakGlassSignal: { recent: number; noisy: boolean };
  regionRollups: { region: string; state: State }[];
  serviceRollups: ServiceRollup[];
  envRollup: State;
  envNote: string;
  controlPlane: ControlPlaneView;
  // Resources the denial-of-wallet guard has pinned warm (guardrail 7): resume
  // thrash detected, so the autoscaler stops parking them until resolved.
  walletGuard: ResourceID[];
  // Right-sizing recommendations from observed utilization (axis 2). Proposals
  // only — accepting changes the shared shape, so it goes through the gate.
  rightSizing: RightSizingProposal[];
  // Cost-effectiveness per Service (axis 3): the denominator made visible —
  // cost vs *value served*, not cost vs budget. Only Services with demand
  // telemetry appear.
  value: ServiceValue[];
  // Aggregate cost per unit of (Criticality-weighted) value served — the
  // headline effectiveness number; null when no value is being served.
  costPerValue: number | null;
}

/** A right-sizing proposal for a Service, from its observed peak utilization. */
export interface RightSizingProposal {
  service: string; // display name
  slug: string;
  from: Size;
  to: Size;
  reason: string;
}

/** Cost-effectiveness for a Service (axis 3): what its spend actually buys. */
export interface ServiceValue {
  service: string; // display name
  slug: string;
  offered: number; // demand offered now (units)
  servedFraction: number; // served ÷ offered over the window (1 when no demand) — quantity
  sloAttainment: number; // quality of what was served (1 = within SLO; lower = run hot)
  value: number; // served *well* (quality-adjusted units) × Criticality weight
  monthlyCost: number; // spend attributed to this Service
  costPerValue: number | null; // cost ÷ value; null = serving no value (infinite)
  ineffective: boolean; // costs money but serves ~no value — spend buying nothing
}

/** Ownership roll-up (§6): a Service's state (worst-of its managed children) and
 *  the spend that attributes to it — the read-side of the Service → org tree. */
export interface ServiceRollup {
  service: string; // display name
  slug: string;
  criticality: Criticality;
  state: State;
  monthlyCost: number; // planned spend attributed to this owner
  billedCost: number; // observed/billed spend attributed to this owner (§13)
  version: string; // running version the runtime holds (§11 inner loop)
  rollout: RolloutState | null; // active rollout state, null when settled
  rolloutArtifact: string; // the version being rolled out, when active
  rolloutShare: number; // % of traffic the rollout currently carries (canary step)
}

export const DEFAULT_POSTURE: Posture = {
  intent: "payments-api",
  criticality: "C0",
  resilience: "active-active",
  regions: ["us-east-1", "eu-west-1"],
  budgetMonthly: 12000,
  optimize: "minimize-cost",
  compliance: ["pci-dss", "soc2"],
  governanceServices: ["load-balancer", "compute", "managed-relational-db"],
  // The environment owns two Services at different Criticality — spend and
  // health attribute to each owner up the tree (§6).
  services: [
    { name: "payments-api", criticality: "C0" },
    { name: "internal-dashboard", criticality: "C3" },
  ],
  budgetPolicy: "alert",
  // A prod-like single environment: never park (docs: Cost & parity). Lower
  // environments carry more aggressive tiers (see the fleet cascade).
  elasticity: "conservative",
  dormancy: "conservative",
};

// Break-glass rate signal (§7): how many freezes within the trailing window
// before the glass is judged "too often" — a gate-health alarm, not heroism.
const BREAK_GLASS_WINDOW_MS = 60_000;
const BREAK_GLASS_NOISY = 3;

// Idle ticks before the autoscaler parks a resource, per tier (docs: Cost &
// parity). The demand-driven replacement for env-label parking: conservative
// never parks (a warm floor), aggressive parks quickly.
const IDLE_THRESHOLD: Record<Tier, number> = {
  aggressive: 2,
  balanced: 5,
  conservative: Number.POSITIVE_INFINITY,
};
// Denial-of-wallet guard (guardrail 7): more than DOW_LIMIT resumes inside the
// trailing window is resume thrash (a flapping signal or an attacker forcing
// cold starts). Pin the resource warm and alert — churn costs more than a warm
// floor, so the cost-effective response is to stop the churn, not the workload.
const DOW_WINDOW_MS = 10_000;
const DOW_LIMIT = 3;
// How early (ticks) to pre-warm ahead of predicted demand (docs: Cost & parity
// axis 1). Must exceed the cold-start window so the resource is live before the
// scheduled demand arrives.
const PREWARM_LEAD = 4;
// The value denominator (docs: Cost & parity axis 3). "Effective" needs a
// denominator: value = demand *served* (not merely offered), weighted by
// Criticality so a C0 unit served is worth more than a C3 one. Cost ÷ value is
// the headline — cost-vs-value, not numerator-only cost-vs-budget.
const CRIT_WEIGHT: Record<Criticality, number> = { C0: 4, C1: 3, C2: 2, C3: 1 };
const VALUE_WINDOW = 10; // trailing ticks over which served/offered are summed
// Quality term (axis 3 refinement): value is demand served *well*, not just
// served. Latency degrades as serving capacity runs hot — above SLO_TARGET
// utilization, quality falls toward SLO_FLOOR at 100%. This makes "headroom is
// not waste" quantitative: a no-headroom shrink serves the same quantity at
// lower quality, so value drops even though cost does.
const SLO_TARGET = 0.8;
const SLO_FLOOR = 0.4;
function sloFactor(utilization: number): number {
  if (utilization <= SLO_TARGET) return 1;
  if (utilization >= 1) return SLO_FLOOR;
  const t = (utilization - SLO_TARGET) / (1 - SLO_TARGET);
  return 1 - t * (1 - SLO_FLOOR);
}

export class Engine {
  private cloud = new SimCloud({ applyLatency: 2 });
  private rec = new Reconciler(this.cloud, {
    driftPolicy: "enforce",
    stalenessBudgetMs: 5000,
    blastRadiusPct: 0.4,
  });
  private cp = new ControlPlane();
  private gen = 0;
  private appliedGen = 0;
  private posture: Posture;
  private plan: Plan | null = null;
  private manifest: Manifest | null = null;
  private statuses: Status[] = [];
  private prevState = new Map<ResourceID, State>();
  private audit: AuditEntry[] = [];
  // The app-delivery inner loop (§11): the team's rollout tool holds each
  // Service's running version and drives its canary; the Reconciler above owns
  // the Cell shape. Trellis (this Engine) observes the rollout, it does not run
  // it — in the simulator one process plays both the team's tool and Trellis.
  private teamRollout = new TeamRollout();
  private nextVer = new Map<string, number>();
  private bakes = new Map<string, Bake>();
  // Utilization control loop: resume timestamps per resource (denial-of-wallet
  // guard) and the set the guard has pinned warm to stop resume thrash.
  private resumeLog = new Map<ResourceID, number[]>();
  private pinnedWarm = new Set<ResourceID>();
  // Value accounting (axis 3): offered demand per Service (slug → units), and a
  // trailing window of {offered, served} so cost-effectiveness reads off served
  // value, not provisioned capacity. Only Services with demand telemetry count.
  private offered = new Map<string, number>();
  private hasDemand = new Set<string>();
  private valueHist = new Map<string, { offered: number; served: number; quality: number }[]>();

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

  /** Billed (observed) spend across the live fleet — the FinOps signal (§13). */
  private billedNow(): number {
    if (!this.manifest) return 0;
    return Object.values(this.manifest.resources).reduce(
      (sum, r) => sum + resourceCost(r) * this.cloud.billedFactor(r.id),
      0,
    );
  }

  /** True when billed spend exceeds budget under a block policy — the gate holds. */
  private provisioningBlocked(): boolean {
    return (
      (this.posture.budgetPolicy ?? "alert") === "block" &&
      this.billedNow() > this.posture.budgetMonthly
    );
  }

  /** The gate: approve the current plan = merge. Mints a scoped credential. */
  approve(): boolean {
    if (!this.plan?.feasible) return false;
    // Budget-breach blocks further provisioning when posture says so (§13).
    if (this.provisioningBlocked()) {
      this.log(
        "Gate",
        "finops",
        "provisioning-blocked",
        `gen ${this.plan.generation}`,
        "budget-breach under a block policy — resolve cost drift before provisioning",
      );
      return false;
    }
    this.manifest = this.plan.manifest;
    this.appliedGen = this.plan.generation;
    // External dependencies are discovered, not provisioned (observe-only, §1).
    for (const r of Object.values(this.manifest.resources)) {
      if (r.lifecycle === "external") this.cloud.seedExternal(r);
    }
    // Each Service's App Cell ships with an initial running version (§11). The
    // runtime holds it; the reconciler authors capacity, never version.
    for (const s of servicesOf(this.posture)) {
      const sl = serviceSlug(s.name);
      if (this.teamRollout.currentVersion(sl) === "none") this.teamRollout.seed(sl, "v1");
      if (!this.nextVer.has(sl)) this.nextVer.set(sl, 1);
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

  /** One reconcile pass + advance the simulated cloud (and any self-upgrade).
   *  Returns true when a deploy settled this tick (the running version changed
   *  or a rollout finished) — the UI persists on those, so a reload restores the
   *  live running version, not a stale v1. */
  tick(): boolean {
    this.cp.tick();
    if (!this.manifest) return false;
    // Utilization control loop (docs: Cost & parity): park idle capacity and
    // resume on demand, per tier — runs before reconcile so a just-parked
    // resource reads Dormant this pass.
    this.autoscale();
    // A bad self-upgrade can brick the reconciler — the one change that disables
    // the thing that would heal (§16). The workload loop is then down: the cloud
    // still drifts, but nothing reconciles it until a re-bootstrap.
    if (!this.cp.loopDown()) {
      this.statuses = this.rec.step(this.manifest, this.cloud.now());
      this.recordTransitions();
    } else {
      // Loop down: still observe (the topology shows reality) but never converge.
      this.statuses = this.rec.observeStates(this.manifest, this.cloud.now());
    }
    // Value accounting (axis 3): now that this tick's states are known, record
    // how much of each Service's offered demand its serving compute met.
    this.accountValue();
    // The app-delivery inner loop runs at its own cadence, independent of the
    // outer reconcile loop above (§11). The team's tool drives it; here the sim
    // ticks it on the team's behalf, and Trellis observes the resulting state.
    const settled = this.observeTeamRollouts();
    this.cloud.tick();
    return settled;
  }

  /** Advance each Service's team rollout one tick (the team's tool drives;
   *  Trellis observes). The gate-check handshake (§11) holds a rollout during a
   *  change-freeze — it parks in Blocked, not fail. */
  private observeTeamRollouts(): boolean {
    const freeze = this.rec.isChangeFreeze();
    let settled = false;
    for (const s of servicesOf(this.posture)) {
      const sl = serviceSlug(s.name);
      this.teamRollout.setHold(sl, freeze);
      const before = this.teamRollout.rollout(sl)?.state;
      const after = this.teamRollout.step(sl, this.bakes.get(sl) ?? (() => true));
      if (after && before && after.state !== before && isTerminal(after.state)) {
        settled = true;
        if (after.state === "Healthy") {
          this.log(
            "Release",
            "team-tool",
            "healthy",
            `${s.name} ${after.artifact}`,
            "promoted to 100% — running version advanced",
          );
        } else if (after.state === "RolledBack") {
          this.log(
            "Release",
            "team-tool",
            "rolled-back",
            `${s.name} ${after.artifact}`,
            after.reason,
          );
        }
      }
    }
    return settled;
  }

  /** The persistable deploy state — each Service's running version + its next
   *  version counter — so a reload restores the live `running vN`, not v1. */
  deployState(): { versions: Record<string, string>; nextVer: Record<string, number> } {
    const versions: Record<string, string> = {};
    const nextVer: Record<string, number> = {};
    for (const s of servicesOf(this.posture)) {
      const sl = serviceSlug(s.name);
      versions[sl] = this.teamRollout.currentVersion(sl);
      nextVer[sl] = this.nextVer.get(sl) ?? 1;
    }
    return { versions, nextVer };
  }

  /** Restore the deploy state after a reload (overrides the v1 seeded by approve). */
  restoreDeploy(state: { versions: Record<string, string>; nextVer: Record<string, number> }) {
    for (const [sl, v] of Object.entries(state.versions ?? {})) {
      if (v && v !== "none") this.teamRollout.seed(sl, v);
    }
    for (const [sl, n] of Object.entries(state.nextVer ?? {})) this.nextVer.set(sl, n);
  }

  /** The team ships a release into its App Cell — the ungated inner loop (§11),
   *  driven by the team's tool; Trellis observes. `broken` makes the team's bake
   *  fail, to show the rollout self-reverts *below* the reconciler: a bad deploy
   *  is the team's RolledBack, not the platform's Stalled. Strategy follows
   *  Criticality (C0/C1 canary; else rolling). */
  ship(slug: string, broken = false) {
    if (!this.manifest) return;
    const svc = servicesOf(this.posture).find((s) => serviceSlug(s.name) === slug);
    if (!svc) return;
    const strategy: Strategy =
      svc.criticality === "C0" || svc.criticality === "C1" ? "canary" : "rolling";
    const n = (this.nextVer.get(slug) ?? 1) + 1;
    this.nextVer.set(slug, n);
    const artifact = `v${n}`;
    this.bakes.set(slug, broken ? () => false : () => true);
    this.teamRollout.release(slug, artifact, strategy, svc.criticality);
    this.log(
      "Release",
      "team",
      "ship",
      `${svc.name} ${artifact}`,
      `${strategy} rollout${broken ? " — bake will fail (self-reverts)" : ""}`,
    );
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

  /** Park idle capacity to save cost (docs: Cost & parity). Only parkable
   *  resources park — a load balancer is fixed, jobs/external have no lever. The
   *  desired shape is unchanged, so parity holds; only realized cost drops. The
   *  reconciler reads the result as Dormant, not down, and holds (never wakes). */
  park(id: ResourceID) {
    const d = this.manifest?.resources[id];
    if (!d || !parkable(d)) return;
    this.cloud.park(id);
    this.cloud.setIdle(id, true); // parked because idle — stays parked until demand returns
    this.log(
      "Observe",
      "autoscaler",
      "park",
      id,
      parkClass(d) === "dormancy"
        ? "idle — paused, durable storage retained (dormancy)"
        : "idle — scaled to zero (elasticity)",
    );
  }

  /** Resume a parked resource when demand returns. Durable state is intact, so
   *  it comes back as the same shape — parity preserved. Routed through the
   *  denial-of-wallet guard, which caps resume thrash. */
  wake(id: ResourceID) {
    this.resumeWithGuard(id, false);
  }

  /** A *cold* resume (guardrail 4): the resource comes back behaviour-divergent
   *  — dropped connections / cold buffers — Degraded until the loop self-heals
   *  it. The tested failure path behind a wake, not a free instant return. */
  coldResume(id: ResourceID) {
    this.resumeWithGuard(id, true);
  }

  /** Observed demand for a resource: idle (no traffic) or busy. The autoscaler
   *  parks on sustained idleness and resumes when demand returns (docs: Cost &
   *  parity) — the demand-driven signal, not an env label. */
  setIdle(id: ResourceID, idle: boolean) {
    this.cloud.setIdle(id, idle);
  }

  /** Inject observed utilization (load units per dimension) for a resource —
   *  the telemetry right-sizing reads (docs: Cost & parity axis 2). */
  setLoad(id: ResourceID, load: { cpu: number; mem: number }) {
    this.cloud.setLoad(id, load);
  }

  /** Inject the demand offered to a Service (units) — the value signal axis 3
   *  reads. Value is what's *served* of this, not what's offered. */
  setDemand(service: string, level: number) {
    const sl = serviceSlug(service);
    this.offered.set(sl, level);
    this.hasDemand.add(sl);
  }

  /** Per-tick value accounting (axis 3): how much of each Service's offered
   *  demand its *serving* compute actually met. Parked, cold, or degraded compute
   *  serves nothing; under-capacity serves only what it can. Accumulated over a
   *  trailing window so cost-effectiveness reads served value, not provisioning. */
  private accountValue() {
    if (!this.manifest) return;
    const stateById = new Map(this.statuses.map((s) => [s.id, s.state]));
    for (const sl of this.hasDemand) {
      const offered = this.offered.get(sl) ?? 0;
      let servingCapacity = 0;
      for (const r of Object.values(this.manifest.resources)) {
        if (r.service !== sl || r.kind !== "compute") continue;
        if (stateById.get(r.id) !== "Converged") continue; // only live compute serves
        if (isSize(r.spec.size)) {
          servingCapacity += SIZE_CAPACITY[r.spec.size].cpu * Number(r.spec.replicas ?? "1");
        }
      }
      const served = Math.min(offered, servingCapacity);
      // Served *well*: discount by SLO attainment, which falls as the serving
      // capacity runs hot (no headroom → high latency → breach).
      const utilization = servingCapacity > 0 ? served / servingCapacity : 0;
      const quality = served * sloFactor(utilization);
      const hist = this.valueHist.get(sl) ?? [];
      hist.push({ offered, served, quality });
      if (hist.length > VALUE_WINDOW) hist.shift();
      this.valueHist.set(sl, hist);
    }
  }

  /** Right-sizing proposals from observed peak utilization, per Service. A
   *  Service's sized resources share one size, so we recommend the size that
   *  covers the *peak across them* (size to the peak you must serve) — only for
   *  Services with utilization telemetry, never blind. */
  private rightSizingProposals(): RightSizingProposal[] {
    if (!this.manifest) return [];
    const m = this.manifest;
    const out: RightSizingProposal[] = [];
    for (const s of servicesOf(this.posture)) {
      const sl = serviceSlug(s.name);
      const sized = Object.values(m.resources).filter(
        (r) => r.service === sl && isSize(r.spec.size),
      );
      const current = sized[0]?.spec.size;
      if (!isSize(current)) continue;
      let cpu = 0;
      let mem = 0;
      let seen = false;
      for (const r of sized) {
        const peak = this.cloud.peakLoad(r.id);
        if (!peak) continue;
        seen = true;
        cpu = Math.max(cpu, peak.cpu);
        mem = Math.max(mem, peak.mem);
      }
      if (!seen) continue; // no telemetry → no recommendation
      const rec = recommendSize(current, { cpu, mem });
      if (!rec) continue;
      // Value consult (axis 3): never propose a shrink that would undersize the
      // Service below the demand it is serving — protect served value, not just
      // chase utilization. (Up-sizes always pass.)
      const shrinking = SIZE_CAPACITY[rec.to].cpu < SIZE_CAPACITY[rec.from].cpu;
      if (shrinking && this.hasDemand.has(sl)) {
        const replicas = sized
          .filter((r) => r.kind === "compute")
          .reduce((a, r) => a + Number(r.spec.replicas ?? "1"), 0);
        const capAfter = SIZE_CAPACITY[rec.to].cpu * replicas;
        if ((this.offered.get(sl) ?? 0) > capAfter) continue; // would drop served value
      }
      out.push({ service: s.name, slug: sl, from: rec.from, to: rec.to, reason: rec.reason });
    }
    return out;
  }

  /** Accept a right-sizing proposal (the owner ratifies at the gate). Sets a
   *  shared size override and re-plans — cascading to every environment, so
   *  parity is preserved; never a per-resource autonomous shrink. */
  acceptRightSizing(service: string): boolean {
    const rec = this.rightSizingProposals().find(
      (p) => p.service === service || p.slug === service,
    );
    if (!rec) return false;
    // Build a fresh posture (don't mutate the shared one): override the accepted
    // Service's size; every environment re-plans to it, so parity holds.
    const services = servicesOf(this.posture).map((s) =>
      s.name === rec.service ? { ...s, sizeOverride: rec.to } : s,
    );
    this.log(
      "Gate",
      "owner",
      "accept-right-sizing",
      `${rec.service} ${rec.from}→${rec.to}`,
      `${rec.reason} — re-planning the shared shape`,
    );
    this.declare({ ...this.posture, services });
    this.approve();
    return true;
  }

  /** Resolve a denial-of-wallet incident: un-pin so the resource may park again. */
  resolveWalletGuard(id: ResourceID) {
    if (!this.pinnedWarm.delete(id)) return;
    this.resumeLog.delete(id);
    this.log(
      "Author",
      "finops",
      "wallet-guard-reset",
      id,
      "resume thrash resolved — parking resumes",
    );
  }

  /** The utilization control loop: park parkable resources idle past their tier
   *  threshold, resume on demand. Conservative tiers never park (a warm floor);
   *  a wallet-guard-pinned resource stays warm. */
  private autoscale() {
    if (!this.manifest) return;
    const nowTick = Math.floor(this.cloud.now() / 1000);
    for (const d of Object.values(this.manifest.resources)) {
      const cls = parkClass(d);
      if (cls !== "elasticity" && cls !== "dormancy") continue; // fixed/none never auto-park
      const tier = cls === "elasticity" ? this.posture.elasticity : this.posture.dormancy;
      const threshold = IDLE_THRESHOLD[tier ?? "conservative"];
      if (threshold === Number.POSITIVE_INFINITY) continue; // conservative — hands-off warm floor
      const idle = this.cloud.idleTicks(d.id);
      // Temporal demand model (docs: Cost & parity axis 1): a scheduled job warms
      // its neighbours. Pre-warm ahead of predicted demand and refuse to park
      // into it — not the blind reactive floor that parks right before the job.
      const warm = warmNeeded(demandWindowsFor(this.manifest, d), nowTick, PREWARM_LEAD);
      // Value consult (axis 3): never park a resource whose Service is serving
      // value right now — the demand signal overrides a stale idle flag, so we
      // don't drop served value for a few dollars.
      const serving = (this.offered.get(d.service) ?? 0) > 0;
      if (!this.cloud.isDormant(d.id)) {
        if (!warm && !serving && idle >= threshold && !this.pinnedWarm.has(d.id)) {
          this.cloud.park(d.id);
          this.log(
            "Observe",
            "autoscaler",
            "auto-park",
            d.id,
            cls === "dormancy"
              ? `idle ${idle}t — paused, storage retained (dormancy/${tier})`
              : `idle ${idle}t — scaled to zero (elasticity/${tier})`,
          );
        }
      } else if (warm) {
        // Anticipate scheduled demand — wake before it arrives, not after. Leave
        // the idle flag set (markBusy=false) so it re-parks once the window passes.
        this.resumeWithGuard(d.id, false, "pre-warming ahead of scheduled demand", false);
      } else if (!this.cloud.isIdle(d.id)) {
        this.resumeWithGuard(d.id, false); // unpredicted demand returned (reactive floor)
      }
    }
  }

  /** Resume a resource, enforcing the denial-of-wallet guard (guardrail 7): too
   *  many resumes in the trailing window is thrash — pin warm and alert rather
   *  than keep paying cold-start churn. The request is still served. */
  private resumeWithGuard(id: ResourceID, cold: boolean, reason?: string, markBusy = true) {
    const d = this.manifest?.resources[id];
    if (!d || !this.cloud.isDormant(id)) return;
    const now = this.cloud.now();
    const times = (this.resumeLog.get(id) ?? []).filter((t) => now - t <= DOW_WINDOW_MS);
    times.push(now);
    this.resumeLog.set(id, times);
    // A reactive/manual resume means demand is here now; a *pre-warm* is
    // anticipatory — leave the idle flag set so it re-parks once the window passes.
    if (markBusy) this.cloud.setIdle(id, false);
    if (times.length > DOW_LIMIT) {
      if (!this.pinnedWarm.has(id)) {
        this.pinnedWarm.add(id);
        this.log(
          "Observe",
          "finops",
          "denial-of-wallet",
          id,
          `resume thrash (${times.length} in ${DOW_WINDOW_MS / 1000}s) — pinning warm to cap cost`,
        );
      }
      this.cloud.wake(id, cold); // serve the request, but stop the park/wake churn
      return;
    }
    this.cloud.wake(id, cold);
    this.log(
      "Observe",
      "autoscaler",
      cold ? "cold-resume" : "wake",
      id,
      cold
        ? "demand returned — cold resume (dropped connections, self-heal recovering)"
        : (reason ?? "demand returned — resumed"),
    );
  }

  /** Cost drift (§13): the cloud starts billing a resource above plan (usage
   *  spike / price change / leak). Observed like any drift; may breach budget. */
  costSpike(id: ResourceID) {
    this.cloud.costSpike(id, 3);
    this.log("Observe", "fault", "cost-drift", id, "billed ≫ planned (3×) — usage spike / leak");
  }

  /** A human reconciles the cost (right-size / clear the leak); the breach clears. */
  resolveCost(id: ResourceID) {
    this.cloud.repairCost(id);
    this.log("Author", "finops", "cost-reconciled", id, "billed back to plan");
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

  /** Temporal governance (§9): toggle a change-freeze / maintenance window. */
  setChangeFreeze(on: boolean) {
    this.rec.setChangeFreeze(on);
    this.log(
      "Author",
      "operator",
      on ? "change-freeze-on" : "change-freeze-off",
      "environment",
      on ? "non-emergency Converge actions held" : "freeze lifted; held changes resume",
    );
  }

  /** Acknowledge the blast-radius breaker so the next pass proceeds (§9). */
  acknowledgeBlast() {
    this.rec.acknowledgeBlast();
    this.log(
      "Author",
      "operator",
      "ack-blast-radius",
      "environment",
      "blast-radius breaker overridden for one pass",
    );
  }

  // ---- Self-upgrade: the control plane managing itself (§16) -----------------

  /** Propose a self-upgrade transition on a TCB component (the C0 self-env). */
  proposeSelfUpgrade(id: TcbId, faulty: boolean) {
    if (!this.cp.propose(id, faulty)) return;
    this.log(
      "Author",
      "platform-team",
      "propose-self-upgrade",
      `tcb/${id}`,
      `transition on the C0 self-environment${faulty ? " (canary will fail)" : ""} — needs the highest gate`,
    );
  }

  /** A dual-control approval for the in-flight self-upgrade (the highest gate). */
  approveSelfUpgrade() {
    if (!this.cp.approve()) return;
    const remaining = this.cp.approvalsRemaining();
    this.log(
      "Gate",
      "sealed-root",
      remaining > 0 ? "self-upgrade-approval" : "self-upgrade-gate-cleared",
      "control-plane",
      remaining > 0
        ? `dual-control: ${remaining} more approval required`
        : "highest gate cleared — canary rollout begins",
    );
  }

  /** Meta-DR (§12): re-bootstrap a bricked control plane from the external seed. */
  reBootstrap() {
    if (!this.cp.view().bricked) return;
    this.cp.reBootstrap();
    this.log(
      "Break-glass",
      "sealed-root",
      "re-bootstrap",
      "control-plane",
      "bricked self-upgrade recovered from the external seed + last-good generation",
    );
  }

  // ---- Snapshot for the UI --------------------------------------------------

  snapshot(): EngineSnapshot {
    const byId = new Map(this.statuses.map((s) => [s.id, s]));
    // Per-Service Criticality drives isolation strength (C2/C3 colocate = weak).
    const critBySlug = new Map(
      servicesOf(this.posture).map((s) => [serviceSlug(s.name), s.criticality]),
    );
    const complianceCovered = this.posture.compliance.length > 0;
    const resources: ResourceView[] = this.manifest
      ? Object.values(this.manifest.resources).map((r) => {
          const crit = critBySlug.get(r.service);
          const weakIsolation = crit === "C2" || crit === "C3";
          return {
            id: r.id,
            service: r.service,
            region: r.region,
            cell: r.cell,
            kind: r.kind,
            lifecycle: r.lifecycle,
            size: r.spec.size,
            replicas: Number(r.spec.replicas ?? "1"),
            state: byId.get(r.id)?.state ?? "Unknown",
            monthlyCost: resourceCost(r),
            billedCost: Math.round(resourceCost(r) * this.cloud.billedFactor(r.id)),
            costDrifted: this.cloud.billedFactor(r.id) > 1,
            security: securityTier(r.cell, r.lifecycle, weakIsolation, complianceCovered),
            detail: byId.get(r.id)?.detail,
            reconcilerReason: byId.get(r.id)?.reason,
          };
        })
      : [];
    const costNow = this.manifest ? manifestCost(this.manifest) : 0;
    const billedNow = resources.reduce((sum, r) => sum + r.billedCost, 0);
    const budget = this.posture.budgetMonthly;
    const budgetPolicy: BudgetPolicy = this.posture.budgetPolicy ?? "alert";
    const budgetBreach = billedNow > budget;
    const phase: Phase = this.manifest ? "applied" : this.plan ? "planned" : "empty";
    const toIncident = (r: ResourceView): Incident => ({
      id: r.id,
      region: r.region,
      service: r.service,
      cell: r.cell,
      reconcilerReason: r.reconcilerReason,
    });
    const incidents: Incident[] = resources.filter((r) => r.state === "Stalled").map(toIncident);
    const frozenDebts: Incident[] = resources.filter((r) => r.state === "Frozen").map(toIncident);

    // Frame roll-up (§4): a region's state is the worst-of the resources it
    // contains; we manage Service + Stateful workloads (Jobs/External excluded).
    const managed = resources.filter(
      (r) => r.lifecycle === "service" || r.lifecycle === "stateful",
    );
    const regionOrder = [...new Set(managed.map((r) => r.region))];
    const regionRollups = regionOrder.map((region) => ({
      region,
      state: rollup(managed.filter((r) => r.region === region).map((r) => r.state)),
    }));
    const envRollup = rollup(regionRollups.map((r) => r.state));
    const envNote = environmentNote(this.posture.resilience, regionRollups);

    // Break-glass rate as a gate-health signal (§7): count freezes inside the
    // trailing window from the (persisted) audit log — survives reload, no extra
    // state. Re-bootstrap is "Break-glass" too, so match the freeze verb only.
    const recentBreakGlass = this.audit.filter(
      (a) =>
        a.cls === "Break-glass" &&
        a.verb === "freeze" &&
        this.cloud.now() - a.tMs <= BREAK_GLASS_WINDOW_MS,
    ).length;

    // Ownership roll-up (§6): state + spend attribute to each owning Service.
    const serviceRollups: ServiceRollup[] = servicesOf(this.posture).map((s) => {
      const sl = serviceSlug(s.name);
      const own = resources.filter((r) => r.service === sl);
      const ownManaged = own.filter((r) => r.lifecycle === "service" || r.lifecycle === "stateful");
      const ro = this.teamRollout.rollout(sl);
      const active = ro && !isTerminal(ro.state) ? ro : null;
      return {
        service: s.name,
        slug: sl,
        criticality: s.criticality,
        state: rollup(ownManaged.map((r) => r.state)),
        monthlyCost: own.reduce((sum, r) => sum + r.monthlyCost, 0),
        billedCost: own.reduce((sum, r) => sum + r.billedCost, 0),
        version: this.teamRollout.currentVersion(sl),
        rollout: active ? active.state : null,
        rolloutArtifact: active ? active.artifact : "",
        rolloutShare: active ? active.share : 0,
      };
    });

    // Cost-effectiveness (axis 3): cost vs value *served*, per Service. The
    // denominator is what makes "effective" measurable — without it the system
    // can't tell cost-effective from cheap.
    const costBySlug = new Map(serviceRollups.map((r) => [r.slug, r.monthlyCost]));
    const value: ServiceValue[] = servicesOf(this.posture)
      .filter((s) => this.hasDemand.has(serviceSlug(s.name)))
      .map((s) => {
        const sl = serviceSlug(s.name);
        const hist = this.valueHist.get(sl) ?? [];
        const offeredSum = hist.reduce((a, h) => a + h.offered, 0);
        const servedSum = hist.reduce((a, h) => a + h.served, 0);
        const qualitySum = hist.reduce((a, h) => a + h.quality, 0);
        const servedFraction = offeredSum > 0 ? servedSum / offeredSum : 1;
        const sloAttainment = servedSum > 0 ? qualitySum / servedSum : 1;
        // Value is served *well*: quantity × quality × Criticality weight.
        const val = qualitySum * CRIT_WEIGHT[s.criticality];
        const cost = costBySlug.get(sl) ?? 0;
        return {
          service: s.name,
          slug: sl,
          offered: this.offered.get(sl) ?? 0,
          servedFraction,
          sloAttainment,
          value: val,
          monthlyCost: cost,
          costPerValue: val > 0 ? cost / val : null,
          ineffective: cost > 0 && val <= 0, // paying, serving ~nothing
        };
      });
    const totalCost = value.reduce((a, v) => a + v.monthlyCost, 0);
    const totalValue = value.reduce((a, v) => a + v.value, 0);
    const costPerValue = totalValue > 0 ? totalCost / totalValue : null;

    return {
      tMs: this.cloud.now(),
      phase,
      posture: this.posture,
      plan: this.plan,
      resources,
      audit: this.audit.slice(-80),
      incidents,
      costNow,
      billedNow,
      budget,
      overBudget: costNow > budget,
      budgetBreach,
      canProvision: !(budgetBreach && budgetPolicy === "block"),
      budgetPolicy,
      converged: resources.length > 0 && resources.every(isSettled),
      appliedGen: this.appliedGen,
      frozenDebts,
      changeFreeze: this.rec.isChangeFreeze(),
      blastTripped: this.rec.blastTripped(),
      breakGlassSignal: { recent: recentBreakGlass, noisy: recentBreakGlass >= BREAK_GLASS_NOISY },
      regionRollups,
      serviceRollups,
      envRollup,
      envNote,
      controlPlane: this.cp.view(),
      walletGuard: [...this.pinnedWarm],
      rightSizing: this.rightSizingProposals(),
      value,
      costPerValue,
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
  // Parked capacity is a good steady state — it doesn't break convergence.
  return r.state === "Converged" || r.state === "Dormant";
}

/** Resilience parameterizes how the environment reads a degraded region (§4):
 *  active-active keeps serving; active-passive fails over; single is user-visible. */
function environmentNote(
  resilience: Resilience,
  regions: { region: string; state: State }[],
): string {
  if (!regions.length) return "";
  const healthy = regions.filter((r) => r.state === "Converged").length;
  const total = regions.length;
  if (healthy === total) return "all regions converged";
  const down = total - healthy;
  if (resilience === "active-active") {
    return healthy > 0
      ? `${down}/${total} region${down > 1 ? "s" : ""} impacted — serving from ${healthy} healthy (active-active)`
      : "all regions impacted — outage";
  }
  if (resilience === "active-passive") {
    return "primary impacted — failover to standby (active-passive)";
  }
  return "single-region — impact is user-visible";
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
