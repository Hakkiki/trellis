/**
 * Remark plugin: turn ```mermaid fenced code blocks into a raw
 * `<pre class="mermaid">` element so they bypass Expressive Code (the code-block
 * styler) and are picked up by the themed client runtime (`mermaid-runtime.ts`).
 *
 * The diagram source is HTML-escaped; the browser decodes it back to text, which
 * is what Mermaid reads from `textContent`.
 */

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escapeHtml(value) {
  return value.replace(/[&<>]/g, (ch) => ESCAPE[ch]);
}

function transform(node) {
  if (!node || !Array.isArray(node.children)) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "code" && child.lang === "mermaid") {
      node.children[i] = {
        type: "html",
        value: `<pre class="mermaid" role="img">${escapeHtml(child.value)}</pre>`,
      };
    } else {
      transform(child);
    }
  }
}

export default function remarkMermaid() {
  return (tree) => transform(tree);
}
