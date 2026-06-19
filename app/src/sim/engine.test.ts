import { describe, expect, it } from "vitest";
import { DEFAULT_POSTURE, Engine } from "./engine";
import type { DesiredResource, Manifest, Observation, Posture } from "./model";
import { plan } from "./planner";
import { allConverged, Reconciler, type Status } from "./reconcile";
import { SimCloud } from "./sim";
import { derive, rollup } from "./state";

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

describe("reconciler safety (§9)", () => {
  it("change-freeze holds non-emergency changes until lifted", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    const app = e.snapshot().resources.find((r) => r.lifecycle === "service" && r.cell === "app")!;

    e.setChangeFreeze(true);
    e.injectDrift(app.id);
    for (let i = 0; i < 8; i++) e.tick();
    // Drift detected but held, not corrected.
    expect(e.snapshot().resources.find((r) => r.id === app.id)!.state).toBe("Drifted");
    expect(e.snapshot().changeFreeze).toBe(true);

    e.setChangeFreeze(false);
    for (let i = 0; i < 20 && !e.snapshot().converged; i++) e.tick();
    expect(e.snapshot().converged).toBe(true);
  });

  it("blast-radius breaker halts a mass remediation until acknowledged", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();

    e.regionOutage("us-east-1");
    e.tick();
    expect(e.snapshot().blastTripped).toBe(true);

    e.acknowledgeBlast();
    for (let i = 0; i < 25 && !e.snapshot().converged; i++) e.tick();
    expect(e.snapshot().converged).toBe(true);
  });
});

describe("multi-service ownership (§6)", () => {
  it("plans every owned Service, attributing spend and state to each owner", () => {
    const e = new Engine(DEFAULT_POSTURE); // owns payments-api (C0) + internal-dashboard (C3)
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    const snap = e.snapshot();

    expect(snap.serviceRollups.map((r) => r.service).sort()).toEqual([
      "internal-dashboard",
      "payments-api",
    ]);
    // Each owner carries its own resources, and the C0 service costs more than C3.
    const pay = snap.serviceRollups.find((r) => r.service === "payments-api")!;
    const dash = snap.serviceRollups.find((r) => r.service === "internal-dashboard")!;
    expect(pay.monthlyCost).toBeGreaterThan(dash.monthlyCost);
    // Per-owner spend sums to the environment total.
    const total = snap.serviceRollups.reduce((s, r) => s + r.monthlyCost, 0);
    expect(total).toBe(snap.costNow);
    expect(snap.converged).toBe(true);
  });

  it("a degraded Service rolls up to its owner without touching its peer", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    const dashApp = e
      .snapshot()
      .resources.find((r) => r.service === "internal-dashboard" && r.cell === "app")!;
    e.hardFailure(dashApp.id);
    for (let i = 0; i < 25; i++) e.tick();
    const snap = e.snapshot();
    const dash = snap.serviceRollups.find((r) => r.service === "internal-dashboard")!;
    const pay = snap.serviceRollups.find((r) => r.service === "payments-api")!;
    expect(dash.state).toBe("Stalled"); // the owner reflects its worst child
    expect(pay.state).toBe("Converged"); // the peer is untouched
  });

  it("the shared budget binds across Services; an infeasible floor fails loudly", () => {
    const tight: Posture = { ...DEFAULT_POSTURE, budgetMonthly: 500 };
    const p = plan(tight, 1);
    expect(p.feasible).toBe(false);
    expect(p.failure).toMatch(/shared across 2 services/);
  });
});

describe("frame roll-up (§4)", () => {
  it("a Frame's state is the worst-of its children", () => {
    expect(rollup([])).toBe("Unknown");
    expect(rollup(["Converged", "Converged"])).toBe("Converged");
    expect(rollup(["Converged", "Degraded"])).toBe("Degraded");
    expect(rollup(["Drifted", "Degraded", "Converging"])).toBe("Degraded");
    expect(rollup(["Degraded", "Stalled"])).toBe("Stalled");
    expect(rollup(["Converged", "Unavailable"])).toBe("Unavailable");
  });

  it("the snapshot rolls a degraded region up and reads the environment by resilience", () => {
    const e = new Engine(DEFAULT_POSTURE); // active-active, two regions
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();

    const conv = e.snapshot();
    expect(conv.envRollup).toBe("Converged");
    expect(conv.envNote).toMatch(/all regions converged/);
    expect(conv.regionRollups.length).toBeGreaterThan(1);

    // Take one region down: its roll-up degrades, the environment notes it is
    // still serving from the healthy region (active-active).
    e.regionOutage("us-east-1");
    e.acknowledgeBlast();
    e.tick();
    const out = e.snapshot();
    const hit = out.regionRollups.find((r) => r.region === "us-east-1")!;
    expect(hit.state).not.toBe("Converged");
    expect(out.envRollup).not.toBe("Converged");
    expect(out.envNote).toMatch(/serving from \d+ healthy/);
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
