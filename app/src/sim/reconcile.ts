// The reconcile loop (spec §9): observe → derive State → converge gaps within
// the approved envelope. Converge actions ONLY — it never mutates desired state
// (that is the Author class). Mirrors the Go reference (../../../reconcile).

import type { Manifest, ResourceID, Health } from "./model";
import type { Provider } from "./provider";
import { derive, type Control, type State } from "./state";

export type DriftPolicy = "enforce" | "warn" | "ignore";
export type Action = "none" | "apply" | "delete" | "hold" | "warn";

export interface Options {
  driftPolicy?: DriftPolicy;
  stalenessBudgetMs?: number;
}

export interface Status {
  id: ResourceID;
  state: State;
  health: Health;
  action: Action;
  reason: string;
}

export class Reconciler {
  private frozen = new Set<ResourceID>();
  private driftPolicy: DriftPolicy;
  private stalenessBudgetMs: number;

  constructor(
    private p: Provider,
    opts: Options = {},
  ) {
    this.driftPolicy = opts.driftPolicy ?? "enforce";
    this.stalenessBudgetMs = opts.stalenessBudgetMs ?? 0;
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

  step(m: Manifest, nowMs: number): Status[] {
    const obs = this.p.observeAll();
    const byId = new Map(obs.map((o) => [o.id, o]));
    const out: Status[] = [];

    for (const [id, d] of Object.entries(m.resources)) {
      const o =
        byId.get(id) ??
        { id, exists: false, spec: {}, health: "Unknown" as Health, appliedGeneration: 0, observedAtMs: 0 };
      const control: Control = this.frozen.has(id) ? "Frozen" : "Settled";
      const st = derive(d, o, control, nowMs, this.stalenessBudgetMs);
      const s: Status = { id, state: st, health: o.health, action: "none", reason: "" };

      switch (st) {
        case "Converged":
          s.reason = "matches spec and healthy";
          break;
        case "Converging":
          this.p.apply(d);
          s.action = "apply";
          s.reason = "authored change rolling out";
          break;
        case "Degraded":
          this.p.apply(d);
          s.action = "apply";
          s.reason = "self-heal: unhealthy, re-provisioning";
          break;
        case "Drifted":
          if (this.driftPolicy === "enforce") {
            this.p.apply(d);
            s.action = "apply";
            s.reason = "drift: unauthored change, correcting";
          } else if (this.driftPolicy === "warn") {
            s.action = "warn";
            s.reason = "drift detected (policy=warn, not correcting)";
          } else {
            s.reason = "drift ignored (policy=ignore)";
          }
          break;
        case "Unknown":
          s.action = "hold";
          s.reason = "telemetry stale/missing — holding (fail-safe)";
          break;
        case "Frozen":
          s.action = "hold";
          s.reason = "break-glass: reconciliation suspended";
          break;
        case "Stalled":
          s.action = "hold";
          s.reason = "stalled — needs a human";
          break;
      }
      out.push(s);
    }

    // Retire resources absent from desired (unauthored existence) under enforce.
    if (this.driftPolicy === "enforce") {
      for (const o of obs) {
        if (m.resources[o.id] || !o.exists || this.frozen.has(o.id)) continue;
        this.p.delete(o.id);
        out.push({ id: o.id, state: "Drifted", health: o.health, action: "delete", reason: "not in desired state — retiring" });
      }
    }

    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return out;
  }
}

export function allConverged(statuses: Status[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s.state === "Converged");
}
