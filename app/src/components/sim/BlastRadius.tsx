import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BEAT_COPY,
  BEATS,
  type BeatId,
  BLAST_TRAIL,
  blastColorVar,
  blastForBeat,
  DIVISION_SERVICES,
  DIVISIONS,
  degradedLobs,
  type EdgeHealth,
  edgeHealth,
  LOB_DEPS,
  PLATFORM,
} from "./blast";

// A purpose-built illustration (not the full engine): a guided, five-beat
// walkthrough of one bad change. Four divisions, each running its own stack of
// services, are coupled only by a shared platform dependency. A blast-radius
// counter stays pinned at 100% while you apply the two fixes leaders reach for —
// redundancy, then process — and only drops when the architecture changes
// (share-nothing partitioning). The number refusing to move is the argument.

const GREEN = "var(--state-converged)";
const AMBER = "var(--state-degraded)";
const RED = "var(--state-stalled)";

/** Status, paired with an icon so meaning never rides on color alone (WCAG AA):
 *  a check for healthy, a triangle for degraded, an x-circle for down. */
type StatusKind = "ok" | "degraded" | "down";

const STATUS: Record<StatusKind, { color: string; Icon: typeof CheckCircle2; label: string }> = {
  ok: { color: GREEN, Icon: CheckCircle2, label: "OK" },
  degraded: { color: AMBER, Icon: AlertTriangle, label: "Degraded" },
  down: { color: RED, Icon: XCircle, label: "Down" },
};

function edgeKind(h: EdgeHealth): StatusKind {
  return h === "good" ? "ok" : h === "brownout" ? "degraded" : "down";
}

