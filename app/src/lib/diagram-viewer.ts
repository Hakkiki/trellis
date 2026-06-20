/**
 * Interactive viewer for rendered Mermaid diagrams.
 *
 * After `mermaid-runtime.ts` turns a `<pre class="mermaid">` into SVG, we wrap it
 * with a small on-brand toolbar:
 *   • ⤢  open the diagram in a full-screen overlay (great in landscape on mobile)
 *   • </> view the diagram's source (with copy)
 *
 * The overlay supports pan + zoom through a single Pointer-Events path, so the
 * same code covers every device:
 *   • touch  — drag to pan, pinch to zoom
 *   • mouse  — wheel to zoom, click-drag to pan
 *   • double-click / double-tap — reset
 *
 * The pan/zoom maths is pure (see `zoomAt` / `panBy` / `clampScale`) and unit
 * tested; the rest is thin DOM glue.
 */

export interface ViewState {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 40;

export const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Zoom by `factor` while keeping the point (cx, cy) — in viewport pixels — fixed. */
export function zoomAt(state: ViewState, factor: number, cx: number, cy: number): ViewState {
  const scale = clampScale(state.scale * factor);
  const k = scale / state.scale;
  return {
    scale,
    x: cx - (cx - state.x) * k,
    y: cy - (cy - state.y) * k,
  };
}

export function panBy(state: ViewState, dx: number, dy: number): ViewState {
  return { scale: state.scale, x: state.x + dx, y: state.y + dy };
}

const IDENTITY: ViewState = { scale: 1, x: 0, y: 0 };

interface PanZoom {
  reset(): void;
  destroy(): void;
}

/** Attach pan/zoom to `content` inside `viewport`, driven by pointer + wheel. */
function attachPanZoom(viewport: HTMLElement, content: HTMLElement): PanZoom {
  let state: ViewState = { ...IDENTITY };
  const pointers = new Map<number, { x: number; y: number }>();
  // Pinch bookkeeping (recomputed whenever the pointer count is 2).
  let pinchDist = 0;
  let pinchMid = { x: 0, y: 0 };

  const apply = (): void => {
    content.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  };
  const local = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = viewport.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const centroid = (): { x: number; y: number; dist: number } => {
    const pts = [...pointers.values()];
    const mx = (pts[0].x + pts[1].x) / 2;
    const my = (pts[0].y + pts[1].y) / 2;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return { x: mx, y: my, dist: Math.hypot(dx, dy) };
  };

  const onPointerDown = (e: PointerEvent): void => {
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e.clientX, e.clientY));
    if (pointers.size === 2) {
      const c = centroid();
      pinchDist = c.dist;
      pinchMid = { x: c.x, y: c.y };
    }
  };
  const onPointerMove = (e: PointerEvent): void => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = local(e.clientX, e.clientY);
    pointers.set(e.pointerId, cur);

    if (pointers.size === 1) {
      state = panBy(state, cur.x - prev.x, cur.y - prev.y);
      apply();
    } else if (pointers.size === 2) {
      const c = centroid();
      if (pinchDist > 0) {
        state = zoomAt(state, c.dist / pinchDist, c.x, c.y);
        state = panBy(state, c.x - pinchMid.x, c.y - pinchMid.y);
        apply();
      }
      pinchDist = c.dist;
      pinchMid = { x: c.x, y: c.y };
    }
  };
  const onPointerUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const c = centroid();
      pinchDist = c.dist;
      pinchMid = { x: c.x, y: c.y };
    }
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = local(e.clientX, e.clientY);
    state = zoomAt(state, e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    apply();
  };
  const reset = (): void => {
    state = { ...IDENTITY };
    apply();
  };
  // Fit the content to the viewport and centre it (used on open + reset).
  const fitToView = (): void => {
    const r = viewport.getBoundingClientRect();
    const cw = content.offsetWidth;
    const ch = content.offsetHeight;
    if (!cw || !ch || !r.width || !r.height) {
      reset();
      return;
    }
    const scale = clampScale(Math.min((r.width * 0.92) / cw, (r.height * 0.92) / ch));
    state = { scale, x: (r.width - cw * scale) / 2, y: (r.height - ch * scale) / 2 };
    apply();
  };

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerUp);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("dblclick", fitToView);

  fitToView();
  // Re-fit once layout settles (fonts/SVG metrics can land a frame late).
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fitToView);
  return {
    reset: fitToView,
    destroy(): void {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("pointercancel", onPointerUp);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("dblclick", fitToView);
    },
  };
}

// ---------------------------------------------------------------------------
// Overlay (full-screen pan/zoom + source) — one instance, reused.
// ---------------------------------------------------------------------------

interface Overlay {
  open(svg: SVGElement, source: string, mode: "diagram" | "code"): void;
}

function icon(path: string): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
const ICON_EXPAND = icon(
  '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
);
const ICON_CODE = icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');
const ICON_CLOSE = icon(
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
);
const ICON_RESET = icon(
  '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
);
const ICON_COPY = icon(
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
);

let overlaySingleton: Overlay | null = null;

