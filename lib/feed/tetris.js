// lib/feed/tetris.js — THE FEED AS TETRIS (owner's feed sketch, 25 Oct 2026:
// "the feed is comprised of multiple different forms of media — stills and
// motions, BRDCSTs, songs, piece listings and locations — they all vary in
// size and should fit randomly and uniformly on the feed with even spacing
// like tetris"). PURE and client-safe.
//
// THE GRID. A fixed number of columns (6 on a phone, 12 on a tablet or a
// small laptop, 18 wider — feedColsFor) and rows sized from the screen: six
// rows and their gaps are a LARGE card, 90% of the screen's height (owner,
// 28 Oct 2026, the four sizes: SIZE). Every card is its kind's one size; the
// gap between all of them is the same.
//
// THE PACKING is by TILES, a large card's place each (see tetrisPack): one
// large card, or an exact fill of the smaller sizes, so no gap opens between
// the cards; large tiles and fills spread evenly, so the feed is always a mix.

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

/** THE FOUR SIZES — A HARD RULE (owner, 28 Oct 2026: "motion and still cards
 *  are the largest they are large it should take up around 90% of the screen
 *  if centered, lising cards are medium roughly 4 listing cards should take
 *  up 90% centered, music and location cards are small 6 small cards should
 *  take up 90% of the screen, a brdcst is in a wide small that means its the
 *  same width and hieght of two small cards side by side otgether").
 *  [columns, rows]: a LARGE card is six columns by six rows, and a row is
 *  sized from the screen so six rows (and their gaps) are LARGE_SHARE of its
 *  height (app/globals.css .fgrid). A MEDIUM is half a large each way, so
 *  four fill a large's place; a SMALL is half its width and a third of its
 *  height, so six fill it; a WIDE SMALL is two smalls side by side. */
export const LARGE_SHARE = 0.9;
export const SIZE = Object.freeze({
  LARGE: Object.freeze([6, 6]),
  MEDIUM: Object.freeze([3, 3]),
  SMALL: Object.freeze([3, 2]),
  WIDE: Object.freeze([6, 2]),
});
/** One screen, in rows: a large card is LARGE_SHARE of it. */
export const SCREEN_ROWS = SIZE.LARGE[1] / LARGE_SHARE;

/** Each kind's size class. A still, a motion, a carousel (Figure 20, a still
 *  of several images), a post carrying a BRDCST (the BRDCST hangs inside the
 *  large card) and the motion row are LARGE; a piece is MEDIUM, and so is a
 *  words-only post (TRANSM, which the owner's rule does not name: a large
 *  card of words alone would be most of a screen of type); a song and a
 *  place are SMALL; a standalone BRDCST is WIDE. */
export const CLASS_OF = Object.freeze({
  STILL: "LARGE", MOTION: "LARGE", "STILL+BRDCST": "LARGE", "MOTION+BRDCST": "LARGE", CAROUSEL: "LARGE", RAIL: "LARGE",
  LISTING: "MEDIUM", TRANSM: "MEDIUM",
  SONG: "SMALL", PLACE: "SMALL",
  BRDCST: "WIDE",
});

/** The sizes each kind may take: [columns, rows, variant]. One size a kind —
 *  the hard rule — except the ad space, which comes in two. */
const span = (cls, v) => [...SIZE[cls], v];
export const SPANS = Object.freeze({
  LISTING: [span("MEDIUM", "hero")],
  PLACE: [span("SMALL", "square")],
  SONG: [span("SMALL", "square")],
  // the post card (owner's post sketch, 25 Oct 2026, IMG_1143): the author's head, the media, the folded
  // caption, the four counted actions; a post's BRDCST hangs inside the same large card
  STILL: [span("LARGE", "post")],
  "STILL+BRDCST": [span("LARGE", "post")],
  MOTION: [span("LARGE", "post")],
  "MOTION+BRDCST": [span("LARGE", "post")],
  TRANSM: [span("MEDIUM", "note")],
  BRDCST: [span("WIDE", "strip")],
  // a carousel is FIGURE 20 alone (Fig20.jsx; owner, 25 Oct 2026, late), a still post's size; the motion
  // row too, "RECOMMENDED VIDEOS" where a carousel's author sits
  CAROUSEL: [span("LARGE", "fig20")],
  RAIL: [span("LARGE", "fig20")],
  ECHO: [],
  // THE AD SPACE (owner, 25 Oct 2026: "there's two types of ad space on the feed, medium and brdcst size …
  // those can be used to fill up spaces"): never in the stream itself — they fill what the cards cannot
  AD: [span("WIDE", "adwide"), span("MEDIUM", "ad")],
});

/** Whether a card is LARGE (its kind's class). An ad space never is. */
export const isLarge = (card) => CLASS_OF[kindOf(card)] === "LARGE";

/** The sizes a card may take on a grid of `cols` columns, anything wider
 *  than the grid narrowed to it. */
export function spansFor(card, cols = 6) {
  return (SPANS[kindOf(card)] || SPANS.LISTING).map(([w, h, v]) => ({ w: Math.min(cols, w), h, v, full: false }));
}

