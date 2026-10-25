// tests/feed-tetris.test.js — THE FEED AS TETRIS (owner's feed sketch, 25
// Oct 2026; lib/feed/tetris.js). Declared before measuring: every card is
// placed exactly once, inside the grid, overlapping nothing, the same way
// every time; the packed area holds no hole on a phone or a tablet grid and
// at most 5% on the widest (where the end of a short list is ragged); a
// full-width card never sits over a hole; a tall piece takes two small
// cards beside it (the sketch); the motion row is never padded. Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tetrisPack, spansFor, kindOf, galleryOf, feedColsFor, motionRail, SPANS, RAIL_MAX, RAIL_MIN, LOOKAHEAD } from "../lib/feed/tetris.js";
import { braid, PLACE_PAIR } from "../lib/feed/types.js";
import { readHidden, hideCard } from "../lib/feed/hidden.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const still = (id, extra = {}) => ({ id, sample: true, image: { src: "/x.jpg" }, ...extra });
const feed = () => {
  const pieces = Array.from({ length: 60 }, (_, i) => ({ id: "syn-" + i }));
  const posts = Array.from({ length: 8 }, (_, i) => still("p" + i, i === 2 ? { images: [{ src: "/a.jpg" }, { src: "/b.jpg" }] } : i === 5 ? { attachments: { event: { id: "e", name: "E" } } } : {}));
  const places = Array.from({ length: 6 }, (_, i) => ({ id: "pl" + i }));
  return braid(pieces, posts, places);
};
// the measured truth of a packing: overlaps, holes below the lowest column top, and full cards over holes
function audit(cells, cols) {
  const occ = new Map();
  let overlaps = 0, outside = 0;
  for (const c of cells) {
    if (c.x < 0 || c.x + c.w > cols || c.y < 0) outside++;
    for (let i = 0; i < c.w; i++) for (let j = 0; j < c.h; j++) {
      const k = (c.x + i) + "," + (c.y + j);
      if (occ.has(k)) overlaps++;
      occ.set(k, c);
    }
  }
  const tops = new Array(cols).fill(0);
  for (const c of cells) for (let i = 0; i < c.w; i++) tops[c.x + i] = Math.max(tops[c.x + i], c.y + c.h);
  const floor = Math.min(...tops);
  let holes = 0;
  for (let y = 0; y < floor; y++) for (let x = 0; x < cols; x++) if (!occ.has(x + "," + y)) holes++;
  let fullOverHole = 0;
  for (const c of cells) if (c.w === cols && c.y > 0) for (let x = 0; x < cols; x++) if (!occ.has(x + "," + (c.y - 1))) fullOverHole++;
  return { overlaps, outside, holes, area: cols * floor, fullOverHole };
}

