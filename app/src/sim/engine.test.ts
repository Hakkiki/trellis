import { describe, expect, it } from "vitest";
import { DEFAULT_POSTURE, Engine } from "./engine";
import type { DesiredResource, Manifest, Observation, Posture } from "./model";
import { plan } from "./planner";
import { allConverged, Reconciler, type Status } from "./reconcile";
import { SimCloud } from "./sim";
import { derive } from "./state";

function dr(id: string, gen: number, spec: Record<string, string>): DesiredResource {
  return {
    id,
    kind: "compute",
    spec,
    generation: gen,
    lifecycle: "service",
    service: "s",
    region: "us-east-1",
    cell: "app",
  };
}
function obs(over: Partial<Observation>): Observation {
  return {
    id: "x",
    exists: true,
    spec: {},
    health: "Healthy",
    appliedGeneration: 1,
    observedAtMs: 1000,
    ...over,
  };
}

describe("state.derive", () => {
  it("Converged when in-sync and healthy", () => {
    const d = dr("x", 1, { a: "1" });
    expect(derive(d, obs({ spec: { a: "1" } }), "Settled", 1000, 0)).toBe("Converged");
  });
  it("Degraded when in-sync but unhealthy", () => {
    const d = dr("x", 1, { a: "1" });
    expect(derive(d, obs({ spec: { a: "1" }, health: "Degraded" }), "Settled", 1000, 0)).toBe(
      "Degraded",
    );
  });
  it("Drifted vs Converging is decided by provenance, not gap size", () => {
    const d = dr("x", 1, { a: "2" });
    // same generation already applied, spec differs -> unauthored drift
    expect(derive(d, obs({ spec: { a: "1" }, appliedGeneration: 1 }), "Settled", 1000, 0)).toBe(
      "Drifted",
    );
    // newer generation not yet applied -> authored progress
    const d2 = dr("x", 2, { a: "2" });
    expect(derive(d2, obs({ spec: { a: "1" }, appliedGeneration: 1 }), "Settled", 1000, 0)).toBe(
      "Converging",
    );
  });
  it("Unknown (fail-safe) on stale telemetry", () => {
    const d = dr("x", 1, { a: "1" });
    expect(derive(d, obs({ spec: { a: "1" }, observedAtMs: 0 + 1 }), "Settled", 100000, 5000)).toBe(
      "Unknown",
    );
  });
  it("Frozen dominates", () => {
    const d = dr("x", 1, { a: "1" });
    expect(derive(d, obs({ spec: { a: "9" } }), "Frozen", 1000, 0)).toBe("Frozen");
  });
});

function manifest(gen: number): Manifest {
  return {
    generation: gen,
    resources: {
      web: dr("web", gen, { size: "small", replicas: "2" }),
      db: {
        id: "db",
        kind: "managed-relational-db",
        spec: { size: "medium" },
        generation: gen,
        lifecycle: "service",
        service: "s",
        region: "us-east-1",
        cell: "data",
      },
    },
  };
}

function run(cloud: SimCloud, rec: Reconciler, m: Manifest, max = 30): Status[] {
  let last: Status[] = [];
  for (let i = 0; i < max; i++) {
    last = rec.step(m, cloud.now());
    if (allConverged(last)) return last;
    cloud.tick();
  }
  return last;
}

describe("reconcile loop", () => {
  it("converges from scratch", () => {
    const c = new SimCloud({ applyLatency: 2 });
    const r = new Reconciler(c, {});
    expect(allConverged(run(c, r, manifest(1)))).toBe(true);
  });
  it("detects and corrects drift", () => {
    const c = new SimCloud({ applyLatency: 1 });
    const r = new Reconciler(c, { driftPolicy: "enforce" });
    run(c, r, manifest(1));
    c.injectDrift("db", (s) => (s.size = "tiny"));
    const st = r.step(manifest(1), c.now());
    expect(st.find((s) => s.id === "db")!.state).toBe("Drifted");
    c.tick();
    expect(allConverged(run(c, r, manifest(1)))).toBe(true);
  });
  it("self-heals a failed node", () => {
    const c = new SimCloud({ applyLatency: 2 });
    const r = new Reconciler(c, {});
    run(c, r, manifest(1));
    c.failNode("web");
    expect(r.step(manifest(1), c.now()).find((s) => s.id === "web")!.state).toBe("Degraded");
    c.tick();
    expect(allConverged(run(c, r, manifest(1)))).toBe(true);
  });
  it("holds on Unknown, never acting on stale data", () => {
    const c = new SimCloud({ applyLatency: 1 });
    const r = new Reconciler(c, { stalenessBudgetMs: 5000 });
    run(c, r, manifest(1));
    c.setStale("db", true);
    for (let i = 0; i < 10; i++) c.tick();
    const db = r.step(manifest(1), c.now()).find((s) => s.id === "db")!;
    expect(db.state).toBe("Unknown");
    expect(db.action).toBe("hold");
  });
});

describe("planner", () => {
  it("produces a proof tracing every region to resilience", () => {
    const p = plan(DEFAULT_POSTURE, 1);
    expect(p.feasible).toBe(true);
    expect(p.proof.some((r) => /active-active/.test(r.reason))).toBe(true);
    expect(Object.keys(p.manifest.resources).length).toBeGreaterThan(0);
  });
  it("fails loudly with the binding constraint when over budget", () => {
    const tight: Posture = { ...DEFAULT_POSTURE, budgetMonthly: 500 };
    const p = plan(tight, 1);
    expect(p.feasible).toBe(false);
    expect(p.failure).toMatch(/binding constraint/);
    expect(p.sensitivity.length).toBeGreaterThan(0);
  });
});

