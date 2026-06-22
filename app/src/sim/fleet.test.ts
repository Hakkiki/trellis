import { describe, expect, it } from "vitest";
import { Fleet } from "./fleet";

function settle(f: Fleet, n = 40) {
  for (let i = 0; i < n; i++) f.tick();
}
const env = (f: Fleet, id: string) => f.snapshot().envs.find((e) => e.id === id)!;

describe("promotion fleet", () => {
  it("cuts a version, deploys to dev, and converges", () => {
    const f = new Fleet();
    f.cutVersion();
    settle(f);
    const dev = env(f, "dev");
    expect(dev.deployedVersion).toBe(1);
    expect(dev.converged).toBe(true);
    expect(env(f, "staging").deployedVersion).toBe(0);
  });

  it("promotes the same version along the pipeline", () => {
    const f = new Fleet();
    f.cutVersion();
    settle(f);
    f.promote("staging");
    settle(f);
    f.promote("prod");
    settle(f);
    expect(env(f, "staging").deployedVersion).toBe(1);
    expect(env(f, "prod").deployedVersion).toBe(1);
    expect(env(f, "prod").converged).toBe(true);
  });

  it("a newer version sits at dev while prod lags (dev@v2, prod@v1)", () => {
    const f = new Fleet();
    f.cutVersion();
    settle(f);
    f.promote("staging");
    f.promote("prod");
    settle(f);
    f.cutVersion(); // v2 to dev
    settle(f);
    expect(env(f, "dev").deployedVersion).toBe(2);
    expect(env(f, "prod").deployedVersion).toBe(1);
    expect(env(f, "prod").canPromote).toBe(false); // staging still on v1
    expect(env(f, "staging").canPromote).toBe(true); // v2 available from dev
  });

  it("hand-modifying an environment shows it Drifted off its version", () => {
    const f = new Fleet();
    f.cutVersion();
    settle(f);
    f.injectDrift("dev");
    f.tick();
    expect(env(f, "dev").drifted).toBe(true);
  });

  it("every environment shares the same desired shape (parity holds)", () => {
    const f = new Fleet();
    f.cutVersion();
    settle(f);
    f.promote("staging");
    settle(f);
    f.promote("prod");
    settle(f);
    expect(f.snapshot().parity.ok).toBe(true);
    expect(f.snapshot().parity.violations).toHaveLength(0);
  });

  it("a more aggressive environment bills less for the identical shape", () => {
    const f = new Fleet();
    f.cutVersion();
    settle(f);
    f.promote("staging");
    settle(f);
    f.promote("prod");
    settle(f);
    const cost = (id: string) => env(f, id).costNow;
    // Same shape → same provisioned ceiling (budget); dev just parks more.
    expect(env(f, "dev").budget).toBe(env(f, "prod").budget);
    expect(cost("dev")).toBeLessThan(cost("prod"));
    expect(cost("staging")).toBeLessThan(cost("prod"));
  });
});
