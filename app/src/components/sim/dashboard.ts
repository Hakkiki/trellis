// Mini "executive" dashboard (the role-tiered bottom line). The simulator shows
// engineers the topology + proof; an exec, a division leader, or a service team
// each needs a different *bottom line* over the same Structure. This is a pure,
// recomputable projection of the engine snapshot — same source of truth, three
// altitudes — consumed by the always-on KPI strip and the role-switcher panel.

import type { EngineSnapshot, ResourceView, ServiceRollup } from "@/sim/engine";
import type { State } from "@/sim/state";

export type RoleTier = "exec" | "division" | "team";

export interface TierMeta {
  id: RoleTier;
  /** The audience this lens speaks to. */
  label: string;
  /** The roles.md personas that read at this altitude (§roles). */
  personas: string;
}

/** The three altitudes, mapped to the nine personas from docs/roles.md. */
export const TIERS: TierMeta[] = [
  { id: "exec", label: "CEO / CIO", personas: "Platform Owner · Security · FinOps · Auditor" },
  { id: "division", label: "Division leader", personas: "Division lead · Platform Operator" },
  { id: "team", label: "Teams", personas: "Service team · Break-glass · Vendor" },
];

/** Severity tone — drives color without leaking the State palette into the data. */
export type Tone = "good" | "warn" | "bad" | "neutral";

export interface Metric {
  label: string;
  value: string;
  tone: Tone;
  /** 0–100 → render a progress bar; omit for a plain figure. */
  pct?: number;
}

export interface TierView {
  title: string;
  /** Worst-of state at this altitude — colors the status dot. */
  state: State;
  metrics: Metric[];
}

/** The always-on headline (the KPI strip): one read, same for every audience. */
export interface Headline {
  state: State;
  spend: string;
  spendPct: number;
  breach: boolean;
  convergedPct: number;
  incidents: number;
}

// ---- shared derivations ---------------------------------------------------

/** Managed workloads roll up health (§4): Services + Stateful; Jobs/External excluded. */
const managed = (rs: ResourceView[]) =>
  rs.filter((r) => r.lifecycle === "service" || r.lifecycle === "stateful");

function convergedPct(rs: ResourceView[]): number {
  const m = managed(rs);
  if (!m.length) return 0;
  return Math.round((m.filter((r) => r.state === "Converged").length / m.length) * 100);
}

function spendPctOf(billed: number, budget: number): number {
  return budget > 0 ? Math.round((billed / budget) * 100) : 0;
}

/** Reliability tone — healthy ≥95%, watch ≥80%, else act. */
function relTone(pct: number): Tone {
  return pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
}

/** Spend tone — a live breach is bad, ≥90% of budget is a warning. */
function spendTone(pct: number, breach: boolean): Tone {
  return breach ? "bad" : pct >= 90 ? "warn" : "good";
}

const flag = (n: number, bad = false): Tone => (n > 0 ? (bad ? "bad" : "warn") : "good");

/** The headline numbers behind the KPI strip. */
export function headline(snap: EngineSnapshot): Headline {
  const spendPct = spendPctOf(snap.billedNow, snap.budget);
  return {
    state: snap.envRollup,
    spend: `$${snap.billedNow} / $${snap.budget}`,
    spendPct,
    breach: snap.budgetBreach,
    convergedPct: convergedPct(snap.resources),
    incidents: snap.incidents.length,
  };
}

/** Which Service the Teams lens speaks for: the focused one, else the worst-of. */
export function teamFocus(snap: EngineSnapshot, focusSlug: string | null): ServiceRollup | null {
  const rollups = snap.serviceRollups;
  if (!rollups.length) return null;
  if (focusSlug && focusSlug !== "all") {
    const hit = rollups.find((r) => r.slug === focusSlug);
    if (hit) return hit;
  }
  return rollups.find((r) => r.state !== "Converged") ?? rollups[0];
}

