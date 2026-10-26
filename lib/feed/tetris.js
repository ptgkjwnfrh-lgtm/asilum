// lib/feed/tetris.js — THE FEED AS TETRIS (owner's feed sketch, 25 Oct 2026:
// "the feed is comprised of multiple different forms of media — stills and
// motions, BRDCSTs, songs, piece listings and locations — they all vary in
// size and should fit randomly and uniformly on the feed with even spacing
// like tetris"). PURE and client-safe.
//
// THE GRID. A fixed number of columns (5 on a phone, 10 on a tablet or a
// small laptop, 15 wider — feedColsFor) and half-column rows: two rows and a gap make one column
// width, so a card W columns wide and 2W rows tall is square. Every card is
// one of a few sizes its kind allows (SPANS); the gap between all of them is
// the same.
//
// THE PACKING is a skyline: each card, in feed order, goes where it traps
// no cells beneath it — the lowest such spot — in whichever of its sizes
// fills it best — so a tall piece ends up with two small cards stacked beside
// it, the owner's sketch, without anyone arranging it. A placement that
// would leave a one-column well nothing can ever fill is refused while a
// better one exists. Where two sizes fit equally well the card's own id
// decides, so the feed is varied but the same card always lands the same
// way. A full-width card (a BRDCST strip, the motion row) waits
// until the skyline is level, so it never leaves a hole beneath it.

import { postType } from "./types.js";

/** Columns for a feed this wide (px): a column stays roughly 60–75px, so a
 *  card is the same size in the hand on a phone, a tablet and a laptop —
 *  more columns, not bigger cards. Multiples of five keep the sketch's
 *  three-and-two split. */
export function feedColsFor(width) {
  const w = Number(width) || 0;
  return w < 560 ? 5 : w < 1100 ? 10 : 15;
}

/** The images a post carries, in order: a composition's media, or a
 *  sample's own set. */
export function galleryOf(post) {
  if (!post) return [];
  const a = post.attachments || {};
  if (Array.isArray(post.images) && post.images.length) return post.images;
  if (Array.isArray(a.media)) return a.media.filter((m) => m && (m.url || m.src));
  return [];
}

/** What a card is, for its size: the feed types (lib/feed/types.js), with a
 *  STILL of two or more images a CAROUSEL, a STILL or MOTION carrying an
 *  event a "+BRDCST", and the motion row a RAIL. */
export function kindOf(card) {
  if (!card) return "LISTING";
  if (card.__rail) return "RAIL";
  if (card.__place) return "PLACE";
  if (card.__song) return "SONG";
  if (card.__post) {
    const p = card.__post;
    const t = postType(p);
    const a = p.attachments || {};
    if (t === "STILL" && galleryOf(p).length > 1) return "CAROUSEL";
    if ((t === "STILL" || t === "MOTION") && (a.event || (a.events && a.events.length))) return t + "+BRDCST";
    return t;
  }
  return "LISTING";
}

/** The sizes each kind may take: [columns, half-rows, variant]. "F" is the
 *  feed's full width. The first size is the kind's own; the packer may pick
 *  another where it fills better. */
export const SPANS = Object.freeze({
  LISTING: [[3, 8, "hero"], [2, 4, "small"]],
  PLACE: [[2, 4, "square"]],
  SONG: [[2, 4, "square"]],
  // the post card (owner's post sketch, 25 Oct 2026, IMG_1143): the author's
  // head, the media, the folded caption, the four counted actions — five
  // columns, the sketch's 7:10; a BRDCST hangs three rows more beneath
  STILL: [[5, 14, "post"]],
  "STILL+BRDCST": [[5, 17, "post"]],
  MOTION: [[5, 14, "post"]],
  "MOTION+BRDCST": [[5, 17, "post"]],
  TRANSM: [[5, 9, "note"]],
  BRDCST: [["F", 4, "strip"]], // a row taller since the strip wears its photograph (25 Oct, evening)
  // a carousel is the post card with the STRIP for its media (Strip.jsx: tall
  // cards side by side, the next one peeking — X's "Videos for you")
  CAROUSEL: [[5, 12, "post"]],
  // the motion row: full width; its height follows the grid's width (stripRows)
  RAIL: [["F", 8, "strip"]],
  ECHO: [],
});

/** The sizes a card may take on a grid of `cols` columns, "F" resolved and
 *  anything wider than the grid narrowed to it. */
export function spansFor(card, cols = 5) {
  const k = kindOf(card);
  const tall = stripRows(k, cols);
  return (SPANS[k] || SPANS.LISTING).map(([w, h, v]) => ({ w: w === "F" ? cols : Math.min(cols, w), h: tall || h, v, full: w === "F" }));
}

/** The motion row's rows: a 9:16 tile about 40% of the feed's width (the
 *  reference), so its height grows with the number of columns — about 1.5
 *  rows per column, capped where a tile would be bigger than a phone —
 *  the title's line included. Null for every other kind (a carousel is a
 *  post card, SPANS.CAROUSEL). */
