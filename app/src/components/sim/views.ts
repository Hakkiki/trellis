// Topology "Views" (spec §13): a read-only projection of the same Structure,
// recolored by the lens you ask for. State is the lifecycle state; Cost is a
// $/mo heatmap (a FinOps projection); Health collapses the lifecycle to an
// observed-health/SLO bucket. Pure colorers, shared by the 3D stage and the grid
// so both lenses agree — derived, never authoritative.

import type { ResourceView } from "@/sim/engine";
import { type State, stateColorVar } from "@/sim/state";

export type ViewMode = "state" | "cost" | "health";

export const VIEW_LABELS: Record<ViewMode, string> = {
  state: "state",
  cost: "cost",
  health: "health",
};

/** Cost heatmap: cheap (cool green) → costly (warm red), normalized to the fleet
 *  max so the most expensive resource anchors the scale. Free resources (consumed
 *  External) read as the coolest. */
export function costColor(cost: number, max: number): string {
  if (max <= 0) return "var(--state-converged)";
  const t = Math.max(0, Math.min(1, cost / max));
  const hue = Math.round(150 - 150 * t); // 150° green → 0° red
  return `hsl(${hue} 68% 52%)`;
}

export type HealthBucket = "healthy" | "degraded" | "at-risk" | "unknown";

export const HEALTH_BUCKETS: { bucket: HealthBucket; label: string }[] = [
  { bucket: "healthy", label: "healthy" },
  { bucket: "degraded", label: "degraded" },
  { bucket: "at-risk", label: "at-risk" },
  { bucket: "unknown", label: "unknown" },
];

/** Collapse a lifecycle State to an observed-health bucket. Drift/converging/
 *  frozen still describe a *running* resource; Stalled/Unavailable/Failed are the
 *  ones an operator must act on; stale telemetry is Unknown (fail-safe). */
export function healthBucket(s: State): HealthBucket {
  switch (s) {
    case "Degraded":
      return "degraded";
    case "Stalled":
    case "Unavailable":
    case "Failed":
      return "at-risk";
    case "Unknown":
      return "unknown";
    default:
      return "healthy";
  }
}

export function healthColor(bucket: HealthBucket): string {
  switch (bucket) {
    case "healthy":
      return "var(--state-converged)";
    case "degraded":
      return "var(--state-degraded)";
    case "at-risk":
      return "var(--state-stalled)";
    case "unknown":
      return "var(--state-unknown)";
  }
}

/** The fill color for a resource under the active view. */
export function viewColor(r: ResourceView, view: ViewMode, maxCost: number): string {
  if (view === "cost") return costColor(r.monthlyCost, maxCost);
  if (view === "health") return healthColor(healthBucket(r.state));
  return stateColorVar(r.state);
}
