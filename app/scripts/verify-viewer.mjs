// Manual browser check for the diagram viewer. Requires a Chromium binary and a
// running `npm run preview`. Run: CHROME_PATH=/path/to/chrome node scripts/verify-viewer.mjs
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.PREVIEW_URL || "http://localhost:4321/trellis";
const OUT = "/tmp/shots";

import { mkdirSync } from "node:fs";

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb"],
});

const log = (...a) => console.log(...a);
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push(String(e)));

await page.goto(`${BASE}/docs/roles/`, { waitUntil: "networkidle0", timeout: 60000 });

// Wait for mermaid to render to SVG and the toolbar to be attached.
await page.waitForSelector("figure.diagram svg", { timeout: 30000 });
const counts = await page.evaluate(() => ({
  diagrams: document.querySelectorAll("figure.diagram").length,
  svgs: document.querySelectorAll("figure.diagram svg").length,
  toolbars: document.querySelectorAll(".diagram__toolbar").length,
  errorTexts: [...document.querySelectorAll("svg")].filter((s) =>
    /Syntax error/i.test(s.textContent || ""),
  ).length,
  expandBtns: document.querySelectorAll('.diagram__toolbar [data-act="expand"]').length,
}));
log("PAGE COUNTS:", JSON.stringify(counts));
await page.screenshot({ path: `${OUT}/01-roles-full.png`, fullPage: true });

// Screenshot the map (diagram 1) and a journey diagram tightly.
const firstFig = await page.$("figure.diagram");
await firstFig.screenshot({ path: `${OUT}/02-map.png` });

// Find a journey diagram (its SVG contains text "journey"? no) — screenshot the
// figure that follows an h3 "Service / Engineering teams" journey by index.
const figHandles = await page.$$("figure.diagram");
log("figure handles:", figHandles.length);
// Heuristic: journey diagrams render with class 'journey' on the svg or specific marker.
const journeyInfo = await page.evaluate(() => {
  const figs = [...document.querySelectorAll("figure.diagram")];
  return figs.map((f, i) => {
    const svg = f.querySelector("svg");
    const id = svg?.id || "";
    const aria = svg?.getAttribute("aria-roledescription") || "";
    return { i, id, aria, w: svg?.getBoundingClientRect().width | 0 };
  });
});
log("DIAGRAM TYPES:", JSON.stringify(journeyInfo));

// journey-figs: screenshot journey diagrams (indices 4,6,8)
{
  const all = await page.$$("figure.diagram");
  for (const idx of [4, 6, 8]) {
    if (all[idx]) await all[idx].screenshot({ path: `${OUT}/journey-${idx}.png` });
  }
}
// Open the overlay via the first diagram's expand button.
await page.click('figure.diagram .diagram__toolbar [data-act="expand"]');
await page.waitForSelector(".diagram-overlay:not([hidden])", { timeout: 5000 });
await new Promise((r) => setTimeout(r, 300));
const ov1 = await page.evaluate(() => {
  const o = document.querySelector(".diagram-overlay");
  const c = o.querySelector(".diagram-overlay__content");
  return {
    hidden: o.hidden,
    mode: o.dataset.mode,
    hasSvg: !!o.querySelector(".diagram-overlay__content svg"),
    transform: getComputedStyle(c).transform,
    bodyLocked: document.body.classList.contains("diagram-overlay-open"),
    zTop: getComputedStyle(o).zIndex,
  };
});
log("OVERLAY OPEN:", JSON.stringify(ov1));
await page.screenshot({ path: `${OUT}/03-overlay-open.png` });

// Wheel zoom over the viewport center; confirm the transform changes.
const vp = await page.$(".diagram-overlay__viewport");
const box = await vp.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel({ deltaY: -600 });
await new Promise((r) => setTimeout(r, 150));
const afterWheel = await page.evaluate(
  () => getComputedStyle(document.querySelector(".diagram-overlay__content")).transform,
);
log("AFTER WHEEL transform:", afterWheel);
await page.screenshot({ path: `${OUT}/04-overlay-zoomed.png` });

// DEEP ZOOM: several wheel-ups to confirm no scaling ceiling/clipping
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel({ deltaY: -500 });
}
await new Promise((r) => setTimeout(r, 150));
const deep = await page.evaluate(
  () => getComputedStyle(document.querySelector(".diagram-overlay__content")).transform,
);
log("DEEP ZOOM transform:", deep);
await page.screenshot({ path: `${OUT}/04b-deepzoom.png` });
await page.click('.diagram-overlay [data-act="reset"]');
await new Promise((r) => setTimeout(r, 150));
// Drag to pan.
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 220, box.y + box.height / 2 - 120, { steps: 10 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 150));
const afterPan = await page.evaluate(
  () => getComputedStyle(document.querySelector(".diagram-overlay__content")).transform,
);
log("AFTER PAN transform:", afterPan);
await page.screenshot({ path: `${OUT}/05-overlay-panned.png` });

// Switch to code tab.
await page.click('.diagram-overlay [data-tab="code"]');
await new Promise((r) => setTimeout(r, 150));
const codeState = await page.evaluate(() => {
  const o = document.querySelector(".diagram-overlay");
  return {
    mode: o.dataset.mode,
    codeVisible: getComputedStyle(o.querySelector(".diagram-overlay__code")).display,
    code: (o.querySelector(".diagram-overlay__code code").textContent || "").slice(0, 40),
  };
});
log("CODE TAB:", JSON.stringify(codeState));
await page.screenshot({ path: `${OUT}/06-overlay-code.png` });

// Close with Escape.
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 150));
const closed = await page.evaluate(() => document.querySelector(".diagram-overlay").hidden);
log("CLOSED via Esc:", closed);

// Mobile landscape emulation — verify overlay fills screen.
await page.setViewport({
  width: 844,
  height: 390,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector("figure.diagram svg", { timeout: 30000 });
await page.click('figure.diagram .diagram__toolbar [data-act="expand"]');
await page.waitForSelector(".diagram-overlay:not([hidden])", { timeout: 5000 });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${OUT}/07-mobile-landscape-overlay.png` });
const mob = await page.evaluate(() => {
  const o = document.querySelector(".diagram-overlay");
  const r = o.getBoundingClientRect();
  return { w: r.width | 0, h: r.height | 0, vw: innerWidth, vh: innerHeight };
});
log("MOBILE OVERLAY box:", JSON.stringify(mob));

log("CONSOLE ERRORS:", errs.length ? JSON.stringify(errs) : "none");
await browser.close();
log("done");
