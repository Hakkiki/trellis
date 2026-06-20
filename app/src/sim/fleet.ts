// The promotion fleet (spec §11): three environments — dev, staging, prod —
// each a full reconcile loop with its own posture overrides and its own
// simulated cloud. You cut an immutable, validated *version* and promote it
// along the pipeline; each environment instantiates the same version with its
// own Criticality (dev=C3 … prod=C0) and re-plans the path against its own
// observed state. "What you validated is what shipped."

import { type AuditClass, type AuditEntry, type ResourceView, securityTier } from "./engine";
import type { Criticality, Manifest, Posture, Resilience, Tier } from "./model";
import {
  expectedCost,
  type ParityResult,
  parityCheck,
  resourceCost,
  plan as runPlanner,
} from "./planner";
import { Reconciler, type Status } from "./reconcile";
import { SimCloud } from "./sim";

export type EnvId = "dev" | "staging" | "prod";

interface EnvDef {
  id: EnvId;
  label: string;
  criticality: Criticality;
  resilience: Resilience;
  regions: string[];
  budget: number;
  // Utilization tiers (docs: Cost & parity): lower environments park idle
  // capacity more aggressively to save cost, without changing the shape.
  elasticity: Tier;
  dormancy: Tier;
}

// Parity of *shape*: every environment is the same Criticality, resilience, and
// regions (docs: Cost & parity), so what you validate in a lower env is the
// prod topology — not a smaller stand-in. The provisioned ceiling (budget) is
// therefore identical too; environments differ only in how aggressively they
// park idle capacity (the utilization tiers) and the version they run.
const SHAPE = {
  criticality: "C0" as Criticality,
  resilience: "active-active" as Resilience,
  regions: ["us-east-1", "eu-west-1"],
  budget: 12000,
};

const ENV_DEFS: EnvDef[] = [
  {
    id: "dev",
    label: "dev",
    ...SHAPE,
    elasticity: "aggressive",
    dormancy: "aggressive",
  },
  {
    id: "staging",
    label: "staging",
    ...SHAPE,
    elasticity: "balanced",
    dormancy: "balanced",
  },
  {
    id: "prod",
    label: "prod",
    ...SHAPE,
    elasticity: "conservative",
    dormancy: "conservative",
  },
];

interface BaseArtifact {
  intent: string;
  compliance: string[];
}

interface Env {
  def: EnvDef;
  cloud: SimCloud;
  rec: Reconciler;
  manifest: Manifest | null;
  deployedVersion: number;
  statuses: Status[];
  wasConverged: boolean;
}

export interface EnvView {
  id: EnvId;
  label: string;
  criticality: Criticality;
  deployedVersion: number;
  resources: ResourceView[];
  converged: boolean;
  drifted: boolean;
  costNow: number;
  budget: number;
  canPromote: boolean;
  promoteTo: number | null;
}

export interface FleetSnapshot {
  tMs: number;
  base: BaseArtifact;
  latestVersion: number;
  envs: EnvView[];
  audit: AuditEntry[];
  // Parity invariant across the deployed environments (docs: Cost & parity):
  // every env must share the same desired shape — a lower env running a smaller
  // shape is flagged here, not silently accepted as a cost saving.
  parity: ParityResult;
}

const ORDER: EnvId[] = ["dev", "staging", "prod"];

/** A workload is settled per its lifecycle (jobs cycle; services/externals converge). */
function settled(state: string, lifecycle: string): boolean {
  if (lifecycle === "job") return state !== "Failed";
  // Parked capacity (docs: Cost & parity) is a good steady state.
  return state === "Converged" || state === "Dormant";
}

export class Fleet {
  private base: BaseArtifact = { intent: "payments-api", compliance: ["pci-dss", "soc2"] };
  private latestVersion = 0;
  private gen = 0;
  private audit: AuditEntry[] = [];
  private envs: Record<EnvId, Env>;

  constructor() {
    const envs = {} as Record<EnvId, Env>;
    for (const def of ENV_DEFS) {
      const cloud = new SimCloud({ applyLatency: 2 });
      envs[def.id] = {
        def,
        cloud,
        rec: new Reconciler(cloud, { driftPolicy: "enforce", stalenessBudgetMs: 5000 }),
        manifest: null,
        deployedVersion: 0,
        statuses: [],
        wasConverged: false,
      };
    }
    this.envs = envs;
  }

  /** Cut a new immutable version and deploy it to dev (the head of the pipeline). */
  cutVersion() {
    this.latestVersion += 1;
    this.log(
      "Author",
      "release",
      "cut-version",
      `v${this.latestVersion}`,
      "immutable validated artifact created",
    );
    this.deploy("dev", this.latestVersion);
  }

  /** Promote the version in env's predecessor into env, re-planning per environment. */
  promote(target: EnvId) {
    const idx = ORDER.indexOf(target);
    if (idx <= 0) return;
    const source = this.envs[ORDER[idx - 1]];
    if (source.deployedVersion <= this.envs[target].deployedVersion) return;
    this.deploy(target, source.deployedVersion);
    this.log(
      "Author",
      "operator",
      "promote",
      `${ORDER[idx - 1]}→${target}`,
      `version v${source.deployedVersion} (re-planned against ${target} state)`,
    );
  }

