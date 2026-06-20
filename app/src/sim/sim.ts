// An in-memory simulated cloud whose *dynamics are real*: apply has latency,
// nodes fail, telemetry goes stale, and out-of-band changes drift. It implements
// the provider port (spec §15). Synchronous — the UI drives tick().

import {
  cloneSpec,
  type DesiredResource,
  type Health,
  type JobPhase,
  type Lifecycle,
  type Observation,
  type ResourceID,
  type Spec,
  specEqual,
} from "./model";
import type { Provider } from "./provider";

const TICK_MS = 1000;

interface SimResource {
  kind: string;
  region: string;
  lifecycle: Lifecycle;
  observed: Spec;
  target: Spec;
  appliedGen: number;
  health: Health;
  convergeIn: number; // ticks until target becomes observed
  exists: boolean;
  stale: boolean;
  dormant: boolean; // intentionally parked (scaled-to-zero / paused) to save cost
  broken: boolean; // root-cause failure that self-heal cannot fix
  costFactor: number; // billed ÷ planned — 1 normally; >1 is cost drift (§13)
  observedAtMs: number;
  // Job lifecycle
  phase?: JobPhase;
  jobTimer: number; // ticks remaining in the current phase
  // Stateful lifecycle (quorum cluster)
  nodesTotal: number;
  nodesDown: number;
}

// Job phase durations (in ticks).
const JOB_START = 1; // pending → running
const JOB_RUN = 3; // running → succeeded
const JOB_COOLDOWN = 4; // succeeded → pending again (cron)

export class SimCloud implements Provider {
  private applyLatency: number;
  private nowMs: number;
  private res = new Map<ResourceID, SimResource>();

  constructor(opts: { applyLatency?: number; startMs?: number } = {}) {
    this.applyLatency = opts.applyLatency ?? 2;
    this.nowMs = opts.startMs ?? 0;
  }

  name() {
    return "sim";
  }

  now() {
    return this.nowMs;
  }

  /** Advance the logical clock and let in-flight applies make progress. */
  tick() {
    this.nowMs += TICK_MS;
    for (const r of this.res.values()) {
      if (r.lifecycle === "job") {
        this.advanceJob(r);
      } else if (r.convergeIn > 0) {
        r.convergeIn--;
        if (r.convergeIn === 0) {
          r.observed = cloneSpec(r.target);
          r.exists = true;
          // A broken resource lands but stays Degraded — self-heal can't fix
          // the root cause, so the reconciler will flap until a human repairs it.
          r.health = r.broken ? "Degraded" : "Healthy";
          // A stateful cluster restores its downed nodes on convergence.
          if (!r.broken) r.nodesDown = 0;
        }
      }
      if (!r.stale) r.observedAtMs = this.nowMs;
    }
  }

  // A Job runs to completion, then re-runs on schedule (cron). Reaching
  // succeeded is success — not drift — so the reconciler holds, it does not
  // "repair" a finished job back to running.
  private advanceJob(r: SimResource) {
    if (!r.phase) return;
    if (r.jobTimer > 0) r.jobTimer--;
    if (r.jobTimer > 0) return;
    switch (r.phase) {
      case "pending":
        r.phase = "running";
        r.jobTimer = JOB_RUN;
        break;
      case "running":
        r.phase = r.broken ? "failed" : "succeeded";
        r.jobTimer = JOB_COOLDOWN;
        break;
      case "succeeded":
      case "failed":
        r.phase = "pending"; // next scheduled run
        r.jobTimer = JOB_START;
        break;
    }
  }

  apply(d: DesiredResource): void {
    let r = this.res.get(d.id);
    if (!r) {
      r = {
        kind: d.kind,
        region: d.region,
        lifecycle: d.lifecycle,
        observed: {},
        target: {},
        appliedGen: 0,
        health: "Unknown",
        convergeIn: 0,
        exists: false,
        stale: false,
        dormant: false,
        broken: false,
        costFactor: 1,
        observedAtMs: this.nowMs,
        jobTimer: 0,
        nodesTotal: d.lifecycle === "stateful" ? Number(d.spec.nodes ?? "3") : 1,
        nodesDown: 0,
      };
      this.res.set(d.id, r);
    }
    // Launching a Job (run-to-completion). If it isn't already in flight, start
    // a run; the sim then advances it through its phases on tick().
    if (d.lifecycle === "job") {
      if (!r.phase || r.phase === "succeeded" || r.phase === "failed") {
        r.phase = "pending";
        r.jobTimer = JOB_START;
      }
      r.exists = true;
      r.observed = cloneSpec(d.spec);
      r.appliedGen = d.generation;
      return;
    }
    const converged = r.exists && specEqual(r.observed, d.spec) && r.appliedGen === d.generation;
    if (converged && r.health === "Healthy") return;
    // Already converging toward this exact desired state: don't restart the
    // latency clock. (Self-heal/drift have convergeIn === 0 and fall through.)
    if (r.convergeIn > 0 && specEqual(r.target, d.spec) && r.appliedGen === d.generation) {
      return;
    }
    r.kind = d.kind;
    r.region = d.region;
    r.target = cloneSpec(d.spec);
    r.appliedGen = d.generation;
    r.convergeIn = this.applyLatency;
    if (r.convergeIn === 0) {
      r.observed = cloneSpec(d.spec);
      r.exists = true;
      r.health = r.broken ? "Degraded" : "Healthy";
    }
  }

