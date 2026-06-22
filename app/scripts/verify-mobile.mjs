// Mobile (iPhone-ish) check for the diagram overlay: does the SVG fill the
// full-screen container, and does a synthetic two-finger pinch zoom it?
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.PREVIEW_URL || "http://localhost:4321/trellis";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

async function run(label, w, h, shot) {
  const p = await b.newPage();
  await p.emulate({
    viewport: { width: w, height: h, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: IOS_UA,
  });
  await p.goto(`${BASE}/docs/roles/`, { waitUntil: "networkidle0", timeout: 60000 });
  await p.waitForSelector("figure.diagram svg", { timeout: 30000 });
  const perr = [];
  p.on("pageerror", (e) => perr.push(String(e)));
  p.on("console", (m) => m.type() === "error" && perr.push(m.text()));
  await p.click('figure.diagram .diagram__toolbar [data-act="expand"]');
  await p.waitForSelector(".diagram-overlay:not([hidden])", { timeout: 5000 });
  await p.waitForSelector(".diagram-overlay__content svg", { timeout: 8000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  if (perr.length) console.log(`${label} page errors:`, JSON.stringify(perr.slice(0, 3)));

  const before = await p.evaluate(() => {
    const vp = document.querySelector(".diagram-overlay__viewport").getBoundingClientRect();
    const svg = document.querySelector(".diagram-overlay__content svg").getBoundingClientRect();
    const t = getComputedStyle(document.querySelector(".diagram-overlay__content")).transform;
    return {
      vpW: Math.round(vp.width),
      vpH: Math.round(vp.height),
      svgW: Math.round(svg.width),
      svgH: Math.round(svg.height),
      t,
    };
  });

  // Synthetic two-finger pinch (open) via PointerEvents on the viewport.
  const scaleAfter = await p.evaluate(() => {
    const vp = document.querySelector(".diagram-overlay__viewport");
    const r = vp.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const pe = (type, id, x, y) =>
      vp.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    // two fingers start 40px apart, end 280px apart (pinch out → zoom in)
    pe("pointerdown", 1, cx - 20, cy);
    pe("pointerdown", 2, cx + 20, cy);
    for (let i = 1; i <= 8; i++) {
      const d = 20 + i * 15;
      pe("pointermove", 1, cx - d, cy);
      pe("pointermove", 2, cx + d, cy);
    }
    pe("pointerup", 1, cx - 140, cy);
    pe("pointerup", 2, cx + 140, cy);
    const m = new DOMMatrixReadOnly(
      getComputedStyle(document.querySelector(".diagram-overlay__content")).transform,
    );
    return m.a; // scale x
  });

  await p.screenshot({ path: `/tmp/shots/${shot}` });
  const fillPct = Math.round((before.svgW / before.vpW) * 100);
  console.log(
    `${label}: viewport ${before.vpW}x${before.vpH}, svg ${before.svgW}x${before.svgH} (${fillPct}% width), pinch scale→ ${scaleAfter.toFixed(2)}`,
  );
  await p.close();
}

await run("PORTRAIT", 390, 844, "mob-portrait.png");
await run("LANDSCAPE", 844, 390, "mob-landscape.png");
await b.close();
console.log("done");
