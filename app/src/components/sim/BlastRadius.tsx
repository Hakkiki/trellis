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
  DIVISIONS,
} from "./blast";

// A purpose-built illustration (not the full engine): a guided, five-beat
// walkthrough of one bad change. A blast-radius counter stays pinned at 100%
// while you apply the two fixes leaders reach for — redundancy, then process —
// and only drops when the architecture changes (share-nothing partitioning).
// The number refusing to move is the whole argument.

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
  const substrateDown = beat !== "partition" && beat !== "recover" && fired;

  const go = (next: number) => {
    setIdx(next);
    // `recover` opens mid-incident (the partition aftermath); every other beat
    // opens healthy.
    setFired(false);
  };

  return (
    <div className="text-foreground">
      {/* Counter + trail: the argument, always on screen. */}
      <div className="border-border/60 mb-5 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium">Blast radius</span>
          <span className="text-4xl font-semibold tabular-nums transition-colors" style={{ color }}>
            {pct}%
          </span>
          <span className="text-muted-foreground text-sm">of the org affected</span>
        </div>
        <Trail current={idx} firedPct={pct} />
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

      {/* Scene. */}
      <div className="mb-5 min-h-[12rem]">
        {beat === "shared" && <SharedScene down={substrateDown} divisions={down} />}
        {beat === "redundant" && (
          <RedundantScene down={substrateDown} divisions={down} board={false} />
        )}
        {beat === "process" && <RedundantScene down={substrateDown} divisions={down} board />}
        {(beat === "partition" || beat === "recover") && <PartitionScene down={down} />}
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

/** The five settled values, current beat highlighted — "the number didn't move
 *  until the architecture did," made permanent. */
function Trail({ current, firedPct }: { current: number; firedPct: number }) {
  return (
    <div className="mt-3 flex items-end gap-1.5">
      {BLAST_TRAIL.map((settled, i) => {
        const active = i === current;
        // Show the live value for the active beat; the settled value elsewhere.
        const value = active ? firedPct : settled;
        const c = blastColorVar(value);
        return (
          <div key={BEATS[i]} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                "w-full rounded-sm transition-all",
                active ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-50",
              )}
              style={{
                height: `${Math.max(6, value * 0.32)}px`,
                background: c,
                ...(active ? { boxShadow: `0 0 10px -2px ${c}` } : {}),
              }}
            />
            <span
              className={cn(
                "text-[10px] tabular-nums",
                active ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {value}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SharedScene({ down, divisions }: { down: boolean; divisions: Set<string> }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2">
        <Node
          label="Shared PAM / secrets service"
          sub="one instance · everyone depends on it"
          down={down}
          wide
        />
        <div className="text-muted-foreground text-xs">
          every division wires to the one instance ↓
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DIVISIONS.map((d) => (
          <DivisionCard key={d} name={d} down={divisions.has(d)} />
        ))}
      </div>
    </div>
  );
}

function RedundantScene({
  down,
  divisions,
  board,
}: {
  down: boolean;
  divisions: Set<string>;
  board: boolean;
}) {
  return (
    <div className="space-y-4">
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
      <div className="flex flex-col items-center gap-2">
        <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          {["Region A", "Region B", "Region C"].map((r) => (
            <Node key={r} label={r} sub="active-active replica" down={down} />
          ))}
        </div>
        <div className="text-muted-foreground text-xs">
          one shared service, three regions — the bad change ships to all of them ↓
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DIVISIONS.map((d) => (
          <DivisionCard key={d} name={d} down={divisions.has(d)} />
        ))}
      </div>
    </div>
  );
}

function PartitionScene({ down }: { down: Set<string> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {DIVISIONS.map((d) => {
        const isDown = down.has(d);
        return (
          <div
            key={d}
            className="border-border/60 flex flex-col gap-2 rounded-lg border p-3"
            style={{
              borderColor: `color-mix(in srgb, ${isDown ? RED : GREEN} 40%, transparent)`,
            }}
          >
            <DivisionCard name={d} down={isDown} />
            <Node label="own PAM / secrets service" sub="this cell only" down={isDown} />
          </div>
        );
      })}
    </div>
  );
}

function DivisionCard({ name, down }: { name: string; down: boolean }) {
  const color = down ? RED : GREEN;
  return (
    <div
      className="flex items-center gap-2 rounded-md border bg-black/20 px-3 py-2"
      style={{ borderColor: color }}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div
          className="text-xs font-medium"
          style={{ color: down ? RED : "var(--muted-foreground)" }}
        >
          {down ? "DOWN" : "serving"}
        </div>
      </div>
    </div>
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
        <span
          className="size-2.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="mt-0.5 text-xs" style={{ color: down ? RED : "var(--muted-foreground)" }}>
        {down ? "bricked by a bad upgrade" : sub}
      </div>
    </div>
  );
}
