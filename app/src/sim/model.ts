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
}

// ---- Posture (what a human declares, spec §2) -----------------------------

export type Criticality = "C0" | "C1" | "C2" | "C3";
export type Resilience = "active-active" | "active-passive" | "single";
export type Optimize = "minimize-cost" | "maximize-resilience";

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
