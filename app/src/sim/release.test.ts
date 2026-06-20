import { describe, expect, it } from "vitest";
import type { Manifest } from "./model";
import { allConverged, Reconciler, type Status } from "./reconcile";
import { type Bake, ReleaseRuntime } from "./release";
import { SimCloud } from "./sim";

const ok: Bake = () => true;
const fail: Bake = () => false;

describe("release rollout — the inner loop (§11)", () => {
  it("canary advances Pending → Progressing ⇄ Verifying → Healthy and hands the version to steady state", () => {
    const rt = new ReleaseRuntime({ "payments-api": "v6" });
    rt.release("payments-api", "v7", "canary", "C0");
    const r = rt.run("payments-api", ok);
    expect(r?.state).toBe("Healthy");
    // On Healthy the runtime's current-version pointer advances.
    expect(rt.currentVersion("payments-api")).toBe("v7");
  });

  it("rolling is the one-step case", () => {
    const rt = new ReleaseRuntime({ s: "v1" });
    rt.release("s", "v2", "rolling", "C3");
    expect(rt.run("s", ok)?.state).toBe("Healthy");
    expect(rt.currentVersion("s")).toBe("v2");
  });

  it("a failed bake self-reverts to the last-healthy version (RolledBack)", () => {
    const rt = new ReleaseRuntime({ "payments-api": "v6" });
    rt.release("payments-api", "v7", "canary", "C0");
    const r = rt.run("payments-api", fail);
    expect(r?.state).toBe("RolledBack");
    expect(rt.currentVersion("payments-api")).toBe("v6"); // unchanged — held safe
  });

  it("a bake that fails only at a later canary step still reverts to the prior version", () => {
    const rt = new ReleaseRuntime({ s: "v1" });
    rt.release("s", "v2", "canary", "C0");
    // pass at 10%, fail once the canary widens to 50%
    const r = rt.run("s", (_a, share) => share < 50);
    expect(r?.state).toBe("RolledBack");
    expect(rt.currentVersion("s")).toBe("v1");
  });

  it("gate-check hold parks the rollout in Blocked, not failed", () => {
    const rt = new ReleaseRuntime({ s: "v1" });
    rt.setHold("s", true);
    rt.release("s", "v2", "rolling", "C3");
    expect(rt.step("s", ok)?.state).toBe("Blocked");
    expect(rt.step("s", ok)?.state).toBe("Blocked"); // still held — waiting, not failed
    rt.setHold("s", false);
    expect(rt.step("s", ok)?.state).toBe("Progressing"); // clears and proceeds
    expect(rt.run("s", ok)?.state).toBe("Healthy");
  });

  it("latest-wins: a newer release supersedes the in-flight one", () => {
    const rt = new ReleaseRuntime({ s: "v1" });
    const first = rt.release("s", "v2", "canary", "C0");
    rt.step("s", ok); // Pending → Progressing
    rt.release("s", "v3", "canary", "C0");
    expect(first.state).toBe("Superseded");
    expect(rt.rollout("s")?.artifact).toBe("v3");
  });

  it("Criticality bounds the strategy (Invariant 27): C0 cannot big-bang roll", () => {
    const rt = new ReleaseRuntime();
    expect(() => rt.release("s", "v1", "rolling", "C0")).toThrow(/not permitted/);
    expect(() => rt.release("s", "v1", "rolling", "C3")).not.toThrow();
  });
});

// The App Cell shape the outer loop owns — note: no version in the spec.
function appCell(gen: number): Manifest {
  return {
    generation: gen,
    resources: {
      "payments-api-app-us-east-1": {
        id: "payments-api-app-us-east-1",
        kind: "compute",
        spec: { region: "us-east-1", size: "large", replicas: "3" },
        generation: gen,
        lifecycle: "service",
        service: "payments-api",
        region: "us-east-1",
        cell: "app",
      },
    },
  };
}

function converge(c: SimCloud, rec: Reconciler, m: Manifest, max = 30): Status[] {
  let last: Status[] = [];
  for (let i = 0; i < max; i++) {
    last = rec.step(m, c.now());
    if (allConverged(last)) return last;
    c.tick();
  }
  return last;
}

describe("inner/outer separation — a bad deploy is the team's RolledBack, not the platform's Stalled", () => {
  it("a failed rollout leaves the App Cell Converged; the reconciler's flap breaker never engages", () => {
    const c = new SimCloud({ applyLatency: 1 });
    const rec = new Reconciler(c, { flapThreshold: 3 });
    const m = appCell(1);

    // Outer loop: provision the App-Cell shape and converge it.
    expect(allConverged(converge(c, rec, m))).toBe(true);

    // Inner loop: a release whose bake fails at every step.
    const rt = new ReleaseRuntime({ "payments-api": "v6" });
    rt.release("payments-api", "v7", "canary", "C0");
    expect(rt.run("payments-api", fail)?.state).toBe("RolledBack");
    expect(rt.currentVersion("payments-api")).toBe("v6");

    // The outer loop never saw it: the running version is not in the reconciled
    // spec, so the Cell stays Converged and no self-heal/flap ever fires.
    const id = "payments-api-app-us-east-1";
    for (let i = 0; i < 10; i++) {
      const cell = rec.step(m, c.now()).find((s) => s.id === id);
      expect(cell?.state).toBe("Converged");
      expect(cell?.action).toBe("none");
      expect(rec.isStalled(id)).toBe(false);
      c.tick();
    }
  });

  it("a successful rollout advances the version while the reconciled shape stays Converged", () => {
    const c = new SimCloud({ applyLatency: 1 });
    const rec = new Reconciler(c, {});
    const m = appCell(1);
    converge(c, rec, m);

    const rt = new ReleaseRuntime({ "payments-api": "v6" });
    rt.release("payments-api", "v7", "canary", "C0");
    expect(rt.run("payments-api", ok)?.state).toBe("Healthy");
    expect(rt.currentVersion("payments-api")).toBe("v7");

    // Version advanced (inner loop), shape unchanged (outer loop).
    const cell = rec.step(m, c.now()).find((s) => s.id === "payments-api-app-us-east-1");
    expect(cell?.state).toBe("Converged");
  });
});
