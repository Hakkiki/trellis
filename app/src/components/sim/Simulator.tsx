import {
  Activity,
  AlertTriangle,
  Boxes,
  Check,
  CircleSlash,
  Clock,
  Cloud,
  Compass,
  Cpu,
  Database,
  DollarSign,
  Eye,
  Gauge,
  Layers,
  Moon,
  Network,
  Server,
  ShieldAlert,
  Siren,
  Snowflake,
  TrendingDown,
  Wrench,
  Zap,
} from "lucide-react";
import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  APPROVALS_REQUIRED,
  type ControlPlaneView,
  type TcbId,
  type TcbState,
} from "@/sim/control";
import {
  type AuditEntry,
  DEFAULT_POSTURE,
  Engine,
  type EngineSnapshot,
  type Incident,
  type ResourceView,
  type RightSizingProposal,
  type ServiceRollup,
  type ServiceValue,
} from "@/sim/engine";
import {
  type BudgetPolicy,
  type CellKind,
  type Criticality,
  type Kind,
  type Posture,
  type Resilience,
  type ServiceSpec,
  servicesOf,
  type Tier,
} from "@/sim/model";
import { isSize, SIZE_CAPACITY } from "@/sim/rightsizing";
import { ALL_STATES, type State, stateColorVar } from "@/sim/state";
import { clearSession, loadSession, saveSession } from "@/sim/store";
import Stage3D from "./Stage3D";
import { startTour } from "./tour";
import {
  costColor,
  HEALTH_BUCKETS,
  healthColor,
  SECURITY_TIERS,
  securityColor,
  VIEW_LABELS,
  type ViewMode,
  viewColor,
} from "./views";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ALL_REGIONS = ["us-east-1", "eu-west-1", "ap-south-1"];
const CRITS: Criticality[] = ["C0", "C1", "C2", "C3"];
const TIER_OPTS: [string, string][] = [
  ["conservative", "conservative"],
  ["balanced", "balanced"],
  ["aggressive", "aggressive"],
];
const ALL_SERVICES: { kind: Kind; label: string }[] = [
  { kind: "load-balancer", label: "load balancer" },
  { kind: "compute", label: "compute" },
  { kind: "managed-relational-db", label: "managed DB" },
];

function resourceIcon(r: ResourceView) {
  if (r.lifecycle === "job") return Clock;
  if (r.lifecycle === "external") return Cloud;
  if (r.lifecycle === "stateful") return Layers;
  if (r.cell === "edge") return Network;
  if (r.cell === "data") return Database;
  return Server;
}

function resourceSub(r: ResourceView) {
  if (r.lifecycle === "job") return "batch-job · nightly";
  if (r.lifecycle === "external") return "external SaaS · observe-only";
  if (r.lifecycle === "stateful") return `stateful broker · ${r.detail ?? "quorum"}`;
  return `${r.kind} · ${r.size}${r.cell === "app" ? ` · ${r.replicas}×` : ""}`;
}

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Seed illustrative demand + utilization so the Cost & value panel is alive out
// of the box: ~35% utilization (so a high-Criticality service shows a right-size
// proposal) and demand at ~35% of serving capacity (comfortably served, SLO ~1).
function seedTelemetry(e: Engine) {
  const snap = e.snapshot();
  const capBySlug = new Map<string, number>();
  for (const r of snap.resources) {
    if (!isSize(r.size)) continue;
    const cap = SIZE_CAPACITY[r.size].cpu;
    e.setLoad(r.id, { cpu: 0.35 * cap, mem: 0.35 * cap });
    if (r.kind === "compute") {
      capBySlug.set(r.service, (capBySlug.get(r.service) ?? 0) + cap * r.replicas);
    }
  }
  for (const s of snap.serviceRollups) {
    const cap = capBySlug.get(s.slug) ?? 0;
    if (cap > 0) e.setDemand(s.service, Math.max(1, Math.round(cap * 0.35)));
  }
}

