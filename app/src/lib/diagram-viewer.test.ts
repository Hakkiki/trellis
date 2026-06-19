// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clampScale,
  enhanceDiagram,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  type ViewState,
  zoomAt,
} from "./diagram-viewer";

describe("pan/zoom maths", () => {
  it("clamps scale to [MIN, MAX]", () => {
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });

  it("zoomAt keeps the focal point fixed in content space", () => {
    const start: ViewState = { scale: 1, x: 0, y: 0 };
    const cx = 120;
    const cy = 80;
    const contentBefore = { x: (cx - start.x) / start.scale, y: (cy - start.y) / start.scale };
    const next = zoomAt(start, 2, cx, cy);
    const contentAfter = { x: (cx - next.x) / next.scale, y: (cy - next.y) / next.scale };
    expect(next.scale).toBe(2);
    expect(contentAfter.x).toBeCloseTo(contentBefore.x, 6);
    expect(contentAfter.y).toBeCloseTo(contentBefore.y, 6);
  });

  it("zoomAt respects clamping without moving an out-of-range focal point oddly", () => {
    const next = zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, 2, 50, 50);
    expect(next.scale).toBe(MAX_SCALE); // already at max → unchanged scale
  });

  it("panBy translates and preserves scale", () => {
    expect(panBy({ scale: 3, x: 10, y: 20 }, 5, -4)).toEqual({ scale: 3, x: 15, y: 16 });
  });
});

describe("enhanceDiagram", () => {
  beforeEach(() => {
    // Clear diagrams between tests but keep the reused overlay singleton, which
    // (as in the real app) lives on <body> for the page's lifetime.
    for (const el of document.querySelectorAll("figure.diagram, pre.mermaid")) el.remove();
  });

  function makePre(): HTMLElement {
    const pre = document.createElement("pre");
    pre.className = "mermaid";
    pre.dataset.src = "flowchart LR\n A-->B";
    pre.dataset.processed = "true";
    pre.innerHTML = "<svg><g></g></svg>";
    document.body.appendChild(pre);
    return pre;
  }

  it("wraps the diagram in a figure with a fullscreen and code button", () => {
    const pre = makePre();
    enhanceDiagram(pre);
    const figure = document.querySelector("figure.diagram");
    expect(figure).not.toBeNull();
    expect(figure?.contains(pre)).toBe(true);
    expect(figure?.querySelector('[data-act="expand"]')).not.toBeNull();
    expect(figure?.querySelector('[data-act="code"]')).not.toBeNull();
    expect(pre.dataset.enhanced).toBe("1");
  });

  it("is idempotent — re-running does not add a second toolbar", () => {
    const pre = makePre();
    enhanceDiagram(pre);
    enhanceDiagram(pre);
    expect(document.querySelectorAll("figure.diagram").length).toBe(1);
    expect(document.querySelectorAll(".diagram__toolbar").length).toBe(1);
  });

  it("opens a full-screen overlay carrying a clone of the SVG when expanded", () => {
    const pre = makePre();
    enhanceDiagram(pre);
    (pre.parentElement?.querySelector('[data-act="expand"]') as HTMLButtonElement).click();
    const overlay = document.querySelector(".diagram-overlay");
    expect(overlay).not.toBeNull();
    expect((overlay as HTMLElement).hidden).toBe(false);
    expect(overlay?.querySelector(".diagram-overlay__content svg")).not.toBeNull();
    expect(document.body.classList.contains("diagram-overlay-open")).toBe(true);
  });

  it("opens the overlay in code mode showing the source when the code button is used", () => {
    const pre = makePre();
    enhanceDiagram(pre);
    (pre.parentElement?.querySelector('[data-act="code"]') as HTMLButtonElement).click();
    const overlay = document.querySelector(".diagram-overlay") as HTMLElement;
    expect(overlay.dataset.mode).toBe("code");
    expect(overlay.querySelector(".diagram-overlay__code code")?.textContent).toContain(
      "flowchart LR",
    );
  });
});
