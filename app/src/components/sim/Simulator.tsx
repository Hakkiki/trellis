import {
  Activity,
  AlertTriangle,
  Boxes,
  CircleSlash,
  Clock,
  Cloud,
  Database,
  Eye,
  Network,
  Server,
  ShieldAlert,
  Siren,
  Snowflake,
  Wrench,
  Zap,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  type AuditEntry,
  DEFAULT_POSTURE,
  Engine,
  type EngineSnapshot,
  type Incident,
  type ResourceView,
} from "@/sim/engine";
import type { CellKind, Criticality, Kind, Posture, Resilience } from "@/sim/model";
import { ALL_STATES, type State, stateColorVar } from "@/sim/state";
import { loadSession, saveSession } from "@/sim/store";
import Stage3D from "./Stage3D";

const ALL_REGIONS = ["us-east-1", "eu-west-1", "ap-south-1"];
const CRITS: Criticality[] = ["C0", "C1", "C2", "C3"];
const ALL_SERVICES: { kind: Kind; label: string }[] = [
  { kind: "load-balancer", label: "load balancer" },
  { kind: "compute", label: "compute" },
  { kind: "managed-relational-db", label: "managed DB" },
];

function resourceIcon(r: ResourceView) {
  if (r.lifecycle === "job") return Clock;
  if (r.lifecycle === "external") return Cloud;
  if (r.cell === "edge") return Network;
  if (r.cell === "data") return Database;
  return Server;
}

