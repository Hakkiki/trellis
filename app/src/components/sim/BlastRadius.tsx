import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A purpose-built illustration (not the full engine): the same bad upgrade to a
// shared service, two ways — one shared instance everyone depends on (100% blast
// radius) versus one instance per division (contained). The money-shot for the
// case: roll out the bad change and watch what it can reach.

type Mode = "shared" | "sliced";
const DIVISIONS = ["Payments", "Trading", "Risk", "Web"];
const GREEN = "var(--state-converged)";
const RED = "var(--state-stalled)";

export default function BlastRadius() {
  const [mode, setMode] = React.useState<Mode>("shared");
  const [down, setDown] = React.useState<Set<string>>(new Set());
  // In shared mode the single source of truth is `down`: any division down means
  // the one shared instance is down (and vice-versa).
  const sharedDown = down.size > 0;

  const reset = React.useCallback(() => setDown(new Set()), []);
  const switchMode = (m: Mode) => {
    setMode(m);
    setDown(new Set());
  };

  // Shared: one bad upgrade fails the shared service → every division goes down.
  const rolloutShared = () => setDown(new Set(DIVISIONS));
  // Sliced: a bad upgrade fails only that division's own instance.
  const upgrade = (d: string) => setDown((s) => new Set(s).add(d));
  const recover = (d: string) =>
    setDown((s) => {
      const n = new Set(s);
      n.delete(d);
      return n;
    });

  const pct = Math.round((down.size / DIVISIONS.length) * 100);
  const verdict =
    down.size === 0
      ? "All divisions healthy. Roll out a bad upgrade and watch what it can reach."
      : mode === "shared"
        ? "One upgrade to the shared service took down the entire org."
        : `Contained to ${down.size} of ${DIVISIONS.length} division${down.size > 1 ? "s" : ""} — the rest keep serving. Recover the hit one from its own last-good version.`;

  return (
    <div className="text-foreground">
      {/* Mode toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["shared", "sliced"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition",
              mode === m
                ? "border-primary bg-primary/15 text-foreground"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "shared" ? "Shared service (one for everyone)" : "Sliced per division"}
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={reset} className="ml-auto">
          Reset
        </Button>
      </div>

      {/* Blast-radius headline */}
      <div className="border-border/60 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3">
        <span className="text-sm font-medium">Blast radius</span>
        <span
          className="text-2xl font-semibold tabular-nums"
          style={{ color: pct > 0 ? RED : GREEN }}
        >
          {pct}%
        </span>
        <span className="text-muted-foreground text-sm">{verdict}</span>
      </div>

      {mode === "shared" ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Node
              label="Shared PAM / secrets service"
              sub="one instance · everyone depends on it"
              down={sharedDown}
              wide
            />
            <Button
              size="sm"
              variant={sharedDown ? "outline" : "default"}
              onClick={sharedDown ? reset : rolloutShared}
            >
              {sharedDown ? "Roll back" : "Roll out a bad upgrade"}
            </Button>
            <div className="text-muted-foreground text-xs">
              every division wires to the one instance ↓
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DIVISIONS.map((d) => (
              <DivisionCard key={d} name={d} down={down.has(d)} />
            ))}
          </div>
        </div>
      ) : (
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
                <Node label="own PAM / secrets service" sub="this division only" down={isDown} />
                <Button
                  size="sm"
                  variant={isDown ? "outline" : "secondary"}
                  onClick={() => (isDown ? recover(d) : upgrade(d))}
                >
                  {isDown ? "Recover (last-good)" : "Roll out a bad upgrade"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
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
