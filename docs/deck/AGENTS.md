# AGENTS.md — extend this deck with an AI agent

This folder is a portable **Marp** bundle of the "trellis-deck" deck, exported from
Lattice. It carries the Lattice component catalog so an AI agent (Claude,
Copilot, Cursor, an SDK agent) can keep authoring the deck correctly — picking
the right layout, honouring each component's slots, and staying within its
content capacity.

## The deck

- `trellis-deck.md` — the slides. Each opts into a Lattice **component** via a
  `<!-- _class: <name> -->` directive and fills its slots with ordinary
  Markdown. Edit this file; re-render per `README.md` (Marp — the VS Code
  extension or marp-cli).

## Pick the right component

- `agent/components.json` — the machine-readable Lattice catalog: every
  component's axes, search tags, slots, authoring skeleton, **`capacity`**, and
  `whenToUse` / `antiPatterns` / `related` prose. **Load it before adding or
  changing a slide; never invent a `_class` that isn't in it.**
- **Count first, then filter by capacity.** A layout overflows when it holds
  more elements than it's built for — the most common authoring slip. Before
  choosing a `_class`, count your content (items / rows / columns / code lines)
  and check the component's `capacity` `{ axis, sweet, soft, hard, escalateTo }`:
  `sweet` is ideal, past `soft` it crowds, past `hard` it overflows. Over
  `hard`? Take an `escalateTo` target or split across slides. Not every
  component declares `capacity` yet; where it's absent, judge by the skeleton
  and split when a slide looks crowded.

## Rules agents most often break

- **Card-style layouts use nested bullets, not inline bold:** `- Title` then
  `  - body`, never `- **Title.** body`.
- **Slots + skeletons in the catalog are the contract** — follow the selectors;
  don't improvise structure.

## Provenance

The catalog is a **frozen snapshot** taken when this deck was exported
(Lattice 1.0.0). It reflects the components available then; a newer Lattice may add
more. Re-export from Lattice to refresh it.
