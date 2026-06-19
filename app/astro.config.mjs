// @ts-check

import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

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
      logo: {
        light: "./src/assets/trellis-lockup.svg",
        dark: "./src/assets/trellis-lockup-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/hakkiki/trellis" }],
      disable404Route: true,
      pagefind: false,
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", slug: "docs/overview" },
            { label: "What's new", slug: "docs/changelog" },
            { label: "Architecture", slug: "docs/architecture" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Posture & Criticality", slug: "docs/posture" },
            { label: "Structure & State", slug: "docs/state" },
            { label: "The reconcile loop", slug: "docs/reconcile" },
            { label: "Promotion", slug: "docs/promotion" },
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
