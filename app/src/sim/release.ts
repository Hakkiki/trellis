// The release rollout — the inner loop (spec §11). A team converges its App
// Cell's *running version* toward the latest submitted artifact: the
// workload-altitude analogue of §4's Job mode, a finite, derived terminal
// progression. The runtime holds the version; the reconciler (the outer loop)
// authors capacity, never version — so a failed rollout self-reverts *below*
// the reconciler and never trips its flap breaker (Invariants 27–29).

import type { Criticality } from "./model";

export type Strategy = "rolling" | "canary" | "blue-green";

export type RolloutState =
  | "Pending"
  | "Blocked"
  | "Progressing"
  | "Verifying"
  | "Healthy"
  | "RolledBack"
  | "Superseded";

/** Whether the new version passes the bake at a given canary share (0–100).
 *  The team owns this readiness contract — §4 Health is infra-level; this is
 *  workload liveness, at a different altitude. */
export type Bake = (artifact: string, sharePct: number) => boolean;

export interface Rollout {
  id: number;
  service: string;
  artifact: string; // the target version — an immutable digest
  from: string; // last-healthy version; where a failure reverts to
  strategy: Strategy;
  steps: number[]; // canary shares; rolling/blue-green collapse to [100]
  stepIndex: number;
  share: number; // current new-version share (0–100)
  state: RolloutState;
  reason: string;
}

const TERMINAL: ReadonlySet<RolloutState> = new Set(["Healthy", "RolledBack", "Superseded"]);

export function isTerminal(s: RolloutState): boolean {
  return TERMINAL.has(s);
}

/** Rollout strategies a Criticality permits (§11 release interface, Invariant
 *  27). C0/C1 must canary or blue-green; lower Criticality may also roll. */
export function permittedStrategies(c: Criticality): Strategy[] {
  return c === "C0" || c === "C1" ? ["canary", "blue-green"] : ["rolling", "canary", "blue-green"];
}

/** Canary steps for a strategy. Rolling and blue-green are the degenerate
 *  one-step (straight to 100%) cases (§11). */
function stepsFor(strategy: Strategy): number[] {
  return strategy === "canary" ? [10, 50, 100] : [100];
}

export class ReleaseRuntime {
  private versions = new Map<string, string>();
  private active = new Map<string, Rollout>();
  private held = new Set<string>();
  private seq = 0;

  constructor(initial: Record<string, string> = {}) {
    for (const [svc, v] of Object.entries(initial)) this.versions.set(svc, v);
  }

  /** The current healthy running version the runtime holds for a Service. */
  currentVersion(service: string): string {
    return this.versions.get(service) ?? "none";
  }

  /** Seed a Service's running version (e.g. the version first provisioned). */
  seed(service: string, version: string): void {
    this.versions.set(service, version);
  }

  rollout(service: string): Rollout | undefined {
    return this.active.get(service);
  }

  /** The temporal handshake (§11 gate-check): a posture transition or
   *  change-freeze holds the inner loop. Enforced here, at admission — not by
   *  the pipeline politely asking first (Invariant 27). */
  setHold(service: string, on: boolean): void {
    if (on) this.held.add(service);
    else this.held.delete(service);
  }
  gateCheck(service: string): "clear" | "hold" {
    return this.held.has(service) ? "hold" : "clear";
  }

  /** Submit a release. Rejects a strategy the Criticality forbids (loud, the §5
   *  fail-with-the-binding-constraint discipline). Supersedes any in-flight
   *  rollout — latest-wins. */
  release(
    service: string,
    artifact: string,
    strategy: Strategy,
    criticality: Criticality,
  ): Rollout {
    const permitted = permittedStrategies(criticality);
    if (!permitted.includes(strategy)) {
      throw new Error(
        `strategy "${strategy}" not permitted at ${criticality} (Invariant 27): use ${permitted.join(" or ")}`,
      );
    }
    const inflight = this.active.get(service);
    if (inflight && !isTerminal(inflight.state)) {
      inflight.state = "Superseded";
      inflight.reason = "a newer release arrived (latest-wins)";
    }
    const r: Rollout = {
      id: ++this.seq,
      service,
      artifact,
      from: this.currentVersion(service),
      strategy,
      steps: stepsFor(strategy),
      stepIndex: 0,
      share: 0,
      state: "Pending",
      reason: "accepted",
    };
    this.active.set(service, r);
    return r;
  }

  /** Advance the active rollout one tick. `bake` is the team's readiness
   *  contract, consulted in Verifying. */
  step(service: string, bake: Bake): Rollout | undefined {
    const r = this.active.get(service);
    if (!r || isTerminal(r.state)) return r;

    switch (r.state) {
      case "Pending":
        if (this.gateCheck(service) === "hold") {
          r.state = "Blocked";
          r.reason = "gate-check hold — transition or change-freeze in flight";
        } else {
          this.enter(r, "Progressing");
        }
        break;
      case "Blocked":
        if (this.gateCheck(service) === "clear") this.enter(r, "Progressing");
        break;
      case "Progressing":
        r.state = "Verifying";
        r.reason = `baking at ${r.share}%`;
        break;
      case "Verifying":
        if (!bake(r.artifact, r.share)) {
          // Self-revert to last-healthy — the version pointer stays at `from`,
          // so the App Cell is never left Degraded for the outer loop to see.
          r.state = "RolledBack";
          r.reason = `bake failed at ${r.share}% — reverted to ${r.from}`;
        } else if (r.stepIndex >= r.steps.length - 1) {
          r.state = "Healthy";
          r.reason = "promoted to 100%";
          this.versions.set(service, r.artifact); // success hands version to steady state
        } else {
          r.stepIndex++;
          this.enter(r, "Progressing", "step passed — advancing");
        }
        break;
    }
    return r;
  }

  /** Drive the active rollout to a terminal state (sim/test convenience). */
  run(service: string, bake: Bake, max = 20): Rollout | undefined {
    for (let i = 0; i < max; i++) {
      const r = this.step(service, bake);
      if (!r || isTerminal(r.state)) return r;
    }
    return this.active.get(service);
  }

  private enter(r: Rollout, state: "Progressing", note = "introducing"): void {
    r.state = state;
    r.share = r.steps[r.stepIndex];
    r.reason = `${note} ${r.artifact} at ${r.share}%`;
  }
}