describe("engine end-to-end", () => {
  it("declare → approve → converge", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    expect(e.approve()).toBe(true);
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    const snap = e.snapshot();
    expect(snap.converged).toBe(true);
    expect(snap.audit.some((a) => a.cls === "Gate")).toBe(true);
  });
});

describe("objective program", () => {
  const base: Posture = {
    ...DEFAULT_POSTURE,
    criticality: "C2",
    resilience: "single",
    regions: ["us-east-1", "eu-west-1"],
    budgetMonthly: 5000,
  };
  const regionsOf = (p: ReturnType<typeof plan>) =>
    new Set(Object.values(p.manifest.resources).map((r) => r.region)).size;

  it("maximize-resilience upgrades within budget; minimize-cost stays lean", () => {
    const cheap = plan({ ...base, optimize: "minimize-cost" }, 1);
    const resil = plan({ ...base, optimize: "maximize-resilience" }, 2);
    expect(cheap.feasible && resil.feasible).toBe(true);
    expect(resil.estMonthlyCost).toBeGreaterThan(cheap.estMonthlyCost);
    expect(regionsOf(resil)).toBeGreaterThan(regionsOf(cheap));
  });

  it("Governance rejects a plan when a required kind is not whitelisted", () => {
    const p = plan({ ...DEFAULT_POSTURE, governanceServices: ["load-balancer", "compute"] }, 1);
    expect(p.feasible).toBe(false);
    expect(p.failure).toMatch(/Governance denied/);
  });

  it("tolerates a legacy posture missing governanceServices (stale session)", () => {
    const legacy = { ...DEFAULT_POSTURE } as Partial<Posture>;
    delete legacy.governanceServices;
    const p = plan(legacy as Posture, 1);
    expect(p.feasible).toBe(true);
  });
});

describe("workload archetypes", () => {
  it("the plan includes a Job and an External alongside the Service", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    const rs = e.snapshot().resources;
    expect(rs.some((r) => r.lifecycle === "job")).toBe(true);
    expect(rs.some((r) => r.lifecycle === "external")).toBe(true);
    expect(rs.some((r) => r.lifecycle === "service")).toBe(true);
  });

  it("a Job runs to completion (Pending → Running → Succeeded), not held as drift", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      e.tick();
      const job = e.snapshot().resources.find((r) => r.lifecycle === "job");
      if (job) seen.add(job.state);
    }
    expect(seen.has("Running")).toBe(true);
    expect(seen.has("Succeeded")).toBe(true);
    // It never drifts and the system still reports converged with a cycling job.
    expect(e.snapshot().converged).toBe(true);
  });

  it("an External is observe-only: it degrades but the reconciler never remediates it", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 20 && !e.snapshot().converged; i++) e.tick();
    const ext = e.snapshot().resources.find((r) => r.lifecycle === "external")!;
    e.failNode(ext.id);
    for (let i = 0; i < 15; i++) e.tick();
    const after = e.snapshot().resources.find((r) => r.id === ext.id)!;
    expect(after.state).toBe("Degraded"); // stays degraded — never self-healed
  });
});

describe("circuit breaker + incidents", () => {
  it("a hard failure trips to Stalled, raises an incident, and resolve recovers", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    const appId = e.snapshot().resources.find((r) => r.cell === "app")!.id;

    e.hardFailure(appId);
    for (let i = 0; i < 25; i++) e.tick();
    const snap = e.snapshot();
    expect(snap.resources.find((r) => r.id === appId)!.state).toBe("Stalled");
    expect(snap.incidents.some((inc) => inc.id === appId)).toBe(true);

    e.resolveIncident(appId);
    for (let i = 0; i < 25 && !e.snapshot().converged; i++) e.tick();
    expect(e.snapshot().converged).toBe(true);
    expect(e.snapshot().incidents.length).toBe(0);
  });
});

describe("stateful clusters (quorum)", () => {
  const broker: DesiredResource = {
    id: "b",
    kind: "stream-broker",
    spec: { nodes: "3" },
    generation: 1,
    lifecycle: "stateful",
    service: "s",
    region: "r",
    cell: "data",
  };

  it("rolls health up by quorum: 3/3 Converged, 2/3 Degraded, 1/3 Unavailable", () => {
    const c = new SimCloud({ applyLatency: 0 });
    c.apply(broker);
    c.tick();
    const stateOf = () => derive(broker, c.observe("b"), "Settled", c.now(), 0);
    expect(stateOf()).toBe("Converged");
    c.failNode("b");
    expect(stateOf()).toBe("Degraded"); // 2/3 — majority still serving
    c.failNode("b");
    expect(stateOf()).toBe("Unavailable"); // 1/3 — quorum lost
  });

  it("the planner includes a stateful broker, and it self-heals", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    const b = e.snapshot().resources.find((r) => r.lifecycle === "stateful");
    expect(b).toBeDefined();
    e.failNode(b!.id);
    for (let i = 0; i < 20 && !e.snapshot().converged; i++) e.tick();
    expect(e.snapshot().converged).toBe(true);
  });
});