test("the grid: 5 columns on a phone, 10 on a tablet, 15 wide — the column stays the same size in the hand", () => {
  assert.equal(feedColsFor(375), 5);
  assert.equal(feedColsFor(711), 10);
  assert.equal(feedColsFor(1440), 15);
  const css = read("app/globals.css");
  assert.match(css, /\.fgridwrap \{ container-type: inline-size;/);
  assert.match(css, /grid-auto-rows: calc\(\(\(100cqw - \(var\(--fcols, 5\) - 1\) \* var\(--fgap\)\) \/ var\(--fcols, 5\) - var\(--fgap\)\) \/ 2\);/, "two rows and a gap make one column: a W x 2W card is square");
});

test("each kind's sizes, as the sketch draws them", () => {
  assert.deepEqual(SPANS.LISTING, [[3, 8, "hero"], [2, 4, "small"]], "the piece: three columns by four, or a small square");
  assert.deepEqual(SPANS.PLACE, [[2, 4, "square"]]);
  assert.deepEqual(SPANS.SONG, [[2, 4, "square"]]);
  assert.equal(SPANS.BRDCST[0][0], "F", "a standalone BRDCST is a full-width strip");
  // the post sketch (IMG_1143): every post is the five-column post card, 7:10; a BRDCST hangs beneath
  assert.deepEqual(SPANS.STILL, [[5, 14, "post"]]);
  assert.deepEqual(SPANS.MOTION, [[5, 14, "post"]]);
  assert.deepEqual(SPANS["STILL+BRDCST"], [[5, 17, "post"]]);
  assert.deepEqual(SPANS.CAROUSEL, [[5, 9, "post"]], "a carousel is the post card with Figure 20 for its media");
  assert.equal(SPANS.RAIL[0][0], "F");
  assert.deepEqual(SPANS.ECHO, [], "an echo lives on the rail above the stream");
  assert.equal(kindOf({ id: "x" }), "LISTING");
  assert.equal(kindOf({ id: "p", __post: still("p", { images: [{ src: "a" }, { src: "b" }] }) }), "CAROUSEL");
  assert.equal(kindOf({ id: "p", __post: still("p") }), "STILL");
  assert.equal(kindOf({ id: "p", __post: still("p", { attachments: { event: { id: "e" } } }) }), "STILL+BRDCST");
  assert.equal(kindOf({ id: "b", __post: { id: "b", attachments: { event: { id: "e" } } } }), "BRDCST");
  assert.equal(kindOf({ id: "pl", __place: { id: "pl" } }), "PLACE");
  assert.equal(kindOf({ id: "r", __rail: [] }), "RAIL");
  assert.deepEqual(spansFor({ id: "b", __post: { id: "b", attachments: { event: { id: "e" } } } }, 10).map((o) => o.w), [10], "full resolves to the grid's width");
  assert.equal(galleryOf({ attachments: { media: [{ url: "a" }, { url: "b" }] } }).length, 2);
  assert.equal(galleryOf({}).length, 0);
});

test("every card is placed exactly once, inside the grid, overlapping nothing, the same way every time", () => {
  const list = feed();
  for (const cols of [5, 10, 15]) {
    const a = tetrisPack(list, { cols });
    const b = tetrisPack(list, { cols });
    assert.deepEqual(a, b, "deterministic");
    assert.deepEqual(a.cells.map((c) => c.card.id).sort(), list.map((c) => c.id).sort(), cols + ": every card once");
    const m = audit(a.cells, cols);
    assert.equal(m.overlaps, 0, cols + ": no overlap");
    assert.equal(m.outside, 0, cols + ": inside the grid");
  }
});

test("like Tetris: no hole in the packed area on a phone or a tablet grid, at most 5% wide; a full-width card never sits over a hole", () => {
  const list = feed();
  for (const [cols, maxShare] of [[5, 0], [10, 0], [15, 0.05]]) {
    const { cells } = tetrisPack(list, { cols });
    const m = audit(cells, cols);
    assert.ok(m.holes / m.area <= maxShare, `${cols} columns: ${m.holes} holes of ${m.area} (${(100 * m.holes / m.area).toFixed(1)}%)`);
    if (cols < 15) assert.equal(m.fullOverHole, 0, cols + ": a full card waits for a level row");
  }
});

test("the case that trapped cells (seen 25 Oct on a 10-column feed): a wide post after a ragged row waits for the small cards that fill it", () => {
  // small, hero, small, then a 5x13 post: placed at the lowest spot it trapped a 3x4 hole under itself
  const list = [{ id: "s1" }, { id: "h1" }, { id: "s2" }, { id: "w", __post: still("w", { attachments: { event: { id: "e" } } }) }, ...Array.from({ length: 12 }, (_, i) => ({ id: "k" + i }))];
  const { cells } = tetrisPack(list, { cols: 10 });
  const m = audit(cells, 10);
  assert.equal(m.holes, 0, "no cell trapped (" + m.holes + ")");
  assert.ok(LOOKAHEAD >= 4, "a short lookahead lets a small card fill the gap first");
});

test("the sketch's pattern: on a phone a tall piece stands with two small cards stacked beside it", () => {
  const pieces = Array.from({ length: 30 }, (_, i) => ({ id: "syn-" + i }));
  const { cells } = tetrisPack(pieces, { cols: 5 });
  const heroes = cells.filter((c) => c.v === "hero");
  assert.ok(heroes.length >= 3, "the feed has tall pieces (" + heroes.length + ")");
  for (const h of heroes.slice(0, 3)) {
    const beside = cells.filter((c) => c.w === 2 && c.h === 4 && c.y >= h.y && c.y + c.h <= h.y + h.h && (c.x === h.x + h.w || c.x + c.w === h.x));
    assert.equal(beside.length, 2, "two small cards beside the hero at " + h.x + "," + h.y);
  }
});

test("the motion row: up to twenty motions, never padded; a row of one is not a row", () => {
  const m = (id) => ({ id, serverId: id, postKind: "video", attachments: { video: { url: "/v.mp4" } } });
  assert.equal(motionRail([m(1)]).rail, null, "one motion stays where it is");
  assert.equal(RAIL_MIN, 2);
  const many = Array.from({ length: 25 }, (_, i) => m(i));
  const { rail, rest } = motionRail([...many, still("s")]);
  assert.equal(rail.__rail.length, RAIL_MAX, "twenty");
  assert.equal(RAIL_MAX, 20);
  assert.equal(rest.length, 6, "five motions over the twenty and the still stay in the stream");
  assert.ok(!rest.some((p) => rail.__rail.includes(p)), "a motion in the row is not also in the stream");
});

test("places come in pairs after every ninth piece; a non-piece PASS is remembered on the device only", () => {
  const pieces = Array.from({ length: 9 }, (_, i) => ({ id: "i" + i }));
  const out = braid(pieces, [], [{ id: "A" }, { id: "B" }, { id: "C" }]);
  assert.equal(PLACE_PAIR, 2);
  assert.deepEqual(out.filter((x) => x.__place).map((x) => x.__place.id), ["A", "B"]);
  assert.equal(readHidden().size, 0, "no window: nothing hidden, nothing thrown");
  assert.doesNotThrow(() => hideCard("post:1"));
  assert.match(read("lib/feed/hidden.js"), /remembered on this device only/, "says what it does and no more");
});

test("the page draws what the packer decides, and the cards are the sketch's", () => {
  const page = read("app/page.js");
  assert.match(page, /const \{ cells, rows \} = tetrisPack\(feedList\(list\)\.filter\(\(it\) => !hidden\.has\(String\(it\.id\)\)\), \{ cols: feedCols \}\);/);
  assert.match(page, /style=\{\{ gridColumn: `\$\{c\.x \+ 1\} \/ span \$\{c\.w\}`, gridRow: `\$\{c\.y \+ 1\} \/ span \$\{c\.h\}` \}\}/, "every card at its grid place");
  assert.match(page, /const \{ rail, rest \} = motionRail\(streamPosts\);/);
  assert.ok(!/<Columns|placeInColumns|packFeed/.test(page), "the masonry columns are gone");
  // the piece: SELL only for a native listing, DEMO for a synthetic record
  assert.match(page, /const mode = demo \? DEMO_LABEL : it\.commerce_rail === "native" \? "SELL" : "LISTED";/);
  const post = read("app/components/PostCard.jsx");
  assert.match(post, /if \(type === "BRDCST"\) return <BrdcstStrip p=\{p\} id=\{cardId\} \/>;/);
  assert.match(post, /\{gallery\.length > 1 \? \(\n\s*<Fig20/, "a post of two or more stills has Figure 20 for its media");
  // Fig. 12: "SELL:handle", one line
  assert.match(page, /<b className="pcmode">\{mode\}\{who \? <span className="pchandle">:\{who\}<\/span> : null\}<\/b>/);
  assert.match(read("app/components/SongCard.jsx"), /if \(!s \|\| !s\.title\) return null;/, "a song card only for a real record");
});

test("Figure 20 (owner, 25 Oct 2026): three flat, every other card visible in the two stacks, each standing on its outer edge", () => {
  const fig = read("app/components/Fig20.jsx");
  assert.match(fig, /export const FLAT = 3;/, "three lie flat");
  assert.match(fig, /s\.pos = s\.target = Math\.floor\(\(n - 1\) \/ 2\);/, "it opens in the middle: twenty shows three flat and seventeen split between the stacks");
  assert.match(fig, /const sl = Math\.min\(14, room \/ Math\.max\(1, Math\.max\(nL, nR\) - 1\)\);/, "the sliver spacing shrinks so a whole stack fits its side");
  assert.ok(!/opacity/.test(fig), "no card is faded out of sight: every card is visible");
  // the inversion the owner caught: the inner edge turns away, the outer edge stands nearest
  assert.match(fig, /c\.style\.transformOrigin = sgn > 0 \? "right center" : "left center";/, "the turn is about the OUTER edge");
  assert.match(fig, /rotateY\(\$\{\(sgn \* EDGE_DEG \* ease\)\.toFixed\(1\)\}deg\)/, "+deg on the right, -deg on the left: the inner edge recedes");
  assert.match(fig, /if \(still \|\| Math\.abs\(diff\) < 0\.002\) s\.pos = s\.target;/, "reduced motion: no gliding");
  assert.match(read("app/globals.css"), /\.f20stage \{[^}]*touch-action: pan-y;/s, "the page still scrolls vertically through it");
  assert.match(read("app/components/MotionRail.jsx"), /aspect=\{9 \/ 16\}/, "the motion row's tiles are 9:16");
});

test("Figure 20's height follows the grid's width, so three flat cards always fit", async () => {
  const { fig20Rows } = await import("../lib/feed/tetris.js");
  assert.equal(fig20Rows("CAROUSEL", 10), null, "a carousel is a post card now (IMG_1143)");
  assert.deepEqual([5, 10, 15].map((c) => fig20Rows("RAIL", c)), [5, 9, 13]);
  assert.equal(fig20Rows("LISTING", 5), null);
  assert.equal(spansFor({ id: "c", __post: still("c", { images: [{ src: "a" }, { src: "b" }] }) }, 10)[0].h, 9);
  assert.equal(spansFor({ id: "r", __rail: [] }, 10)[0].h, 9);
});

test("the post card (owner's post sketch, 25 Oct 2026, IMG_1143): head, red rules, folded caption, four counted blue actions — and no invented count", async () => {
  const { count3 } = await import("../app/components/PostCard.jsx").catch(() => ({}));
  const post = read("app/components/PostCard.jsx");
  // Figs. 8–11: circle, username, PASS, the red rule
  assert.match(post, /<header className="p2head">\n\s*<span className="p2orb">/);
  assert.match(post, /<PassKey id=\{cardId\}/);
  assert.match(post, /<i className="p2rule" aria-hidden="true" \/>/);
  assert.match(post, /<i className="p2rule p2rule2" aria-hidden="true" \/>/, "Fig. 1: the rule under the actions");
  // Figs. 6–7: the counter and the folded caption
  assert.match(post, /\{pad\(idx \+ 1\)\}\/\{pad\(gallery\.length\)\}/, "01/26");
  assert.match(post, /:\{">"\.repeat\(160\)\}/, "the caption folds into chevrons");
  assert.match(post, /<span className="idlabel">read the caption: \{caption\}<\/span>/, "the folded caption is still read aloud");
  assert.match(post, /<Icon name="fold"/);
  // Figs. 2–5: the four actions, the stamp is STAMP, the bubble is not built and says so
  assert.match(post, /icon="stamp"/);
  assert.match(post, /className="wpcact soon" title="comments are not built yet"/);
  assert.match(post, /<b className="p2n" title="comments are not built yet">---<\/b>/);
  assert.match(post, /<b className="p2n" title="shares are not counted">---<\/b>/);
  assert.match(post, /<b className="p2n">\{eng \? count3\(eng\.likes\) : "---"\}<\/b>/, "a sample or a post without its record shows ---, never 000");
  // the ring: a real sound control, on a motion only
  assert.match(post, /\{motion \? <SoundRing video=\{\(\) => videoRef\.current\} \/> : null\}/);
  const css = read("app/globals.css");
  assert.match(css, /\.p2rule \{[^}]*background: var\(--red\);/);
  assert.match(css, /\.p2acts \{[^}]*color: var\(--sig\);/, "the actions are the signal blue");
  assert.match(css, /\.p2n \{[^}]*color: var\(--sig\);/);
  // count3 is pure: read it from source so the test runs without JSX
  const src = post.match(/export function count3\(v\) \{[\s\S]*?\n\}/)[0];
  const fn = count3 || new Function(src.replace("export function count3", "return function count3"))();
  assert.equal(fn(null), "---", "no record, no number");
  assert.equal(fn(undefined), "---");
  assert.equal(fn("x"), "---");
  assert.equal(fn(0), "000");
  assert.equal(fn(7), "007");
  assert.equal(fn(1234), "999+");
});

test("the place card (IMG_1143 Figs. 14–16): Location name and Location type as written, not shouted", () => {
  const place = read("app/components/PlaceCard.jsx");
  const src = place.match(/export function kindWord\(kind\) \{[\s\S]*?\n\}/)[0];
  const kindWord = new Function(src.replace("export function kindWord", "return function kindWord"))();
  assert.equal(kindWord("GALLERY"), "Gallery");
  assert.equal(kindWord("pop_up"), "Pop up");
  assert.equal(kindWord(null), "");
  assert.match(place, /<span className="placemeta">\{kindWord\(p\.kind\)\}\{p\.sample \? " · SAMPLE FIXTURE" : ""\}<\/span>/, "a sample still says so");
  assert.match(read("app/globals.css"), /\.fcell \.placename \{ text-transform: none;/);
});