// THE TILES (owner, 28 Oct 2026: "there must never be a large gap in between the cards and there should
// never be 2 full scrolls where it is all mediums, smalls, and wide smalls or just larges there must always
// be a mix"). The feed is a grid of TILES, each a large card's place (six columns by six rows): one, two or
// three side by side (a phone, a tablet, wider), a band of them a large card tall. A tile holds one large
// card, or one exact FILL of the others — the only ways the four sizes close a large card's place:
//   two mediums stacked beside three smalls; four mediums; six smalls; three wide smalls; two wide smalls
//   and two smalls; one wide small and four smalls.
// A full tile has no gap by construction, so the feed has none above its ragged end. The tiles take turns,
// LARGE and FILL, as a checkerboard (on a phone, band by band): every band two screens tall holds both while
// the feed still has both. Within a fill the cards keep their order as far as the fill allows; the fill
// chosen is the one whose cards stand earliest in the queue (the feed's order bends only to close a tile).
// With ad space allowed (the page), an ad may stand in for a missing medium or wide small, at most one for
// every AD_EVERY cards. What cannot close a tile at the end of the feed is laid on its lanes, never over
// a gap: the feed's ragged end, which fillAds evens out.
export const TILE = SIZE.LARGE[0];
const FILLS = Object.freeze([
  { need: { M: 2, S: 3 }, split: true },
  { need: { M: 4 } },
  { need: { S: 6 } },
  { need: { W: 3 } },
  { need: { W: 2, S: 2 } },
  { need: { W: 1, S: 4 } },
]);
const LETTER = { LARGE: "L", MEDIUM: "M", SMALL: "S", WIDE: "W" };
const letterOf = (card) => LETTER[CLASS_OF[kindOf(card)]] || "M";
const AD_COST = 1e4; // an ad stands in only where the cards themselves cannot close the tile

/** Pack the cards. Returns { cells: [{ card, kind, x, y, w, h, v }], rows }
 *  with x and y zero-based grid positions (columns, rows). */