function resourceSub(r: ResourceView) {
  if (r.lifecycle === "job") return "batch-job · nightly";
  if (r.lifecycle === "external") return "external SaaS · observe-only";
  return `${r.kind} · ${r.size}${r.cell === "app" ? ` · ${r.replicas}×` : ""}`;
}

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function Simulator() {
  const engineRef = React.useRef<Engine | null>(null);
  const [snap, setSnap] = React.useState<EngineSnapshot | null>(null);
  const [running, setRunning] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<Posture>(DEFAULT_POSTURE);
  const [layout, setLayout] = React.useState<"stage" | "grid">("stage");

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
      setForm(posture);
      e.hydrate(s.audit);
      e.declare(posture);
      if (s.applied) {
        e.approve();
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
      engineRef.current?.tick();
      refresh();
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
    });
  }, []);

  const onPlan = () => {
    setRunning(false);
    engineRef.current?.declare(form);
    persist(false);
    refresh();
  };
  const onApprove = () => {
    if (!engineRef.current?.approve()) return;
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

  const plan = snap?.plan ?? null;
  const phase = snap?.phase ?? "empty";
  const resources = snap?.resources ?? [];
  const sel = resources.find((r) => r.id === selected) ?? resources[0] ?? null;
  const frozenIds = new Set(resources.filter((r) => r.state === "Frozen").map((r) => r.id));

  return (
    <div className="dark text-foreground grid gap-4 lg:grid-cols-[300px_1fr_340px]">
      {/* ---- Left: Posture ---- */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Boxes className="size-4 text-primary" /> Posture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Field label="Intent">
            <input
              className="bg-secondary/50 border-input w-full rounded-md border px-2 py-1.5 text-sm"
              value={form.intent}
              onChange={(e) => setForm({ ...form, intent: e.target.value })}
            />
          </Field>
          <Field label="Criticality">
            <div className="grid grid-cols-4 gap-1">
              {CRITS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, criticality: c })}
                  className={cn(
                    "rounded-md border px-1 py-1.5 text-xs font-semibold transition",
                    form.criticality === c
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-input text-muted-foreground hover:bg-accent",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
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
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={onPlan} variant="secondary" className="w-full">
              Plan
            </Button>
            <Button
              onClick={onApprove}
              disabled={
                !plan?.feasible ||
                (phase === "applied" && (plan?.generation ?? 0) <= (snap?.appliedGen ?? 0))
              }
              className="w-full"
            >
              {phase === "applied" && (plan?.generation ?? 0) > (snap?.appliedGen ?? 0)
                ? "Approve transition"
                : "Approve & apply"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- Center: Topology + events ---- */}
      <div className="space-y-4">
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
          {phase === "applied" && (
            <button
              onClick={() => setRunning((r) => !r)}
              className="text-muted-foreground hover:text-foreground ml-auto text-xs underline"
            >
              {running ? "pause loop" : "resume loop"}
            </button>
          )}
          <div className="ml-auto flex gap-1">
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
                <div className="text-destructive font-semibold">Plan failed loudly — no magic</div>
                <p className="text-muted-foreground mt-1">{plan.failure}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "applied" && (
          <Topology
            resources={resources}
            selected={sel?.id ?? null}
            onSelect={setSelected}
            layout={layout}
            frozenIds={frozenIds}
            budget={snap!.budget}
            costNow={snap!.costNow}
          />
        )}

        {phase === "applied" && (
          <Card>
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
                  sel && act((e) => (e.isFrozen(sel.id) ? e.ratify(sel.id) : e.breakGlass(sel.id)))
                }
              />
            </CardContent>
          </Card>
        )}

        {phase === "applied" && (snap?.incidents.length ?? 0) > 0 && (
          <IncidentSurface
            incidents={snap!.incidents}
            onResolve={(id) => act((e) => e.resolveIncident(id))}
            onSelect={setSelected}
          />
        )}
      </div>

      {/* ---- Right: Proof + audit ---- */}
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Plan = proof</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="proof">
            <TabsList className="w-full">
              <TabsTrigger value="proof" className="flex-1">
                Proof
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex-1">
                Audit
              </TabsTrigger>
            </TabsList>
            <TabsContent value="proof" className="mt-3">
              <ProofPanel snap={snap} selectedId={sel?.id ?? null} />
            </TabsContent>
            <TabsContent value="audit" className="mt-3">
              <AuditPanel audit={snap?.audit ?? []} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
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
  selected,
  onSelect,
  layout,
  frozenIds,
  budget,
  costNow,
}: {
  resources: ResourceView[];
  selected: string | null;
  onSelect: (id: string) => void;
  layout: "stage" | "grid";
  frozenIds: Set<string>;
  budget: number;
  costNow: number;
}) {
  const regions = [...new Set(resources.map((r) => r.region))];
  const order: CellKind[] = ["edge", "app", "data"];
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <div className="text-muted-foreground mb-1 flex justify-between text-xs">
            <span>cost vs budget</span>
            <span className={costNow > budget ? "text-destructive" : ""}>
              ${costNow} / ${budget} /mo
            </span>
          </div>
          <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                costNow > budget ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, (costNow / budget) * 100)}%` }}
            />
          </div>
        </div>

        {layout === "stage" ? (
          <Stage3D
            resources={resources}
            selected={selected}
            frozenIds={frozenIds}
            onSelect={onSelect}
          />
        ) : (
          <div className={cn("grid gap-3", regions.length > 1 ? "md:grid-cols-2" : "")}>
            {regions.map((region) => (
              <div key={region} className="border-border/60 rounded-lg border p-3">
                <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
                  <Network className="size-3" /> {region}
                </div>
                <div className="space-y-2">
                  {order.map((cell) =>
                    resources
                      .filter((r) => r.region === region && r.cell === cell)
                      .map((r) => (
                        <ResourceCard
                          key={r.id}
                          r={r}
                          selected={r.id === selected}
                          onSelect={() => onSelect(r.id)}
                        />
                      )),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <Legend />
      </CardContent>
    </Card>
  );
}

function ResourceCard({
  r,
  selected,
  onSelect,
}: {
  r: ResourceView;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = resourceIcon(r);
  const color = stateColorVar(r.state);
  const pulsing =
    r.state === "Converging" ||
    r.state === "Degraded" ||
    r.state === "Drifted" ||
    r.state === "Running";
  return (
    <button
      onClick={onSelect}
      style={{ borderColor: color }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border bg-black/20 px-3 py-2 text-left transition",
        selected ? "ring-2 ring-[var(--ring)]" : "",
      )}
    >
      <Icon className="size-4 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{r.id}</div>
        <div className="text-muted-foreground text-[10px]">{resourceSub(r)}</div>
      </div>
      <span
        className={cn("size-2.5 shrink-0 rounded-full", pulsing && "animate-pulse")}
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </button>
  );
}

function Legend() {
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
  onResolve,
  onSelect,
}: {
  incidents: Incident[];
  onResolve: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const regions = [...new Set(incidents.map((i) => i.region))];
  return (
    <Card className="border-[var(--state-stalled)]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Siren className="size-4 text-[var(--state-stalled)]" />
          Incident — {incidents.length} resource{incidents.length > 1 ? "s" : ""} Stalled
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p className="text-muted-foreground">
          Self-heal flapped and the circuit breaker tripped (§9). Routed by Frame + Criticality to
          on-call (§13). Blast radius: {regions.join(", ")}. The reconciler is holding — a human
          must fix the root cause.
        </p>
        {incidents.map((inc) => (
          <div
            key={inc.id}
            className="flex items-center gap-2 rounded-md border border-[var(--state-stalled)]/40 px-2 py-1.5"
          >
            <span className="size-2 rounded-full" style={{ background: "var(--state-stalled)" }} />
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
  };
  if (!audit.length) return <p className="text-muted-foreground text-xs">No actions yet.</p>;
  return (
    <div className="max-h-[460px] space-y-1.5 overflow-auto text-[11px]">
      {[...audit].reverse().map((a, i) => (
        <div key={i} className="border-border/40 flex gap-2 border-b pb-1.5">
          <span className="text-muted-foreground tabular-nums">{fmtClock(a.tMs)}</span>
          <span className={cn("font-medium", clsColor[a.cls] ?? "")}>{a.verb}</span>
          <span className="text-muted-foreground min-w-0 flex-1 truncate">
            {a.target} — {a.reason}
          </span>
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
  return (
    <button
      onClick={onClick}
      className="border-input hover:bg-accent flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition"
    >
      <Icon className="size-4" />
      <span className="text-xs font-medium">{label}</span>
      {hint && <span className="text-muted-foreground truncate text-[10px]">{hint}</span>}
    </button>
  );
}