export default function Simulator() {
  const engineRef = React.useRef<Engine | null>(null);
  const [snap, setSnap] = React.useState<EngineSnapshot | null>(null);
  const [running, setRunning] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<Posture>(DEFAULT_POSTURE);
  const [layout, setLayout] = React.useState<"stage" | "grid">("stage");
  const [view, setView] = React.useState<ViewMode>("state");
  const [cpTarget, setCpTarget] = React.useState<TcbId>("reconciler");
  // Topology service focus: "all" = grouped overview; a slug drills into one service.
  const [serviceFocus, setServiceFocus] = React.useState<string>("all");
  // Seed demand/utilization once resources are live (load needs the sim resource
  // to exist, which only happens after the first converge).
  const seededRef = React.useRef(false);

  const refresh = React.useCallback(() => {
    if (engineRef.current) setSnap(engineRef.current.snapshot());
  }, []);

  // Init + restore from IndexedDB.
  React.useEffect(() => {
    const e = new Engine(DEFAULT_POSTURE);
    engineRef.current = e;
    let cancelled = false;
    loadSession().then((s) => {
      if (cancelled || !s) {
        refresh();
        return;
      }
      // Merge over defaults so a session saved before newer posture fields
      // existed (e.g. governanceServices) doesn't render the form with missing
      // keys — that would crash on first access.
      const posture: Posture = { ...DEFAULT_POSTURE, ...s.posture };
      // A session saved before multi-service existed: synthesize its single
      // Service from the legacy intent/criticality rather than inheriting the
      // default two.
      if (!s.posture.services?.length) {
        posture.services = [
          { name: s.posture.intent ?? DEFAULT_POSTURE.intent, criticality: posture.criticality },
        ];
      }
      setForm(posture);
      e.hydrate(s.audit);
      e.declare(posture);
      if (s.applied) {
        e.approve();
        // Restore the live running version(s) so a reload doesn't reset to v1.
        if (s.deploy) e.restoreDeploy(s.deploy);
        seededRef.current = false; // demand/load aren't persisted — re-seed once live
        setRunning(true);
      }
      refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Reconcile clock.
  React.useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const e = engineRef.current;
      const settled = e?.tick() ?? false;
      // Once the env is first live, seed illustrative demand/utilization so the
      // Value tab is alive (load only sticks once the sim resources exist).
      if (e && !seededRef.current && e.snapshot().converged) {
        seedTelemetry(e);
        seededRef.current = true;
      }
      refresh();
      // A deploy settled this tick (running version advanced / rollout finished):
      // persist so a reload restores the live running version, not v1.
      if (settled && e) {
        void saveSession({
          posture: e.getPosture(),
          applied: true,
          audit: e.snapshot().audit,
          savedAt: Date.now(),
          deploy: e.deployState(),
        });
      }
    }, 650);
    return () => clearInterval(iv);
  }, [running, refresh]);

  const persist = React.useCallback((applied: boolean) => {
    const e = engineRef.current;
    if (!e) return;
    void saveSession({
      posture: e.getPosture(),
      applied,
      audit: e.snapshot().audit,
      savedAt: Date.now(),
      deploy: e.deployState(),
    });
  }, []);

  const onPlan = () => {
    setRunning(false);
    engineRef.current?.declare(form);
    persist(false);
    refresh();
  };
  const onApprove = () => {
    const e = engineRef.current;
    if (!e?.approve()) return;
    seededRef.current = false; // re-seed the Value tab once the env converges
    setRunning(true);
    persist(true);
    refresh();
  };
  const act = (fn: (e: Engine) => void, applied = true) => {
    if (!engineRef.current) return;
    fn(engineRef.current);
    persist(applied);
    refresh();
  };

  // Reset to a clean slate: clear saved state and start from the default posture.
  const resetAll = () => {
    void clearSession();
    engineRef.current = new Engine(DEFAULT_POSTURE);
    seededRef.current = false;
    setForm(DEFAULT_POSTURE);
    setRunning(false);
    setSelected(null);
    setServiceFocus("all");
    setView("state");
    setLayout("stage");
    refresh();
  };

  const plan = snap?.plan ?? null;
  const phase = snap?.phase ?? "empty";
  const resources = snap?.resources ?? [];
  const sel = resources.find((r) => r.id === selected) ?? resources[0] ?? null;
  const frozenIds = new Set(resources.filter((r) => r.state === "Frozen").map((r) => r.id));
  const regionState: Record<string, State> = Object.fromEntries(
    (snap?.regionRollups ?? []).map((r) => [r.region, r.state]),
  );

  return (
    <div className="dark text-foreground space-y-4">
      <Guide onTour={startTour} onReset={resetAll} />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr_340px]">
        {/* ---- Left: Posture ---- */}
        <Card id="tour-posture" className="h-fit min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Boxes className="size-4 text-primary" /> Posture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Field label="Services — owned by this environment">
              <ServicesEditor
                services={servicesOf(form)}
                onChange={(services) => setForm({ ...form, services })}
              />
            </Field>
            <Field label="Resilience">
              <Select
                value={form.resilience}
                onChange={(v) => setForm({ ...form, resilience: v as Resilience })}
                options={[
                  ["active-active", "active-active"],
                  ["active-passive", "active-passive"],
                  ["single", "single"],
                ]}
              />
            </Field>
            <Field label="Regions">
              <div className="space-y-1">
                {ALL_REGIONS.map((r) => {
                  const on = form.regions.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() =>
                        setForm({
                          ...form,
                          regions: on ? form.regions.filter((x) => x !== r) : [...form.regions, r],
                        })
                      }
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-xs transition",
                        on
                          ? "border-primary bg-primary/15"
                          : "border-input text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <span>{r}</span>
                      {on && <span className="text-primary">●</span>}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={`Budget — $${form.budgetMonthly}/mo`}>
              <input
                type="range"
                min={500}
                max={20000}
                step={500}
                value={form.budgetMonthly}
                onChange={(e) => setForm({ ...form, budgetMonthly: Number(e.target.value) })}
                className="w-full accent-[var(--primary)]"
              />
            </Field>
            <Field label="On budget-breach">
              <Select
                value={form.budgetPolicy ?? "alert"}
                onChange={(v) => setForm({ ...form, budgetPolicy: v as BudgetPolicy })}
                options={[
                  ["alert", "alert only"],
                  ["block", "block provisioning"],
                ]}
              />
            </Field>
            <Field label="Optimize">
              <Select
                value={form.optimize}
                onChange={(v) => setForm({ ...form, optimize: v as Posture["optimize"] })}
                options={[
                  ["minimize-cost", "minimize cost"],
                  ["maximize-resilience", "maximize resilience"],
                ]}
              />
            </Field>
            <Field label="Cost levers — how eagerly idle capacity is parked">
              <div id="tour-tiers" className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-muted-foreground mb-1 text-[11px]">
                    elasticity · stateless
                  </div>
                  <Select
                    value={form.elasticity ?? "conservative"}
                    onChange={(v) => setForm({ ...form, elasticity: v as Tier })}
                    options={TIER_OPTS}
                  />
                </div>
                <div>
                  <div className="text-muted-foreground mb-1 text-[11px]">dormancy · stateful</div>
                  <Select
                    value={form.dormancy ?? "conservative"}
                    onChange={(v) => setForm({ ...form, dormancy: v as Tier })}
                    options={TIER_OPTS}
                  />
                </div>
              </div>
            </Field>
            <Field label="Governance — allowed services">
              <div className="flex flex-wrap gap-1.5">
                {ALL_SERVICES.map((s) => {
                  const allowed = form.governanceServices ?? [];
                  const on = allowed.includes(s.kind);
                  return (
                    <button
                      key={s.kind}
                      onClick={() =>
                        setForm({
                          ...form,
                          governanceServices: on
                            ? allowed.filter((k) => k !== s.kind)
                            : [...allowed, s.kind],
                        })
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] transition",
                        on
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-input text-muted-foreground line-through",
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div id="tour-plan" className="flex flex-col gap-2 pt-1">
              <Button onClick={onPlan} variant="secondary" className="w-full">
                Plan
              </Button>
              <Button
                onClick={onApprove}
                disabled={
                  !plan?.feasible ||
                  snap?.canProvision === false ||
                  (phase === "applied" && (plan?.generation ?? 0) <= (snap?.appliedGen ?? 0))
                }
                className="w-full"
              >
                {phase === "applied" && (plan?.generation ?? 0) > (snap?.appliedGen ?? 0)
                  ? "Approve transition"
                  : "Approve & apply"}
              </Button>
              {snap?.canProvision === false && (
                <p className="text-destructive text-[11px]">
                  Provisioning blocked — budget breached under a block policy (§13). Reconcile the
                  cost drift to continue.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ---- Center: Topology + events ---- */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Activity className="size-3" /> {fmtClock(snap?.tMs ?? 0)}
            </Badge>
            <Badge variant={phase === "applied" ? "default" : "secondary"}>{phase}</Badge>
            {phase === "applied" && (
              <Badge variant={snap?.converged ? "outline" : "secondary"} className="gap-1">
                {snap?.converged ? "converged & holding" : "reconciling…"}
              </Badge>
            )}
            {phase === "applied" && snap && (
              <Badge
                variant="outline"
                className="gap-1.5"
                title={snap.envNote}
                style={{ borderColor: stateColorVar(snap.envRollup) }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    background: stateColorVar(snap.envRollup),
                    boxShadow: `0 0 6px ${stateColorVar(snap.envRollup)}`,
                  }}
                />
                env · {snap.envRollup}
              </Badge>
            )}
            {phase === "applied" && (
              <div className="ml-auto flex items-center gap-3 text-xs">
                <button
                  onClick={() => act((e) => e.setChangeFreeze(!snap?.changeFreeze))}
                  className={cn(
                    "rounded-md border px-2 py-1",
                    snap?.changeFreeze
                      ? "border-[var(--state-frozen)] text-foreground"
                      : "border-input text-muted-foreground hover:text-foreground",
                  )}
                >
                  {snap?.changeFreeze ? "❄ freeze on" : "change freeze"}
                </button>
                <button
                  onClick={() => setRunning((r) => !r)}
                  className="text-muted-foreground hover:text-foreground underline"
                >
                  {running ? "pause loop" : "resume loop"}
                </button>
              </div>
            )}
            {phase === "applied" && (
              <div
                id="tour-views"
                className="flex flex-wrap gap-1"
                title="recolor the topology by lens — a read-only View (§13)"
              >
                {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs capitalize",
                      view === v
                        ? "border-primary text-foreground"
                        : "border-input text-muted-foreground",
                    )}
                  >
                    {VIEW_LABELS[v]}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              {(["stage", "grid"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setLayout(v)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs capitalize",
                    layout === v
                      ? "border-primary text-foreground"
                      : "border-input text-muted-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {phase === "empty" && <EmptyState onPlan={onPlan} />}

          {phase !== "empty" && plan && !plan.feasible && (
            <Card className="border-destructive/50">
              <CardContent className="flex gap-3 pt-6 text-sm">
                <CircleSlash className="text-destructive mt-0.5 size-5 shrink-0" />
                <div>
                  <div className="text-destructive font-semibold">
                    Plan failed loudly — no magic
                  </div>
                  <p className="text-muted-foreground mt-1">{plan.failure}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {phase === "applied" && (
            <Topology
              resources={resources}
              regionState={regionState}
              envNote={snap!.envNote}
              rollups={snap!.serviceRollups}
              focus={serviceFocus}
              onFocus={(slug) => {
                setServiceFocus(slug);
                if (slug !== "all") {
                  const first = resources.find((r) => r.service === slug);
                  if (first) setSelected(first.id);
                }
              }}
              selected={sel?.id ?? null}
              onSelect={setSelected}
              layout={layout}
              view={view}
              frozenIds={frozenIds}
              budget={snap!.budget}
              costNow={snap!.costNow}
              billedNow={snap!.billedNow}
            />
          )}

          {phase === "applied" && (
            <Card id="tour-inject">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs tracking-wide uppercase">Inject reality</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <EventButton
                  icon={AlertTriangle}
                  label="Fail node"
                  hint={sel?.id}
                  onClick={() => sel && act((e) => e.failNode(sel.id))}
                />
                <EventButton
                  icon={Eye}
                  label="Inject drift"
                  hint={sel?.id}
                  onClick={() => sel && act((e) => e.injectDrift(sel.id))}
                />
                <EventButton
                  icon={Zap}
                  label="Region outage"
                  hint={sel?.region}
                  onClick={() => sel && act((e) => e.regionOutage(sel.region))}
                />
                <EventButton
                  icon={CircleSlash}
                  label="Telemetry loss"
                  hint={sel?.id}
                  onClick={() => sel && act((e) => e.setStale(sel.id, true))}
                />
                <EventButton
                  icon={Wrench}
                  label="Hard failure"
                  hint={sel?.id}
                  onClick={() => sel && act((e) => e.hardFailure(sel.id))}
                />
                <EventButton
                  icon={Moon}
                  label={sel?.state === "Dormant" ? "Wake" : "Park (idle)"}
                  hint={sel?.id}
                  onClick={() =>
                    sel && act((e) => (sel.state === "Dormant" ? e.wake(sel.id) : e.park(sel.id)))
                  }
                />
                <EventButton
                  icon={Database}
                  label="Cold resume"
                  hint={sel?.id}
                  onClick={() => sel && act((e) => e.coldResume(sel.id))}
                />
                <EventButton
                  icon={sel?.costDrifted ? Wrench : DollarSign}
                  label={sel?.costDrifted ? "Reconcile cost" : "Cost spike"}
                  hint={sel?.id}
                  onClick={() =>
                    sel &&
                    act((e) => (sel.costDrifted ? e.resolveCost(sel.id) : e.costSpike(sel.id)))
                  }
                />
                <EventButton
                  icon={
                    engineRef.current && sel && engineRef.current.isFrozen(sel.id)
                      ? Snowflake
                      : ShieldAlert
                  }
                  label={
                    engineRef.current && sel && engineRef.current.isFrozen(sel.id)
                      ? "Ratify (repay)"
                      : "Break-glass"
                  }
                  hint={sel?.id}
                  onClick={() =>
                    sel &&
                    act((e) => (e.isFrozen(sel.id) ? e.ratify(sel.id) : e.breakGlass(sel.id)))
                  }
                />
              </CardContent>
              {sel && (
                <div
                  id="tour-breakglass"
                  className="border-border/60 mx-6 mb-4 rounded-md border border-dashed px-3 py-2 text-[11px] leading-relaxed"
                >
                  {frozenIds.has(sel.id) ? (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-[var(--state-frozen)]">
                        Frozen by break-glass
                      </span>{" "}
                      — reconciliation suspended, debt owed. Ratify to repay through the Author gate
                      (§7).
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">Before you break glass</span> —
                      the loop believes{" "}
                      <span
                        className="rounded px-1 py-0.5 text-[9px]"
                        style={{ background: stateColorVar(sel.state), color: "#15110d" }}
                      >
                        {sel.state}
                      </span>{" "}
                      {sel.reconcilerReason ? `(${sel.reconcilerReason}) ` : ""}converging toward
                      gen {snap?.appliedGen}. Decide on evidence, not panic (§13).
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          {phase === "applied" && snap?.changeFreeze && (
            <Card className="border-[var(--state-frozen)]">
              <CardContent className="flex items-center gap-3 pt-6 text-sm">
                <Snowflake className="size-5 shrink-0 text-[var(--state-frozen)]" />
                <div className="flex-1">
                  <div className="font-semibold">Change freeze active</div>
                  <p className="text-muted-foreground">
                    Non-emergency Converge actions are held (§9). Drift is recorded but not
                    corrected; break-glass still overrides per-resource.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => act((e) => e.setChangeFreeze(false))}
                >
                  Lift freeze
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === "applied" && snap?.blastTripped && !snap?.changeFreeze && (
            <Card className="border-destructive">
              <CardContent className="flex items-center gap-3 pt-6 text-sm">
                <Zap className="text-destructive size-5 shrink-0" />
                <div className="flex-1">
                  <div className="text-destructive font-semibold">Blast-radius breaker tripped</div>
                  <p className="text-muted-foreground">
                    A single pass would remediate a large share of the fleet — halted and paging
                    instead of mass-stomping (§9). Review, then proceed.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => act((e) => e.acknowledgeBlast())}
                >
                  Proceed once
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === "applied" && snap?.budgetBreach && (
            <Card className="border-destructive">
              <CardContent className="flex items-center gap-3 pt-6 text-sm">
                <DollarSign className="text-destructive size-5 shrink-0" />
                <div className="flex-1">
                  <div className="text-destructive font-semibold">
                    Budget breach — billed ${snap.billedNow} / ${snap.budget}/mo
                  </div>
                  <p className="text-muted-foreground">
                    Cost drift (billed ≫ planned) pushed spend over budget (§13).{" "}
                    {snap.budgetPolicy === "block"
                      ? "Policy: block — further provisioning is held until reconciled."
                      : "Policy: alert — provisioning continues; on-call is paged."}{" "}
                    Reconcile the cost-drifted resource to clear it.
                  </p>
                </div>
                {(() => {
                  const drifted = resources.find((r) => r.costDrifted);
                  return drifted ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act((e) => e.resolveCost(drifted.id))}
                    >
                      Reconcile cost
                    </Button>
                  ) : null;
                })()}
              </CardContent>
            </Card>
          )}

          {phase === "applied" && (snap?.walletGuard.length ?? 0) > 0 && (
            <Card className="border-destructive">
              <CardContent className="flex items-center gap-3 pt-6 text-sm">
                <DollarSign className="text-destructive size-5 shrink-0" />
                <div className="flex-1">
                  <div className="text-destructive font-semibold">
                    Denial-of-wallet guard tripped
                  </div>
                  <p className="text-muted-foreground">
                    Resume thrash detected — {snap!.walletGuard.length} resource(s) pinned warm to
                    cap cost, because churn costs more than a warm floor (guardrail 7). Resolve once
                    the churn stops.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    act((e) => {
                      for (const id of snap!.walletGuard) e.resolveWalletGuard(id);
                    })
                  }
                >
                  Resolve
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === "applied" &&
            ((snap?.incidents.length ?? 0) > 0 ||
              (snap?.frozenDebts.length ?? 0) > 0 ||
              snap?.breakGlassSignal.noisy) && (
              <IncidentSurface
                incidents={snap!.incidents}
                frozen={snap!.frozenDebts}
                breakGlass={snap!.breakGlassSignal}
                onResolve={(id) => act((e) => e.resolveIncident(id))}
                onRatify={(id) => act((e) => e.ratify(id))}
                onSelect={setSelected}
              />
            )}

          {phase === "applied" && snap && (
            <ControlPlanePanel
              cp={snap.controlPlane}
              target={cpTarget}
              onTarget={setCpTarget}
              onPropose={(faulty) => act((e) => e.proposeSelfUpgrade(cpTarget, faulty))}
              onApprove={() => act((e) => e.approveSelfUpgrade())}
              onReBootstrap={() => act((e) => e.reBootstrap())}
            />
          )}
        </div>

        {/* ---- Right: Proof + audit ---- */}
        <Card className="h-fit min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Plan = proof</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="proof">
              <TabsList className="w-full">
                <TabsTrigger value="proof" className="flex-1">
                  Proof
                </TabsTrigger>
                <TabsTrigger id="tour-owners" value="owners" className="flex-1">
                  Owners
                </TabsTrigger>
                <TabsTrigger id="tour-effectiveness" value="value" className="flex-1">
                  Value
                </TabsTrigger>
                <TabsTrigger value="audit" className="flex-1">
                  Audit
                </TabsTrigger>
              </TabsList>
              <TabsContent value="proof" className="mt-3">
                <ProofPanel snap={snap} selectedId={sel?.id ?? null} />
              </TabsContent>
              <TabsContent value="owners" className="mt-3">
                <OwnersPanel
                  rollups={snap?.serviceRollups ?? []}
                  budget={snap?.budget ?? 0}
                  envRollup={snap?.envRollup ?? "Unknown"}
                  selectedSlug={sel?.service ?? null}
                  onSelect={(slug) => {
                    const first = resources.find((r) => r.service === slug);
                    if (first) setSelected(first.id);
                  }}
                  onShip={(slug, broken) => act((e) => e.ship(slug, broken))}
                />
              </TabsContent>
              <TabsContent value="value" className="mt-3">
                <EffectivenessPanel
                  value={snap?.value ?? []}
                  costPerValue={snap?.costPerValue ?? null}
                  rightSizing={snap?.rightSizing ?? []}
                  onAccept={(slug) => act((e) => e.acceptRightSizing(slug))}
                  onDemand={(service, n) => act((e) => e.setDemand(service, n))}
                />
              </TabsContent>
              <TabsContent value="audit" className="mt-3">
                <AuditPanel audit={snap?.audit ?? []} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Guide({ onTour, onReset }: { onTour: () => void; onReset: () => void }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Compass className="text-primary size-4" /> New here? Start with the guide.
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onReset}
              title="Clear saved state and start over"
            >
              Reset
            </Button>
            <Button size="sm" variant="secondary" onClick={onTour}>
              Take the tour
            </Button>
          </div>
        </div>
        <Accordion type="single" collapsible className="text-sm">
          <AccordionItem value="what">
            <AccordionTrigger>What is this?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-2">
              <p>
                Trellis turns a short declaration of intent — a <b>Posture</b> — into running
                infrastructure, then keeps it that way. You declare what you want. The planner
                writes a plan that doubles as its own proof. You approve it. A reconcile loop drives
                reality to match and holds it there.
              </p>
              <p>
                The cloud here is simulated, but the dynamics are real: applies take time, nodes
                fail, telemetry goes stale, and bills drift. Everything you do persists in your
                browser — reload and it's still here.
              </p>
              <p>
                This page is <b>one environment, up close</b>. To watch a validated version travel
                dev → staging → prod, open the{" "}
                <a href={`${BASE}/promotion`} className="text-primary underline underline-offset-2">
                  Release pipeline
                </a>{" "}
                — it's the same loop, zoomed out.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="how">
            <AccordionTrigger>How to drive it</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  Edit the <b>Posture</b> on the left — services and their criticality, resilience,
                  regions, budget, and the <b>cost levers</b> (elasticity · dormancy).
                </li>
                <li>
                  Click <b>Plan</b> to compile it, then read the proof on the right.
                </li>
                <li>
                  Click <b>Approve &amp; apply</b> to start the loop and watch it converge.
                </li>
                <li>
                  Use <b>Inject reality</b> to break things (or <b>Park</b> a resource to scale it
                  to zero), and watch the loop heal, hold, or raise an incident.
                </li>
                <li>
                  Open the <b>Value</b> tab for cost ÷ value served, and accept a{" "}
                  <b>right-sizing</b> proposal to make a service cheaper for the same workload.
                </li>
                <li>
                  Switch the <b>lens</b> (state · cost · health · security) and open <b>Owners</b>.
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="batteries">
            <AccordionTrigger>What's included</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              <p className="mb-2">Batteries included — this models the whole loop, end to end:</p>
              <ul className="space-y-1">
                {[
                  [
                    "The reconcile loop",
                    "Posture → plan-as-proof → gate → reconcile, with state = f(desired, observed, health).",
                  ],
                  [
                    "Four workload types",
                    "long-running services, run-to-completion jobs, observe-only external SaaS, and stateful quorum clusters.",
                  ],
                  [
                    "A real planner",
                    "it solves an objective — minimize cost or maximize resilience — under your budget and a governance whitelist, and fails loudly when nothing fits.",
                  ],
                  [
                    "Reconciler safety",
                    "change-freeze windows, a blast-radius breaker, a flap breaker that trips to Stalled, an incident surface, and break-glass.",
                  ],
                  [
                    "Frame roll-ups",
                    "region and environment health, read through your resilience choice.",
                  ],
                  ["Four lenses", "recolor the topology by state, cost, health, or security."],
                  [
                    "Multi-service ownership",
                    "spend and health attribute up the service → environment tree.",
                  ],
                  [
                    "Cost as a live signal",
                    "cost drift, budget-breach, and an alert-or-block policy.",
                  ],
                  [
                    "Cost-effectiveness, not optimization",
                    "elasticity/dormancy tiers park idle capacity, right-sizing proposals shrink the shared shape at the gate, and the Value tab measures cost ÷ value served — served well, not just cheap.",
                  ],
                  [
                    "Self-upgrade",
                    "the control plane manages itself with dual-control and meta-DR recovery.",
                  ],
                ].map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <span className="text-primary mt-0.5 shrink-0">›</span>
                    <span>
                      <b className="text-foreground">{k}</b> — {v}
                    </span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function EffectivenessPanel({
  value,
  costPerValue,
  rightSizing,
  onAccept,
  onDemand,
}: {
  value: ServiceValue[];
  costPerValue: number | null;
  rightSizing: RightSizingProposal[];
  onAccept: (slug: string) => void;
  onDemand: (service: string, n: number) => void;
}) {
  if (!value.length && !rightSizing.length)
    return (
      <p className="text-muted-foreground text-xs">
        Approve a plan to see cost vs <em>value served</em> — what a service's spend actually buys,
        not just what it costs.
      </p>
    );
  return (
    <div className="space-y-3 text-xs">
      <div className="border-border/60 flex items-center justify-between border-b pb-2">
        <span className="flex items-center gap-1.5 font-medium">
          <Gauge className="text-primary size-3.5" /> cost ÷ value served
        </span>
        <span className="text-muted-foreground tabular-nums">
          {costPerValue != null ? `$${costPerValue.toFixed(0)} / value-unit` : "—"}
        </span>
      </div>
      <p className="text-muted-foreground">
        Effectiveness is cost over <em>value served</em>, not cost over budget. Value is demand met
        by live serving capacity (parked, cold, or degraded serves nothing), weighted by Criticality
        and discounted when run hot — served <em>well</em>, not just served (axis 3).
      </p>
      {rightSizing.length > 0 && (
        <div className="space-y-1.5">
          {rightSizing.map((p) => (
            <div
              key={p.slug}
              className="border-border/60 flex items-start justify-between gap-2 rounded-md border border-dashed p-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium">
                  <TrendingDown className="text-primary size-3.5 shrink-0" /> right-size {p.service}
                  : {p.from} → {p.to}
                </div>
                <div className="text-muted-foreground text-[10px] leading-snug">{p.reason}</div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 shrink-0 text-[11px]"
                onClick={() => onAccept(p.slug)}
              >
                Accept at gate
              </Button>
            </div>
          ))}
        </div>
      )}
      {value.map((v) => (
        <div key={v.slug} className="border-border/60 space-y-1.5 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{v.service}</span>
            {v.ineffective ? (
              <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                ineffective
              </Badge>
            ) : (
              <span className="text-muted-foreground tabular-nums">
                {v.costPerValue != null ? `$${v.costPerValue.toFixed(0)}/value` : "—"}
              </span>
            )}
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums">
            <span>cost ${v.monthlyCost}/mo</span>
            <span>value {v.value.toFixed(0)}</span>
            <span>served {Math.round(v.servedFraction * 100)}%</span>
            <span>SLO {Math.round(v.sloAttainment * 100)}%</span>
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-[10px]">
            demand
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={Math.min(30, v.offered)}
              onChange={(ev) => onDemand(v.service, Number(ev.target.value))}
              className="flex-1 accent-[var(--primary)]"
            />
            <span className="w-5 text-right tabular-nums">{v.offered}</span>
          </label>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-xs">{label}</div>
      {children}
    </div>
  );
}

function ServicesEditor({
  services,
  onChange,
}: {
  services: ServiceSpec[];
  onChange: (s: ServiceSpec[]) => void;
}) {
  const set = (i: number, patch: Partial<ServiceSpec>) =>
    onChange(services.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-2">
      {services.map((s, i) => (
        <div key={i} className="border-input space-y-1.5 rounded-md border p-2">
          <div className="flex items-center gap-1.5">
            <input
              className="bg-secondary/50 border-input min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
              value={s.name}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            {services.length > 1 && (
              <button
                title="remove service"
                onClick={() => onChange(services.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive shrink-0 px-1"
              >
                ×
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {CRITS.map((c) => (
              <button
                key={c}
                onClick={() => set(i, { criticality: c })}
                className={cn(
                  "rounded-md border px-1 py-1 text-[11px] font-semibold transition",
                  s.criticality === c
                    ? "border-primary bg-primary/20 text-foreground"
                    : "border-input text-muted-foreground hover:bg-accent",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([...services, { name: `service-${services.length + 1}`, criticality: "C3" }])
        }
        className="border-input text-muted-foreground hover:text-foreground w-full rounded-md border border-dashed px-2 py-1.5 text-xs"
      >
        + add service
      </button>
    </div>
  );
}

function OwnersPanel({
  rollups,
  budget,
  envRollup,
  selectedSlug,
  onSelect,
  onShip,
}: {
  rollups: ServiceRollup[];
  budget: number;
  envRollup: State;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onShip: (slug: string, broken: boolean) => void;
}) {
  if (!rollups.length)
    return <p className="text-muted-foreground text-xs">Approve a plan to see ownership.</p>;
  const planned = rollups.reduce((sum, r) => sum + r.monthlyCost, 0);
  const billed = rollups.reduce((sum, r) => sum + r.billedCost, 0);
  const breach = billed > budget;
  return (
    <div className="space-y-3 text-xs">
      <div className="border-border/60 flex items-center justify-between border-b pb-2">
        <span className="flex items-center gap-1.5 font-medium">
          <span
            className="size-2 rounded-full"
            style={{
              background: stateColorVar(envRollup),
              boxShadow: `0 0 6px ${stateColorVar(envRollup)}`,
            }}
          />
          environment · {envRollup}
        </span>
        <span className={breach ? "text-destructive" : "text-muted-foreground"}>
          ${billed} / ${budget}/mo{billed !== planned ? ` (plan $${planned})` : ""}
        </span>
      </div>
      <p className="text-muted-foreground">
        State and spend attribute to each owning Service (§6). Billed-vs-planned is a live signal —
        a breach pages on-call and, by posture, blocks provisioning (§13).
      </p>
      <p className="text-muted-foreground border-border/40 rounded border border-dashed p-1.5 leading-relaxed">
        <span className="text-foreground font-medium">
          Releases come from each team's own CI/CD pipeline
        </span>{" "}
        (it calls <code className="text-[9px]">trellis release</code>) — Trellis <em>observes</em>{" "}
        the rollout, it does not trigger it. The <span className="text-foreground">simulate</span>{" "}
        buttons below stand in for that pipeline so you can watch a rollout, and a bad deploy
        self-revert. It stays <span className="text-foreground">aware, not passive</span>, so it can
        self-heal to the running version and not mistake a bad deploy for an infra fault.
      </p>
      {rollups.map((r) => {
        const color = stateColorVar(r.state);
        const drifted = r.billedCost > r.monthlyCost;
        const share = budget > 0 ? Math.round((r.billedCost / budget) * 100) : 0;
        return (
          <div key={r.slug} className="space-y-1">
            <button
              onClick={() => onSelect(r.slug)}
              className={cn(
                "border-border/60 w-full space-y-1 rounded-md border p-2 text-left transition",
                selectedSlug === r.slug ? "sel-halo" : "hover:bg-accent/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                  />
                  {r.service}
                </span>
                <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                  {r.criticality}
                </Badge>
              </div>
              <div className="text-muted-foreground flex items-center justify-between text-[10px]">
                <span>{r.state}</span>
                <span className={cn("tabular-nums", drifted && "text-destructive")}>
                  ${r.billedCost}/mo{drifted ? ` (plan $${r.monthlyCost})` : ""} · {share}%
                </span>
              </div>
              <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, share)}%`,
                    background: drifted ? "var(--destructive)" : color,
                  }}
                />
              </div>
            </button>
            {/* App-delivery inner loop (§11). In the real product the team's
                own CI/CD pipeline calls `trellis release` and Trellis observes
                the rollout; these buttons stand in for that pipeline. Deploy ✗
                fails the bake to show a bad deploy self-reverts below the
                reconciler — RolledBack, not the platform's Stalled. */}
            <div className="flex items-center justify-between gap-2 px-0.5 text-[10px]">
              <span className="text-muted-foreground tabular-nums">
                running {r.version}
                {r.rollout && (
                  <span
                    className="ml-1.5 font-medium"
                    style={{
                      color:
                        r.rollout === "Blocked" ? "var(--state-frozen)" : "var(--state-converging)",
                    }}
                  >
                    ▶ {r.rollout} {r.rolloutArtifact}
                    {r.rolloutShare > 0 ? ` · ${r.rolloutShare}%` : ""}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/60 italic">simulate</span>
                <button
                  type="button"
                  disabled={r.rollout != null}
                  onClick={() => onShip(r.slug, false)}
                  title="Stand in for the team's CI/CD pipeline shipping a good release"
                  className="border-border/60 hover:bg-accent rounded border px-1.5 py-0.5 disabled:opacity-40"
                >
                  Deploy
                </button>
                <button
                  type="button"
                  disabled={r.rollout != null}
                  onClick={() => onShip(r.slug, true)}
                  title="A broken release — its bake fails and the rollout self-reverts"
                  className="border-border/60 text-destructive hover:bg-accent rounded border px-1.5 py-0.5 disabled:opacity-40"
                >
                  Deploy&nbsp;✗
                </button>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function tcbColor(state: TcbState): string {
  if (state === "Bricked") return "var(--state-stalled)";
  if (state === "Upgrading") return "var(--state-converging)";
  return "var(--state-converged)";
}

function ControlPlanePanel({
  cp,
  target,
  onTarget,
  onPropose,
  onApprove,
  onReBootstrap,
}: {
  cp: ControlPlaneView;
  target: TcbId;
  onTarget: (id: TcbId) => void;
  onPropose: (faulty: boolean) => void;
  onApprove: () => void;
  onReBootstrap: () => void;
}) {
  const { pending } = cp;
  return (
    <Card id="tour-controlplane" className={cp.bricked ? "border-destructive" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs tracking-wide uppercase">
          <Cpu className="size-3.5" /> Control plane · self-environment (C0)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {cp.components.map((c) => {
            const color = tcbColor(c.state);
            return (
              <button
                key={c.id}
                onClick={() => onTarget(c.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1",
                  target === c.id && !pending ? "ring-1 ring-[var(--ring)]" : "",
                )}
                style={{ borderColor: `color-mix(in srgb, ${color} 50%, transparent)` }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                />
                {c.name} v{c.version}
                {c.state === "Bricked" ? " ✕" : c.state === "Upgrading" ? " ⟳" : ""}
              </button>
            );
          })}
        </div>

        {!pending && !cp.bricked && (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              The loop manages itself reflexively (§16): a self-upgrade is a transition on the C0
              self-environment, at the <b>highest gate</b> (dual-control / sealed-root). Target:{" "}
              <b className="text-foreground">{target}</b>.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onPropose(false)}>
                Propose upgrade
              </Button>
              <Button size="sm" variant="outline" onClick={() => onPropose(true)}>
                Propose faulty
              </Button>
            </div>
          </div>
        )}

        {pending && (
          <div className="border-border/60 space-y-2 rounded-md border p-2">
            <div className="font-medium">
              {pending.component} v{pending.fromVersion} → v{pending.toVersion} · {pending.phase}
            </div>
            {pending.phase === "proposed" && (
              <>
                <p className="text-muted-foreground">
                  Highest gate — dual-control / sealed-root (you're changing the thing that governs
                  change). {APPROVALS_REQUIRED - pending.approvals} more approval required.
                </p>
                <Button size="sm" onClick={onApprove}>
                  Approve ({pending.approvals}/{APPROVALS_REQUIRED})
                </Button>
              </>
            )}
            {pending.phase === "canary" && (
              <>
                <p className="text-muted-foreground">Canary rollout — {pending.canaryPct}%</p>
                <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${pending.canaryPct}%` }}
                  />
                </div>
              </>
            )}
            {pending.phase === "bricked" && (
              <p className="text-destructive">Canary failed — {pending.component} is bricked.</p>
            )}
          </div>
        )}

        {cp.bricked && (
          <div className="border-destructive space-y-2 rounded-md border p-2">
            <div className="text-destructive font-medium">
              Control plane bricked{cp.loopDown ? " — workload self-heal is DOWN" : ""}
            </div>
            <p className="text-muted-foreground">
              A bad self-upgrade disabled the loop — the one change the loop can't heal itself
              (§16). Recover via the meta-DR path: re-bootstrap from the external seed + the
              last-good generation.
            </p>
            <Button size="sm" variant="outline" onClick={onReBootstrap}>
              Re-bootstrap (meta-DR)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-secondary/50 border-input w-full rounded-md border px-2 py-1.5 text-sm"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function EmptyState({ onPlan }: { onPlan: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Boxes className="text-primary size-8" />
        <p className="text-muted-foreground max-w-sm text-sm">
          Declare a Posture on the left, then <b>Plan</b> to compile it into a Structure with a
          proof. Approve to mint a scoped credential and watch the reconciler converge — then inject
          failures and drift and watch it heal.
        </p>
        <Button onClick={onPlan} variant="secondary">
          Plan the default posture
        </Button>
      </CardContent>
    </Card>
  );
}

function Topology({
  resources,
  regionState,
  envNote,
  rollups,
  focus,
  onFocus,
  selected,
  onSelect,
  layout,
  view,
  frozenIds,
  budget,
  costNow,
  billedNow,
}: {
  resources: ResourceView[];
  regionState: Record<string, State>;
  envNote: string;
  rollups: ServiceRollup[];
  focus: string;
  onFocus: (slug: string) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  layout: "stage" | "grid";
  view: ViewMode;
  frozenIds: Set<string>;
  budget: number;
  costNow: number;
  billedNow: number;
}) {
  const order: CellKind[] = ["edge", "app", "data"];
  const maxCost = Math.max(0, ...resources.map((r) => r.monthlyCost));
  const billedBreach = billedNow > budget;
  const names = Object.fromEntries(rollups.map((r) => [r.slug, r.service]));
  // In a specific-service focus, the grid shows only that service too.
  const focused = focus !== "all" && resources.some((r) => r.service === focus);
  const shown = focused ? resources.filter((r) => r.service === focus) : resources;
  const regions = [...new Set(shown.map((r) => r.region))];
  return (
    <Card id="tour-topology">
      <CardContent className="space-y-4 pt-6">
        <div>
          <div className="text-muted-foreground mb-1 flex justify-between text-xs">
            <span>{billedNow !== costNow ? "billed vs budget" : "cost vs budget"}</span>
            <span
              className={
                billedBreach ? "text-destructive" : costNow > budget ? "text-destructive" : ""
              }
            >
              ${billedNow} / ${budget} /mo{billedNow !== costNow ? ` (plan $${costNow})` : ""}
            </span>
          </div>
          {/* Billed spend (red base) with planned layered on top — the gap beyond
              planned is the cost-drift overage (§13). */}
          <div className="bg-secondary relative h-2 w-full overflow-hidden rounded-full">
            {billedNow > costNow && (
              <div
                className="bg-destructive absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${Math.min(100, (billedNow / budget) * 100)}%` }}
              />
            )}
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                costNow > budget ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, (costNow / budget) * 100)}%` }}
            />
          </div>
        </div>

        {rollups.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-[11px]">view:</span>
            <button
              onClick={() => onFocus("all")}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                !focused
                  ? "border-primary text-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              All services
            </button>
            {rollups.map((r) => (
              <button
                key={r.slug}
                onClick={() => onFocus(r.slug)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                  focus === r.slug
                    ? "border-primary text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: stateColorVar(r.state) }}
                />
                {r.service}
              </button>
            ))}
          </div>
        )}

        {layout === "stage" ? (
          <Stage3D
            resources={resources}
            regionState={regionState}
            view={view}
            maxCost={maxCost}
            selected={selected}
            frozenIds={frozenIds}
            focus={focus}
            names={names}
            onFocus={onFocus}
            onSelect={onSelect}
          />
        ) : (
          <div className={cn("grid gap-3", regions.length > 1 ? "md:grid-cols-2" : "")}>
            {regions.map((region) => {
              const rs = regionState[region] ?? "Unknown";
              const rc = stateColorVar(rs);
              return (
                <div
                  key={region}
                  className="rounded-lg border p-3"
                  style={{ borderColor: `color-mix(in srgb, ${rc} 40%, transparent)` }}
                >
                  <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
                    <Network className="size-3" /> {region}
                    <span
                      className="ml-auto flex items-center gap-1 text-[10px]"
                      style={{ color: rc }}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ background: rc, boxShadow: `0 0 6px ${rc}` }}
                      />
                      {rs}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {order.map((cell) =>
                      shown
                        .filter((r) => r.region === region && r.cell === cell)
                        .map((r) => (
                          <ResourceCard
                            key={r.id}
                            r={r}
                            view={view}
                            maxCost={maxCost}
                            selected={r.id === selected}
                            onSelect={() => onSelect(r.id)}
                          />
                        )),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {envNote && (
          <p className="text-muted-foreground text-[11px]">
            <span className="text-foreground font-medium">Environment:</span> {envNote}
          </p>
        )}
        <Legend view={view} maxCost={maxCost} />
      </CardContent>
    </Card>
  );
}

function ResourceCard({
  r,
  view,
  maxCost,
  selected,
  onSelect,
}: {
  r: ResourceView;
  view: ViewMode;
  maxCost: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = resourceIcon(r);
  const color = viewColor(r, view, maxCost);
  const unsettled =
    r.state === "Converging" ||
    r.state === "Degraded" ||
    r.state === "Drifted" ||
    r.state === "Running" ||
    r.state === "Unavailable";
  const pulsing = (view === "state" || view === "health") && unsettled;
  return (
    <button
      onClick={onSelect}
      style={{ borderColor: color }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border bg-black/20 px-3 py-2 text-left transition",
        selected ? "sel-halo" : "",
      )}
    >
      <Icon className="size-4 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{r.id}</div>
        <div className="text-muted-foreground text-[10px]">{resourceSub(r)}</div>
      </div>
      {view === "cost" && (
        <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
          ${r.monthlyCost}
        </span>
      )}
      <span
        className={cn("size-2.5 shrink-0 rounded-full", pulsing && "animate-pulse")}
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </button>
  );
}

function Legend({ view, maxCost }: { view: ViewMode; maxCost: number }) {
  if (view === "cost") {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
        <span>$0</span>
        <span
          className="h-2 flex-1 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${costColor(0, 1)}, ${costColor(0.5, 1)}, ${costColor(1, 1)})`,
          }}
        />
        <span>${maxCost}/mo</span>
      </div>
    );
  }
  if (view === "health") {
    return (
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        {HEALTH_BUCKETS.map(({ bucket, label }) => (
          <span key={bucket} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: healthColor(bucket) }} />
            {label}
          </span>
        ))}
      </div>
    );
  }
  if (view === "security") {
    return (
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        {SECURITY_TIERS.map(({ tier, label }) => (
          <span key={tier} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: securityColor(tier) }} />
            {label}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
      {ALL_STATES.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: stateColorVar(s as State) }} />
          {s}
        </span>
      ))}
    </div>
  );
}

function ProofPanel({
  snap,
  selectedId,
}: {
  snap: EngineSnapshot | null;
  selectedId: string | null;
}) {
  const plan = snap?.plan;
  if (!plan)
    return <p className="text-muted-foreground text-xs">Plan a posture to see its proof.</p>;
  const selRows = selectedId ? plan.proof.filter((r) => r.resourceId === selectedId) : [];
  const selRes = selectedId ? snap?.resources.find((r) => r.id === selectedId) : null;
  return (
    <div className="space-y-3 text-xs">
      <div className="text-muted-foreground flex justify-between">
        <span>generation {plan.generation}</span>
        <span className={plan.feasible ? "" : "text-destructive"}>${plan.estMonthlyCost}/mo</span>
      </div>
      {selRes && selRows.length > 0 && (
        <div className="border-primary/40 bg-primary/5 rounded-md border p-2">
          <div className="text-foreground flex items-center justify-between font-medium">
            <span>Why this exists</span>
            <span
              className="rounded px-1 py-0.5 text-[9px]"
              style={{ background: stateColorVar(selRes.state), color: "#15110d" }}
            >
              {selRes.state}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 mb-1.5 text-[10px]">{selRes.id}</div>
          {selRows.map((row, i) => (
            <div key={i} className="mt-1">
              <span className="text-foreground font-medium">{row.claim}</span>
              <p className="text-muted-foreground">{row.reason}</p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {plan.proof.map((row, i) => (
          <div key={i} className={cn("border-border/60 border-b pb-2", row.binding && "")}>
            <div className="flex items-center gap-2">
              {row.binding && (
                <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                  binding
                </Badge>
              )}
              <span className="font-medium">{row.claim}</span>
            </div>
            <p className="text-muted-foreground mt-0.5">{row.reason}</p>
          </div>
        ))}
      </div>
      {plan.sensitivity.length > 0 && (
        <div className="text-muted-foreground space-y-1 pt-1">
          <div className="text-foreground font-medium">Sensitivity</div>
          {plan.sensitivity.map((s, i) => (
            <div key={i}>· {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentSurface({
  incidents,
  frozen,
  breakGlass,
  onResolve,
  onRatify,
  onSelect,
}: {
  incidents: Incident[];
  frozen: Incident[];
  breakGlass: EngineSnapshot["breakGlassSignal"];
  onResolve: (id: string) => void;
  onRatify: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const regions = [...new Set([...incidents, ...frozen].map((i) => i.region))];
  const title =
    [
      incidents.length ? `${incidents.length} Stalled` : null,
      frozen.length ? `${frozen.length} Frozen` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "gate-health signal";
  return (
    <Card className="border-[var(--state-stalled)]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Siren className="size-4 text-[var(--state-stalled)]" />
          Incident surface — {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p className="text-muted-foreground">
          The §13 rollup of Stalled + Frozen resources, joined to the audit log and routed by Frame
          + Criticality to on-call.{regions.length ? ` Blast radius: ${regions.join(", ")}.` : ""}{" "}
          Each row shows the loop's belief — decide on evidence (§13).
        </p>
        {breakGlass.noisy && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--state-stalled)]/60 bg-[var(--state-stalled)]/10 px-2 py-1.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--state-stalled)]" />
            <p className="text-muted-foreground">
              <span className="font-medium text-[var(--state-stalled)]">
                Break-glass is frequent — check the gate, not the operator.
              </span>{" "}
              {breakGlass.recent} opens in the recent window. The rate is a gate-health signal (§7):
              a frequently-opened glass diagnoses a miscalibrated gate — make normal Authoring fast
              (Inv 18) so the emergency path stays rare.
            </p>
          </div>
        )}
        {incidents.map((inc) => (
          <div
            key={inc.id}
            className="rounded-md border border-[var(--state-stalled)]/40 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: "var(--state-stalled)" }}
              />
              <button
                onClick={() => onSelect(inc.id)}
                className="hover:text-foreground min-w-0 flex-1 truncate text-left"
              >
                {inc.id}
              </button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5"
                onClick={() => onResolve(inc.id)}
              >
                <Wrench className="size-3.5" /> Resolve
              </Button>
            </div>
            <p className="text-muted-foreground mt-1 pl-4">
              loop: {inc.reconcilerReason ?? "stalled — needs a human"}
            </p>
          </div>
        ))}
        {frozen.map((fz) => (
          <div
            key={fz.id}
            className="rounded-md border border-[var(--state-frozen)]/40 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: "var(--state-frozen)" }}
              />
              <button
                onClick={() => onSelect(fz.id)}
                className="hover:text-foreground min-w-0 flex-1 truncate text-left"
              >
                {fz.id}
              </button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5"
                onClick={() => onRatify(fz.id)}
              >
                <Snowflake className="size-3.5" /> Ratify
              </Button>
            </div>
            <p className="text-muted-foreground mt-1 pl-4">
              break-glass debt outstanding — {fz.reconcilerReason ?? "reconciliation suspended"}.
              Ratify to repay through the Author gate (§7).
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuditPanel({ audit }: { audit: AuditEntry[] }) {
  const clsColor: Record<string, string> = {
    Author: "text-primary",
    Gate: "text-[var(--state-degraded)]",
    Converge: "text-[var(--state-converged)]",
    "Break-glass": "text-[var(--state-stalled)]",
    Observe: "text-muted-foreground",
    Release: "text-[var(--state-converging)]",
  };
  if (!audit.length) return <p className="text-muted-foreground text-xs">No actions yet.</p>;
  return (
    <div className="max-h-[460px] space-y-1.5 overflow-y-auto overflow-x-hidden text-[11px]">
      {[...audit].reverse().map((a, i) => (
        <div key={i} className="border-border/40 min-w-0 border-b pb-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground shrink-0 tabular-nums">{fmtClock(a.tMs)}</span>
            <span className={cn("font-medium break-words", clsColor[a.cls] ?? "")}>{a.verb}</span>
          </div>
          <div className="text-muted-foreground break-words">
            {a.target} — {a.reason}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventButton({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  // A momentary "fired" flash so a click clearly registers — these trigger an
  // instantaneous event, so the feedback is the acknowledgement, not a spinner.
  const [fired, setFired] = React.useState(false);
  const timer = React.useRef<number | null>(null);
  React.useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  const handle = () => {
    onClick();
    setFired(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFired(false), 600);
  };
  return (
    <button
      type="button"
      onClick={handle}
      className={cn(
        "focus-visible:ring-ring relative flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97]",
        fired
          ? "border-primary bg-primary/15 ring-primary/40 ring-1"
          : "border-input hover:bg-accent hover:border-primary/40",
      )}
    >
      <Icon className={cn("size-4 transition-colors", fired && "text-primary")} />
      <span className="flex items-center gap-1 text-xs font-medium">
        {label}
        <Check
          className={cn(
            "size-3 text-primary transition-opacity duration-150",
            fired ? "opacity-100" : "opacity-0",
          )}
        />
      </span>
      {hint && <span className="text-muted-foreground truncate text-[10px]">{hint}</span>}
    </button>
  );
}
