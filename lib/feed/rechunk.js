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
// The server keeps a ring of recent serves for attribution (lib/brain/index.js
// imports this): bounded by CARDS, not entries, so the sixty-card first load —
// the top of the page, the part a reader scrolls back to — is not the first
// thing evicted by a run of 24-card chunks. SERVE_RING_MAX entries is the
// hard ceiling; the client keeps the same number of records.
export const SERVE_RING_CARDS = 300;
export const SERVE_RING_MAX = 16;
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

/**
 * Apply a chunk to the rendered list IN PLACE: each dropped card is replaced
 * by the next fresh item at the same position, the remainder is appended, and
 * nothing that was not planned for replacement is touched — a card inserted
 * or removed while the chunk was in flight keeps whatever place it has. The
 * catalog grid is CSS multi-column with balanced columns, so removing cards
 * from the middle re-flows every column break; replacing one-for-one keeps
 * the column breaks, and the cards the reader is looking at, where they are.
 * Bounded by `max` (the rendered ceiling) and never repeats an id.
 */
export function applyRechunk(prev, dropped, fresh, { max = Infinity } = {}) {
  const drop = new Set(dropped || []);
  const have = new Set((prev || []).filter((x) => x && !drop.has(String(x.id))).map((x) => String(x.id)));
  const queue = [];
  for (const it of fresh || []) {
    const id = it && it.id != null ? String(it.id) : "";
    if (!id || have.has(id)) continue;
    have.add(id);
    queue.push(it);
  }
  const out = [];
  for (const x of prev || []) {
    if (x && drop.has(String(x.id))) {
      // A planned card is REPLACED, never merely removed: with no fresh item
      // left to stand in its place it stays, so a chunk of 24 can only ever
      // change 24 cards, however many the plan marked replaceable.
      const next = queue.shift();
      out.push(next || x);
      continue;
    }
    out.push(x);
  }
  while (queue.length && out.length < max) out.push(queue.shift());
  return out;
}

/**
 * Place items in N columns with a MEMORY of where each id already sits.
 *
 * A column is part of a card's state, not a function of its index: derived
 * from the index, removing one card (a PASS) shifts every later card one slot
 * (59 of 59 moved for a pass at the top — a verifier's measurement, 7 Sep).
 * Here a known id keeps its column; a newcomer takes the shortest column;
 * within a column, cards keep list order — so a replacement made in place
 * (applyRechunk) lands where the card it replaced stood, and a removal
 * shortens only its own column. `memo` is a Map id → column the caller keeps
 * across renders (and discards when the column count changes).
 */
export function placeInColumns(items, count, memo) {
  const n = Math.max(1, Math.trunc(Number(count)) || 1);
  const map = memo instanceof Map ? memo : new Map();
  const live = new Set();
  const cols = Array.from({ length: n }, () => []);
  (items || []).forEach((it, idx) => {
    if (!it || it.id == null) return;
    const id = String(it.id);
    live.add(id);
    const c = map.get(id);
    if (c !== undefined && c < n) cols[c].push({ it, idx });
  });
  for (const id of [...map.keys()]) if (!live.has(id)) map.delete(id);
  (items || []).forEach((it, idx) => {
    if (!it || it.id == null) return;
    const id = String(it.id);
    if (map.has(id) && map.get(id) < n) return;
    let best = 0;
    for (let c = 1; c < n; c++) if (cols[c].length < cols[best].length) best = c;
    map.set(id, best);
    cols[best].push({ it, idx });
  });
  return cols.map((col) => col.sort((a, b) => a.idx - b.idx).map((x) => x.it));
}
