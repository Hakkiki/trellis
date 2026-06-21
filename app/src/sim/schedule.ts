// Temporal demand model (docs: Cost & parity, axis 1 — "park aware of patterns,
// not blind"). A declared `schedule` on a Job (its `spec.schedule`, which the
// planner already emits) implies a recurring demand window on the resources it
// shares a Frame with. The autoscaler reads this calendar to *pre-warm* before
// predicted demand and to *refuse to park into* it — instead of reacting to
// instantaneous idle, blind to the pattern (which would park the DB at 11:58 and
// cold-start the midnight job).

import type { DesiredResource, Manifest } from "./model";

/** A recurring demand window, in logical ticks (1 tick = 1s of sim time). */
export interface DemandWindow {
  everyTicks: number; // period between runs
  atTick: number; // phase offset of the window within the period
  durationTicks: number; // how long demand lasts once it opens
}

// Declared schedule strings → a recurring window. The periods are illustrative
// (a "day" is compressed to keep the sim legible) — the *shape* is the point,
// not the wall clock. This is the declared half of the model; inferring
// undeclared patterns from observed usage is the remaining half.
const SCHEDULES: Record<string, DemandWindow> = {
  nightly: { everyTicks: 24, atTick: 0, durationTicks: 3 },
  hourly: { everyTicks: 6, atTick: 0, durationTicks: 1 },
  weekly: { everyTicks: 120, atTick: 0, durationTicks: 4 },
  "month-end": { everyTicks: 480, atTick: 472, durationTicks: 8 },
};

/** Map a declared schedule string to its window, or null if unrecognized. */
export function parseSchedule(s: string | undefined): DemandWindow | null {
  return s ? (SCHEDULES[s] ?? null) : null;
}

/** The demand windows that bear on a resource: the schedules of the Jobs it
 *  shares a Service + region with — a scheduled job warms its neighbours. */
export function demandWindowsFor(m: Manifest, r: DesiredResource): DemandWindow[] {
  const out: DemandWindow[] = [];
  for (const d of Object.values(m.resources)) {
    if (d.lifecycle !== "job" || d.service !== r.service || d.region !== r.region) continue;
    const w = parseSchedule(d.spec.schedule);
    if (w) out.push(w);
  }
  return out;
}

/** Ticks until a window next opens (0 when demand is active now). */
export function ticksUntilDemand(w: DemandWindow, now: number): number {
  const phase = (((now - w.atTick) % w.everyTicks) + w.everyTicks) % w.everyTicks;
  if (phase < w.durationTicks) return 0; // active now
  return w.everyTicks - phase; // until the next opening
}

/** True when demand is active now, or opens within `lead` ticks — so the
 *  resource must be (kept) warm rather than parked. `lead` should cover the
 *  cold-start time, so a pre-warm completes before demand arrives. */
export function warmNeeded(windows: DemandWindow[], now: number, lead: number): boolean {
  return windows.some((w) => ticksUntilDemand(w, now) <= lead);
}
