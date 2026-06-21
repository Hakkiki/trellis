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
  PLATFORM,
} from "./blast";

// A purpose-built illustration (not the full engine): a guided, five-beat
// walkthrough of one bad change. Four divisions, each running its own stack of
// services, are coupled only by a shared platform dependency. A blast-radius
// counter stays pinned at 100% while you apply the two fixes leaders reach for —
// redundancy, then process — and only drops when the architecture changes
// (share-nothing partitioning). The number refusing to move is the argument.

const GREEN = "var(--state-converged)";
const RED = "var(--state-stalled)";

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
        <DivisionGrid down={down} withOwnPlatform={!shared} />
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

/** The org as four lines of business (LOBs), each its own stack of services. */
function DivisionGrid({ down, withOwnPlatform }: { down: Set<string>; withOwnPlatform: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground mb-2 text-center text-xs font-medium tracking-wide uppercase">
        Lines of business (LOBs) — each runs its own services
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {DIVISIONS.map((d) => (
          <DivisionStack key={d} name={d} down={down.has(d)} withOwnPlatform={withOwnPlatform} />
        ))}
      </div>
    </div>
  );
}

/** One division: a header + the set of services it runs. When partitioned it also
 *  owns its copy of the platform — no shared substrate for a fault to cross. */
function DivisionStack({
  name,
  down,
  withOwnPlatform,
}: {
  name: string;
  down: boolean;
  withOwnPlatform: boolean;
}) {
  const color = down ? RED : GREEN;
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border bg-black/20 p-2.5"
      style={{
        borderColor: `color-mix(in srgb, ${color} ${down ? 65 : 45}%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2">
        <Dot color={color} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div
            className="text-[11px] font-medium"
            style={{ color: down ? RED : "var(--muted-foreground)" }}
          >
            {down ? "DOWN" : "serving"}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {DIVISION_SERVICES.map((s) => (
          <Chip key={s} label={s} down={down} />
        ))}
        {withOwnPlatform && <Chip label={`${PLATFORM} (own)`} down={down} own />}
      </div>
    </div>
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
  const color = down ? RED : GREEN;
  return (
    <div
      className={cn(
        "rounded-md border bg-black/30 px-3 py-2",
        wide ? "w-full max-w-sm text-center" : "",
      )}
      style={{ borderColor: color, boxShadow: `0 0 16px -6px ${color}` }}
    >
      <div className="flex items-center justify-center gap-2">
        <Dot color={color} />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="mt-0.5 text-xs" style={{ color: down ? RED : "var(--muted-foreground)" }}>
        {down ? "bricked by a bad upgrade" : sub}
      </div>
    </div>
  );
}
