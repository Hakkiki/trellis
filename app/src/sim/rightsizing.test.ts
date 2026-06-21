import { describe, expect, it } from "vitest";
import { idealSize, recommendSize } from "./rightsizing";

describe("right-sizing recommender (axis 2)", () => {
  it("idealSize picks the smallest size covering peak + headroom on every dimension", () => {
    expect(idealSize({ cpu: 0.5, mem: 0.5 })).toBe("small");
    expect(idealSize({ cpu: 1.5, mem: 1.5 })).toBe("medium"); // 1.5×1.25 = 1.875 → medium(2)
    expect(idealSize({ cpu: 3, mem: 3 })).toBe("large");
  });

  it("the binding resource decides — high memory blocks a CPU-based shrink", () => {
    // 25% CPU but 75% memory of a large: memory binds, so it must stay large.
    expect(idealSize({ cpu: 1, mem: 3 })).toBe("large");
    expect(recommendSize("large", { cpu: 1, mem: 3 })).toBeNull();
  });

  it("headroom is respected at the boundary", () => {
    expect(idealSize({ cpu: 1.6, mem: 1.6 })).toBe("medium"); // 1.6×1.25 = 2.0 fits medium
    expect(idealSize({ cpu: 1.61, mem: 1.61 })).toBe("large"); // 2.0125 > 2 → large
  });

  it("recommends a shrink when overprovisioned, with a binding-aware reason", () => {
    const rec = recommendSize("large", { cpu: 1.5, mem: 1.4 });
    expect(rec).not.toBeNull();
    expect(rec).toMatchObject({ from: "large", to: "medium" });
    expect(rec?.reason).toMatch(/binding: cpu/);
  });

  it("recommends an upsize when under-provisioned", () => {
    const rec = recommendSize("medium", { cpu: 1.9, mem: 1.0 });
    expect(rec).toMatchObject({ from: "medium", to: "large" });
    expect(rec?.reason).toMatch(/under-provisioned/);
  });

  it("returns null when already right-sized", () => {
    expect(recommendSize("small", { cpu: 0.5, mem: 0.5 })).toBeNull();
    expect(recommendSize("medium", { cpu: 1.5, mem: 1.5 })).toBeNull();
  });
});
