// Core domain types for the Trellis simulator. The source of truth is the
// specification in docs/ (a living document, still being refined); these types
// implement it. Provider-neutral by design (spec §15): kinds name what a
// resource is *for*, never a provider resource type.

export type Generation = number;
export type Kind = string;
export type ResourceID = string;
export type Spec = Record<string, string>;

export type Health = "Healthy" | "Degraded" | "Unknown";

/** A trust/placement cell inside a Frame (spec §3, §6). */
export type CellKind = "edge" | "app" | "data";

/**
 * The lifecycle class of a workload (spec §1):
 * - service  — long-running, reconcile-and-hold (desired = "N healthy replicas").
 * - job      — finite, run-to-completion (a finished job is success, not drift).
 * - external — third-party SaaS Trellis consumes but never provisions; observe-only.
 * - stateful — a self-run quorum cluster (broker/DB/search); health rolls up by
 *              quorum (majority serving = Degraded-but-serving; minority = Unavailable).
 */
export type Lifecycle = "service" | "job" | "external" | "stateful";

/** The terminal progression of a Job (spec §4). */
export type JobPhase = "pending" | "running" | "succeeded" | "failed";

/** The authored projection of a resource (spec §4): spec + the generation that authored it. */
export interface DesiredResource {
  id: ResourceID;
  kind: Kind;
  spec: Spec;
  generation: Generation;
  lifecycle: Lifecycle;
  // Showcase placement metadata (the Topology this resource occupies).
  service: string; // function tag — the owning Service (§6)
  region: string;
  cell: CellKind;
}

/** Desired state of the world at a generation — the single source of truth. */
export interface Manifest {
  generation: Generation;
  resources: Record<ResourceID, DesiredResource>;
}

/** The measured projection of a resource (status), timestamped for freshness (§4). */
export interface Observation {
  id: ResourceID;
  exists: boolean;
  spec: Spec;
  health: Health;
  appliedGeneration: Generation;
  observedAtMs: number;
  phase?: JobPhase; // for Job workloads
  quorum?: { healthy: number; total: number }; // for Stateful workloads
  dormant?: boolean; // intentionally parked (scaled-to-zero / paused) — not down
  resuming?: boolean; // warming back up after a park (cold start) — benign progress
}

// ---- Posture (what a human declares, spec §2) -----------------------------

export type Criticality = "C0" | "C1" | "C2" | "C3";
export type Resilience = "active-active" | "active-passive" | "single";
export type Optimize = "minimize-cost" | "maximize-resilience";
/** What a budget-breach does (§13): alert only, or block further provisioning. */
export type BudgetPolicy = "alert" | "block";
/** How aggressively an environment parks idle capacity to save cost (docs: Cost
 *  & parity). One three-tier scale shared by both utilization levers. */
export type Tier = "aggressive" | "balanced" | "conservative";

/** A Service the environment owns (spec §6): a function tag + its own
 *  Criticality, which drives sizing/replication independently of its peers. */
export interface ServiceSpec {
  name: string;
  criticality: Criticality;
}

export interface Posture {
  intent: string;
  criticality: Criticality;
  resilience: Resilience;
  regions: string[];
  budgetMonthly: number;
  optimize: Optimize;
  compliance: string[];
  /** Governance service whitelist — the resource kinds permitted (§2, hard). */
  governanceServices: Kind[];
  /** The Services this environment owns (§6). When absent (legacy session), a
   *  single Service is synthesized from intent + criticality. */
  services?: ServiceSpec[];
  /** What a budget-breach does (§13). Defaults to "alert" when absent (legacy). */
  budgetPolicy?: BudgetPolicy;
  /** Utilization levers (docs: Cost & parity). How eagerly idle capacity is
   *  parked — stateless compute via `elasticity`, stateful services via
   *  `dormancy`. They lower *realized* cost without changing the desired shape,
   *  so parity across environments is preserved. Default "conservative" (never
   *  park) when absent. */
  elasticity?: Tier;
  dormancy?: Tier;
}

/** Which utilization lever governs a resource (docs: Cost & parity). Grounded in
 *  the same state-bearing test the security tier uses (`cell === "data" ||
 *  lifecycle === "stateful"`): state-bearing → dormancy (pause, keep storage);
 *  stateless compute → elasticity (scale, incl. to zero); a load balancer is
 *  elasticity-class but never parks ("fixed"); jobs/external have no lever. */
export type ParkClass = "elasticity" | "dormancy" | "fixed" | "none";

export function parkClass(d: DesiredResource): ParkClass {
  if (d.lifecycle === "job" || d.lifecycle === "external") return "none";
  const sensitive = d.cell === "data" || d.lifecycle === "stateful";
  if (sensitive) return "dormancy";
  if (d.kind === "load-balancer") return "fixed"; // elasticity class, never zero
  return "elasticity";
}

/** True when a resource may be parked when idle (elasticity or dormancy class). */
export function parkable(d: DesiredResource): boolean {
  const c = parkClass(d);
  return c === "elasticity" || c === "dormancy";
}

/** The effective Service list: explicit `services`, or a single Service
 *  synthesized from the legacy `intent` + `criticality` fields. */
export function servicesOf(p: Posture): ServiceSpec[] {
  if (p.services?.length) return p.services;
  return [{ name: p.intent, criticality: p.criticality }];
}

// ---- Plan + proof (the planner's output, spec §5) -------------------------

export interface ProofRow {
  resourceId: ResourceID | "*";
  claim: string;
  reason: string;
  binding?: boolean;
}

export interface Plan {
  generation: Generation;
  manifest: Manifest;
  proof: ProofRow[];
  estMonthlyCost: number;
  feasible: boolean;
  /** When infeasible, the loud failure naming the binding constraint (§5). */
  failure?: string;
  sensitivity: string[]; // "raise budget $X → active-active becomes feasible"
}

export function specEqual(a: Spec, b: Spec): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

export function cloneSpec(s: Spec): Spec {
  return { ...s };
}