export function stripRows(kind, cols) {
  if (kind === "RAIL") return Math.min(12, Math.ceil(cols * 1.5));
  return null;
}

/** A stable small number from an id (FNV-1a). */
export function idHash(id) {
  let h = 2166136261;
  const s = String(id ?? "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// what a placement costs: a one-column well nothing fits, then cells trapped
// under the card (lost for good), then height — a card a row lower is better
// than a hole under it, because the cards after it fill what is above
const WELL = 1e8, WASTE = 1e6, ROW = 1e3;
export const LOOKAHEAD = 6;

/** Pack the cards. Returns { cells: [{ card, kind, x, y, w, h, v }], rows }
 *  with x and y zero-based grid positions (columns, half-rows). */
export function tetrisPack(cards, { cols = 5 } = {}) {
  const n = Math.max(2, cols | 0);
  const heights = new Array(n).fill(0);
  const cells = [];
  const waiting = [];
  const level = () => heights.every((h) => h === heights[0]);
  const wells = (hs) => {
    let c = 0;
    for (let i = 0; i < n; i++) {
      const left = i === 0 ? Infinity : hs[i - 1];
      const right = i === n - 1 ? Infinity : hs[i + 1];
      if (hs[i] < left && hs[i] < right) c++;
    }
    return c;
  };
  // the best spot and size for a card right now: { score, o, x, y }
  const fit = (card, opts) => {
    if (!opts.length) return null;
    // the card's own id rotates which size it prefers when sizes tie
    const turn = idHash(card.id) % opts.length;
    let best = null;
    opts.forEach((o, oi) => {
      const pref = (oi - turn + opts.length) % opts.length;
      for (let x = 0; x + o.w <= n; x++) {
        let y = 0;
        for (let i = 0; i < o.w; i++) y = Math.max(y, heights[x + i]);
        let waste = 0;
        for (let i = 0; i < o.w; i++) waste += y - heights[x + i];
        const next = heights.slice();
        for (let i = 0; i < o.w; i++) next[x + i] = y + o.h;
        const score = wells(next) * WELL + waste * WASTE + y * ROW + pref * 10 + x;
        if (!best || score < best.score) best = { score, o, x, y };
      }
    });
    return best;
  };
  const put = (card, b) => {
    const { o, x, y } = b;
    for (let i = 0; i < o.w; i++) heights[x + i] = y + o.h;
    cells.push({ card, kind: kindOf(card), x, y, w: o.w, h: o.h, v: o.v });
  };
  // A SHORT LOOKAHEAD: of the next LOOKAHEAD cards, the one that fits with
  // the least trapped space goes first (the earliest on a tie), so a wide
  // card waits a beat for the small ones that fill the gap beside it — the
  // feed's order bends a little, the grid stays whole.
  const open = [];
  const step = () => {
    let pick = -1, best = null;
    for (let k = 0; k < open.length; k++) {
      const b = fit(open[k], spansFor(open[k], n));
      if (b && (!best || b.score < best.score)) { best = b; pick = k; }
      if (best && best.score < WASTE) break; // a clean fit for the earliest card wins at once
    }
    if (pick < 0) { open.shift(); return; }
    const [card] = open.splice(pick, 1);
    put(card, best);
  };
  const drainLevel = () => { while (waiting.length && level()) { const w = waiting.shift(); put(w, fit(w, spansFor(w, n))); } };
  for (const card of cards || []) {
    const opts = spansFor(card, n);
    if (!opts.length) continue; // ECHO lives on the rail above the stream
    if (opts[0].full) waiting.push(card);
    else open.push(card);
    while (open.length >= LOOKAHEAD) { step(); drainLevel(); }
    drainLevel();
  }
  while (open.length) { step(); drainLevel(); }
  for (const card of waiting) put(card, fit(card, spansFor(card, n)));
  return { cells, rows: Math.max(0, ...heights) };
}

/** The motion row (owner, 25 Oct 2026: "motions that will be recommended —
 *  20 videos in the same formation as figure 20, the way X and Instagram
 *  recommend video"): up to RAIL_MAX of the stream's MOTION posts gathered
 *  into one card, when there are at least RAIL_MIN of them; otherwise the
 *  motions stay where they are. Never padded: a row of one is not a row. */
export const RAIL_MAX = 20;
export const RAIL_MIN = 2;
export function motionRail(posts) {
  const motions = (posts || []).filter((p) => postType(p) === "MOTION" && !galleryOf(p).length);
  if (motions.length < RAIL_MIN) return { rail: null, rest: posts || [] };
  const take = motions.slice(0, RAIL_MAX);
  const ids = new Set(take.map((p) => p.serverId ?? p.id));
  return {
    rail: { id: "rail:motion", __rail: take },
    rest: (posts || []).filter((p) => !ids.has(p.serverId ?? p.id)),
  };
}
