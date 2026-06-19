// The Trellis State model (spec §4): state = f(desired, observed, health).
// A pure, recomputable function — never stored as ground truth.

import { type DesiredResource, type Observation, specEqual } from "./model";

export type Sync = "Unknown" | "InSync" | "Progressing" | "Drifted";
export type Control = "Settled" | "Reconciling" | "Stalled" | "Frozen";
export type State =
  | "Unknown"
  | "Converged"
  | "Converging"
  | "Drifted"
  | "Degraded"
  | "Stalled"
  | "Frozen"
  // Job lifecycle (terminal progression, §4)
  | "Pending"
  | "Running"
  | "Succeeded"
  | "Failed";

export const ALL_STATES: State[] = [
  "Converged",
  "Converging",
  "Drifted",
  "Degraded",
  "Stalled",
  "Frozen",
  "Unknown",
];

/** Tailwind/CSS color token for each state (matches src/styles/global.css). */
export function stateColorVar(s: State): string {
  switch (s) {
    case "Converged":
    case "Succeeded":
      return "var(--state-converged)";
    case "Converging":
    case "Running":
      return "var(--state-converging)";
    case "Degraded":
      return "var(--state-degraded)";
    case "Drifted":
      return "var(--state-drifted)";
    case "Stalled":
    case "Failed":
      return "var(--state-stalled)";
    case "Frozen":
      return "var(--state-frozen)";
    case "Pending":
      return "var(--state-unknown)";
    default:
      return "var(--state-unknown)";
  }
}

/** A Job's State is its terminal progression; completion is success, not drift. */
function deriveJob(o: Observation): State {
  if (!o.exists || !o.phase) return "Pending";
  switch (o.phase) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
  }
}

/** An External workload is observe-only: its State reflects the observed health,
 *  and the reconciler never converges it. */
function deriveExternal(o: Observation): State {
  if (!o.exists) return "Unknown";
  if (o.health === "Degraded") return "Degraded";
  if (o.health === "Healthy") return "Converged";
  return "Unknown";
}

function classifySync(
  d: DesiredResource,
  o: Observation,
  nowMs: number,
  stalenessBudgetMs: number,
): Sync {
  if (!o.exists) return "Progressing"; // authored creation in flight
  if (stalenessBudgetMs > 0 && o.observedAtMs > 0 && nowMs - o.observedAtMs > stalenessBudgetMs) {
    return "Unknown";
  }
  if (specEqual(o.spec, d.spec)) return "InSync";
  // observed != desired — provenance (generation), not gap size, decides (§4).
  if (d.generation > o.appliedGeneration) return "Progressing";
  return "Drifted";
}

/**
 * Derive the named lifecycle State. stalenessBudgetMs bounds how old an
 * observation may be before it is treated as Unknown rather than
 * assumed-converged (Invariant 7). Zero disables the freshness check.
 */
export function derive(
  d: DesiredResource,
  o: Observation,
  control: Control,
  nowMs: number,
  stalenessBudgetMs: number,
): State {
  // Jobs and External workloads have different lifecycles (§1, §4).
  if (d.lifecycle === "job") return deriveJob(o);
  if (d.lifecycle === "external") return deriveExternal(o);

  if (control === "Frozen") return "Frozen";

  const sync = classifySync(d, o, nowMs, stalenessBudgetMs);

  // A reconciler that has given up (circuit breaker tripped) reports Stalled
  // until the resource is genuinely Converged again (the breaker resets).
  if (control === "Stalled") {
    return sync === "InSync" && o.health === "Healthy" ? "Converged" : "Stalled";
  }
  if (sync === "Unknown") return "Unknown";

  switch (sync) {
    case "InSync":
      if (o.health === "Healthy") return "Converged";
      if (o.health === "Degraded") return "Degraded";
      return "Unknown";
    case "Progressing":
      return "Converging";
    case "Drifted":
      return "Drifted";
  }
  return "Unknown";
}
