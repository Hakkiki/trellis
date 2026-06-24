import { describe, expect, it } from "vitest";
import { DEFAULT_POSTURE, Engine } from "@/sim/engine";
import { headline, TIERS, teamFocus, tierView } from "./dashboard";

/** Drive an engine to a converged, applied steady state. */
function converged(): Engine {
  const e = new Engine(DEFAULT_POSTURE);
  e.declare(DEFAULT_POSTURE);
  e.approve();
  for (let i = 0; i < 300 && !e.snapshot().converged; i++) e.tick();
  return e;
}

describe("dashboard tiers", () => {
  it("maps the three altitudes to the nine personas", () => {
    expect(TIERS.map((t) => t.id)).toEqual(["exec", "division", "team"]);
    for (const t of TIERS) expect(t.personas).toMatch(/·/); // a list of personas
  });

  it("headline reflects a healthy applied estate", () => {
    const snap = converged().snapshot();
    const h = headline(snap);
    expect(h.convergedPct).toBe(100);
    expect(h.incidents).toBe(0);
    expect(h.breach).toBe(false);
    expect(h.spend).toBe(`$${snap.billedNow} / $${snap.budget}`);
    expect(h.spendPct).toBeLessThanOrEqual(100);
  });

  it("exec lens is the estate posture with five bottom-line metrics", () => {
    const snap = converged().snapshot();
    const v = tierView(snap, "exec", null);
    expect(v.title).toBe("Estate posture");
    expect(v.state).toBe(snap.envRollup);
    expect(v.metrics).toHaveLength(5);
    // Spend + reliability are healthy in a converged estate; tones stay valid.
    expect(v.metrics[0].tone).toBe("good"); // spend within budget
    expect(v.metrics[1].value).toBe("100% converged");
    expect(v.metrics[1].tone).toBe("good");
    expect(v.metrics.every((m) => ["good", "warn", "bad", "neutral"].includes(m.tone))).toBe(true);
  });

  it("division lens shows incidents and approvals; clear when settled", () => {
    const snap = converged().snapshot();
    const v = tierView(snap, "division", null);
    expect(v.title).toBe("Division operations");
    const incidents = v.metrics.find((m) => m.label === "Incidents");
    expect(incidents?.value).toBe("0 stalled");
    expect(incidents?.tone).toBe("good");
  });

  it("team lens defaults to a real service and reflects its name", () => {
    const snap = converged().snapshot();
    const focus = teamFocus(snap, null);
    expect(focus).not.toBeNull();
    const v = tierView(snap, "team", null);
    expect(v.title).toBe(focus?.service);
    expect(v.metrics.find((m) => m.label === "Last deploy")?.value).toBe(`gen ${snap.appliedGen}`);
  });

  it("a cost spike surfaces as billed-over-planned in the bottom line", () => {
    const e = converged();
    const target = e.snapshot().resources.find((r) => r.lifecycle === "service");
    if (!target) throw new Error("expected a service resource");
    e.costSpike(target.id);
    for (let i = 0; i < 20; i++) e.tick();
    const snap = e.snapshot();
    expect(snap.billedNow).toBeGreaterThan(snap.costNow);
    // The owning team's cost line flags the drift.
    const v = tierView(snap, "team", target.service);
    const cost = v.metrics.find((m) => m.label === "My cost");
    expect(cost?.value).toContain("plan $");
    expect(cost?.tone).toBe("warn");
  });
});
