// The control plane managing *itself* (spec §16, §12): the TCB — planner, proof,
// gate, catalog, reconciler — is a Criticality-0 self-environment. A self-upgrade
// is a transition (§10) on that environment, gated at the *highest* bar
// (dual-control / sealed-root), canaried in, and reversible. The hazard is
// circularity: a bad self-upgrade is the one change that can disable the thing
// that would heal it — so recovery is the meta-DR path (re-bootstrap from the
// external seed + a known-good prior generation), never the ordinary loop.

/** The five parts the model's safety concentrates onto (spec §7). */
export type TcbId = "planner" | "proof" | "gate" | "catalog" | "reconciler";

export type TcbState = "Converged" | "Upgrading" | "Bricked";

export interface TcbComponent {
  id: TcbId;
  name: string;
  version: number;
  state: TcbState;
}

export type UpgradePhase = "proposed" | "canary" | "rolled-out" | "bricked";

export interface SelfUpgrade {
  component: TcbId;
  fromVersion: number;
  toVersion: number;
  faulty: boolean; // a faulty upgrade bricks the component at the end of canary
  phase: UpgradePhase;
  canaryPct: number; // 0..100 rollout progress
  approvals: number; // dual-control: needs APPROVALS_REQUIRED
}

export const APPROVALS_REQUIRED = 2; // the highest gate — dual-control (§16)
const CANARY_STEP = 25; // canary advances per tick

const TCB_NAMES: Record<TcbId, string> = {
  planner: "planner",
  proof: "proof",
  gate: "gate",
  catalog: "catalog",
  reconciler: "reconciler",
};

export interface ControlPlaneView {
  components: TcbComponent[];
  pending: SelfUpgrade | null;
  bricked: boolean; // any TCB component is bricked
  loopDown: boolean; // the reconciler is bricked → the workload loop is disabled
}

export class ControlPlane {
  private components: TcbComponent[] = (Object.keys(TCB_NAMES) as TcbId[]).map((id) => ({
    id,
    name: TCB_NAMES[id],
    version: 1,
    state: "Converged",
  }));
  private pending: SelfUpgrade | null = null;
  // The known-good generation to re-bootstrap from (the external seed snapshot).
  private lastGood = new Map<TcbId, number>();

  private get(id: TcbId): TcbComponent {
    return this.components.find((c) => c.id === id)!;
  }

  /** Propose a self-upgrade transition. Only one in flight at a time. */
  propose(id: TcbId, faulty: boolean): boolean {
    if (this.pending) return false;
    const c = this.get(id);
    if (c.state === "Bricked") return false;
    this.pending = {
      component: id,
      fromVersion: c.version,
      toVersion: c.version + 1,
      faulty,
      phase: "proposed",
      canaryPct: 0,
      approvals: 0,
    };
    return true;
  }

  /** A dual-control approval. Returns true once the gate clears and canary opens. */
  approve(): boolean {
    if (this.pending?.phase !== "proposed") return false;
    this.pending.approvals += 1;
    if (this.pending.approvals >= APPROVALS_REQUIRED) {
      this.pending.phase = "canary";
      this.get(this.pending.component).state = "Upgrading";
    }
    return true;
  }

  approvalsRemaining(): number {
    if (!this.pending) return 0;
    return Math.max(0, APPROVALS_REQUIRED - this.pending.approvals);
  }

  /** Advance an in-flight canary; complete it (roll out) or brick it. */
  tick(): void {
    const u = this.pending;
    if (u?.phase !== "canary") return;
    u.canaryPct = Math.min(100, u.canaryPct + CANARY_STEP);
    if (u.canaryPct < 100) return;
    const c = this.get(u.component);
    if (u.faulty) {
      // The one change that can disable the thing that would heal it (§16).
      c.state = "Bricked";
      u.phase = "bricked";
    } else {
      this.lastGood.set(c.id, c.version); // prior good generation, for meta-DR
      c.version = u.toVersion;
      c.state = "Converged";
      u.phase = "rolled-out";
      this.pending = null;
    }
  }

  /** Meta-DR (§12): re-bootstrap a bricked component from the external seed +
   *  its last-good generation. The only recovery — the loop can't heal itself. */
  reBootstrap(): void {
    for (const c of this.components) {
      if (c.state === "Bricked") {
        c.version = this.lastGood.get(c.id) ?? c.version;
        c.state = "Converged";
      }
    }
    this.pending = null;
  }

  /** The reconciler being bricked disables the workload self-heal loop (§16). */
  loopDown(): boolean {
    return this.get("reconciler").state === "Bricked";
  }

  view(): ControlPlaneView {
    return {
      components: this.components.map((c) => ({ ...c })),
      pending: this.pending ? { ...this.pending } : null,
      bricked: this.components.some((c) => c.state === "Bricked"),
      loopDown: this.loopDown(),
    };
  }
}
