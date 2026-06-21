import { describe, expect, it } from "vitest";
import { DEFAULT_POSTURE, Engine, securityTier } from "./engine";
import type { DesiredResource, Manifest, Observation, Posture } from "./model";
import { parkable, parkClass } from "./model";
import { parityCheck, plan } from "./planner";
import { allConverged, Reconciler, type Status } from "./reconcile";
import { parseSchedule } from "./schedule";
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

describe("release inner loop wired into the engine (§11)", () => {
  function ready(): Engine {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 40 && !e.snapshot().converged; i++) e.tick();
    return e;
  }
  const rollupFor = (e: Engine, slug: string) =>
    e.snapshot().serviceRollups.find((r) => r.slug === slug)!;

  it("a good release advances the running version; the env stays converged", () => {
    const e = ready();
    expect(e.snapshot().converged).toBe(true);
    e.ship("payments-api");
    expect(rollupFor(e, "payments-api").rollout).not.toBeNull(); // rolling out
    for (let i = 0; i < 15 && rollupFor(e, "payments-api").rollout; i++) e.tick();
    const r = rollupFor(e, "payments-api");
    expect(r.rollout).toBeNull(); // settled
    expect(r.version).toBe("v2"); // advanced
    expect(e.snapshot().converged).toBe(true); // outer loop undisturbed
  });

  it("a broken release self-reverts; the version holds and the env never has an incident", () => {
    const e = ready();
    e.ship("payments-api", true);
    for (let i = 0; i < 15 && rollupFor(e, "payments-api").rollout; i++) e.tick();
    expect(rollupFor(e, "payments-api").version).toBe("v1"); // unchanged — held safe
    expect(e.snapshot().converged).toBe(true); // never the platform's Stalled
    const audit = e.snapshot().audit;
    expect(audit.some((a) => a.cls === "Release" && a.verb === "rolled-back")).toBe(true);
    expect(audit.some((a) => a.verb === "STALLED")).toBe(false);
  });

  it("a change-freeze parks the rollout in Blocked — the temporal handshake", () => {
    const e = ready();
    e.setChangeFreeze(true);
    e.ship("payments-api");
    e.tick();
    expect(rollupFor(e, "payments-api").rollout).toBe("Blocked");
    e.setChangeFreeze(false);
    for (let i = 0; i < 15 && rollupFor(e, "payments-api").rollout; i++) e.tick();
    expect(rollupFor(e, "payments-api").version).toBe("v2"); // proceeds once clear
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

describe("self-upgrade — the control plane managing itself (§16)", () => {
  function applied() {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    return e;
  }

  it("a good self-upgrade needs the highest gate (dual-control), then canaries in", () => {
    const e = applied();
    e.proposeSelfUpgrade("planner", false);
    expect(e.snapshot().controlPlane.pending?.phase).toBe("proposed");

    // One approval is not enough — the highest gate is dual-control.
    e.approveSelfUpgrade();
    expect(e.snapshot().controlPlane.pending?.phase).toBe("proposed");
    e.approveSelfUpgrade();
    expect(e.snapshot().controlPlane.pending?.phase).toBe("canary");

    // Canary rolls out over ticks; the component lands on the new version.
    for (let i = 0; i < 6; i++) e.tick();
    const cp = e.snapshot().controlPlane;
    expect(cp.pending).toBeNull();
    expect(cp.components.find((c) => c.id === "planner")!.version).toBe(2);
    expect(cp.bricked).toBe(false);
  });

  it("a faulty self-upgrade bricks the reconciler and disables the loop until re-bootstrap", () => {
    const e = applied();
    e.proposeSelfUpgrade("reconciler", true);
    e.approveSelfUpgrade();
    e.approveSelfUpgrade();
    for (let i = 0; i < 6; i++) e.tick();
    expect(e.snapshot().controlPlane.bricked).toBe(true);
    expect(e.snapshot().controlPlane.loopDown).toBe(true);

    // With the loop down, an injected failure is NOT self-healed.
    const app = e.snapshot().resources.find((r) => r.lifecycle === "service" && r.cell === "app")!;
    e.failNode(app.id);
    for (let i = 0; i < 15; i++) e.tick();
    expect(e.snapshot().resources.find((r) => r.id === app.id)!.state).not.toBe("Converged");

    // Meta-DR: re-bootstrap restores the loop; self-heal resumes.
    e.reBootstrap();
    expect(e.snapshot().controlPlane.bricked).toBe(false);
    expect(e.snapshot().controlPlane.loopDown).toBe(false);
    for (let i = 0; i < 20 && !e.snapshot().converged; i++) e.tick();
    expect(e.snapshot().converged).toBe(true);
  });
});

describe("security posture projection (§7)", () => {
  it("classifies trust/exposure tiers and flags the attack surface", () => {
    // External is always at-risk (third-party, outside our TCB).
    expect(securityTier("edge", "external", false, true)).toBe("at-risk");
    // An exposed edge with strong isolation (C0/C1) is exposed, not at-risk.
    expect(securityTier("edge", "service", false, true)).toBe("exposed");
    // The same edge with weak isolation (C2/C3 colocate) is at-risk.
    expect(securityTier("edge", "service", true, true)).toBe("at-risk");
    // Data/stateful are crown jewels — sensitive when covered, at-risk when not.
    expect(securityTier("data", "service", false, true)).toBe("sensitive");
    expect(securityTier("data", "stateful", false, false)).toBe("at-risk");
    // App compute is the internal baseline.
    expect(securityTier("app", "service", false, true)).toBe("internal");
  });

  it("the snapshot tags each resource with a security tier", () => {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    const rs = e.snapshot().resources;
    // The third-party External is flagged at-risk; the payments-api (C0) edge is
    // exposed but isolated.
    expect(rs.find((r) => r.lifecycle === "external")!.security).toBe("at-risk");
    const payEdge = rs.find((r) => r.service === "payments-api" && r.cell === "edge")!;
    expect(payEdge.security).toBe("exposed");
    // internal-dashboard (C3, colocated) edge shares trust → at-risk.
    const dashEdge = rs.find((r) => r.service === "internal-dashboard" && r.cell === "edge")!;
    expect(dashEdge.security).toBe("at-risk");
  });
});

describe("cost as a live signal (§13)", () => {
  function converged(posture: Posture) {
    const e = new Engine(posture);
    e.declare(posture);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    return e;
  }

  it("cost drift shows billed above planned and attributes to the owner", () => {
    const e = converged(DEFAULT_POSTURE);
    const before = e.snapshot();
    expect(before.billedNow).toBe(before.costNow); // no drift yet
    const payApp = before.resources.find((r) => r.service === "payments-api" && r.cell === "app")!;

    e.costSpike(payApp.id);
    const after = e.snapshot();
    const r = after.resources.find((x) => x.id === payApp.id)!;
    expect(r.costDrifted).toBe(true);
    expect(r.billedCost).toBeGreaterThan(r.monthlyCost);
    expect(after.billedNow).toBeGreaterThan(after.costNow);
    // the overage lands on payments-api, not its peer
    const pay = after.serviceRollups.find((s) => s.service === "payments-api")!;
    const dash = after.serviceRollups.find((s) => s.service === "internal-dashboard")!;
    expect(pay.billedCost).toBeGreaterThan(pay.monthlyCost);
    expect(dash.billedCost).toBe(dash.monthlyCost);
  });

  it("a block policy holds provisioning on breach until the cost is reconciled", () => {
    // A tight budget so a single 3× spike breaches it.
    const posture: Posture = { ...DEFAULT_POSTURE, budgetPolicy: "block" };
    const e = converged(posture);
    const big = e
      .snapshot()
      .resources.filter((r) => r.lifecycle === "service")
      .reduce((a, b) => (b.monthlyCost > a.monthlyCost ? b : a));

    e.costSpike(big.id);
    expect(e.snapshot().budgetBreach).toBe(true);
    expect(e.snapshot().canProvision).toBe(false);
    // Re-planning + approving is blocked while breached under a block policy.
    e.declare({ ...posture, budgetMonthly: posture.budgetMonthly + 1 });
    expect(e.approve()).toBe(false);

    e.resolveCost(big.id);
    expect(e.snapshot().budgetBreach).toBe(false);
    expect(e.snapshot().canProvision).toBe(true);
  });

  it("an alert policy never blocks provisioning, even on breach", () => {
    const e = converged({ ...DEFAULT_POSTURE, budgetPolicy: "alert" });
    const big = e
      .snapshot()
      .resources.filter((r) => r.lifecycle === "service")
      .reduce((a, b) => (b.monthlyCost > a.monthlyCost ? b : a));
    e.costSpike(big.id);
    expect(e.snapshot().budgetBreach).toBe(true);
    expect(e.snapshot().canProvision).toBe(true);
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

describe("break-glass trigger discipline (§7/§13)", () => {
  function converged() {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    return e;
  }

  it("surfaces the reconciler's reasoning per resource, so a break-glass is decided on evidence", () => {
    const e = converged();
    const app = e.snapshot().resources.find((r) => r.lifecycle === "service" && r.cell === "app")!;
    // Converged: the loop's belief is shown and benign.
    expect(e.snapshot().resources.find((r) => r.id === app.id)!.reconcilerReason).toMatch(
      /matches spec/,
    );
    // Drift the resource: the surfaced reasoning now explains the loop is correcting it —
    // the evidence that distinguishes "the loop is fighting me" from "the loop is right".
    e.injectDrift(app.id);
    e.tick();
    const reason = e.snapshot().resources.find((r) => r.id === app.id)!.reconcilerReason!;
    expect(reason).toMatch(/drift/i);
  });

  it("treats break-glass rate as a gate-health signal — frequent opens go noisy", () => {
    const e = converged();
    const services = e.snapshot().resources.filter((r) => r.lifecycle === "service");
    expect(e.snapshot().breakGlassSignal.noisy).toBe(false);

    e.breakGlass(services[0].id);
    e.breakGlass(services[1].id);
    expect(e.snapshot().breakGlassSignal.recent).toBe(2);
    expect(e.snapshot().breakGlassSignal.noisy).toBe(false); // below the threshold

    e.breakGlass(services[2].id);
    const sig = e.snapshot().breakGlassSignal;
    expect(sig.recent).toBe(3);
    expect(sig.noisy).toBe(true); // a frequently-opened glass diagnoses the gate
  });

  it("surfaces break-glass debt on the incident surface — Frozen is loud, not a silent hole", () => {
    const e = converged();
    const app = e.snapshot().resources.find((r) => r.lifecycle === "service" && r.cell === "app")!;
    expect(e.snapshot().frozenDebts).toHaveLength(0);

    e.breakGlass(app.id);
    e.tick();
    const debt = e.snapshot().frozenDebts;
    expect(debt.map((d) => d.id)).toContain(app.id);
    expect(debt.find((d) => d.id === app.id)!.reconcilerReason).toMatch(/break-glass/i);

    // Ratify repays the debt; the resource leaves the surface and reconciles again.
    e.ratify(app.id);
    for (let i = 0; i < 20 && !e.snapshot().converged; i++) e.tick();
    expect(e.snapshot().frozenDebts).toHaveLength(0);
    expect(e.snapshot().converged).toBe(true);
  });

  it("the rate signal decays — old opens fall out of the trailing window", () => {
    const e = converged();
    const services = e.snapshot().resources.filter((r) => r.lifecycle === "service");
    e.breakGlass(services[0].id);
    e.breakGlass(services[1].id);
    e.breakGlass(services[2].id);
    expect(e.snapshot().breakGlassSignal.noisy).toBe(true);
    // Advance well past the 60s trailing window; the signal quiets on its own.
    for (let i = 0; i < 70; i++) e.tick();
    expect(e.snapshot().breakGlassSignal.recent).toBe(0);
    expect(e.snapshot().breakGlassSignal.noisy).toBe(false);
  });
});

// ---- Cost & parity: elasticity / dormancy ---------------------------------

function res(over: Partial<DesiredResource>): DesiredResource {
  return {
    id: "r",
    kind: "compute",
    spec: {},
    generation: 1,
    lifecycle: "service",
    service: "s",
    region: "us-east-1",
    cell: "app",
    ...over,
  };
}

describe("park class (docs: Cost & parity)", () => {
  it("assigns the lever from the same state-bearing test the security tier uses", () => {
    // Stateless compute → elasticity; a load balancer is elasticity-class but
    // never parks; state-bearing (data cell / stateful) → dormancy.
    expect(parkClass(res({ cell: "app", kind: "compute" }))).toBe("elasticity");
    expect(parkClass(res({ cell: "edge", kind: "load-balancer" }))).toBe("fixed");
    expect(parkClass(res({ cell: "data", kind: "managed-relational-db" }))).toBe("dormancy");
    expect(parkClass(res({ cell: "data", kind: "stream-broker", lifecycle: "stateful" }))).toBe(
      "dormancy",
    );
    // Jobs and external dependencies have no utilization lever.
    expect(parkClass(res({ lifecycle: "job", kind: "batch-job" }))).toBe("none");
    expect(parkClass(res({ lifecycle: "external", kind: "external-saas", cell: "edge" }))).toBe(
      "none",
    );
  });
  it("only elasticity/dormancy resources are parkable", () => {
    expect(parkable(res({ cell: "app", kind: "compute" }))).toBe(true);
    expect(parkable(res({ cell: "data", kind: "managed-relational-db" }))).toBe(true);
    expect(parkable(res({ cell: "edge", kind: "load-balancer" }))).toBe(false);
    expect(parkable(res({ lifecycle: "job", kind: "batch-job" }))).toBe(false);
  });
});

describe("Dormant state — parked is not down, not drift", () => {
  it("a parked observation derives Dormant, before any health/quorum reading", () => {
    const compute = res({ id: "x", spec: { a: "1" } });
    // Scaled-to-zero compute: Dormant, not Unknown/Degraded.
    expect(derive(compute, obs({ spec: { a: "1" }, dormant: true }), "Settled", 1000, 0)).toBe(
      "Dormant",
    );
    // A paused stateful cluster reports quorum 0 — still Dormant, not Unavailable.
    const broker = res({ id: "b", kind: "stream-broker", lifecycle: "stateful", cell: "data" });
    expect(
      derive(broker, obs({ dormant: true, quorum: { healthy: 0, total: 3 } }), "Settled", 1000, 0),
    ).toBe("Dormant");
  });
  it("break-glass still dominates a parked resource", () => {
    const d = res({ id: "x", spec: { a: "1" } });
    expect(derive(d, obs({ spec: { a: "1" }, dormant: true }), "Frozen", 1000, 0)).toBe("Frozen");
  });
});

describe("reconciler holds on Dormant (does not fight the lever)", () => {
  function converged() {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    return e;
  }

  it("parks elasticity + dormancy resources; the loop holds and the env stays settled", () => {
    const e = converged();
    expect(e.snapshot().converged).toBe(true);
    const app = e.snapshot().resources.find((r) => r.cell === "app" && r.lifecycle === "service")!;
    const db = e.snapshot().resources.find((r) => r.kind === "managed-relational-db")!;

    e.park(app.id);
    e.park(db.id);
    e.tick();

    const find = (id: string) => e.snapshot().resources.find((r) => r.id === id)!;
    expect(find(app.id).state).toBe("Dormant");
    expect(find(db.id).state).toBe("Dormant");
    // The reconciler's belief is "parked", not drift/degraded.
    expect(find(app.id).reconcilerReason).toMatch(/dormant|parked/i);
    // Parked capacity does not break convergence.
    expect(e.snapshot().converged).toBe(true);

    // The loop never wakes it: it stays Dormant across many passes.
    for (let i = 0; i < 8; i++) e.tick();
    expect(find(app.id).state).toBe("Dormant");
    expect(find(db.id).state).toBe("Dormant");

    // Resume on demand → it comes back as the same shape, converged.
    e.wake(app.id);
    e.wake(db.id);
    for (let i = 0; i < 10 && find(app.id).state !== "Converged"; i++) e.tick();
    expect(find(app.id).state).toBe("Converged");
    expect(find(db.id).state).toBe("Converged");
  });

  it("a fixed resource (load balancer) never parks", () => {
    const e = converged();
    const lb = e.snapshot().resources.find((r) => r.kind === "load-balancer")!;
    e.park(lb.id); // no-op — elasticity class, but never zero
    e.tick();
    const after = e.snapshot().resources.find((r) => r.id === lb.id)!;
    expect(after.state).not.toBe("Dormant");
  });

  it("resume has latency — a woken resource warms through Converging, then Converged", () => {
    const e = converged();
    const db = e.snapshot().resources.find((r) => r.kind === "managed-relational-db")!;
    const stateOf = () => e.snapshot().resources.find((r) => r.id === db.id)!.state;
    e.park(db.id);
    e.tick();
    expect(stateOf()).toBe("Dormant");

    e.wake(db.id);
    e.tick();
    // Not instant — the cold-start window reads as benign progress, not down.
    expect(stateOf()).toBe("Converging");
    for (let i = 0; i < 10 && stateOf() !== "Converged"; i++) e.tick();
    expect(stateOf()).toBe("Converged");
  });
});

describe("parity invariant (docs: Cost & parity, guardrail 2)", () => {
  it("identical shapes pass; a shrunk lower environment is flagged", () => {
    const a = plan(DEFAULT_POSTURE, 1).manifest;
    const b = plan(DEFAULT_POSTURE, 1).manifest;
    expect(
      parityCheck([
        { id: "prod", manifest: a },
        { id: "dev", manifest: b },
      ]).ok,
    ).toBe(true);

    // Drop a resource from the lower env (a smaller shape) → violation.
    const shrunk: Manifest = { generation: b.generation, resources: { ...b.resources } };
    delete shrunk.resources[Object.keys(shrunk.resources)[0]];
    const dropped = parityCheck([
      { id: "prod", manifest: a },
      { id: "dev", manifest: shrunk },
    ]);
    expect(dropped.ok).toBe(false);
    expect(dropped.violations.length).toBeGreaterThan(0);
  });

  it("shrinking replicas in a lower env is a parity violation", () => {
    const a = plan(DEFAULT_POSTURE, 1).manifest;
    const b = plan(DEFAULT_POSTURE, 1).manifest;
    const appId = Object.values(b.resources).find((r) => r.cell === "app")!.id;
    const smaller: Manifest = {
      generation: b.generation,
      resources: {
        ...b.resources,
        [appId]: { ...b.resources[appId], spec: { ...b.resources[appId].spec, replicas: "1" } },
      },
    };
    expect(
      parityCheck([
        { id: "prod", manifest: a },
        { id: "dev", manifest: smaller },
      ]).ok,
    ).toBe(false);
  });

  it("a different promoted version (release tag) does NOT break parity", () => {
    const a = plan(DEFAULT_POSTURE, 1).manifest;
    const b = plan(DEFAULT_POSTURE, 1).manifest;
    const tagged: Manifest = {
      generation: b.generation,
      resources: Object.fromEntries(
        Object.entries(b.resources).map(([k, r]) => [
          k,
          { ...r, spec: { ...r.spec, release: "v9" } },
        ]),
      ),
    };
    expect(
      parityCheck([
        { id: "prod", manifest: a },
        { id: "dev", manifest: tagged },
      ]).ok,
    ).toBe(true);
  });
});

describe("utilization control loop (idle trigger, cold resume, wallet guard)", () => {
  function ready(over: Partial<Posture> = {}) {
    const posture: Posture = { ...DEFAULT_POSTURE, ...over };
    const e = new Engine(posture);
    e.declare(posture);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    return e;
  }
  const aggressive = (): Posture => ({
    ...DEFAULT_POSTURE,
    elasticity: "aggressive",
    dormancy: "aggressive",
  });
  const stateOf = (e: Engine, id: string) => e.snapshot().resources.find((r) => r.id === id)!.state;

  it("an aggressive env auto-parks on observed idleness and resumes on demand", () => {
    const e = ready(aggressive());
    const app = e.snapshot().resources.find((r) => r.cell === "app" && r.lifecycle === "service")!;

    // Demand goes away → the autoscaler parks it once idle past the tier threshold.
    e.setIdle(app.id, true);
    for (let i = 0; i < 6 && stateOf(e, app.id) !== "Dormant"; i++) e.tick();
    expect(stateOf(e, app.id)).toBe("Dormant");

    // Demand returns → it resumes on its own (no operator action).
    e.setIdle(app.id, false);
    for (let i = 0; i < 10 && stateOf(e, app.id) !== "Converged"; i++) e.tick();
    expect(stateOf(e, app.id)).toBe("Converged");
  });

  it("a conservative env never auto-parks, however long it sits idle", () => {
    const e = ready(); // DEFAULT_POSTURE is conservative
    const app = e.snapshot().resources.find((r) => r.cell === "app" && r.lifecycle === "service")!;
    e.setIdle(app.id, true);
    for (let i = 0; i < 12; i++) e.tick();
    expect(stateOf(e, app.id)).not.toBe("Dormant"); // warm floor
  });

  it("a cold resume comes back Degraded and the loop self-heals it (guardrail 4)", () => {
    const e = ready();
    const db = e.snapshot().resources.find((r) => r.kind === "managed-relational-db")!;
    e.park(db.id);
    e.tick();
    expect(stateOf(e, db.id)).toBe("Dormant");

    e.coldResume(db.id); // dropped connections / cold buffers
    e.tick();
    expect(stateOf(e, db.id)).toBe("Degraded"); // not a free wake — a failure path
    for (let i = 0; i < 10 && stateOf(e, db.id) !== "Converged"; i++) e.tick();
    expect(stateOf(e, db.id)).toBe("Converged"); // the loop recovers it
  });

  it("the denial-of-wallet guard trips on resume thrash and pins warm (guardrail 7)", () => {
    const e = ready(aggressive());
    const db = e.snapshot().resources.find((r) => r.kind === "managed-relational-db")!;

    // Thrash: park/resume repeatedly in a tight window.
    for (let i = 0; i < 5; i++) {
      e.park(db.id);
      e.wake(db.id);
    }
    expect(e.snapshot().walletGuard).toContain(db.id);

    // Pinned warm: even sustained idleness no longer parks it (churn > warm floor).
    e.setIdle(db.id, true);
    for (let i = 0; i < 8; i++) e.tick();
    expect(stateOf(e, db.id)).not.toBe("Dormant");

    // Resolving the incident lets it park again.
    e.resolveWalletGuard(db.id);
    expect(e.snapshot().walletGuard).not.toContain(db.id);
    for (let i = 0; i < 8 && stateOf(e, db.id) !== "Dormant"; i++) e.tick();
    expect(stateOf(e, db.id)).toBe("Dormant");
  });
});

describe("temporal demand model wired into the autoscaler (axis 1)", () => {
  function ready(): Engine {
    const posture: Posture = {
      ...DEFAULT_POSTURE,
      elasticity: "aggressive",
      dormancy: "aggressive",
    };
    const e = new Engine(posture);
    e.declare(posture);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    return e;
  }
  const NIGHTLY = parseSchedule("nightly")!; // { everyTicks: 24, atTick: 0, durationTicks: 3 }
  const tickOf = (e: Engine) => Math.floor(e.snapshot().tMs / 1000);
  const phaseOf = (e: Engine) => tickOf(e) % NIGHTLY.everyTicks;
  const driveToPhase = (e: Engine, p: number) => {
    for (let i = 0; i < NIGHTLY.everyTicks && phaseOf(e) !== p; i++) e.tick();
  };
  const stateOf = (e: Engine, id: string) => e.snapshot().resources.find((r) => r.id === id)!.state;
  // The DB in the same region as the nightly batch job — it inherits the window.
  const scheduledDb = (e: Engine) => {
    const jr = e.snapshot().resources.find((r) => r.lifecycle === "job")!.region;
    return e
      .snapshot()
      .resources.find((r) => r.kind === "managed-relational-db" && r.region === jr)!;
  };

  it("refuses to park into scheduled demand, then parks once the window passes", () => {
    const e = ready();
    const db = scheduledDb(e);
    driveToPhase(e, 0); // the nightly window is open (demand active)

    // Idle through the active window — a blind autoscaler would park after the
    // tier threshold (2 ticks); the temporal one holds it warm.
    e.setIdle(db.id, true);
    e.tick();
    e.tick();
    e.tick(); // autoscale saw phases 0,1,2 — all warm
    expect(stateOf(e, db.id)).not.toBe("Dormant");

    // Window has passed (and the next is far): now it is free to park.
    for (let i = 0; i < 5 && stateOf(e, db.id) !== "Dormant"; i++) e.tick();
    expect(stateOf(e, db.id)).toBe("Dormant");
  });

  it("pre-warms a parked resource ahead of the next scheduled window", () => {
    const e = ready();
    const db = scheduledDb(e);
    driveToPhase(e, 8); // far from the window

    e.setIdle(db.id, true);
    for (let i = 0; i < 5 && stateOf(e, db.id) !== "Dormant"; i++) e.tick();
    expect(stateOf(e, db.id)).toBe("Dormant"); // parks while demand is far off

    // Advance toward the next window; it must wake *before* demand arrives, so it
    // isn't cold-started at the window opening.
    for (let i = 0; i < NIGHTLY.everyTicks && phaseOf(e) !== 0; i++) e.tick();
    expect(stateOf(e, db.id)).not.toBe("Dormant"); // pre-warmed, not cold at demand
  });
});

describe("right-sizing from observed utilization (axis 2)", () => {
  function converged() {
    const e = new Engine(DEFAULT_POSTURE);
    e.declare(DEFAULT_POSTURE);
    e.approve();
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();
    return e;
  }
  // Inject load on every sized resource of a Service (its compute + data).
  const loadService = (e: Engine, slug: string, cpu: number, mem: number) => {
    for (const r of e.snapshot().resources) {
      if (r.service === slug && (r.size === "small" || r.size === "medium" || r.size === "large")) {
        e.setLoad(r.id, { cpu, mem });
      }
    }
  };
  const propFor = (e: Engine, slug: string) =>
    e.snapshot().rightSizing.find((p) => p.slug === slug);

  it("surfaces a shrink proposal for an overprovisioned service, only with telemetry", () => {
    const e = converged();
    // payments-api is C0 → large; run it at ~37% of large.
    loadService(e, "payments-api", 1.5, 1.5);
    e.tick();
    expect(propFor(e, "payments-api")).toMatchObject({ from: "large", to: "medium" });
    // internal-dashboard has no telemetry → no recommendation (never blind).
    expect(propFor(e, "internal-dashboard")).toBeUndefined();
  });

  it("does not propose a shrink when memory binds (low CPU is not enough)", () => {
    const e = converged();
    loadService(e, "payments-api", 1.0, 3.0); // 25% CPU but 75% memory of large
    e.tick();
    expect(propFor(e, "payments-api")).toBeUndefined();
  });

  it("sizes to the peak, not the average — a spike in the window blocks the shrink", () => {
    const e = converged();
    loadService(e, "payments-api", 0.5, 0.5); // mostly quiet
    for (let i = 0; i < 3; i++) e.tick();
    loadService(e, "payments-api", 3.0, 3.0); // a brief spike
    e.tick();
    loadService(e, "payments-api", 0.5, 0.5); // back to quiet (low average)
    for (let i = 0; i < 3; i++) e.tick();
    // The windowed peak still holds the spike → no shrink despite the low average.
    expect(propFor(e, "payments-api")).toBeUndefined();
  });

  it("accepting a proposal shrinks the shared shape and drops cost", () => {
    const e = converged();
    loadService(e, "payments-api", 1.5, 1.5);
    e.tick();
    const before = e.snapshot().costNow;

    expect(e.acceptRightSizing("payments-api")).toBe(true);
    for (let i = 0; i < 30 && !e.snapshot().converged; i++) e.tick();

    const after = e.snapshot();
    const sizes = after.resources
      .filter((r) => r.service === "payments-api" && r.kind === "compute")
      .map((r) => r.size);
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every((s) => s === "medium")).toBe(true); // shrank, on every region
    expect(after.costNow).toBeLessThan(before); // cheaper for the same workload
    expect(after.converged).toBe(true);
    expect(propFor(e, "payments-api")).toBeUndefined(); // now right-sized
  });
});
