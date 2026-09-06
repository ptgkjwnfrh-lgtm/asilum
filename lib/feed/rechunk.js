// lib/feed/rechunk.js — which cards a re-chunk may replace. Pure; client-safe.
//
// After enough deliberate actions the taste has moved, and the part of the
// feed the reader has NOT reached should be rebuilt from it. "Not reached" is
// a question of GEOMETRY, not list position: the catalog grid flows
// column-major, so the card at index 63 can sit in the fourth column at the
// top of the page while index 20 is two screens down. The first version used
// "everything after the last examined index" and, on a real page, found a
// tail of seven cards below a card the reader had in fact never scrolled
// past. The rule is therefore: a card is replaceable when it is entirely
// below the fold AND the reader never examined it. Everything else — on
// screen, above, or once looked at — keeps its place, so nothing visible moves.

export const RECHUNK_AFTER = 3;        // deliberate actions before a re-chunk
export const RECHUNK_MIN_REPLACE = 8;  // fewer replaceable cards → leave it to the next scroll

/**
 * @param {Array<{id:string}>} items   the rendered list, in order
 * @param {Set<string>} examined      ids the reader has looked at (r19 beacon set)
 * @param {Set<string>} belowFold     ids whose card sits entirely below the viewport
 * @returns {{ head: Array, dropped: string[] } | null}  null = not worth it
 */
export function planRechunk(items, examined, belowFold, minReplace = RECHUNK_MIN_REPLACE) {
  if (!Array.isArray(items) || !items.length) return null;
  const ex = examined instanceof Set ? examined : new Set(examined || []);
  const below = belowFold instanceof Set ? belowFold : new Set(belowFold || []);
  const dropped = [];
  const head = [];
  for (const it of items) {
    const id = it && it.id != null ? String(it.id) : "";
    if (id && below.has(id) && !ex.has(id)) dropped.push(id);
    else head.push(it);
  }
  if (dropped.length < minReplace) return null;
  return { head, dropped };
}

/** ids of `.card[data-id]` elements entirely below the viewport (plus a margin). */
export function idsBelowFold(doc, viewportHeight, margin = 0) {
  const out = new Set();
  if (!doc || typeof doc.querySelectorAll !== "function") return out;
  doc.querySelectorAll(".card[data-id]").forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top > viewportHeight + margin) out.add(el.getAttribute("data-id"));
  });
  return out;
}