  /** Instantiate a version in an environment with that env's posture overrides. */
  private deploy(id: EnvId, version: number) {
    const env = this.envs[id];
    const posture: Posture = {
      intent: this.base.intent,
      criticality: env.def.criticality,
      resilience: env.def.resilience,
      regions: env.def.regions,
      budgetMonthly: env.def.budget,
      optimize: "minimize-cost",
      compliance: this.base.compliance,
      governanceServices: ["load-balancer", "compute", "managed-relational-db"],
      elasticity: env.def.elasticity,
      dormancy: env.def.dormancy,
    };
    this.gen += 1;
    const p = runPlanner(posture, this.gen);
    if (!p.feasible) {
      this.log("Author", "planner", "plan-failed", id, p.failure ?? "infeasible");
      return;
    }
    // Stamp the promoted version onto every resource (the validated artifact).
    for (const r of Object.values(p.manifest.resources)) {
      r.spec.release = `v${version}`;
      if (r.lifecycle === "external") env.cloud.seedExternal(r); // observe-only
    }
    env.manifest = p.manifest;
    env.deployedVersion = version;
    env.wasConverged = false;
  }

  tick() {
    for (const id of ORDER) {
      const env = this.envs[id];
      if (!env.manifest) continue;
      env.statuses = env.rec.step(env.manifest, env.cloud.now());
      const conv =
        env.statuses.length > 0 &&
        env.statuses.every((s) =>
          settled(s.state, env.manifest!.resources[s.id]?.lifecycle ?? "service"),
        );
      if (conv && !env.wasConverged) {
        env.wasConverged = true;
        this.log(
          "Converge",
          "reconciler",
          "converged",
          id,
          `v${env.deployedVersion} live and healthy`,
        );
      }
      if (!conv) env.wasConverged = false;
      env.cloud.tick();
    }
  }

  /** Hand-modify an environment off its version — it should show as Drifted (§11). */
  injectDrift(id: EnvId) {
    const env = this.envs[id];
    const first = env.manifest && Object.values(env.manifest.resources)[0];
    if (first) {
      env.cloud.injectDrift(first.id, (s) => (s.release = "hotfix-unverified"));
      this.log(
        "Observe",
        "human",
        "hand-edit",
        `${id}/${first.id}`,
        "modified off its version → drift",
      );
    }
  }

  failNode(id: EnvId) {
    const env = this.envs[id];
    const apps = env.manifest
      ? Object.values(env.manifest.resources).filter((r) => r.cell === "app")
      : [];
    if (apps[0]) {
      env.cloud.failNode(apps[0].id);
      this.log(
        "Observe",
        "fault",
        "node-failure",
        `${id}/${apps[0].id}`,
        "node died — self-heal expected",
      );
    }
  }

  snapshot(): FleetSnapshot {
    const envs: EnvView[] = ORDER.map((id, idx) => {
      const env = this.envs[id];
      const stById = new Map(env.statuses.map((s) => [s.id, s.state]));
      const resources: ResourceView[] = env.manifest
        ? Object.values(env.manifest.resources).map((r) => ({
            id: r.id,
            service: r.service,
            region: r.region,
            cell: r.cell,
            kind: r.kind,
            lifecycle: r.lifecycle,
            size: r.spec.size,
            replicas: Number(r.spec.replicas ?? "1"),
            state: stById.get(r.id) ?? "Unknown",
            monthlyCost: resourceCost(r),
            billedCost: resourceCost(r),
            costDrifted: false,
            security: securityTier(
              r.cell,
              r.lifecycle,
              env.def.criticality === "C2" || env.def.criticality === "C3",
              true,
            ),
          }))
        : [];
      const source = idx > 0 ? this.envs[ORDER[idx - 1]] : null;
      const promoteTo = idx === 0 ? this.latestVersion : source!.deployedVersion;
      return {
        id,
        label: env.def.label,
        criticality: env.def.criticality,
        deployedVersion: env.deployedVersion,
        resources,
        converged: resources.length > 0 && resources.every((r) => settled(r.state, r.lifecycle)),
        drifted: resources.some((r) => r.state === "Drifted"),
        // Expected (tier-discounted) spend: same shape everywhere, but a more
        // aggressive env bills less for it (docs: Cost & parity).
        costNow: env.manifest ? Math.round(expectedCost(env.manifest, env.def)) : 0,
        budget: env.def.budget,
        canPromote: promoteTo > env.deployedVersion,
        promoteTo: promoteTo > env.deployedVersion ? promoteTo : null,
      };
    });
    // Parity invariant across whatever is deployed: same desired shape in every
    // environment (docs: Cost & parity, guardrail 2).
    const deployed = ORDER.map((id) => this.envs[id]).filter(
      (e): e is Env & { manifest: Manifest } => e.manifest !== null,
    );
    const parity = parityCheck(deployed.map((e) => ({ id: e.def.id, manifest: e.manifest })));
    return {
      tMs: this.envs.dev.cloud.now(),
      base: this.base,
      latestVersion: this.latestVersion,
      envs,
      audit: this.audit.slice(-60),
      parity,
    };
  }

  private log(cls: AuditClass, actor: string, verb: string, target: string, reason: string) {
    this.audit.push({ tMs: this.envs.dev.cloud.now(), cls, actor, verb, target, reason });
  }
}
