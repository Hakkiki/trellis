import * as React from "react";
import "./stage.css";
import type { ResourceView, SecurityTier } from "@/sim/engine";
import type { CellKind } from "@/sim/model";
import { rollup, type State, stateColorVar } from "@/sim/state";
import { costColor, securityColor, type ViewMode, viewColor } from "./views";

const SECURITY_ORDER: SecurityTier[] = ["at-risk", "exposed", "sensitive", "internal"];

const GW = 760;
const GH = 520;
const PAD = 26;
const GAP = 22;
const CELL_Y: Record<CellKind, number> = { edge: 0.26, app: 0.54, data: 0.82 };
const CELL_LABEL: Record<CellKind, string> = { edge: "EDGE", app: "APP", data: "DATA" };

type Pt = { x: number; y: number };
type Group = {
  key: string;
  slug: string;
  cx: number;
  cy: number;
  count: number;
  state: State;
  cost: number;
  security: SecurityTier;
};

function nodeLabel(r: ResourceView): string {
  if (r.lifecycle === "job") return "JOB";
  if (r.lifecycle === "external") return "SAAS";
  if (r.lifecycle === "stateful") return "BROKER";
  return CELL_LABEL[r.cell];
}

function nodeSub(r: ResourceView): string {
  if (r.lifecycle === "job") return "nightly";
  if (r.lifecycle === "external") return "observe-only";
  if (r.lifecycle === "stateful") return r.detail ?? "quorum";
  return `${r.size}${r.cell === "app" ? ` ·${r.replicas}×` : ""}`;
}

function pulse(state: State) {
  return (
    state === "Converging" ||
    state === "Degraded" ||
    state === "Drifted" ||
    state === "Running" ||
    state === "Unavailable"
  );
}

