// Right-sizing recommender (docs: Cost & parity, axis 2 — "low utilization →
// right-size"). Pure: given a resource's provisioned size and its *observed peak*
// load, recommend the smallest size that still covers the peak plus headroom —
// never blindly, so it honours three things the naive "50% used = 50% waste"
// claim ignores: required **headroom** (cut it and the next spike breaks SLA),
// the **binding resource** (50% CPU at 95% memory is not overprovisioned), and
// the **distribution** (it sizes to the *peak* you must serve, fed by the caller,
// not the average). This only proposes — accepting changes the desired *shape*,
// which the parity invariant holds constant, so it goes through the gate.

export type Size = "small" | "medium" | "large";

/** Capacity units per size, per dimension. */
export interface Load {
  cpu: number;
  mem: number;
}

export const SIZE_CAPACITY: Record<Size, Load> = {
  small: { cpu: 1, mem: 1 },
  medium: { cpu: 2, mem: 2 },
  large: { cpu: 4, mem: 4 },
};

const SIZES: Size[] = ["small", "medium", "large"];

/** Required burst room above the observed peak before a size is considered safe. */
export const HEADROOM = 0.25;

export function isSize(s: string | undefined): s is Size {
  return s === "small" || s === "medium" || s === "large";
}

/** The smallest size whose capacity covers peak load + headroom on *every*
 *  dimension — the binding resource decides. Clamps to the largest size when
 *  even that doesn't fit (under-provisioned). */
export function idealSize(peak: Load, headroom = HEADROOM): Size {
  for (const s of SIZES) {
    const cap = SIZE_CAPACITY[s];
    if (cap.cpu >= peak.cpu * (1 + headroom) && cap.mem >= peak.mem * (1 + headroom)) return s;
  }
  return "large";
}

export interface SizeRec {
  from: Size;
  to: Size;
  reason: string;
}

/** A right-sizing recommendation, or null when the resource is already
 *  right-sized. Operates on *peak* load (the caller feeds the windowed peak, so
 *  the average can't talk you into undersizing a spiky workload). */
export function recommendSize(current: Size, peak: Load, headroom = HEADROOM): SizeRec | null {
  const to = idealSize(peak, headroom);
  if (to === current) return null;
  const cap = SIZE_CAPACITY[current];
  const util = Math.round(100 * Math.max(peak.cpu / cap.cpu, peak.mem / cap.mem));
  const binding = peak.cpu / cap.cpu >= peak.mem / cap.mem ? "cpu" : "mem";
  const shrinking = SIZES.indexOf(to) < SIZES.indexOf(current);
  return {
    from: current,
    to,
    reason: shrinking
      ? `peak ${util}% of ${current} (binding: ${binding}) — ${to} covers it with ${Math.round(headroom * 100)}% headroom`
      : `peak ${util}% of ${current} (binding: ${binding}) — under-provisioned, needs ${to}`,
  };
}
