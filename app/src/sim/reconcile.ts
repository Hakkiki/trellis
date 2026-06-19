// The reconcile loop (spec §9): observe → derive State → converge gaps within
// the approved envelope. Converge actions ONLY — it never mutates desired state
// (that is the Author class).

import type { DesiredResource, Health, Manifest, Observation, ResourceID } from "./model";
import type { Provider } from "./provider";
import { type Control, derive, type State } from "./state";

export type DriftPolicy = "enforce" | "warn" | "ignore";
export type Action = "none" | "apply" | "delete" | "hold" | "warn";

export interface Options {
  driftPolicy?: DriftPolicy;
  stalenessBudgetMs?: number;
  /** Consecutive failed self-heals before the breaker trips to Stalled (§9). */
  flapThreshold?: number;
  /** Blast-radius breaker (§9): if a single pass would remediate more than this
   *  fraction of managed resources, halt and page instead of mass-stomping.
   *  0 disables it. */
  blastRadiusPct?: number;
}

export interface Status {
  id: ResourceID;
  state: State;
  health: Health;
  action: Action;
  reason: string;
  detail?: string; // e.g. quorum "2/3 nodes" for stateful clusters
}

export class Reconciler {
  private frozen = new Set<ResourceID>();
  private stalled = new Set<ResourceID>();
  private attempts = new Map<ResourceID, number>();
  private driftPolicy: DriftPolicy;
  private stalenessBudgetMs: number;
  private flapThreshold: number;
  private blastRadiusPct: number;
  private freezeOn = false; // change-freeze / maintenance window
  private blastAck = false; // one-shot: proceed past the blast-radius breaker
  private lastBlastTripped = false;

  constructor(
    private p: Provider,
    opts: Options = {},
  ) {
    this.driftPolicy = opts.driftPolicy ?? "enforce";
    this.stalenessBudgetMs = opts.stalenessBudgetMs ?? 0;
    this.flapThreshold = opts.flapThreshold ?? 3;
    this.blastRadiusPct = opts.blastRadiusPct ?? 0;
  }

  /** Temporal governance (§9): a change-freeze window holds non-emergency
   *  Converge actions. Break-glass (per-resource freeze) still overrides. */
  setChangeFreeze(on: boolean) {
    this.freezeOn = on;
  }
  isChangeFreeze() {
    return this.freezeOn;
  }
  /** Acknowledge the blast-radius breaker: let the next pass proceed once. */
  acknowledgeBlast() {
    this.blastAck = true;
  }
  blastTripped() {
    return this.lastBlastTripped;
  }

  /** Break-glass: suspend reconciliation of a resource (spec §7). */
  freeze(id: ResourceID) {
    this.frozen.add(id);
  }
  unfreeze(id: ResourceID) {
    this.frozen.delete(id);
  }
  isFrozen(id: ResourceID) {
    return this.frozen.has(id);
  }

  /** Circuit-breaker state (spec §9 reconciler self-protection). */
  isStalled(id: ResourceID) {
    return this.stalled.has(id);
  }
  /** Resolve an incident: clear the breaker so reconciliation resumes. */
  resetBreaker(id: ResourceID) {
    this.stalled.delete(id);
    this.attempts.delete(id);
  }

  /** Read-only observe: derive each resource's State without converging. Used
   *  when the loop is down (e.g. the reconciler component is bricked, §16) — the
   *  topology still shows reality, but nothing is remediated. */
  observeStates(m: Manifest, nowMs: number): Status[] {
    const byId = new Map(this.p.observeAll().map((o) => [o.id, o]));
    const out: Status[] = [];
    for (const [id, d] of Object.entries(m.resources)) {
      const o = byId.get(id) ?? {
        id,
        exists: false,
        spec: {},
        health: "Unknown" as Health,
        appliedGeneration: 0,
        observedAtMs: 0,
      };
      const control: Control = this.frozen.has(id)
        ? "Frozen"
        : this.stalled.has(id)
          ? "Stalled"
          : "Settled";
      const st = derive(d, o, control, nowMs, this.stalenessBudgetMs);
      out.push({
        id,
        state: st,
        health: o.health,
        action: "hold",
        reason: "control-plane loop down — observing only, not reconciling",
        detail: o.quorum ? `${o.quorum.healthy}/${o.quorum.total} nodes` : undefined,
      });
    }
    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return out;
  }

