import { describe, expect, it } from "vitest";
import type { DesiredResource, Manifest } from "./model";
import { demandWindowsFor, parseSchedule, ticksUntilDemand, warmNeeded } from "./schedule";

function rsc(over: Partial<DesiredResource>): DesiredResource {
  return {
    id: "r",
    kind: "managed-relational-db",
    spec: {},
    generation: 1,
    lifecycle: "service",
    service: "s",
    region: "r1",
    cell: "data",
    ...over,
  };
}

describe("temporal demand model (schedule)", () => {
  it("parses declared schedule strings; unknown/undefined → null", () => {
    expect(parseSchedule("nightly")).toEqual({ everyTicks: 24, atTick: 0, durationTicks: 3 });
    expect(parseSchedule("never-heard-of-it")).toBeNull();
    expect(parseSchedule(undefined)).toBeNull();
  });

  it("ticksUntilDemand: 0 while active, else the gap to the next opening", () => {
    const w = parseSchedule("nightly")!; // every 24, at 0, dur 3
    expect(ticksUntilDemand(w, 0)).toBe(0); // active
    expect(ticksUntilDemand(w, 2)).toBe(0); // active (last tick of the window)
    expect(ticksUntilDemand(w, 3)).toBe(21); // just past → 24 - 3
    expect(ticksUntilDemand(w, 20)).toBe(4);
    expect(ticksUntilDemand(w, 24)).toBe(0); // next cycle — active again
  });

  it("warmNeeded: active now, or opening within the lead", () => {
    const ws = [parseSchedule("nightly")!];
    expect(warmNeeded(ws, 0, 4)).toBe(true); // active
    expect(warmNeeded(ws, 20, 4)).toBe(true); // opens in 4
    expect(warmNeeded(ws, 19, 4)).toBe(false); // opens in 5 — still cold-safe to park
    expect(warmNeeded(ws, 10, 4)).toBe(false); // far from the window
    expect(warmNeeded([], 10, 4)).toBe(false); // no schedule → never warm-needed
  });

  it("a scheduled job implies a window on its same-service, same-region neighbours", () => {
    const job = rsc({
      id: "s-batch-r1",
      kind: "batch-job",
      lifecycle: "job",
      cell: "app",
      spec: { schedule: "nightly" },
    });
    const dbSame = rsc({ id: "s-data-r1", region: "r1" });
    const dbOtherRegion = rsc({ id: "s-data-r2", region: "r2" });
    const m: Manifest = {
      generation: 1,
      resources: { [job.id]: job, [dbSame.id]: dbSame, [dbOtherRegion.id]: dbOtherRegion },
    };
    expect(demandWindowsFor(m, dbSame)).toHaveLength(1); // shares the job's region
    expect(demandWindowsFor(m, dbOtherRegion)).toHaveLength(0); // different region — no window
  });
});