/** The corner tag: icon + label, so the state reads without relying on color. */
function StatusTag({ kind }: { kind: StatusKind }) {
  const { color, Icon, label } = STATUS[kind];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 50%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/** Which divisions are dark for a given beat — kept in lockstep with
 *  `blastForBeat` so the picture and the number can never disagree. */
function downSet(beat: BeatId, fired: boolean): Set<string> {
  switch (beat) {
    case "shared":
    case "redundant":
    case "process":
      return fired ? new Set(DIVISIONS) : new Set();
    case "partition":
      return fired ? new Set([DIVISIONS[0]]) : new Set();
    case "recover":
      return fired ? new Set() : new Set([DIVISIONS[0]]);
  }
}

export default function BlastRadius() {
  const [idx, setIdx] = React.useState(0);
  const [fired, setFired] = React.useState(false);

  const beat = BEATS[idx];
  const copy = BEAT_COPY[beat];
  const pct = blastForBeat(beat, fired);
  const color = blastColorVar(pct);
  const down = downSet(beat, fired);
  const shared = beat === "shared" || beat === "redundant" || beat === "process";
  const platformDown = shared && fired;
  const degraded = degradedLobs(down);

  const go = (next: number) => {
    setIdx(next);
    // `recover` opens mid-incident (the partition aftermath); every other beat
    // opens healthy.
    setFired(false);
  };

  return (
    <div className="text-foreground">
      {/* Counter + per-attempt trail: the argument, always on screen. */}
      <div className="border-border/60 mb-5 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium">Blast radius</span>
          <span className="text-4xl font-semibold tabular-nums transition-colors" style={{ color }}>
            {pct}%
          </span>
          <span className="text-muted-foreground text-sm">of the org affected</span>
        </div>
        {degraded.length > 0 && (
          <div
            className="mt-1 flex items-center gap-1.5 text-sm font-medium"
            style={{ color: AMBER }}
          >
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            <span>
              + {degraded.length} LOB{degraded.length > 1 ? "s" : ""} degraded (brownout) — still
              serving, not counted
            </span>
          </div>
        )}
        <Trail current={idx} firedPct={pct} onJump={go} />
        <p className="text-muted-foreground mt-3 text-sm">
          <b className="text-foreground">Redundancy and process are probability levers.</b> Blast
          radius is a magnitude problem. Only partitioning bounds the worst case.
        </p>
      </div>

      {/* Beat narration. */}
      <div className="mb-4">
        <div className="text-primary text-xs font-semibold tracking-wide uppercase">
          Step {copy.step} of {BEATS.length}
        </div>
        <h2 className="mt-0.5 text-lg font-semibold">{copy.title}</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{copy.setup}</p>
        {fired && (
          <p
            className="mt-2 max-w-2xl rounded-md border p-2.5 text-sm"
            style={{
              borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
              background: `color-mix(in srgb, ${color} 8%, transparent)`,
            }}
          >
            {copy.verdict}
          </p>
        )}
      </div>

      {/* Scene: the org is always four divisions, each owning its own services. */}
      <div className="mb-5">
        {shared && (
          <>
            <SharedPlatform
              down={platformDown}
              replicas={beat !== "shared"}
              board={beat === "process"}
            />
            <Connector down={platformDown} />
          </>
        )}
        <DivisionGrid down={down} shared={shared} platformDown={platformDown} />
      </div>

      {/* Action + navigation. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={fired ? "outline" : "default"} onClick={() => setFired((f) => !f)}>
          {fired ? copy.undo : copy.action}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" disabled={idx === 0} onClick={() => go(idx - 1)}>
            Back
          </Button>
          <Button
            variant="secondary"
            disabled={idx === BEATS.length - 1}
            onClick={() => go(idx + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The five attempts and the blast radius each one left behind — current
 *  highlighted, clickable to jump. "The number didn't move until the
 *  architecture did," made permanent and legible. */
function Trail({
  current,
  firedPct,
  onJump,
}: {
  current: number;
  firedPct: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="mt-3">
      <div className="text-muted-foreground mb-1.5 text-xs">Blast radius after each attempt</div>
      <div className="flex gap-1.5">
        {BEATS.map((b, i) => {
          const active = i === current;
          // Show the live value for the active beat; the settled value elsewhere.
          const value = active ? firedPct : BLAST_TRAIL[i];
          const c = blastColorVar(value);
          return (
            <button
              key={b}
              type="button"
              onClick={() => onJump(i)}
              className={cn(
                "flex-1 rounded-md border px-1 py-1.5 text-center transition-all",
                active ? "" : "opacity-60 hover:opacity-100",
              )}
              style={{
                borderColor: `color-mix(in srgb, ${c} ${active ? 70 : 35}%, transparent)`,
                background: `color-mix(in srgb, ${c} ${active ? 18 : 8}%, transparent)`,
                ...(active ? { boxShadow: `0 0 10px -3px ${c}` } : {}),
              }}
            >
              <div className="text-sm font-semibold tabular-nums" style={{ color: c }}>
                {value}%
              </div>
              <div
                className={cn(
                  "mt-0.5 truncate text-[10px]",
                  active ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {BEAT_COPY[b].short}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The shared dependency every division reaches into — one instance (shared) or
 *  three active-active replicas of the *same* service (redundant / process). */
function SharedPlatform({
  down,
  replicas,
  board,
}: {
  down: boolean;
  replicas: boolean;
  board: boolean;
}) {
  return (
    <div className="space-y-3">
      {board && (
        <div className="flex flex-wrap justify-center gap-2">
          {["Change Approval Board ✓", "Freeze window ✓", "Runbook signed off ✓"].map((b) => (
            <span
              key={b}
              className="border-border/60 text-muted-foreground rounded-full border px-3 py-1 text-xs"
            >
              {b}
            </span>
          ))}
        </div>
      )}
      <div className="text-muted-foreground text-center text-xs font-medium tracking-wide uppercase">
        Shared platform — every LOB depends on it
      </div>
      {replicas ? (
        <div className="grid grid-cols-3 gap-2">
          {["Region A", "Region B", "Region C"].map((r) => (
            <Node key={r} label={r} sub={`${PLATFORM} · active-active`} down={down} />
          ))}
        </div>
      ) : (
        <div className="flex justify-center">
          <Node
            label={`Shared ${PLATFORM}`}
            sub="one instance · everyone depends on it"
            down={down}
            wide
          />
        </div>
      )}
    </div>
  );
}

function Connector({ down }: { down: boolean }) {
  return (
    <div
      className="mx-auto my-2 h-5 w-px"
      style={{ background: `color-mix(in srgb, ${down ? RED : GREEN} 60%, transparent)` }}
      aria-hidden
    />
  );
}

/** The org as four lines of business (LOBs), each its own stack of services,
 *  with the dependency edges between them colored by health. */
function DivisionGrid({
  down,
  shared,
  platformDown,
}: {
  down: Set<string>;
  shared: boolean;
  platformDown: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground mb-2 text-center text-xs font-medium tracking-wide uppercase">
        Lines of business (LOBs) — each runs its own services
      </div>
      <Legend />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {DIVISIONS.map((d) => (
          <DivisionStack key={d} name={d} down={down} shared={shared} platformDown={platformDown} />
        ))}
      </div>
    </div>
  );
}

/** What the edge colors mean — healthy, browned-out (degraded but serving), or
 *  blacked-out (down). */
function Legend() {
  const items: [StatusKind, string][] = [
    ["ok", "healthy"],
    ["degraded", "brownout — degraded, still serving"],
    ["down", "blackout — down"],
  ];
  return (
    <div className="text-muted-foreground mb-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px]">
      {items.map(([kind, t]) => {
        const { color, Icon } = STATUS[kind];
        return (
          <span key={kind} className="inline-flex items-center gap-1">
            <Icon className="size-3" style={{ color }} aria-hidden />
            {t}
          </span>
        );
      })}
    </div>
  );
}

/** One LOB: its services, plus the dependencies it calls. The shared platform
 *  (beats 1-3) is a *synchronous* edge — its outage blacks the LOB out. The
 *  LOB→LOB edges (once partitioned) are *async + graceful* — a callee's outage
 *  only browns the edge out, the LOB keeps serving. */
function DivisionStack({
  name,
  down,
  shared,
  platformDown,
}: {
  name: string;
  down: Set<string>;
  shared: boolean;
  platformDown: boolean;
}) {
  const isDown = down.has(name);
  const edges: { label: string; health: EdgeHealth; sync: boolean }[] = shared
    ? [{ label: "Shared platform", health: edgeHealth(platformDown, true), sync: true }]
    : (LOB_DEPS[name] ?? []).map((t) => ({
        label: t,
        health: edgeHealth(down.has(t), false),
        sync: false,
      }));
  const degraded = !isDown && edges.some((e) => e.health === "brownout");
  const kind: StatusKind = isDown ? "down" : degraded ? "degraded" : "ok";
  const tone = STATUS[kind].color;
  const status = isDown ? "DOWN" : degraded ? "serving · degraded" : "serving";

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border bg-black/20 p-2.5"
      style={{
        borderColor: `color-mix(in srgb, ${tone} ${isDown ? 65 : degraded ? 55 : 45}%, transparent)`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Dot color={tone} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div
              className="text-[11px] font-medium"
              style={{ color: isDown || degraded ? tone : "var(--muted-foreground)" }}
            >
              {status}
            </div>
          </div>
        </div>
        <StatusTag kind={kind} />
      </div>
      <div className="flex flex-wrap gap-1">
        {DIVISION_SERVICES.map((s) => (
          <Chip key={s} label={s} down={isDown} />
        ))}
        {!shared && <Chip label={`${PLATFORM} (own)`} down={isDown} own />}
      </div>
      {edges.length > 0 && (
        <div
          className="flex flex-col gap-1 border-t pt-2"
          style={{ borderColor: "color-mix(in srgb, var(--border) 70%, transparent)" }}
        >
          <span className="text-muted-foreground text-[9px] tracking-wide uppercase">
            depends on
          </span>
          <div className="flex flex-col gap-1">
            {edges.map((e) => (
              <EdgeChip key={e.label} label={e.label} health={e.health} sync={e.sync} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A dependency edge to another LOB or the shared platform, colored by health and
 *  tagged sync/async — the sync/async distinction is why one blacks out and the
 *  other only browns out. */
function EdgeChip({ label, health, sync }: { label: string; health: EdgeHealth; sync: boolean }) {
  const { color, Icon } = STATUS[edgeKind(health)];
  return (
    <span
      className="flex w-full min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
      style={{
        borderColor: `color-mix(in srgb, ${color} 50%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        color,
      }}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="shrink-0" aria-hidden>
        →
      </span>
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0 opacity-70">{sync ? "sync" : "async"}</span>
    </span>
  );
}

function Chip({ label, down, own }: { label: string; down: boolean; own?: boolean }) {
  const color = down ? RED : GREEN;
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap",
        own ? "font-medium" : "",
      )}
      style={{
        borderColor: `color-mix(in srgb, ${color} ${own ? 60 : 30}%, transparent)`,
        background: own ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
        color: down ? RED : own ? "var(--foreground)" : "var(--muted-foreground)",
      }}
    >
      {label}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

function Node({
  label,
  sub,
  down,
  wide,
}: {
  label: string;
  sub: string;
  down: boolean;
  wide?: boolean;
}) {
  const kind: StatusKind = down ? "down" : "ok";
  const color = STATUS[kind].color;
  return (
    <div
      className={cn(
        "rounded-md border bg-black/30 px-3 py-2",
        wide ? "w-full max-w-sm text-center" : "",
      )}
      style={{ borderColor: color, boxShadow: `0 0 16px -6px ${color}` }}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <Dot color={color} />
        <span className="text-sm font-semibold">{label}</span>
        <StatusTag kind={kind} />
      </div>
      <div className="mt-0.5 text-xs" style={{ color: down ? RED : "var(--muted-foreground)" }}>
        {down ? "bricked by a bad upgrade" : sub}
      </div>
    </div>
  );
}