export default function Stage3D({
  resources,
  regionState,
  view,
  maxCost,
  selected,
  frozenIds,
  focus,
  names,
  onFocus,
  onSelect,
}: {
  resources: ResourceView[];
  regionState: Record<string, State>;
  view: ViewMode;
  maxCost: number;
  selected: string | null;
  frozenIds: Set<string>;
  // Service focus: "all" shows a grouped overview (one tile per service per
  // region); a slug drills into that one service's full topology. This keeps the
  // stage readable no matter how many services the environment owns.
  focus: string;
  names: Record<string, string>;
  onFocus: (slug: string) => void;
  onSelect: (id: string) => void;
}) {
  // grx/grz orbit the camera; zoom is the user's multiplier on top of `fit`,
  // the base scale that sizes the fixed 760×520 ground plane to the container so
  // it never overflows on a phone.
  const [cam, setCam] = React.useState({ grx: 56, grz: -2, zoom: 1 });
  const [fit, setFit] = React.useState(1);
  const sceneRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  // Active touch points (for pinch) and the pinch baseline.
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{ dist: number; zoom: number } | null>(null);

  const setZoom = React.useCallback(
    (next: number | ((z: number) => number)) =>
      setCam((c) => ({
        ...c,
        zoom: Math.min(2.4, Math.max(0.5, typeof next === "function" ? next(c.zoom) : next)),
      })),
    [],
  );

  // Auto-fit the ground plane to the container width (responsive, no overflow).
  React.useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const measure = () => setFit(Math.min(1, Math.max(0.44, el.clientWidth / 700)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const regions = React.useMemo(() => [...new Set(resources.map((r) => r.region))], [resources]);
  const services = React.useMemo(() => [...new Set(resources.map((r) => r.service))], [resources]);
  // With a single service there's nothing to group, so show its weave directly.
  const activeFocus =
    focus !== "all" && services.includes(focus)
      ? focus
      : services.length === 1
        ? services[0]
        : null;
  const focused = activeFocus !== null;

  // Lay out region frames, plus either the focused service's nodes or, in the
  // overview, one group tile per service per region.
  const { frames, nodes, groups } = React.useMemo(() => {
    const R = Math.max(1, regions.length);
    const rw = (GW - 2 * PAD - (R - 1) * GAP) / R;
    const rh = GH - 2 * PAD;
    const frames = regions.map((region, i) => ({
      region,
      x: PAD + i * (rw + GAP),
      y: PAD,
      w: rw,
      h: rh,
    }));

    if (activeFocus) {
      const shown = resources.filter((r) => r.service === activeFocus);
      const nodes = shown.map((r) => {
        const f = frames[regions.indexOf(r.region)];
        const peers = shown.filter((p) => p.region === r.region && p.cell === r.cell);
        const idx = peers.indexOf(r);
        const span = 84;
        const cx = f.x + f.w / 2 + (idx - (peers.length - 1) / 2) * span;
        const cy = f.y + f.h * CELL_Y[r.cell];
        return { r, cx, cy };
      });
      return { frames, nodes, groups: [] as Group[] };
    }

    // Overview: stack one tile per service down the middle of each region frame.
    const groups: Group[] = [];
    for (const f of frames) {
      const svcs = [
        ...new Set(resources.filter((r) => r.region === f.region).map((r) => r.service)),
      ];
      svcs.forEach((slug, i) => {
        const rs = resources.filter((r) => r.region === f.region && r.service === slug);
        groups.push({
          key: `${f.region}/${slug}`,
          slug,
          cx: f.x + f.w / 2,
          cy: f.y + f.h * ((i + 1) / (svcs.length + 1)),
          count: rs.length,
          state: rollup(rs.map((r) => r.state)),
          cost: rs.reduce((sum, r) => sum + r.monthlyCost, 0),
          security: SECURITY_ORDER.find((t) => rs.some((r) => r.security === t)) ?? "internal",
        });
      });
    }
    return { frames, nodes: [] as { r: ResourceView; cx: number; cy: number }[], groups };
  }, [resources, regions, activeFocus]);

  const groupMaxCost = Math.max(0, ...groups.map((g) => g.cost));

  // Weave edges per Service: edge→app→data within a region; replication across
  // regions. Wiring per Service keeps the topology legible when the environment
  // owns more than one (§6) — chains never cross owners.
  const wires = React.useMemo(() => {
    const out: { p1: Pt; p2: Pt; repl?: boolean }[] = [];
    const services = [...new Set(resources.map((r) => r.service))];
    const rep = (svc: string, region: string, cell: CellKind) =>
      nodes.find((n) => n.r.service === svc && n.r.region === region && n.r.cell === cell);
    for (const svc of services) {
      for (const region of regions) {
        const e = rep(svc, region, "edge");
        const a = rep(svc, region, "app");
        const d = rep(svc, region, "data");
        if (e && a) out.push({ p1: { x: e.cx, y: e.cy }, p2: { x: a.cx, y: a.cy } });
        if (a && d) out.push({ p1: { x: a.cx, y: a.cy }, p2: { x: d.cx, y: d.cy } });
      }
      const dataNodes = regions.map((region) => rep(svc, region, "data")).filter(Boolean) as {
        cx: number;
        cy: number;
      }[];
      for (let i = 0; i + 1 < dataNodes.length; i++) {
        out.push({
          p1: { x: dataNodes[i].cx, y: dataNodes[i].cy },
          p2: { x: dataNodes[i + 1].cx, y: dataNodes[i + 1].cy },
          repl: true,
        });
      }
    }
    return out;
  }, [nodes, regions, resources]);

  const twoPointerDist = () => {
    const pts = [...pointers.current.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      pinch.current = { dist: twoPointerDist(), zoom: cam.zoom };
      dragging.current = false;
    } else {
      dragging.current = pointers.current.size === 1;
    }
  };
  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    dragging.current = pointers.current.size === 1;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // Pinch-to-zoom (touch): scale the zoom by the change in finger distance.
    if (pointers.current.size >= 2 && pinch.current) {
      const ratio = twoPointerDist() / pinch.current.dist;
      setZoom(pinch.current.zoom * ratio);
      return;
    }
    if (!dragging.current) return;
    setCam((c) => ({
      ...c,
      grx: Math.min(80, Math.max(22, c.grx - e.movementY * 0.18)),
      grz: Math.max(-45, Math.min(45, c.grz + e.movementX * 0.25)),
    }));
  };
  const onWheel = (e: React.WheelEvent) => {
    setZoom((z) => z - e.deltaY * 0.0014);
  };

  const sceneVars = {
    "--grx": `${cam.grx}deg`,
    "--grz": `${cam.grz}deg`,
    "--scale": fit * cam.zoom,
  } as React.CSSProperties;

  return (
    <div
      ref={sceneRef}
      className="stage-scene group"
      style={sceneVars}
      onPointerDown={onPointerDown}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={endPointer}
      onPointerMove={onPointerMove}
      onWheel={onWheel}
    >
      <div className="stage-zoom">
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => z * 1.2)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => z / 1.2)}>
          −
        </button>
        <button
          type="button"
          aria-label="Reset view"
          className="reset"
          onClick={() => setCam({ grx: 56, grz: -2, zoom: 1 })}
        >
          ⤢
        </button>
      </div>
      <div className="stage-lattice" />
      <div className="stage-ground">
        {frames.map((f) => {
          const rs = regionState[f.region] ?? "Unknown";
          const rc = stateColorVar(rs);
          return (
            <div
              key={f.region}
              className="stage-region"
              style={
                {
                  left: f.x,
                  top: f.y,
                  width: f.w,
                  height: f.h,
                  ["--rc" as string]: rc,
                } as React.CSSProperties
              }
            >
              <span className="rlabel">
                <i className="rdot" style={{ background: rc }} />
                {f.region} · {rs}
              </span>
            </div>
          );
        })}

        {wires.map((w, i) => {
          const dx = w.p2.x - w.p1.x;
          const dy = w.p2.y - w.p1.y;
          const len = Math.hypot(dx, dy);
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <div
              key={i}
              className={`stage-wire${w.repl ? " repl" : ""}`}
              style={{ left: w.p1.x, top: w.p1.y, width: len, transform: `rotateZ(${ang}deg)` }}
            />
          );
        })}

        {nodes.map(({ r, cx, cy }) => {
          const color = viewColor(r, view, maxCost);
          const isFrozen = frozenIds.has(r.id);
          const pulsing = (view === "state" || view === "health") && pulse(r.state);
          return (
            <div
              key={r.id}
              className={`stage-node${pulsing ? " pulse" : ""}${selected === r.id ? " selected" : ""}`}
              style={{ left: cx, top: cy, ["--st" as string]: color } as React.CSSProperties}
            >
              <div className="shadow" />
              <div className="stem" />
              <div
                className="face"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(r.id);
                }}
              >
                <div className="accent" />
                <div className="kind">{nodeLabel(r)}</div>
                <div className="nm">{nodeSub(r)}</div>
              </div>
              <div className="led" />
              {isFrozen && <div className="badge3d">🔒</div>}
            </div>
          );
        })}

        {groups.map((g) => {
          const color =
            view === "cost"
              ? costColor(g.cost, groupMaxCost)
              : view === "security"
                ? securityColor(g.security)
                : stateColorVar(g.state);
          const pulsing = (view === "state" || view === "health") && pulse(g.state);
          const sub =
            view === "cost"
              ? `$${g.cost}/mo · open →`
              : view === "security"
                ? `${g.security} · open →`
                : `${g.count} resources · open →`;
          return (
            <div
              key={g.key}
              className={`stage-node group${pulsing ? " pulse" : ""}`}
              style={{ left: g.cx, top: g.cy, ["--st" as string]: color } as React.CSSProperties}
            >
              <div className="shadow" />
              <div className="stem" />
              <div
                className="face"
                onClick={(e) => {
                  e.stopPropagation();
                  onFocus(g.slug);
                }}
              >
                <div className="accent" />
                <div className="kind">{names[g.slug] ?? g.slug}</div>
                <div className="nm">{sub}</div>
              </div>
              <div className="led" />
            </div>
          );
        })}
      </div>
      <div className="stage-hint">
        {focused
          ? "tap a service tile to switch · drag to orbit · pinch or scroll to zoom"
          : "tap a service to open it · drag to orbit · pinch or scroll to zoom"}
      </div>
    </div>
  );
}
