import * as React from "react";
import "./stage.css";
import type { ResourceView } from "@/sim/engine";
import type { CellKind } from "@/sim/model";
import { type State, stateColorVar } from "@/sim/state";

const GW = 760;
const GH = 520;
const PAD = 26;
const GAP = 22;
const CELL_Y: Record<CellKind, number> = { edge: 0.26, app: 0.54, data: 0.82 };
const CELL_LABEL: Record<CellKind, string> = { edge: "EDGE", app: "APP", data: "DATA" };

type Pt = { x: number; y: number };

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
  selected,
  frozenIds,
  onSelect,
}: {
  resources: ResourceView[];
  selected: string | null;
  frozenIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const [cam, setCam] = React.useState({ grx: 56, grz: -2, scale: 1 });
  const dragging = React.useRef(false);

  const regions = React.useMemo(() => [...new Set(resources.map((r) => r.region))], [resources]);

  // Lay out region frames and node centers on the ground plane.
  const { frames, nodes } = React.useMemo(() => {
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
    const nodes = resources.map((r) => {
      const fi = regions.indexOf(r.region);
      const f = frames[fi];
      const peers = resources.filter((p) => p.region === r.region && p.cell === r.cell);
      const idx = peers.indexOf(r);
      const span = 84;
      const cx = f.x + f.w / 2 + (idx - (peers.length - 1) / 2) * span;
      const cy = f.y + f.h * CELL_Y[r.cell];
      return { r, cx, cy };
    });
    return { frames, nodes };
  }, [resources, regions]);

  // Weave edges: edge→app→data within a region; replication across regions.
  const wires = React.useMemo(() => {
    const out: { p1: Pt; p2: Pt; repl?: boolean }[] = [];
    const rep = (region: string, cell: CellKind) =>
      nodes.find((n) => n.r.region === region && n.r.cell === cell);
    for (const region of regions) {
      const e = rep(region, "edge");
      const a = rep(region, "app");
      const d = rep(region, "data");
      if (e && a) out.push({ p1: { x: e.cx, y: e.cy }, p2: { x: a.cx, y: a.cy } });
      if (a && d) out.push({ p1: { x: a.cx, y: a.cy }, p2: { x: d.cx, y: d.cy } });
    }
    const dataNodes = regions
      .map((region) => nodes.find((n) => n.r.region === region && n.r.cell === "data"))
      .filter(Boolean) as { cx: number; cy: number }[];
    for (let i = 0; i + 1 < dataNodes.length; i++) {
      out.push({
        p1: { x: dataNodes[i].cx, y: dataNodes[i].cy },
        p2: { x: dataNodes[i + 1].cx, y: dataNodes[i + 1].cy },
        repl: true,
      });
    }
    return out;
  }, [nodes, regions]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = () => (dragging.current = false);
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setCam((c) => ({
      grx: Math.min(80, Math.max(22, c.grx - e.movementY * 0.18)),
      grz: Math.max(-45, Math.min(45, c.grz + e.movementX * 0.25)),
      scale: c.scale,
    }));
  };
  const onWheel = (e: React.WheelEvent) => {
    setCam((c) => ({ ...c, scale: Math.min(1.8, Math.max(0.6, c.scale - e.deltaY * 0.0012)) }));
  };

  const sceneVars = {
    "--grx": `${cam.grx}deg`,
    "--grz": `${cam.grz}deg`,
    "--scale": cam.scale,
  } as React.CSSProperties;

  return (
    <div
      className={"stage-scene"}
      style={sceneVars}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerMove={onPointerMove}
      onWheel={onWheel}
    >
      <div className="stage-lattice" />
      <div className="stage-ground">
        {frames.map((f) => (
          <div
            key={f.region}
            className="stage-region"
            style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
          >
            <span className="rlabel">◇ {f.region}</span>
          </div>
        ))}

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
          const color = stateColorVar(r.state);
          const isFrozen = frozenIds.has(r.id);
          return (
            <div
              key={r.id}
              className={`stage-node${pulse(r.state) ? " pulse" : ""}${selected === r.id ? " selected" : ""}`}
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
      </div>
      <div className="stage-hint">drag to orbit · scroll to zoom</div>
    </div>
  );
}
