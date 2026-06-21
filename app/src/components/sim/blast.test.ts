import { describe, expect, it } from "vitest";
import { BEATS, BLAST_TRAIL, blastForBeat, CONTAINED_PCT } from "./blast";

// The lesson, as a test. The blast-radius number must refuse to move while you
// apply redundancy and process, and only drop when the architecture changes.
describe("blast-radius walkthrough model", () => {
  it("the settled trail is 100 → 100 → 100 → 25 → 0", () => {
    expect(BLAST_TRAIL).toEqual([100, 100, 100, CONTAINED_PCT, 0]);
  });

  it("redundancy and process cannot drop it below the shared baseline", () => {
    // Beats 1–3 are the shared service, then the two fixes leaders reach for.
    for (const beat of ["shared", "redundant", "process"] as const) {
      expect(blastForBeat(beat, true)).toBe(100);
    }
  });

  it("partitioning is the first beat to move the number", () => {
    const trail = BEATS.map((b) => blastForBeat(b, true));
    const firstDrop = trail.findIndex((pct) => pct < 100);
    expect(BEATS[firstDrop]).toBe("partition");
    expect(trail[firstDrop]).toBe(CONTAINED_PCT);
  });

  it("a partitioned fault is bounded to one cell of N", () => {
    expect(CONTAINED_PCT).toBe(25); // 1 of 4 divisions
    expect(blastForBeat("partition", true)).toBe(CONTAINED_PCT);
  });

  it("recover carries the partitioned aftermath, then clears it", () => {
    expect(blastForBeat("recover", false)).toBe(CONTAINED_PCT); // one cell still down
    expect(blastForBeat("recover", true)).toBe(0); // rolled back to last-good
  });

  it("nothing is broken until its beat's action fires", () => {
    for (const beat of BEATS) {
      // `recover` starts mid-incident (the partition aftermath); every other
      // beat starts healthy.
      expect(blastForBeat(beat, false)).toBe(beat === "recover" ? CONTAINED_PCT : 0);
    }
  });
});
