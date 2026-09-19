import { parseHTML } from "linkedom";
import { WIKIPEDIA_EXTRACTOR_VERSION, paragraphHash } from "./contract.js";

const NON_PROSE = [
  "script", "style", "noscript", "template", "link", "meta",
  "sup.reference", ".mw-editsection", ".mw-cite-backlink", ".noprint",
];

const normalizeText = (value) => String(value || "")
  .replace(/\u00a0/g, " ").replace(/[ \t\f\v]+/g, " ")
  .replace(/\s*\n\s*/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();

/**
 * Extract the first direct, substantive lead paragraph from MediaWiki parser
 * HTML. We remove only non-prose/citation display nodes and record each class
 * of editorial cleanup. The returned paragraph is plain text; remote HTML is
 * never retained as executable markup.
 */
export function extractWikipediaLead(html) {
  const { document } = parseHTML(String(html || ""));
  const root = document.querySelector(".mw-parser-output");
  if (!root) return { ok: false, reason: "parser_output_missing" };
  const paragraphs = [...root.children].filter((node) => node.tagName === "P");
  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = paragraphs[index];
    if (paragraph.classList.contains("mw-empty-elt")) continue;
    const clone = paragraph.cloneNode(true);
    const modifications = new Set(["HTML links converted to plain text", "whitespace normalized"]);
    for (const selector of NON_PROSE) {
      const nodes = [...clone.querySelectorAll(selector)];
      if (nodes.length && selector.includes("reference")) modifications.add("citation markers removed");
      if (nodes.length && selector === ".noprint") modifications.add("non-print display markup removed");
      for (const node of nodes) node.remove();
    }
    const text = normalizeText(clone.textContent);
    if (text.length < 60) continue;
    if (!/\p{L}/u.test(text)) continue;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 10) continue;
    return {
      ok: true,
      text,
      sourceParagraph: text,
      renderedText: text,
      selector: `.mw-parser-output > p:nth-of-type(${index + 1})`,
      extractorVersion: WIKIPEDIA_EXTRACTOR_VERSION,
      contentHash: paragraphHash(text),
      editorialModifications: [...modifications],
    };
  }
  return { ok: false, reason: "substantive_lead_missing" };
}
