// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import react from "@astrojs/react";

// GitHub Pages: served from https://hakkiki.github.io/trellis
const SITE = "https://hakkiki.github.io";
const BASE = "/trellis";

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    react(),
    starlight({
      title: "Trellis",
      description:
        "Posture → planner → Structure → reconcile loop. The interactive simulator and design docs.",
      tagline: "Declare what you want; a reconciler keeps reality matching it.",
      disable404Route: true,
      pagefind: false,
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", slug: "docs/overview" },
            { label: "Architecture", slug: "docs/architecture" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Posture & Criticality", slug: "docs/posture" },
            { label: "Structure & State", slug: "docs/state" },
            { label: "The reconcile loop", slug: "docs/reconcile" },
          ],
        },
        {
          label: "Specification",
          items: [{ label: "Full spec", slug: "docs/spec" }],
        },
      ],
      customCss: ["./src/styles/starlight.css"],
    }),
  ],
});
