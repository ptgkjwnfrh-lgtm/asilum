// lib/feed/tetris.js — THE FEED AS TETRIS (owner's feed sketch, 25 Oct 2026:
// "the feed is comprised of multiple different forms of media — stills and
// motions, BRDCSTs, songs, piece listings and locations — they all vary in
// size and should fit randomly and uniformly on the feed with even spacing
// like tetris"). PURE and client-safe.
//
// THE GRID. A fixed number of columns (6 on a phone, 12 on a tablet or a
// small laptop, 18 wider — feedColsFor) and half-column rows: two rows and a gap make one column
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

/** Columns for a feed this wide (px): a column stays roughly 55–65px, so a
 *  card is the same size in the hand on a phone, a tablet and a laptop —
 *  more columns, not bigger cards. MULTIPLES OF SIX (owner, 25 Oct 2026,
 *  late: "a listing should never be in a small card … that is reserved for
 *  music and locations only"): a listing is medium only, three columns, so
 *  two sit side by side on a phone; on five columns every listing left a
 *  two-column gap only a song or a place could fill, and a fifth of a
 *  phone's feed was holes (measured 20.5%; on six, 1.3%). */
export function feedColsFor(width) {
  const w = Number(width) || 0;
  return w < 560 ? 6 : w < 1100 ? 12 : 18;
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
 *  event a "+BRDCST", and the motion row a RAIL (both Figure 20). */
export function kindOf(card) {
  if (!card) return "LISTING";
  if (card.__rail) return "RAIL";
  if (card.__ad) return "AD";
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

/** The sizes each kind may take: [columns, half-rows, variant, fewest
 *  columns the grid needs for it, most it allows]. "F" is the feed's full
 *  width.
 *
 *  THE SIZES VARY (owner, 25 Oct 2026, late: "the sizes of listings, songs,
 *  locations and brdcsts can be randomized to varying sizes but still
 *  allowing motions and stills to be the biggest … like tetris it doesn't
 *  matter what's next to each other"). Each card draws one of its kind's
 *  sizes from its own id (preferredSpan) — portrait, square or landscape —
 *  and the packer keeps that draw unless it would trap a hole. The two-wide
 *  sizes are a phone's only (the fifth field: most columns allowed). */
export const SPANS = Object.freeze({
  // a piece: MEDIUM ONLY (owner, 25 Oct 2026, late: "a listing should never
  // be in a small card … that is reserved for music and locations only") —
  // three columns by eight (a four-wide size left wells beside the three-wide
  // cards on the wide grids, 26 Oct 2026)
  LISTING: [[3, 8, "hero"]],
  // a song and a place: small in three shapes, or medium
  // (26 Oct 2026) the two-wide sizes on a phone's six columns only, where three
  // fill a row: on twelve or eighteen, beside the three-wide pieces, they left
  // one-column wells (a 12-column feed measured 12.7% holes)
  PLACE: [[2, 4, "square", 0, 6], [2, 8, "square", 0, 6], [3, 4, "square"], [3, 8, "medium"]],
  SONG: [[2, 4, "square", 0, 6], [2, 8, "square", 0, 6], [3, 4, "square"], [3, 8, "medium"]],
  // the post card (owner's post sketch, 25 Oct 2026, IMG_1143): the author's
  // head, the media, the folded caption, the four counted actions — five
  // columns, the sketch's 7:10; a BRDCST hangs three rows more beneath
  STILL: [[6, 16, "post"]],
  "STILL+BRDCST": [[6, 20, "post"]],
  MOTION: [[6, 16, "post"]],
  "MOTION+BRDCST": [[6, 20, "post"]],
  TRANSM: [[6, 12, "note"]],
  // a standalone BRDCST (owner, 25 Oct 2026): the width of a large card, the
  // height of a small one — no longer the feed's full width
  BRDCST: [[6, 4, "strip"]],
  // a carousel is FIGURE 20 alone (Fig20.jsx; owner, 25 Oct 2026, late),
  // "almost the same height and width of a regular motion or still post",
  // its author's name in a small space above
  CAROUSEL: [[6, 16, "fig20"]],
  // the motion row: Figure 20 too, a motion post's size, "RECOMMENDED VIDEOS"
  // where a carousel's author sits (same night)
  RAIL: [[6, 16, "fig20"]],
  ECHO: [],
  // THE AD SPACE (owner, 25 Oct 2026: "there's two types of ad space on the
  // feed, medium and brdcst size … those can be used to fill up spaces"):
  // never in the stream itself — fillAds lays them into the gaps the packing
  // leaves at the feed's ragged end
  AD: [[6, 4, "adwide"], [3, 8, "ad"]],
});

/** The sizes a card may take on a grid of `cols` columns, "F" resolved and
 *  anything wider than the grid narrowed to it. */
export function spansFor(card, cols = 5) {
  const k = kindOf(card);
  return (SPANS[k] || SPANS.LISTING)
    .filter(([, , , min, max]) => (!min || cols >= min) && (!max || cols <= max))
    .map(([w, h, v]) => ({ w: w === "F" ? cols : Math.min(cols, w), h, v, full: w === "F" }));
}

/** Which of its sizes a card draws: a stable pick from its own id, so the
 *  feed is varied and the same card always takes the same size. */
export function preferredSpan(card, count) {
  return count > 1 ? idHash(String(card && card.id) + ":size") % count : 0;
}

/** A stable small number from an id (FNV-1a). */
export function idHash(id) {
  let h = 2166136261;
  const s = String(id ?? "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// what a placement costs: a one-column well nothing fits, then cells trapped
// under the card, then a size other than the card's own draw (twenty rows),
// then height. Every card covers the lowest column (fit, BOTTOM FIRST), so
// no column is left behind. Measured over 24 sample feeds (25 Oct 2026, on
// 6 / 12 / 18 columns, listings medium only): holes at most 1.7% of a
// phone's packed area, 2.2% of a tablet's, 3.5% wide. (With small listings
// as filler it was 0.7 / 0.2 / 1.2; the owner reserved the small sizes for
// songs and places, and a two-column gap now waits for one of them.)
const WELL = 1e8, WASTE = 1e6, PREF = 2e4, ROW = 1e3;
export const LOOKAHEAD = 9; // (25 Oct 2026, late) six left a two-column gap open while the next six were all listings

/** Pack the cards. Returns { cells: [{ card, kind, x, y, w, h, v }], rows }
 *  with x and y zero-based grid positions (columns, half-rows). */
export function tetrisPack(cards, { cols = 5, ads = false } = {}) {
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
    // the card's own draw (preferredSpan); any other size pays PREF
    const own = preferredSpan(card, opts.length);
    // BOTTOM FIRST: every card covers the lowest column (the leftmost, on a
    // tie), so no column is ever left behind — a one-column pit nothing fits
    // is covered and its cells counted as waste, never abandoned
    const floor = Math.min(...heights), low = heights.indexOf(floor);
    let best = null;
    opts.forEach((o, oi) => {
      const pref = oi === own ? 0 : PREF;
      for (let x = Math.max(0, low - o.w + 1); x <= low && x + o.w <= n; x++) {
        let y = 0;
        for (let i = 0; i < o.w; i++) y = Math.max(y, heights[x + i]);
        let waste = 0;
        for (let i = 0; i < o.w; i++) waste += y - heights[x + i];
        const next = heights.slice();
        for (let i = 0; i < o.w; i++) next[x + i] = y + o.h;
        const score = wells(next) * WELL + waste * WASTE + pref + y * ROW + x;
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
    // AD SPACE AS FILLER (owner, 25 Oct 2026: the two ad spaces "can be used to
    // fill up spaces"): when every open card would trap a cell, an ad that
    // fits clean at the lowest column goes in first — at most one for every
    // AD_EVERY cards placed — and the cards try again above it
    if (ads && (!best || best.score >= WASTE) && adsPlaced < Math.floor((cells.length + 1) / AD_EVERY)) {
      const ad = { id: "ad:" + cells.length, __ad: true };
      const b = fit(ad, spansFor(ad, n));
      if (b && b.score < WASTE) { adsPlaced++; put(ad, b); return; }
    }
    if (pick < 0) { open.shift(); return; }
    const [card] = open.splice(pick, 1);
    put(card, best);
  };
  let adsPlaced = 0;
  const drainLevel = () => { while (waiting.length && level()) { const w = waiting.shift(); put(w, fit(w, spansFor(w, n))); } };
  for (const card of cards || []) {
    const opts = spansFor(card, n);
    if (!opts.length) continue; // ECHO lives on the rail above the stream
    // a card as wide as the grid in every size (a full-width card, or a post or
    // a BRDCST on a phone's six columns) waits for a level row: placed over a
    // ragged one it would trap every cell beneath it (26 Oct 2026)
    if (opts.every((o) => o.w >= n)) waiting.push(card);
    else open.push(card);
    while (open.length >= LOOKAHEAD) { step(); drainLevel(); }
    drainLevel();
  }
  while (open.length) { step(); drainLevel(); }
  for (const card of waiting) put(card, fit(card, spansFor(card, n)));
  return { cells, rows: Math.max(0, ...heights) };
}

/** Fill the packing's ragged end with ad space: wherever a BRDCST-size
 *  (5 x 4) or a medium (3 x 8) ad fits exactly — on columns of one height,
 *  trapping nothing and reaching no lower than the feed already does — one
 *  goes in, the lowest spot first, the wide one before the medium, at most
 *  one for every AD_EVERY cards. Gaps neither fits stay empty. Returns a
 *  new packing; the cards' own cells are untouched. */
export const AD_EVERY = 8; // at most one ad space per this many cards, so a short feed's end is not a wall of them
export function fillAds({ cells, rows }, { cols = 5 } = {}) {
  const n = Math.max(2, cols | 0);
  let room = Math.floor(cells.length / AD_EVERY);
  const tops = new Array(n).fill(0);
  for (const c of cells) for (let i = 0; i < c.w; i++) tops[c.x + i] = Math.max(tops[c.x + i], c.y + c.h);
  const bottom = Math.max(rows, ...tops);
  const out = cells.slice();
  while (room-- > 0) {
    let best = null;
    for (const [w, h, v] of SPANS.AD) {
      if (w > n) continue;
      for (let x = 0; x + w <= n; x++) {
        const y = tops[x];
        let level = true;
        for (let i = 1; i < w; i++) if (tops[x + i] !== y) { level = false; break; }
        if (!level || y + h > bottom) continue;
        if (!best || y < best.y) best = { x, y, w, h, v };
      }
    }
    if (!best) break;
    const card = { id: "ad:" + best.x + ":" + best.y, __ad: { size: best.v } };
    out.push({ card, kind: "AD", x: best.x, y: best.y, w: best.w, h: best.h, v: best.v });
    for (let i = 0; i < best.w; i++) tops[best.x + i] = best.y + best.h;
  }
  return { cells: out, rows: bottom };
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