export function tetrisPack(cards, { cols = 6, ads = false } = {}) {
  const n = Math.max(TILE, (cols | 0) - ((cols | 0) % TILE));
  const across = n / TILE;
  const queue = (cards || []).filter((c) => spansFor(c, n).length); // ECHO lives on the rail above the stream
  const cells = [];
  let adsPlaced = 0;
  const variant = (card) => spansFor(card, n)[0].v;
  const place = (card, x, y, [w, h], v = variant(card)) => cells.push({ card, kind: kindOf(card), x, y, w, h, v });
  const adCard = (size) => ({ id: "ad:" + cells.length + ":" + size, __ad: { size } });

  // the fill whose cards stand earliest: { fill, picks: { M: [queue index…], … }, ads: { M: k, W: k } }
  const choose = () => {
    const at = { M: [], S: [], W: [] };
    queue.forEach((c, i) => { const l = letterOf(c); if (at[l]) at[l].push(i); });
    const budget = ads ? Math.floor((cells.length + 1) / AD_EVERY) - adsPlaced : 0;
    let best = null;
    for (const fill of FILLS) {
      let score = 0, missing = 0;
      const picks = {}, sub = {};
      let ok = true;
      for (const [l, k] of Object.entries(fill.need)) {
        picks[l] = at[l].slice(0, k);
        const short = k - picks[l].length;
        if (short > 0) { if (l === "S") { ok = false; break; } sub[l] = short; missing += short; }
        score += picks[l].reduce((a, b) => a + b, 0) + short * AD_COST;
      }
      if (!ok || missing > budget) continue;
      if (missing && !Object.values(picks).some((p) => p.length)) continue; // a tile of ads alone is not a tile
      if (!best || score < best.score) best = { score, fill, picks, sub };
    }
    return best;
  };

  // lay a chosen fill in the tile at (x0, y0), its cards in their queue order
  const lay = ({ fill, picks, sub }, x0, y0) => {
    const idx = Object.values(picks).flat().sort((a, b) => a - b);
    const chosen = idx.map((i) => queue[i]);
    for (const i of idx.slice().reverse()) queue.splice(i, 1);
    for (const [l, k] of Object.entries(sub)) for (let j = 0; j < k; j++) { chosen.push(adCard(l === "M" ? "ad" : "adwide")); adsPlaced++; }
    const by = (l) => chosen.filter((c) => (letterOf(c) === l) || (c.__ad && ((l === "M" && c.__ad.size === "ad") || (l === "W" && c.__ad.size === "adwide"))));
    const [mw, mh] = SIZE.MEDIUM, [sw, sh] = SIZE.SMALL, [ww, wh] = SIZE.WIDE;
    const adSpan = (c) => (c.__ad.size === "ad" ? SPANS.AD[1][2] : SPANS.AD[0][2]);
    const put = (c, x, y, size) => place(c, x, y, size, c.__ad ? adSpan(c) : variant(c));
    if (fill.split) {
      // the mediums' lane is the left one when a medium comes first
      const left = letterOf(chosen[0]) === "M" ? "M" : "S";
      const mx = left === "M" ? x0 : x0 + mw, sx = left === "M" ? x0 + mw : x0;
      by("M").forEach((c, k) => put(c, mx, y0 + k * mh, SIZE.MEDIUM));
      by("S").forEach((c, k) => put(c, sx, y0 + k * sh, SIZE.SMALL));
    } else if (fill.need.M) {
      by("M").forEach((c, k) => put(c, x0 + (k % 2) * mw, y0 + Math.floor(k / 2) * mh, SIZE.MEDIUM));
    } else {
      // strips two rows tall, in the order their first card stands: a wide small, or a pair of smalls
      let y = y0, open = null;
      for (const c of chosen) {
        if (letterOf(c) === "W" || (c.__ad && c.__ad.size === "adwide")) { put(c, x0, y, SIZE.WIDE); y += wh; }
        else if (open) { put(c, x0 + sw, open, SIZE.SMALL); open = null; }
        else { put(c, x0, y, SIZE.SMALL); open = y; y += sh; }
      }
    }
  };

  // THE TURNS. Which kind each tile takes, in reading order, spreads the larges evenly through what is left
  // (an error-diffusion share of large tiles to fill tiles, the first turn the queue front's kind); on an
  // even number of tiles across, every other band reads right to left, so the kinds checker rather than
  // stand in columns. Hard: a band follows two without a large with a large, and two without a fill with
  // a fill, while one is left; a fill nothing can close gives way to a large while one remains.
  const area = { M: SIZE.MEDIUM[0] * SIZE.MEDIUM[1], S: SIZE.SMALL[0] * SIZE.SMALL[1], W: SIZE.WIDE[0] * SIZE.WIDE[1] };
  const tileArea = TILE * TILE;
  const fillsLeft = () => queue.reduce((a, c) => a + (isLarge(c) ? 0 : area[letterOf(c)] || 0), 0) / tileArea;
  const largesLeft = () => queue.reduce((a, c) => a + (isLarge(c) ? 1 : 0), 0);
  let err = queue.length && isLarge(queue[0]) ? 0.5 : -0.5;
  const kinds = []; // per band: { L, F }
  let b = 0, done = false;
  while (queue.length && !done) {
    const band = { L: false, F: false };
    kinds.push(band);
    const lackL = b >= 2 && !kinds[b - 1].L && !kinds[b - 2].L, lackF = b >= 2 && !kinds[b - 1].F && !kinds[b - 2].F;
    for (let k = 0; k < across && queue.length; k++) {
      const j = across % 2 === 0 && b % 2 === 1 ? across - 1 - k : k;
      const x0 = j * TILE, y0 = b * TILE;
      const plan = queue.some((c) => !isLarge(c)) ? choose() : null;
      const nl = largesLeft(), nf = fillsLeft();
      err += nl + nf > 0 ? nl / (nl + nf) : 0;
      let turnLarge = err >= 0.5;
      const last = k === across - 1;
      if (last && lackL && !band.L) turnLarge = true;
      if (last && lackF && !band.F && plan) turnLarge = false;
      if (nl && (turnLarge || !plan)) {
        err -= 1;
        const [c] = queue.splice(queue.findIndex(isLarge), 1);
        place(c, x0, y0, SIZE.LARGE);
        band.L = true;
      } else if (plan) { lay(plan, x0, y0); band.F = true; }
      else { done = true; lanes(b, k, j); break; }
    }
    b++;
  }

  // THE END: what no fill closes, laid on lanes three columns wide: the wide smalls first, while each tile's
  // two lanes are still level, then each other card on the lowest lane — so nothing stands over a gap
  function lanes(band, filled, at) {
    const L = n / SIZE.SMALL[0];
    // the tiles of this band already laid: the `filled` places before `at` in this band's reading direction
    const reversed = across % 2 === 0 && band % 2 === 1;
    const laid = (t) => (reversed ? t > at : t < at) && filled > 0;
    const h = Array.from({ length: L }, (_, i) => (laid(Math.floor(i / 2)) ? (band + 1) * TILE : band * TILE));
    const rest = queue.splice(0, queue.length);
    for (const c of rest.filter((r) => letterOf(r) === "W")) {
      let t = 0;
      for (let i = 0; i + 1 < L; i += 2) if (h[i] < h[t]) t = i;
      place(c, t * SIZE.SMALL[0], h[t], SIZE.WIDE);
      h[t] = h[t + 1] = h[t] + SIZE.WIDE[1];
    }
    for (const c of rest.filter((r) => letterOf(r) !== "W")) {
      const i = h.indexOf(Math.min(...h));
      const size = letterOf(c) === "S" ? SIZE.SMALL : SIZE.MEDIUM;
      place(c, i * SIZE.SMALL[0], h[i], size);
      h[i] += size[1];
    }
  }
  return { cells, rows: Math.max(0, ...cells.map((c) => c.y + c.h)) };
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