/** The bottom line at one altitude. `focusSlug` ties the Teams lens to the
 *  topology's service focus (null/"all" → surface the service that needs attention). */
export function tierView(snap: EngineSnapshot, tier: RoleTier, focusSlug: string | null): TierView {
  const { resources, serviceRollups, billedNow, budget } = snap;
  const spendPct = spendPctOf(billedNow, budget);
  const relPct = convergedPct(resources);

  if (tier === "exec") {
    const atRisk = resources.filter((r) => r.security === "at-risk").length;
    const exposed = resources.filter((r) => r.security === "exposed").length;
    const drifted = resources.filter((r) => r.state === "Drifted").length;
    const critAtRisk = serviceRollups.filter(
      (r) => (r.criticality === "C0" || r.criticality === "C1") && r.state !== "Converged",
    ).length;
    return {
      title: "Estate posture",
      state: snap.envRollup,
      metrics: [
        {
          label: "Spend vs budget",
          value: `$${billedNow} / $${budget}`,
          pct: spendPct,
          tone: spendTone(spendPct, snap.budgetBreach),
        },
        { label: "Reliability", value: `${relPct}% converged`, pct: relPct, tone: relTone(relPct) },
        { label: "Risk", value: `${critAtRisk} C0/C1 at-risk`, tone: flag(critAtRisk) },
        { label: "Exposure", value: `${atRisk} at-risk · ${exposed} exposed`, tone: flag(atRisk) },
        { label: "Governance", value: `signed · ${drifted} drift`, tone: flag(drifted) },
      ],
    };
  }

  if (tier === "division") {
    const offTarget = serviceRollups.filter((r) => r.state !== "Converged").length;
    const pendingApproval = snap.plan?.feasible && snap.plan.generation > snap.appliedGen ? 1 : 0;
    const approvals =
      pendingApproval > 0
        ? `${pendingApproval} awaiting`
        : snap.changeFreeze
          ? "freeze on"
          : "clear";
    return {
      title: "Division operations",
      state: snap.envRollup,
      metrics: [
        {
          label: "Budget headroom",
          value: `$${billedNow} / $${budget}`,
          pct: spendPct,
          tone: spendTone(spendPct, snap.budgetBreach),
        },
        { label: "Convergence", value: `${relPct}%`, pct: relPct, tone: relTone(relPct) },
        {
          label: "Incidents",
          value: `${snap.incidents.length} stalled`,
          tone: flag(snap.incidents.length, true),
        },
        {
          label: "Approvals",
          value: approvals,
          tone: pendingApproval > 0 || snap.changeFreeze ? "warn" : "good",
        },
        {
          label: "Services",
          value: `${serviceRollups.length} · ${offTarget} off-target`,
          tone: flag(offTarget),
        },
      ],
    };
  }

  // team
  const svc = teamFocus(snap, focusSlug);
  if (!svc) {
    return { title: "No service", state: "Unknown", metrics: [] };
  }
  const own = managed(resources.filter((r) => r.service === svc.slug));
  const conv = own.filter((r) => r.state === "Converged").length;
  const drifted = own.filter((r) => r.state === "Drifted").length;
  const healthPct = own.length ? Math.round((conv / own.length) * 100) : 0;
  const costDrift = svc.billedCost > svc.monthlyCost;
  return {
    title: svc.service,
    state: svc.state,
    metrics: [
      {
        label: "Health",
        value: `${conv}/${own.length} healthy`,
        pct: healthPct,
        tone: relTone(healthPct),
      },
      { label: "Drift", value: `${drifted} drifted`, tone: flag(drifted) },
      {
        label: "My cost",
        value: costDrift
          ? `$${svc.billedCost} (plan $${svc.monthlyCost})`
          : `$${svc.billedCost}/mo`,
        tone: costDrift ? "warn" : "good",
      },
      { label: "Last deploy", value: `gen ${snap.appliedGen}`, tone: "neutral" },
      { label: "Criticality", value: svc.criticality, tone: "neutral" },
    ],
  };
}
