// lib/wardrobe/flow.js — THE CLOSET'S COVER FLOW, AS RULES (V.2 brief §8).
// Client-safe and pure: which cards sit around the selected one, how a
// lookup narrows the closet, how a key or a button moves the selection.
// The component (app/components/WardrobeFlow.jsx) only draws what these say,
// so the behaviour a tester relies on can be held by a test.

export const FLOW_SPAN = 2;          // cards drawn on each side of the selected one
export const VIEWS = Object.freeze(["flow", "grid", "list"]);

/** The cards around `selected`: [{ item, offset }] with offset −span..+span, bounded by the ends. */
export function flowWindow(items = [], selected = 0, span = FLOW_SPAN) {
  const n = items.length;
  if (!n) return [];
  const i = Math.max(0, Math.min(n - 1, selected));
  const out = [];
  for (let k = -span; k <= span; k++) {
    const j = i + k;
    if (j < 0 || j >= n) continue;
    out.push({ item: items[j], offset: k, index: j });
  }
  return out;
}

/** Direct lookup: title, brand, category or size, case-folded; empty = everything. */
export function filterWardrobe(items = [], q = "") {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return items;
  return items.filter((p) => [p.title, p.brand, p.category, p.sizeLabel].some((f) => String(f || "").toLowerCase().includes(needle)));
}

/** Move the selection by `delta`, clamped (the closet has ends; it does not wrap). */
export function step(selected, delta, count) {
  if (!count) return 0;
  return Math.max(0, Math.min(count - 1, selected + delta));
}

/** Which selection survives a re-filter: the same piece if still present, else the first. */
export function keepSelection(items = [], selectedId = null) {
  const i = items.findIndex((p) => String(p.id) === String(selectedId));
  return i >= 0 ? i : 0;
}
