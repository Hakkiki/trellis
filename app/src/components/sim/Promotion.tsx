import { AlertTriangle, ArrowRight, Eye, GitCommitVertical, Rocket } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AuditEntry } from "@/sim/engine";
import { type EnvView, Fleet, type FleetSnapshot } from "@/sim/fleet";
import { stateColorVar } from "@/sim/state";

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function Promotion() {
  const fleetRef = React.useRef<Fleet | null>(null);
  const [snap, setSnap] = React.useState<FleetSnapshot | null>(null);

  const refresh = React.useCallback(() => {
    if (fleetRef.current) setSnap(fleetRef.current.snapshot());
  }, []);

  React.useEffect(() => {
    fleetRef.current = new Fleet();
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    const iv = setInterval(() => {
      fleetRef.current?.tick();
      refresh();
    }, 650);
    return () => clearInterval(iv);
  }, [refresh]);

  const act = (fn: (f: Fleet) => void) => {
    if (!fleetRef.current) return;
    fn(fleetRef.current);
    refresh();
  };

  const envs = snap?.envs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="gap-1">
          <GitCommitVertical className="size-3" /> {snap?.base.intent}
        </Badge>
        <Badge variant="secondary">latest cut: v{snap?.latestVersion ?? 0}</Badge>
        <Badge variant="outline">{fmtClock(snap?.tMs ?? 0)}</Badge>
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => act((f) => f.cutVersion())}>
          <GitCommitVertical className="size-3.5" /> Cut new version → dev
        </Button>
      </div>

      {/* Promotion rail */}
      <div className="bg-card/40 flex items-center gap-2 rounded-lg border p-3 text-sm">
        {envs.map((e, i) => (
          <React.Fragment key={e.id}>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{e.label}</span>
              <Badge variant={e.deployedVersion ? "default" : "secondary"}>
                {e.deployedVersion ? `v${e.deployedVersion}` : "—"}
              </Badge>
            </div>
            {i < envs.length - 1 && <ArrowRight className="text-muted-foreground size-4" />}
          </React.Fragment>
        ))}
        <span className="text-muted-foreground ml-auto text-xs">
          promote an immutable version along the pipeline — the path is re-planned per environment
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {envs.map((e) => (
          <EnvCard
            key={e.id}
            env={e}
            onPromote={() => act((f) => f.promote(e.id))}
            onDrift={() => act((f) => f.injectDrift(e.id))}
            onFail={() => act((f) => f.failNode(e.id))}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs tracking-wide uppercase">Audit</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditPanel audit={snap?.audit ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}

function EnvCard({
  env,
  onPromote,
  onDrift,
  onFail,
}: {
  env: EnvView;
  onPromote: () => void;
  onDrift: () => void;
  onFail: () => void;
}) {
  const critColor: Record<string, string> = {
    C0: "var(--state-stalled)",
    C1: "var(--state-degraded)",
    C2: "var(--state-converged)",
    C3: "var(--muted-foreground)",
  };
  const regions = [...new Set(env.resources.map((r) => r.region))];
  return (
    <Card className={cn(env.drifted && "border-[var(--state-drifted)]")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm capitalize">
            {env.label}
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-black"
              style={{ background: critColor[env.criticality] }}
            >
              {env.criticality}
            </span>
          </CardTitle>
          <Badge variant={env.deployedVersion ? "default" : "secondary"}>
            {env.deployedVersion ? `v${env.deployedVersion}` : "not deployed"}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {env.converged && env.deployedVersion ? (
            <span className="text-[var(--state-converged)]">converged & holding</span>
          ) : env.deployedVersion ? (
            <span className="text-[var(--state-converging)]">reconciling…</span>
          ) : (
            <span>—</span>
          )}
          {env.drifted && (
            <span className="text-[var(--state-drifted)]">· drifted off version</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* cost */}
        <div>
          <div className="text-muted-foreground mb-1 flex justify-between text-[11px]">
            <span>cost</span>
            <span className={env.costNow > env.budget ? "text-destructive" : ""}>
              ${env.costNow} / ${env.budget}
            </span>
          </div>
          <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                env.costNow > env.budget ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, (env.costNow / Math.max(1, env.budget)) * 100)}%` }}
            />
          </div>
        </div>

        {/* topology dots */}
        {env.resources.length === 0 ? (
          <p className="text-muted-foreground py-3 text-center text-xs">nothing deployed yet</p>
        ) : (
          <div className="space-y-2">
            {regions.map((region) => (
              <div key={region}>
                <div className="text-muted-foreground mb-1 text-[10px]">{region}</div>
                <div className="flex flex-wrap gap-1.5">
                  {env.resources
                    .filter((r) => r.region === region)
                    .map((r) => {
                      const color = stateColorVar(r.state);
                      const pulsing =
                        r.state === "Converging" || r.state === "Degraded" || r.state === "Drifted";
                      return (
                        <span
                          key={r.id}
                          title={`${r.id} — ${r.state}`}
                          className="flex items-center gap-1 rounded border px-1.5 py-1 text-[10px]"
                          style={{ borderColor: color }}
                        >
                          <span
                            className={cn("size-2 rounded-full", pulsing && "animate-pulse")}
                            style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                          />
                          {r.cell}
                        </span>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            disabled={!env.canPromote}
            onClick={onPromote}
          >
            <Rocket className="size-3.5" />
            {env.canPromote ? `Promote v${env.promoteTo}` : "up to date"}
          </Button>
        </div>
        {env.deployedVersion > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onFail}>
              <AlertTriangle className="size-3.5" /> Fail node
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onDrift}>
              <Eye className="size-3.5" /> Hand-edit
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditPanel({ audit }: { audit: AuditEntry[] }) {
  const clsColor: Record<string, string> = {
    Author: "text-primary",
    Converge: "text-[var(--state-converged)]",
    Observe: "text-muted-foreground",
  };
  if (!audit.length)
    return (
      <p className="text-muted-foreground text-xs">No actions yet — cut a version to begin.</p>
    );
  return (
    <div className="max-h-64 space-y-1.5 overflow-auto text-[11px]">
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