  step(m: Manifest, nowMs: number): Status[] {
    const obs = this.p.observeAll();
    const byId = new Map(obs.map((o) => [o.id, o]));
    const out: Status[] = [];
    const plans: PlanItem[] = [];

    for (const [id, d] of Object.entries(m.resources)) {
      const o = byId.get(id) ?? {
        id,
        exists: false,
        spec: {},
        health: "Unknown" as Health,
        appliedGeneration: 0,
        observedAtMs: 0,
      };

      // External: observe-only — the reconciler never converges it (§1).
      if (d.lifecycle === "external") {
        const st = derive(d, o, "Settled", nowMs, this.stalenessBudgetMs);
        out.push({
          id,
          state: st,
          health: o.health,
          action: "none",
          reason:
            st === "Degraded"
              ? "external dependency degraded — observe-only, cannot remediate"
              : "external SaaS — observed only",
        });
        continue;
      }

      // Job: run-to-completion. Launch it once; then hold — reaching succeeded
      // is success, not drift, and the sim re-runs it on schedule.
      if (d.lifecycle === "job") {
        const st = derive(d, o, "Settled", nowMs, this.stalenessBudgetMs);
        const sj: Status = { id, state: st, health: o.health, action: "none", reason: "" };
        if (!o.exists) {
          this.p.apply(d);
          sj.action = "apply";
          sj.reason = "launching job";
        } else if (st === "Succeeded") {
          sj.reason = "completed — success, not drift";
        } else if (st === "Running") {
          sj.reason = "run in progress";
        } else if (st === "Failed") {
          sj.reason = "run failed — will retry on schedule";
        } else {
          sj.reason = "scheduled — pending";
        }
        out.push(sj);
        continue;
      }

      // --- Decide (no side effects yet) for service / stateful workloads. ---
      const control: Control = this.frozen.has(id)
        ? "Frozen"
        : this.stalled.has(id)
          ? "Stalled"
          : "Settled";
      const st = derive(d, o, control, nowMs, this.stalenessBudgetMs);
      if (st === "Converged") {
        this.attempts.delete(id);
        this.stalled.delete(id);
      }
      const detail = o.quorum ? `${o.quorum.healthy}/${o.quorum.total} nodes` : undefined;

      let intended: Action = "none";
      let reason = "";
      let remediation = false; // unauthored gap the reconciler would close
      switch (st) {
        case "Converged":
          reason = "matches spec and healthy";
          break;
        case "Converging":
          intended = "apply";
          reason = "authored change rolling out";
          break;
        case "Degraded":
          intended = "apply";
          reason = "self-heal: unhealthy, re-provisioning";
          remediation = true;
          break;
        case "Unavailable":
          intended = "apply";
          reason = "quorum lost — restoring nodes";
          remediation = true;
          break;
        case "Drifted":
          if (this.driftPolicy === "enforce") {
            intended = "apply";
            reason = "drift: unauthored change, correcting";
            remediation = true;
          } else if (this.driftPolicy === "warn") {
            intended = "warn";
            reason = "drift detected (policy=warn, not correcting)";
          } else {
            reason = "drift ignored (policy=ignore)";
          }
          break;
        case "Unknown":
          intended = "hold";
          reason = "telemetry stale/missing — holding (fail-safe)";
          break;
        case "Frozen":
          intended = "hold";
          reason = "break-glass: reconciliation suspended";
          break;
        case "Stalled":
          intended = "hold";
          reason = "stalled — needs a human";
          break;
      }
      plans.push({ id, d, o, st, intended, reason, detail, remediation });
    }

    // --- Blast-radius breaker (§9): count unauthored remediations this pass. ---
    const remediators = plans.filter((p) => p.intended === "apply" && p.remediation).length;
    const managed = plans.length;
    const ratio = managed ? remediators / managed : 0;
    const blastTripped = this.blastRadiusPct > 0 && ratio > this.blastRadiusPct && !this.blastAck;
    this.lastBlastTripped = blastTripped;

    // --- Realize: apply within the temporal + blast-radius envelope. ---
    for (const p of plans) {
      let st = p.st;
      let reason = p.reason;
      let action: Action = p.intended === "apply" ? "apply" : p.intended;

      if (p.intended === "apply") {
        if (this.freezeOn) {
          action = "hold";
          reason = "change-freeze: non-emergency change held";
        } else if (blastTripped && p.remediation) {
          action = "hold";
          reason = `blast-radius breaker: ${Math.round(ratio * 100)}% would change — halted, paging`;
        } else if (p.remediation && (st === "Degraded" || st === "Unavailable")) {
          // Flap breaker: stop retrying a self-heal that never sticks.
          const n = (this.attempts.get(p.id) ?? 0) + 1;
          this.attempts.set(p.id, n);
          if (n > this.flapThreshold) {
            this.stalled.add(p.id);
            st = "Stalled";
            action = "hold";
            reason = "stalled — needs a human";
          } else {
            this.p.apply(p.d);
          }
        } else {
          this.p.apply(p.d);
        }
      }
      out.push({ id: p.id, state: st, health: p.o.health, action, reason, detail: p.detail });
    }

    // Retire resources absent from desired — gated by the same envelope.
    if (this.driftPolicy === "enforce" && !this.freezeOn && !blastTripped) {
      for (const o of obs) {
        if (m.resources[o.id] || !o.exists || this.frozen.has(o.id)) continue;
        this.p.delete(o.id);
        out.push({
          id: o.id,
          state: "Drifted",
          health: o.health,
          action: "delete",
          reason: "not in desired state — retiring",
        });
      }
    }

    this.blastAck = false; // one-shot acknowledgement consumed

    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return out;
  }
}

interface PlanItem {
  id: ResourceID;
  d: DesiredResource;
  o: Observation;
  st: State;
  intended: Action;
  reason: string;
  detail?: string;
  remediation: boolean;
}

export function allConverged(statuses: Status[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s.state === "Converged");
}
