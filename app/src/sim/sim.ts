// An in-memory simulated cloud whose *dynamics are real*: apply has latency,
// nodes fail, telemetry goes stale, and out-of-band changes drift. Mirrors the
// Go reference (../../../provider/sim). Synchronous — the UI drives tick().

import {
  cloneSpec,
  specEqual,
  type DesiredResource,
  type Health,
  type Observation,
  type ResourceID,
  type Spec,
} from "./model";
import type { Provider } from "./provider";

const TICK_MS = 1000;

interface SimResource {
  kind: string;
  region: string;
  observed: Spec;
  target: Spec;
  appliedGen: number;
  health: Health;
  convergeIn: number; // ticks until target becomes observed
  exists: boolean;
  stale: boolean;
  broken: boolean; // root-cause failure that self-heal cannot fix
  observedAtMs: number;
}

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
      if (r.convergeIn > 0) {
        r.convergeIn--;
        if (r.convergeIn === 0) {
          r.observed = cloneSpec(r.target);
          r.exists = true;
          // A broken resource lands but stays Degraded — self-heal can't fix
          // the root cause, so the reconciler will flap until a human repairs it.
          r.health = r.broken ? "Degraded" : "Healthy";
        }
      }
      if (!r.stale) r.observedAtMs = this.nowMs;
    }
  }

  apply(d: DesiredResource): void {
    let r = this.res.get(d.id);
    if (!r) {
      r = {
        kind: d.kind,
        region: d.region,
        observed: {},
        target: {},
        appliedGen: 0,
        health: "Unknown",
        convergeIn: 0,
        exists: false,
        stale: false,
        broken: false,
        observedAtMs: this.nowMs,
      };
      this.res.set(d.id, r);
    }
    const converged =
      r.exists && specEqual(r.observed, d.spec) && r.appliedGen === d.generation;
    if (converged && r.health === "Healthy") return;
    // Already converging toward this exact desired state: don't restart the
    // latency clock. (Self-heal/drift have convergeIn === 0 and fall through.)
    if (
      r.convergeIn > 0 &&
      specEqual(r.target, d.spec) &&
      r.appliedGen === d.generation
    ) {
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

  observe(id: ResourceID): Observation {
    const r = this.res.get(id);
    if (!r) return { id, exists: false, spec: {}, health: "Unknown", appliedGeneration: 0, observedAtMs: 0 };
    return this.toObservation(id, r);
  }

  observeAll(): Observation[] {
    const out: Observation[] = [];
    for (const [id, r] of this.res) out.push(this.toObservation(id, r));
    return out;
  }

  private toObservation(id: ResourceID, r: SimResource): Observation {
    return {
      id,
      exists: r.exists,
      spec: cloneSpec(r.observed),
      health: r.exists ? r.health : "Unknown",
      appliedGeneration: r.appliedGen,
      observedAtMs: r.observedAtMs,
    };
  }

  // ---- Fault injection (sim-only; the dynamics the loop must survive) ------

  failNode(id: ResourceID) {
    const r = this.res.get(id);
    if (r) r.health = "Degraded";
  }

  /** A root-cause failure self-heal cannot fix (bad config, exhausted quota).
   *  Re-applies keep landing Degraded → the reconciler flaps, then Stalls. */
  failPermanent(id: ResourceID) {
    const r = this.res.get(id);
    if (r) {
      r.health = "Degraded";
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
      if (r.region === region && r.exists) {
        r.health = "Degraded";
        hit.push(id);
      }
    }
    return hit;
  }

  injectDrift(id: ResourceID, mutate: (s: Spec) => void) {
    const r = this.res.get(id);
    if (r && r.exists) mutate(r.observed);
  }

  setStale(id: ResourceID, stale: boolean) {
    const r = this.res.get(id);
    if (r) {
      r.stale = stale;
      if (!stale) r.observedAtMs = this.nowMs;
    }
  }
}
