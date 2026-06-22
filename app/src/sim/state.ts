// The Trellis State model (spec §4): state = f(desired, observed, health).
// A pure, recomputable function — never stored as ground truth.

import { type DesiredResource, type Observation, specEqual } from "./model";

export type Sync = "Unknown" | "InSync" | "Progressing" | "Drifted";
export type Control = "Settled" | "Reconciling" | "Stalled" | "Frozen";
export type State =
  | "Unknown"
  | "Converged"
  // Intentionally parked to save cost (docs: Cost & parity) — a good steady
  // state, not down and not drift; the reconciler holds, never wakes it.
  | "Dormant"
  | "Converging"
  | "Drifted"
  | "Degraded"
  | "Stalled"
  | "Frozen"
  // Stateful quorum roll-up (§4): minority of nodes serving
  | "Unavailable"
  // Job lifecycle (terminal progression, §4)
  | "Pending"
  | "Running"
  | "Succeeded"
  | "Failed";

export const ALL_STATES: State[] = [
  "Converged",
  "Dormant",
  "Converging",
  "Drifted",
  "Degraded",
  "Unavailable",
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
    case "Dormant":
      // Intentionally suspended — reuse the calm "held" token, not an alarm color.
      return "var(--state-frozen)";
    case "Degraded":
      return "var(--state-degraded)";
    case "Drifted":
      return "var(--state-drifted)";
    case "Stalled":
    case "Failed":
      return "var(--state-stalled)";
    case "Unavailable":
      return "var(--state-unavailable)";
    case "Frozen":
      return "var(--state-frozen)";
    case "Pending":
      return "var(--state-unknown)";
    default:
      return "var(--state-unknown)";
  }
}

/** Severity ordering for rolling a Frame's state up from its children (§4). */
const SEVERITY: Record<State, number> = {
  Converged: 0,
  Succeeded: 0,
  // Parked is a good steady state — benign, but visible in a roll-up so a frame
  // with idle capacity reads "Dormant" rather than masquerading as fully live.
  Dormant: 1,
  Pending: 1,
  Running: 1,
  Unknown: 2,
  Converging: 3,
  Drifted: 4,
  Degraded: 5,
  Frozen: 6,
  Unavailable: 7,
  Stalled: 8,
  Failed: 8,
};

/** Roll a Frame's state up from its children's states — worst-of (§4). */
export function rollup(states: State[]): State {
  if (!states.length) return "Unknown";
  return states.reduce<State>(
    (worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst),
    "Converged",
  );
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

  // Intentionally parked to save cost (docs: Cost & parity). Checked before the
  // sync/health/quorum classification so a paused DB (quorum 0) or a scaled-to-
  // zero service reads Dormant, never Unavailable/Degraded — and never drift.
  if (o.dormant) return "Dormant";

  // Warming back up after a park (cold start, docs: Cost & parity guardrail 4) —
  // benign progress toward live, not drift. The reconciler holds while it warms.
  if (o.resuming) return "Converging";

  const sync = classifySync(d, o, nowMs, stalenessBudgetMs);

  // A reconciler that has given up (circuit breaker tripped) reports Stalled
  // until the resource is genuinely Converged again (the breaker resets).
  if (control === "Stalled") {
    return sync === "InSync" && o.health === "Healthy" ? "Converged" : "Stalled";
  }
  if (sync === "Unknown") return "Unknown";

  switch (sync) {
    case "InSync":
      // Stateful clusters roll health up by quorum (§4).
      if (d.lifecycle === "stateful") return statefulHealth(o);
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

/** Quorum roll-up for a stateful cluster: all nodes → Converged; a majority
 *  still serving → Degraded; a minority → Unavailable (quorum lost). */
function statefulHealth(o: Observation): State {
  const q = o.quorum ?? { healthy: o.health === "Healthy" ? 1 : 0, total: 1 };
  if (q.healthy >= q.total) return "Converged";
  const majority = Math.floor(q.total / 2) + 1;
  return q.healthy >= majority ? "Degraded" : "Unavailable";
}
