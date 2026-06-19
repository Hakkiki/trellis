// @ts-check

import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import remarkMermaid from "./src/lib/remark-mermaid.mjs";

// GitHub Pages: served from https://hakkiki.github.io/trellis
const SITE = "https://hakkiki.github.io";
const BASE = "/trellis";

export default defineConfig({
  site: SITE,
  base: BASE,
  // Render ```mermaid fences as diagrams (themed client-side in Head.astro).
  markdown: { remarkPlugins: [remarkMermaid] },
  integrations: [
    react(),
    starlight({
      title: "Trellis",
      description:
        "Posture → planner → Structure → reconcile loop. The interactive simulator and design docs.",
      logo: {
        light: "./src/assets/trellis-lockup.svg",
        dark: "./src/assets/trellis-lockup-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/hakkiki/trellis" }],
      disable404Route: true,
      pagefind: false,
      // Sidebar is organized by *genre* so it's obvious what each page is:
      // the story (narrative), orientation, model primers, applied decisions,
      // and the normative specification (the source of truth).
      sidebar: [
        {
          label: "The case (start here)",
          items: [
            { label: "The case", slug: "docs/the-case" },
            { label: "Why Trellis — use case", slug: "docs/use-case" },
            // Standalone page (not a docs entry), so use an absolute `link` —
            // Starlight does not prepend the base path to sidebar `link`s.
            { label: "Blast radius (demo)", link: "/trellis/blast-radius" },
          ],
        },
        {
          label: "Orientation",
          items: [
            { label: "Overview", slug: "docs/overview" },
            { label: "FAQ", slug: "docs/faq" },
            { label: "What's new", slug: "docs/changelog" },
          ],
        },
        {
          label: "Concepts (the model)",
          items: [
            { label: "Posture & Criticality", slug: "docs/posture" },
            { label: "Structure & State", slug: "docs/state" },
            { label: "The reconcile loop", slug: "docs/reconcile" },
            { label: "Promotion", slug: "docs/promotion" },
          ],
        },
        {
          label: "Architecture & decisions",
          items: [
            { label: "Operating model", slug: "docs/operating-model" },
            { label: "Bootstrap & footprint", slug: "docs/bootstrap" },
            { label: "Inversion stress test", slug: "docs/hardening" },
            { label: "Provider crosswalk", slug: "docs/provider-crosswalk" },
            { label: "Architecture", slug: "docs/architecture" },
          ],
        },
        {
          label: "Specification (source of truth)",
          items: [{ label: "Full spec", slug: "docs/spec" }],
        },
      ],
      customCss: ["./src/styles/starlight.css"],
      components: {
        // Boot the themed Mermaid runtime from the document head.
        Head: "./src/components/Head.astro",
      },
    }),
  ],
});
