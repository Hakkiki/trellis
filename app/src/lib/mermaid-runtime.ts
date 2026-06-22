/**
 * Themed Mermaid runtime — the Trellis "cuoio" brand applied to diagrams.
 *
 * Renders the `<pre class="mermaid">` blocks emitted by `remark-mermaid.mjs`,
 * lazy-loading Mermaid only on pages that actually have a diagram, and re-themes
 * live when the reader toggles light/dark. Two curated palettes (below) keep the
 * diagrams on-brand: warm dark + gold, with the State colours available via
 * `classDef` (converged/converging/degraded/drifted/stalled) in any diagram.
 */

import { enhanceDiagram } from "./diagram-viewer";

type ThemeVars = Record<string, string>;

// Match the site body font (no web font is loaded; stay on the system stack).
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Dark — the default. Warm "cuoio" panels, gold borders, cream text.
const DARK: ThemeVars = {
  background: "transparent",
  fontFamily: FONT,
  primaryColor: "#2c2417",
  primaryBorderColor: "#c8a040",
  primaryTextColor: "#f3ead6",
  secondaryColor: "#26312a",
  secondaryBorderColor: "#5f8f6e",
  secondaryTextColor: "#e7f0e9",
  tertiaryColor: "#241d12",
  tertiaryBorderColor: "#8a7d63",
  tertiaryTextColor: "#f3ead6",
  lineColor: "#a3895a",
  textColor: "#f3ead6",
  mainBkg: "#2c2417",
  nodeBorder: "#c8a040",
  nodeTextColor: "#f3ead6",
  clusterBkg: "rgba(200, 160, 64, 0.06)",
  clusterBorder: "#6b5d3a",
  titleColor: "#e6cf94",
  edgeLabelBackground: "#221b10",
  // sequence diagrams
  actorBkg: "#2c2417",
  actorBorder: "#c8a040",
  actorTextColor: "#f3ead6",
  actorLineColor: "#a3895a",
  signalColor: "#e6cf94",
  signalTextColor: "#f3ead6",
  labelBoxBkgColor: "#2c2417",
  labelBoxBorderColor: "#c8a040",
  labelTextColor: "#f3ead6",
  loopTextColor: "#f3ead6",
  noteBkgColor: "#3a2f17",
  noteBorderColor: "#c8a040",
  noteTextColor: "#f3ead6",
  activationBkgColor: "#3a3020",
  activationBorderColor: "#c8a040",
};

// Light — cream panels, deep gold borders, warm-dark text.
const LIGHT: ThemeVars = {
  background: "transparent",
  fontFamily: FONT,
  primaryColor: "#fbf6ea",
  primaryBorderColor: "#9a7320",
  primaryTextColor: "#2a2110",
  secondaryColor: "#e9f3ec",
  secondaryBorderColor: "#3f7a52",
  secondaryTextColor: "#1f3a29",
  tertiaryColor: "#f3ecd9",
  tertiaryBorderColor: "#b6a06a",
  tertiaryTextColor: "#2a2110",
  lineColor: "#9a8a5f",
  textColor: "#2a2110",
  mainBkg: "#fbf6ea",
  nodeBorder: "#9a7320",
  nodeTextColor: "#2a2110",
  clusterBkg: "rgba(154, 115, 32, 0.07)",
  clusterBorder: "#c4ab6e",
  titleColor: "#7a5a16",
  edgeLabelBackground: "#fbf6ea",
  actorBkg: "#fbf6ea",
  actorBorder: "#9a7320",
  actorTextColor: "#2a2110",
  actorLineColor: "#9a8a5f",
  signalColor: "#7a5a16",
  signalTextColor: "#2a2110",
  labelBoxBkgColor: "#fbf6ea",
  labelBoxBorderColor: "#9a7320",
  labelTextColor: "#2a2110",
  loopTextColor: "#2a2110",
  noteBkgColor: "#f6e9c6",
  noteBorderColor: "#9a7320",
  noteTextColor: "#2a2110",
  activationBkgColor: "#f1e3bf",
  activationBorderColor: "#9a7320",
};

function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Reveal the raw source of any diagram we never managed to render. Marking it
 * `data-mermaid-error` drops the "hide until processed" CSS so the content is
 * shown legibly instead of an invisible-but-selectable empty panel. Called both
 * on hard failures and from a safety-net timeout, so a chunk that never loads
 * (blocked proxy, stale cache, offline) can't leave a blank box behind.
 */
function reveal(nodes: Iterable<HTMLElement>): void {
  for (const el of nodes) {
    if (!el.dataset.processed) {
      if (el.dataset.src !== undefined) el.textContent = el.dataset.src;
      el.setAttribute("data-mermaid-error", "");
    }
  }
}

// Load Mermaid, retrying once — the chunk is large and a single transient
// network blip otherwise leaves every diagram blank for the whole session.
async function loadMermaid(): Promise<typeof import("mermaid").default> {
  try {
    return (await import("mermaid")).default;
  } catch {
    return (await import("mermaid")).default;
  }
}

let lastTheme: string | null = null;
let running = false;

async function render(force = false): Promise<void> {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("pre.mermaid"));
  if (nodes.length === 0) return;

  const theme = currentTheme();
  const allDone = nodes.every((n) => n.dataset.processed);
  if (!force && theme === lastTheme && allDone) return;
  if (running) return;
  running = true;

  // Stash the original source once, before Mermaid replaces it with SVG.
  for (const el of nodes) {
    if (el.dataset.src === undefined) el.dataset.src = el.textContent ?? "";
  }

  // Safety net: if rendering hasn't completed in time (chunk blocked/hung),
  // reveal the source so the diagram is never an invisible empty box. A later
  // successful render clears the marker via `data-processed`.
  const safety = window.setTimeout(() => reveal(nodes), 8000);

  try {
    const mermaid = await loadMermaid();

    const reset = force || theme !== lastTheme;
    for (const el of nodes) {
      if (reset || !el.dataset.processed) {
        el.removeAttribute("data-processed");
        el.removeAttribute("data-mermaid-error");
        el.textContent = el.dataset.src ?? "";
      }
    }
    lastTheme = theme;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      themeVariables: theme === "light" ? LIGHT : DARK,
      fontFamily: FONT,
      flowchart: { curve: "basis", htmlLabels: true, padding: 16, useMaxWidth: true },
      sequence: { useMaxWidth: true, actorMargin: 56, noteMargin: 12, mirrorActors: false },
    });

    // Render each diagram independently so one bad block can't blank the rest.
    for (const el of nodes.filter((n) => !n.dataset.processed)) {
      try {
        await mermaid.run({ nodes: [el] });
        el.removeAttribute("data-mermaid-error");
        // Wrap the rendered diagram with the toolbar (fullscreen + view-source).
        // Idempotent: re-theming re-renders the SVG but keeps the existing toolbar.
        enhanceDiagram(el);
      } catch (err) {
        console.error("[mermaid] diagram failed to render", err);
        reveal([el]);
      }
    }
  } catch (err) {
    console.error("[mermaid] runtime failed to load", err);
    reveal(nodes);
  } finally {
    window.clearTimeout(safety);
    running = false;
  }
}

export function initMermaid(): void {
  const run = (): void => {
    void render();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  // Client-side navigation (when Astro's router is active).
  document.addEventListener("astro:page-load", run);

  // Re-theme live when the reader toggles light/dark (Starlight sets
  // `data-theme` on <html>).
  const observer = new MutationObserver(() => {
    void render(true);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}
