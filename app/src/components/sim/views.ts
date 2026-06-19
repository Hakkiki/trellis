// Topology "Views" (spec §13): a read-only projection of the same Structure,
// recolored by the lens you ask for. State is the lifecycle state; Cost is a
// $/mo heatmap (a FinOps projection); Health collapses the lifecycle to an
// observed-health/SLO bucket. Pure colorers, shared by the 3D stage and the grid
// so both lenses agree — derived, never authoritative.

import type { ResourceView, SecurityTier } from "@/sim/engine";
import { type State, stateColorVar } from "@/sim/state";

export type ViewMode = "state" | "cost" | "health" | "security";

export const VIEW_LABELS: Record<ViewMode, string> = {
  state: "state",
  cost: "cost",
  health: "health",
  security: "security",
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

export const SECURITY_TIERS: { tier: SecurityTier; label: string }[] = [
  { tier: "at-risk", label: "at-risk" },
  { tier: "exposed", label: "exposed" },
  { tier: "sensitive", label: "sensitive" },
  { tier: "internal", label: "internal" },
];

/** Trust/exposure posture color (§7): at-risk reads as the alarm color, the
 *  exposed attack surface as a warm warning, crown jewels as a distinct accent,
 *  and internal compute as the calm baseline. */
export function securityColor(tier: SecurityTier): string {
  switch (tier) {
    case "at-risk":
      return "var(--state-stalled)";
    case "exposed":
      return "var(--state-degraded)";
    case "sensitive":
      return "var(--state-drifted)";
    case "internal":
      return "var(--state-converged)";
  }
}

/** The fill color for a resource under the active view. */
export function viewColor(r: ResourceView, view: ViewMode, maxCost: number): string {
  if (view === "cost") return costColor(r.monthlyCost, maxCost);
  if (view === "health") return healthColor(healthBucket(r.state));
  if (view === "security") return securityColor(r.security);
  return stateColorVar(r.state);
}