  delete(id: ResourceID): void {
    this.res.delete(id);
  }

  /** Register an External (third-party SaaS) as discovered — it exists and is
   *  healthy but is never provisioned or reconciled (observe-only, §1). */
  seedExternal(d: DesiredResource) {
    if (this.res.has(d.id)) return;
    this.res.set(d.id, {
      kind: d.kind,
      region: d.region,
      lifecycle: "external",
      observed: cloneSpec(d.spec),
      target: cloneSpec(d.spec),
      appliedGen: d.generation,
      health: "Healthy",
      convergeIn: 0,
      exists: true,
      stale: false,
      dormant: false,
      broken: false,
      costFactor: 1,
      observedAtMs: this.nowMs,
      jobTimer: 0,
      nodesTotal: 1,
      nodesDown: 0,
    });
  }

  observe(id: ResourceID): Observation {
    const r = this.res.get(id);
    if (!r)
      return {
        id,
        exists: false,
        spec: {},
        health: "Unknown",
        appliedGeneration: 0,
        observedAtMs: 0,
      };
    return this.toObservation(id, r);
  }

  observeAll(): Observation[] {
    const out: Observation[] = [];
    for (const [id, r] of this.res) out.push(this.toObservation(id, r));
    return out;
  }

  private toObservation(id: ResourceID, r: SimResource): Observation {
    const stateful = r.lifecycle === "stateful";
    // A parked resource is intentionally suspended, not unhealthy — report it
    // Healthy so the dormant flag (not a degraded reading) carries the meaning.
    const health: Health = r.dormant
      ? "Healthy"
      : !r.exists
        ? "Unknown"
        : stateful
          ? r.nodesDown > 0
            ? "Degraded"
            : "Healthy"
          : r.health;
    return {
      id,
      exists: r.exists,
      spec: cloneSpec(r.observed),
      health,
      appliedGeneration: r.appliedGen,
      observedAtMs: r.observedAtMs,
      phase: r.lifecycle === "job" ? r.phase : undefined,
      quorum: stateful ? { healthy: r.nodesTotal - r.nodesDown, total: r.nodesTotal } : undefined,
      dormant: r.dormant || undefined,
    };
  }

  // ---- Utilization levers: park idle capacity, resume on demand ------------

  /** Park a resource: scale-to-zero (elasticity) or pause (dormancy). Durable
   *  state is retained — this suspends compute, it does not delete (docs: Cost
   *  & parity). The reconciler reads the result as Dormant, not down. */
  park(id: ResourceID) {
    const r = this.res.get(id);
    if (r) r.dormant = true;
  }

  /** Resume a parked resource. Durable state is intact, so it comes back as it
   *  was — a real cold-start would add resume latency; here wake is immediate. */
  wake(id: ResourceID) {
    const r = this.res.get(id);
    if (r) {
      r.dormant = false;
      r.health = "Healthy";
      r.nodesDown = 0;
    }
  }

  // ---- Fault injection (sim-only; the dynamics the loop must survive) ------

  failNode(id: ResourceID) {
    const r = this.res.get(id);
    if (!r) return;
    if (r.lifecycle === "stateful") {
      // Lose one node of the quorum cluster.
      r.nodesDown = Math.min(r.nodesTotal, r.nodesDown + 1);
    }
    r.health = "Degraded";
  }

  /** A root-cause failure self-heal cannot fix (bad config, exhausted quota).
   *  Re-applies keep landing Degraded → the reconciler flaps, then Stalls. */
  failPermanent(id: ResourceID) {
    const r = this.res.get(id);
    if (r) {
      r.health = "Degraded";
      if (r.lifecycle === "stateful") r.nodesDown = r.nodesTotal;
      r.broken = true;
    }
  }

  /** A human fixes the root cause — the next apply heals it. */
  repair(id: ResourceID) {
    const r = this.res.get(id);
    if (r) r.broken = false;
  }

  /** Fail every healthy resource in a region — a region outage. Returns ids hit. */
  regionOutage(region: string): ResourceID[] {
    const hit: ResourceID[] = [];
    for (const [id, r] of this.res) {
      // External SaaS is outside our failure domain; jobs are ephemeral.
      if (r.lifecycle === "external" || r.lifecycle === "job") continue;
      if (r.region === region && r.exists) {
        r.health = "Degraded";
        if (r.lifecycle === "stateful") r.nodesDown = r.nodesTotal;
        hit.push(id);
      }
    }
    return hit;
  }

  injectDrift(id: ResourceID, mutate: (s: Spec) => void) {
    const r = this.res.get(id);
    if (r?.exists) mutate(r.observed);
  }

  /** Billed-vs-planned cost drift (§13): the cloud starts billing this resource
   *  at `factor`× its planned cost (a usage spike / price change / leak). */
  costSpike(id: ResourceID, factor: number) {
    const r = this.res.get(id);
    if (r) r.costFactor = factor;
  }

  /** A human reconciles the cost (right-sizes / clears the leak). */
  repairCost(id: ResourceID) {
    const r = this.res.get(id);
    if (r) r.costFactor = 1;
  }

  /** The billed-vs-planned multiplier the FinOps loop observes for a resource. */
  billedFactor(id: ResourceID): number {
    return this.res.get(id)?.costFactor ?? 1;
  }

  setStale(id: ResourceID, stale: boolean) {
    const r = this.res.get(id);
    if (r) {
      r.stale = stale;
      if (!stale) r.observedAtMs = this.nowMs;
    }
  }
}
