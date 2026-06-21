// Pure model for the blast-radius walkthrough — kept free of React/DOM so the
// thesis is unit-testable. A guided, five-beat sequence that shows the
// blast-radius number *refusing to move* as you apply the two fixes leaders
// reach for (redundancy, then process) — and only dropping when the
// architecture changes (share-nothing partitioning), then again on recovery.
// The settled value after each beat is the on-screen trail: 100 → 100 → 100 → 25 → 0.

export type BeatId = "shared" | "redundant" | "process" | "partition" | "recover";

export const BEATS: BeatId[] = ["shared", "redundant", "process", "partition", "recover"];

export const DIVISIONS = ["Payments", "Trading", "Risk", "Web"] as const;

/** Each division runs its own stack of services — the point the picture must make
 *  obvious: a division is a set of services, not a single box. */
export const DIVISION_SERVICES = ["API", "Web app", "Database"] as const;

/** The shared platform dependency every division reaches into — the coupling that
 *  turns one bad change into an org-wide outage until you give each division its own. */
export const PLATFORM = "PAM / secrets";

/** 1/N as a percentage — the blast radius a partitioned system bounds itself to. */
export const CONTAINED_PCT = Math.round(100 / DIVISIONS.length);

/** Blast radius (%) for a beat. `fired` = the beat's primary action has been taken
 *  (roll out the bad change; for `recover`, roll back to last-good). The settled
 *  value of each beat (fired=true) is the trail: 100 → 100 → 100 → 25 → 0. */
export function blastForBeat(beat: BeatId, fired: boolean): number {
  switch (beat) {
    case "shared":
    case "redundant":
    case "process":
      // The fix leaders bank on (redundancy, then process) cannot move it: a
      // correlated change still reaches everything.
      return fired ? 100 : 0;
    case "partition":
      // The architecture finally bounds it — confined to one cell of N.
      return fired ? CONTAINED_PCT : 0;
    case "recover":
      // Carries the partitioned aftermath (one cell down) until rolled back.
      return fired ? 0 : CONTAINED_PCT;
  }
}

/** The settled blast radius after each beat's action — the on-screen trail. */
export const BLAST_TRAIL: number[] = BEATS.map((b) => blastForBeat(b, true));

export interface BeatCopy {
  step: number;
  /** Short label for the per-attempt trail strip. */
  short: string;
  title: string;
  /** Intro narration shown before the action. */
  setup: string;
  /** Button label before the action is taken. */
  action: string;
  /** Button label after the action is taken (undo). */
  undo: string;
  /** Verdict shown once the action has been taken. */
  verdict: string;
}

export const BEAT_COPY: Record<BeatId, BeatCopy> = {
  shared: {
    step: 1,
    short: "Shared",
    title: "One shared service",
    setup:
      "Four divisions, one shared PAM / secrets service they all depend on. Roll out a bad upgrade and watch what it reaches.",
    action: "Roll out a bad upgrade",
    undo: "Roll back",
    verdict:
      "One change to the shared service took down the whole org. Obvious. Now watch the fixes leaders actually reach for.",
  },
  redundant: {
    step: 2,
    short: "Redundant",
    title: "“Make it redundant” — active-active / DR",
    setup:
      "Leadership’s first answer: redundancy. Three regions, active-active, a DR site. All green. Surely now we’re safe.",
    action: "Roll out the same bad upgrade",
    undo: "Roll back",
    verdict:
      "Redundancy protects against a server dying — an independent failure. A bad change isn’t independent: it rode the replication channel to every replica at once. The number didn’t move.",
  },
  process: {
    step: 3,
    short: "Process",
    title: "“Tighten the process” — change board + freeze",
    setup:
      "Second answer: process. A change-approval board, a freeze window, runbooks. Nothing ships without sign-off.",
    action: "Ship a change that passed review",
    undo: "Roll back",
    verdict:
      "Process lowers how often a bad change ships. It never lowers how far one reaches. And latent faults and drift walk straight past review — there was nothing to catch at the moment they bite. The number still didn’t move.",
  },
  partition: {
    step: 4,
    short: "Partition",
    title: "“Partition it” — share-nothing",
    setup:
      "The structural answer: share nothing. One cell per division — its own service, no shared substrate for a fault to cross.",
    action: "Roll out the same bad change",
    undo: "Roll back",
    verdict:
      "Only the architecture moved the number. Blast radius is now 1/N — chosen at design time, guaranteed by construction, no matter how the change got in. This is a magnitude bound, not a bet.",
  },
  recover: {
    step: 5,
    short: "Recover",
    title: "Recover",
    setup: "The hit cell rolls back to its own last-good. The other three never noticed.",
    action: "Recover (last-good)",
    undo: "Re-break",
    verdict:
      "Staged promotion would have killed this change in a lower cell before it ever reached all four. Reconcile keeps each cell’s standby identical to intent, so recovery is real — not a failover into the same latent fault.",
  },
};

/** The throughline, stated once under the trail. */
export const CLOSING_LINE =
  "Redundancy and process are probability levers. Blast radius is a magnitude problem. Only partitioning bounds the worst case.";

/** Counter color token by severity: zero is green, contained (1/N) is amber, the
 *  rest is red. */
export function blastColorVar(pct: number): string {
  if (pct === 0) return "var(--state-converged)";
  if (pct <= CONTAINED_PCT) return "var(--state-degraded)";
  return "var(--state-stalled)";
}
