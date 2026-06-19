/**
 * Validate every ```mermaid block in the given Markdown files by parsing them
 * with the SAME Mermaid the site ships, under a real DOM (jsdom) so DOMPurify /
 * htmlLabels behave exactly like the browser. Catches "Syntax error in text"
 * before it ships — the check the LLM eyeball cannot do reliably.
 *
 * Usage: node scripts/validate-mermaid.mjs <file.md> [more.md ...]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

/** Recursively collect .md/.mdx files under a directory. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.mdx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

// A real DOM, installed as globals BEFORE mermaid (→ DOMPurify) is imported.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMPurify = undefined; // let mermaid bind its own against window

const { default: mermaid } = await import("mermaid");

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  flowchart: { htmlLabels: true, useMaxWidth: true },
  sequence: { useMaxWidth: true },
});

function extract(md) {
  const blocks = [];
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m = re.exec(md);
  while (m) {
    blocks.push(m[1]);
    m = re.exec(md);
  }
  return blocks;
}

// Files from argv, or default to scanning all docs content.
const files = process.argv.length > 2 ? process.argv.slice(2) : walk("src/content/docs");

let fail = 0;
let total = 0;
for (const file of files) {
  const blocks = extract(readFileSync(file, "utf8"));
  if (blocks.length === 0) continue;
  total += blocks.length;
  console.log(`\n${file} — ${blocks.length} mermaid block(s)`);
  for (let i = 0; i < blocks.length; i++) {
    const src = blocks[i];
    const head = (src.split("\n").find((l) => l.trim()) || "").trim().slice(0, 44);
    try {
      await mermaid.parse(src);
      console.log(`  #${i + 1} OK    [${head}]`);
    } catch (e) {
      fail++;
      console.log(`  #${i + 1} FAIL  [${head}]`);
      console.log(
        "        " +
          String(e?.message || e)
            .replace(/\n/g, "\n        ")
            .slice(0, 800),
      );
    }
  }
}
console.log(`\n${fail ? "✗" : "✓"} mermaid: ${total - fail}/${total} diagrams parse`);
process.exit(fail ? 1 : 0);