function getOverlay(): Overlay {
  if (overlaySingleton) return overlaySingleton;

  const root = document.createElement("div");
  root.className = "diagram-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.hidden = true;
  root.innerHTML = `
    <div class="diagram-overlay__bar">
      <div class="diagram-overlay__tabs" role="tablist">
        <button type="button" data-tab="diagram" class="is-active">Diagram</button>
        <button type="button" data-tab="code">Code</button>
      </div>
      <div class="diagram-overlay__actions">
        <button type="button" data-act="reset" aria-label="Reset view" title="Reset view">${ICON_RESET}</button>
        <button type="button" data-act="copy" aria-label="Copy source" title="Copy source">${ICON_COPY}<span>Copy</span></button>
        <button type="button" data-act="close" aria-label="Close" title="Close (Esc)">${ICON_CLOSE}</button>
      </div>
    </div>
    <div class="diagram-overlay__body">
      <div class="diagram-overlay__viewport" data-pane="diagram"><div class="diagram-overlay__content"></div></div>
      <pre class="diagram-overlay__code" data-pane="code"><code></code></pre>
    </div>`;
  document.body.appendChild(root);

  const viewport = root.querySelector<HTMLElement>(".diagram-overlay__viewport")!;
  const content = root.querySelector<HTMLElement>(".diagram-overlay__content")!;
  const codePane = root.querySelector<HTMLElement>(".diagram-overlay__code")!;
  const codeEl = codePane.querySelector("code")!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const copyBtn = root.querySelector<HTMLButtonElement>('[data-act="copy"]')!;
  let pz: PanZoom | null = null;

  const setMode = (mode: "diagram" | "code"): void => {
    for (const t of tabs) t.classList.toggle("is-active", t.dataset.tab === mode);
    root.dataset.mode = mode;
  };
  const close = (): void => {
    root.hidden = true;
    document.body.classList.remove("diagram-overlay-open");
    pz?.destroy();
    pz = null;
    content.replaceChildren();
  };

  root.querySelector('[data-act="close"]')!.addEventListener("click", close);
  root.querySelector('[data-act="reset"]')!.addEventListener("click", () => pz?.reset());
  for (const t of tabs)
    t.addEventListener("click", () => setMode(t.dataset.tab as "diagram" | "code"));
  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  document.addEventListener("keydown", (e) => {
    if (!root.hidden && e.key === "Escape") close();
  });
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeEl.textContent ?? "");
      const label = copyBtn.querySelector("span");
      if (label) {
        label.textContent = "Copied";
        setTimeout(() => {
          label.textContent = "Copy";
        }, 1400);
      }
    } catch {
      /* clipboard may be unavailable; no-op */
    }
  });

  overlaySingleton = {
    open(svg, source, mode): void {
      // Give the clone a definite intrinsic size from its viewBox and drop
      // Mermaid's max-width cap, so CSS-transform zoom scales it without a
      // ceiling (vector, stays crisp at any scale).
      const vb = svg.getAttribute("viewBox");
      const dims = vb ? vb.split(/[\s,]+/).map(Number) : null;
      if (dims && dims.length === 4 && dims[2] > 0 && dims[3] > 0) {
        svg.setAttribute("width", String(dims[2]));
        svg.setAttribute("height", String(dims[3]));
        svg.style.width = `${dims[2]}px`;
        svg.style.height = `${dims[3]}px`;
      } else {
        svg.removeAttribute("height");
      }
      svg.style.maxWidth = "none";
      svg.style.maxHeight = "none";
      content.replaceChildren(svg);
      codeEl.textContent = source;
      setMode(mode);
      root.hidden = false;
      document.body.classList.add("diagram-overlay-open");
      pz?.destroy();
      pz = attachPanZoom(viewport, content);
    },
  };
  return overlaySingleton;
}

// ---------------------------------------------------------------------------
// Inline toolbar
// ---------------------------------------------------------------------------

/** Wrap a rendered `pre.mermaid` with a toolbar. Idempotent. */
export function enhanceDiagram(pre: HTMLElement): void {
  if (pre.dataset.enhanced) return;
  const source = pre.dataset.src ?? pre.textContent ?? "";

  const figure = document.createElement("figure");
  figure.className = "diagram";
  const toolbar = document.createElement("div");
  toolbar.className = "diagram__toolbar";
  toolbar.innerHTML = `
    <button type="button" data-act="expand" aria-label="Open full screen" title="Full screen">${ICON_EXPAND}</button>
    <button type="button" data-act="code" aria-label="View source" title="View source">${ICON_CODE}</button>`;

  pre.parentNode?.insertBefore(figure, pre);
  figure.appendChild(toolbar);
  figure.appendChild(pre);
  pre.dataset.enhanced = "1";

  const openWith = (mode: "diagram" | "code"): void => {
    const svg = pre.querySelector("svg");
    if (!svg) return;
    getOverlay().open(svg.cloneNode(true) as SVGElement, source, mode);
  };
  toolbar
    .querySelector('[data-act="expand"]')!
    .addEventListener("click", () => openWith("diagram"));
  toolbar.querySelector('[data-act="code"]')!.addEventListener("click", () => openWith("code"));
}
