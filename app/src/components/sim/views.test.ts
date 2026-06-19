import { describe, expect, it } from "vitest";
import type { ResourceView } from "@/sim/engine";
import { costColor, healthBucket, viewColor } from "./views";

function rv(over: Partial<ResourceView>): ResourceView {
  return {
    id: "x",
    service: "s",
    region: "us-east-1",
    cell: "app",
    kind: "compute",
    lifecycle: "service",
    size: "small",
    replicas: 1,
    state: "Converged",
    monthlyCost: 0,
    billedCost: 0,
    costDrifted: false,
    ...over,
  };
}

describe("topology views (§13)", () => {
  it("cost heatmap runs cool (cheap) → warm (costly), anchored to the fleet max", () => {
    expect(costColor(0, 0)).toBe("var(--state-converged)"); // empty fleet → neutral
    const cheap = costColor(0, 1000);
    const dear = costColor(1000, 1000);
    expect(cheap).toMatch(/hsl\(150 /); // green
    expect(dear).toMatch(/hsl\(0 /); // red
    // clamps above the max
    expect(costColor(5000, 1000)).toBe(dear);
  });

  it("health collapses lifecycle states into observed-health buckets", () => {
    expect(healthBucket("Converged")).toBe("healthy");
    expect(healthBucket("Drifted")).toBe("healthy"); // still running, just diverged
    expect(healthBucket("Degraded")).toBe("degraded");
    expect(healthBucket("Stalled")).toBe("at-risk");
    expect(healthBucket("Unavailable")).toBe("at-risk");
    expect(healthBucket("Unknown")).toBe("unknown");
  });

  it("viewColor selects the lens: state vs cost vs health", () => {
    const degradedCheap = rv({ state: "Degraded", monthlyCost: 100 });
    // state lens reads the lifecycle color; health lens reads the degraded color;
    // cost lens reads the heatmap (independent of state).
    expect(viewColor(degradedCheap, "state", 1000)).toBe("var(--state-degraded)");
    expect(viewColor(degradedCheap, "health", 1000)).toBe("var(--state-degraded)");
    expect(viewColor(degradedCheap, "cost", 1000)).toMatch(/^hsl\(/);
  });
});
