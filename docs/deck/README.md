# trellis-deck — portable Marp bundle

Exported from Lattice. The slide splits are **baked into literal `---`**, so the
deck divides correctly in any Marp tool — no Lattice plugin required. Render it
with **Marp** (the VS Code extension or marp-cli); the `cuoio` palette + the
Lattice layout ride along as plain CSS, and a small browser runtime renders
Mermaid + structural components when you open the exported HTML.

## VS Code (Marp for VS Code)

1. Install the **Marp for VS Code** extension (`marp-team.marp-vscode`).
2. Open this folder — the bundled `.vscode/settings.json` already registers the
   palette via `markdown.marp.themes` (lattice.css, themes/cuoio.css, themes/cuoio-dark.css).
3. Open `trellis-deck.md` and toggle the Marp preview, or export to PDF/HTML/PPTX from
   the command palette.

## Marp CLI

```sh
npm install        # installs marp-cli (the only dependency)
npm run pdf        # → trellis-deck.pdf   (or: npm run html)
```

…or without installing, point marp-cli at the bundled themes directly:

```sh
npx @marp-team/marp-cli trellis-deck.md --theme-set lattice.css themes \
  --allow-local-files -o trellis-deck.pdf
```

Marp applies the palette + the CSS layouts (card grids, split panels, typography).
It does **not** run the Mermaid/component runtime — those render in the browser
route below.

## Full fidelity — open the HTML in a browser

`trellis-deck.html` (from `npm run html`, or any Marp HTML export of `trellis-deck.md`)
loads the bundled `mermaid-v11.min.js` + `lattice-runtime.min.js` via two
`<script>` tags at the end of the deck. Opened in a browser they render Mermaid
diagrams **and** the structural layouts (card grids, split panels, islands, badge
tables) client-side — the full deck, no install. (The VS Code preview pane blocks
inline scripts, so those show here, not in the preview.)

## Extend it with an AI agent

This bundle carries the Lattice component catalog, so an AI coding agent (Claude,
Copilot, Cursor, …) can keep authoring the deck correctly. Open this folder with
your agent and point it at `AGENTS.md` — it explains how to pick a component,
honour its slots, and stay within each layout's content **capacity** (so added
slides don't overflow).

## What's in here

| Path | What |
|---|---|
| `trellis-deck.md` | the deck — splits baked to `---`, image paths localized, runtime `<script>` tags appended |
| `AGENTS.md` | entrypoint for an AI agent extending the deck |
| `agent/components.json` | the Lattice component catalog — pick layouts, slots, capacity |
| `lattice.css` | the palette-blind engine stylesheet (minified) |
| `themes/` | the `cuoio` palette (+ dark), minified |
| `lattice-runtime.min.js`, `mermaid-v11.min.js` | render diagrams + components in the browser |
| `.vscode/settings.json` | registers the themes for the Marp VS Code preview |
| `marp.config.cjs` | Marp CLI config (registers `lattice.css` + `themes/`) |
| `package.json` | pins marp-cli (for `npm run pdf` / `npm run html`) |
| `assets/` | local images the deck references (if any) |
