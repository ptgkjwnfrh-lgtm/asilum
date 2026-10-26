// tests/feed-tetris.test.js — THE FEED AS TETRIS (owner's feed sketch, 25
// Oct 2026; lib/feed/tetris.js). Declared before measuring: every card is
// placed exactly once, inside the grid, overlapping nothing, the same way
// every time; the packed area holds no hole on a phone or a tablet grid and
// at most 5% on the widest (where the end of a short list is ragged); a
// full-width card never sits over a hole; a tall piece takes two small
// cards beside it (the sketch); the motion row is never padded. Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tetrisPack, fillAds, preferredSpan, AD_EVERY, spansFor, kindOf, galleryOf, feedColsFor, motionRail, SPANS, RAIL_MAX, RAIL_MIN, LOOKAHEAD } from "../lib/feed/tetris.js";
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
  // (owner, 25 Oct 2026, late: "the sizes … can be randomized to varying sizes") portrait, square and landscape
  assert.deepEqual(SPANS.LISTING, [[3, 8, "hero"], [4, 8, "hero", 10], [2, 4, "small"], [2, 8, "small"]], "the piece: medium tall or square, small square or tall");
  // (owner, 25 Oct 2026) a song and a place vary like a piece: small or medium
  assert.deepEqual(SPANS.PLACE, [[2, 4, "square"], [2, 8, "square"], [3, 4, "square"], [3, 8, "medium"]]);
  assert.deepEqual(SPANS.SONG, [[2, 4, "square"], [2, 8, "square"], [3, 4, "square"], [3, 8, "medium"]]);
  assert.deepEqual(SPANS.BRDCST, [[5, 4, "strip"], [4, 4, "strip", 10]], "a standalone BRDCST: a small card's height, a large card's width (or four on a wide grid)");
  assert.ok(spansFor({ id: "x" }, 5).every((o) => o.w !== 4), "no four-wide size on a phone's five columns: it would leave a one-column well");
  assert.deepEqual(SPANS.AD, [[5, 4, "adwide"], [3, 8, "ad"]], "two ad spaces: BRDCST-size and medium");
  // the post sketch (IMG_1143): every post is the five-column post card, 7:10; a BRDCST hangs beneath
  assert.deepEqual(SPANS.STILL, [[5, 14, "post"]]);
  assert.deepEqual(SPANS.MOTION, [[5, 14, "post"]]);
  assert.deepEqual(SPANS["STILL+BRDCST"], [[5, 17, "post"]]);
  assert.deepEqual(SPANS.CAROUSEL, [[5, 4, "fig20"]], "a carousel is Figure 20 alone: a large card's width, its flat cards' height");
  assert.equal(SPANS.RAIL[0][0], "F");
  assert.deepEqual(SPANS.ECHO, [], "an echo lives on the rail above the stream");
  assert.equal(kindOf({ id: "x" }), "LISTING");
  assert.equal(kindOf({ id: "p", __post: still("p", { images: [{ src: "a" }, { src: "b" }] }) }), "CAROUSEL");
  assert.equal(kindOf({ id: "p", __post: still("p") }), "STILL");
  assert.equal(kindOf({ id: "p", __post: still("p", { attachments: { event: { id: "e" } } }) }), "STILL+BRDCST");
  assert.equal(kindOf({ id: "b", __post: { id: "b", attachments: { event: { id: "e" } } } }), "BRDCST");
  assert.equal(kindOf({ id: "pl", __place: { id: "pl" } }), "PLACE");
  assert.equal(kindOf({ id: "r", __rail: [] }), "RAIL");
  assert.deepEqual(spansFor({ id: "r", __rail: [] }, 10).map((o) => o.w), [10], "full resolves to the grid's width");
  assert.deepEqual(spansFor({ id: "b", __post: { id: "b", attachments: { event: { id: "e" } } } }, 10).map((o) => o.w), [5, 4], "a BRDCST: five wide, or four on a wide grid");
  assert.equal(kindOf({ id: "ad:0:0", __ad: { size: "ad" } }), "AD");
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

// (retired 25 Oct 2026, late) "a tall piece with two small cards beside it" was
// the fit-first packing's habit; the owner ruled sizes vary and "it doesn't
// matter what's next to each other" — the size battery below replaces it.

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
  assert.match(page, /const \{ cells, rows \} = fillAds\(tetrisPack\(feedList\(list\)\.filter\(\(it\) => !hidden\.has\(String\(it\.id\)\)\), \{ cols: feedCols \}\), \{ cols: feedCols \}\);/);
  assert.match(page, /style=\{\{ gridColumn: `\$\{c\.x \+ 1\} \/ span \$\{c\.w\}`, gridRow: `\$\{c\.y \+ 1\} \/ span \$\{c\.h\}` \}\}/, "every card at its grid place");
  assert.match(page, /const \{ rail, rest \} = motionRail\(streamPosts\);/);
  assert.ok(!/<Columns|placeInColumns|packFeed/.test(page), "the masonry columns are gone");
  // the piece: SELL only for a native listing, DEMO for a synthetic record
  // (25 Oct 2026, last: "get rid of all the demo and sample tags") a demo record wears no word; it stays demo in the data
  assert.match(page, /const mode = demo \? "" : it\.commerce_rail === "native" \? "SELL" : "LISTED";/);
  assert.ok(!/DEMO_LABEL|demoflag|<ModelTag kind="sample">/.test(page), "no DEMO or SAMPLE on a card");
  assert.ok(!/SAMPLE FIXTURE|ModelTag/.test(read("app/components/PostCard.jsx")), "no SAMPLE on a post");
  const post = read("app/components/PostCard.jsx");
  assert.match(post, /if \(type === "BRDCST"\) return <BrdcstStrip p=\{p\} id=\{cardId\} \/>;/);
  assert.match(post, /if \(gallery\.length > 1\) \{\n\s*return \(\n\s*<div className="card f20post"/, "a post of two or more stills is Figure 20 alone");
  // no × on any card's face: a piece and a song hold the menu too
  assert.ok(!/className="cardpass"/.test(page) && !/className="cardpass"/.test(read("app/components/SongCard.jsx")), "the × lives in the hold menu everywhere");
  assert.match(page, /<HoldMenu id=\{"piece:" \+ it\.id\} what=\{what\} open=\{menu\} onClose=\{closeMenu\} onPass=\{onPass \|\| null\} \/>/, "a piece's PASS is still the brain's signal");
  // Fig. 12: "SELL:handle", one line
  assert.match(page, /<b className="pcmode">\{mode\}\{who \? <span className="pchandle">\{mode \? ":" : ""\}\{who\}<\/span> : null\}<\/b>/, "SELL:handle — or the handle alone on a demo record");
  assert.match(read("app/components/SongCard.jsx"), /if \(!s \|\| !s\.title\) return null;/, "a song card only for a real record");
});

test("the strip (the owner's reference, 25 Oct 2026, evening: X's \"Videos for you\"): tall cards side by side, the next one peeking, a plain sideways scroll", async () => {
  const strip = read("app/components/Strip.jsx");
  assert.match(strip, /scroll-snap|scrollLeft/, "native scrolling, snapped");
  assert.match(strip, /onSettle\(Math\.max\(0, Math\.min\(items\.length - 1, Math\.round\(el\.scrollLeft \/ Math\.max\(1, step\)\)\)\)\);/, "the card at the left edge is reported");
  assert.ok(!/rotateY|perspective/.test(strip), "the strip is flat");
  const css = read("app/globals.css");
  assert.match(css, /\.strip \{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory;/, "the page still scrolls through it");
  assert.match(css, /\.stripcard \{ flex: none; height: 100%; aspect-ratio: var\(--asp, 9 \/ 16\); scroll-snap-align: start;/);
  assert.match(read("app/components/MotionRail.jsx"), /<Strip\n\s*aspect=\{9 \/ 16\}/, "the motion row's tiles are 9:16");
  const { stripRows } = await import("../lib/feed/tetris.js");
  assert.deepEqual([5, 10, 15].map((c) => stripRows("RAIL", c)), [8, 12, 12], "the row grows with the columns, capped at a phone's tile");
  assert.equal(stripRows("CAROUSEL", 10), null, "a carousel's height is its own span, not the strip's");
  assert.equal(spansFor({ id: "r", __rail: [] }, 10)[0].h, 12);
});

test("the post card (owner's post sketch, 25 Oct 2026, IMG_1143): head, red rules, folded caption, four counted blue actions — and no invented count", async () => {
  const post = read("app/components/PostCard.jsx");
  // Figs. 8–11: circle, username, PASS, the red rule
  assert.match(post, /<header className="p2head">\n\s*<span className="p2orb">/);
  // (25 Oct, later) PASS left the head for the HOLD MENU: a held press, a right-click or the keyboard's OPTIONS key
  assert.ok(!/<PassKey/.test(post) && !/className="cardpass"/.test(post), "no × on a post's face");
  assert.match(post, /<HoldMenu id=\{cardId\} what=\{what\} href=\{sample \? null : href\} open=\{menu\} onClose=\{closeMenu\} \/>/);
  const holdm = read("app/components/HoldMenu.jsx");
  assert.match(holdm, /s\.t = setTimeout\(\(\) => \{ s\.t = 0; s\.fired = true; haptic\("confirm"\); onHold\(\); \}, LONG_PRESS_MS\);/, "the one long-press clock");
  assert.match(holdm, /if \(s\.t && Math\.hypot\(e\.clientX - s\.x, e\.clientY - s\.y\) > 8\) clear\(\);/, "a scroll is not a hold");
  assert.match(holdm, /className="idlabel holdopt" aria-haspopup="menu"/, "a keyboard reaches the menu");
  assert.match(holdm, /useEscape\(onClose, open\);/, "Escape puts it away (the one dismissal contract)");
  assert.match(holdm, /if \(onPass\) onPass\(\); else hideCard\(id\); onClose\(\);/, "PASS: the brain's signal on a piece, set aside on this device otherwise");
  assert.match(post, /<HoldKey what=\{what\} open=\{menu\} onOpen=\{\(\) => setMenu\(true\)\} \/>/, "a keyboard reaches a post's menu");
  // (later) the red rules are CUTS (Cut.jsx): a band either side bends what lies beneath
  assert.match(post, /<Cut className="p2rule" \/>/);
  assert.ok(!/p2rule2/.test(post), "no line under the actions (owner, late)");
  const cut = read("app/components/Cut.jsx");
  assert.match(cut, /feDisplacementMap in="SourceGraphic" in2="map" scale=\{CUT_SCALE\} xChannelSelector="R" yChannelSelector="G"/);
  assert.match(cut, /if \(ok\) document\.documentElement\.dataset\.cut = "1";/, "gated on the engine, like the glass");
  assert.match(read("app/globals.css"), /html\[data-cut="1"\] \.cutband \{[^}]*backdrop-filter: url\(#cutwarp\);/);
  // Figs. 6–7: the counter and the folded caption
  // (25 Oct 2026, late) the "01/26" counter rode only the housed carousel; Figure 20 carries none
  assert.ok(!/pad\(idx \+ 1\)|p2count/.test(post), "no counter: a carousel is Figure 20 alone");
  assert.match(post, /<BlockLine className="p2fold-line" text=\{caption\} \/>/, "the caption folds into blocks, one per word (owner, 25 Oct: the blocks replace the chevrons)");
  assert.match(post, /<span className="idlabel">read the caption: \{caption\}<\/span>/, "the folded caption is still read aloud");
  assert.match(post, /<Icon name="fold"/);
  // Figs. 2–5: the four actions, the stamp is STAMP, the bubble is not built and says so; no counts beneath (owner, late: "get rid of the three dots")
  assert.match(post, /icon="stamp"/);
  assert.match(post, /className="wpcact soon" title="comments are not built yet"/);
  assert.ok(!/className="p2n"/.test(post) && !/count3/.test(post), "no counts, invented or otherwise");
  assert.match(read("app/components/Icons.jsx"), /strokeWidth: 1\.15,/, "one thin stroke");
  assert.match(read("app/globals.css"), /\.p2acts \{[^}]*opacity: 0\.78; \}/, "a little transparent");
  // the ring: a real sound control, on a motion only
  assert.match(post, /\{motion \? <SoundRing video=\{\(\) => videoRef\.current\} \/> : null\}/);
  const css = read("app/globals.css");
  // (evening) the rule is the fixtures' hairline cut, .cccut's colour, not a red line
  assert.match(css, /\.p2rule \{[^}]*background: color-mix\(in srgb, var\(--ink\) 14%, transparent\);/);
  assert.match(css, /\.cccut \{[^}]*background: color-mix\(in srgb, var\(--ink\) 14%, transparent\);/s, "the same groove as the deck's");
  // the stage: on a media post the photograph is the whole card, the head and the foot over it
  assert.match(post, /<div className="p2stage">/);
  assert.match(css, /\.card\.wpostcard\.p2\.withmedia \.p2media \{ position: absolute; inset: 0;/);
  assert.match(css, /\.card\.wpostcard\.p2\.withmedia \.p2foot \{ position: absolute; left: 0; right: 0; bottom: 0;/);
  // the BRDCST strip as drawn: the clouded photograph, the badge, the name large, where and when, the ×, a tap opens the popup
  assert.match(post, /openSheet\("brdcst", \{ id: ev\.id, title: "BRDCST" \}\)/);
  assert.match(post, /<img className="bsimg" src=\{ev\.image\}/);
  assert.match(css, /\.bsimg \{[^}]*filter: blur\(3px\) saturate\(0\.45\)/, "clouded on the strip");
  assert.match(read("app/components/BrdcstSheet.jsx"), /<img className="bsheetimg" src=\{ev\.image\} alt="" \/>/, "clear in the popup");
  assert.match(read("app/components/SheetHost.jsx"), /brdcst: \{ title: "BRDCST", render: \(p\) => <BrdcstSheet \{\.\.\.p\} \/>, roomy: true \},/);
  assert.match(css, /\.p2acts \{[^}]*color: var\(--sig\);/, "the actions are the signal blue");
});

test("the place card (IMG_1143 Figs. 14–16): Location name and Location type as written, not shouted", () => {
  const place = read("app/components/PlaceCard.jsx");
  const src = place.match(/export function kindWord\(kind\) \{[\s\S]*?\n\}/)[0];
  const kindWord = new Function(src.replace("export function kindWord", "return function kindWord"))();
  assert.equal(kindWord("GALLERY"), "Gallery");
  assert.equal(kindWord("pop_up"), "Pop up");
  assert.equal(kindWord(null), "");
  assert.match(place, /<span className="placemeta">\{kindWord\(p\.kind\)\}<\/span>/, "the kind alone (no SAMPLE, owner, 25 Oct, last)");
  assert.match(read("app/globals.css"), /\.fcell \.placename \{ text-transform: none;/);
});

test("stills and motions are always the biggest: every other kind's every size is smaller (owner, 25 Oct 2026)", () => {
  // declared before measuring: the area of the smallest post-card size is larger
  // than the area of the largest size of a piece, a song, a place, a BRDCST or an ad
  const area = (k) => SPANS[k].map(([w, h]) => w * h);
  // (a carousel is Figure 20, a band of small cards, not a post card — see its own test)
  const posts = ["STILL", "MOTION", "STILL+BRDCST", "MOTION+BRDCST"].flatMap(area);
  const rest = ["LISTING", "SONG", "PLACE", "BRDCST", "AD"].flatMap(area);
  assert.ok(Math.min(...posts) > Math.max(...rest), `posts ${Math.min(...posts)} > others ${Math.max(...rest)}`);
});

test("songs and places take more than one size across a feed, and the packing still holds no hole", () => {
  const list = braid(Array.from({ length: 45 }, (_, i) => ({ id: "syn-" + i })), [], Array.from({ length: 10 }, (_, i) => ({ id: "pl" + i })), Array.from({ length: 10 }, (_, i) => ({ id: "s" + i, title: "t" })));
  const seen = new Set();
  for (const cols of [5, 10, 15]) {
    const { cells } = tetrisPack(list, { cols });
    for (const c of cells) if (c.kind === "SONG" || c.kind === "PLACE") seen.add(c.w + "x" + c.h);
    assert.equal(audit(cells, cols).holes, 0, cols + ": no hole");
  }
  assert.ok(seen.has("2x4") && seen.has("3x8"), "small and medium both appear (" + [...seen] + ")");
});

test("ad space fills the ragged end: only where it fits exactly, never over a card, never lower than the feed", () => {
  // declared before measuring: after fillAds there is no overlap, every ad is one of
  // the two sizes, none reaches below the feed's lowest card, and the ragged end
  // shrinks on a grid that has one; the cards' own cells are untouched
  const posts = Array.from({ length: 15 }, (_, i) => i % 5 === 3 ? { id: "b" + i, attachments: { event: { id: "e" + i, name: "E" } } } : still("p" + i));
  const list = braid(Array.from({ length: 45 }, (_, i) => ({ id: "syn-" + i })), posts, Array.from({ length: 10 }, (_, i) => ({ id: "pl" + i })), Array.from({ length: 10 }, (_, i) => ({ id: "s" + i, title: "t" })));
  let filled = 0;
  for (const cols of [5, 10, 15]) {
    const packed = tetrisPack(list, { cols });
    const out = fillAds(packed, { cols });
    const m = audit(out.cells, cols);
    assert.equal(m.overlaps, 0, cols + ": no overlap");
    assert.equal(m.outside, 0, cols + ": inside the grid");
    assert.deepEqual(out.cells.slice(0, packed.cells.length), packed.cells, cols + ": the cards stay where they were");
    const ads = out.cells.slice(packed.cells.length);
    assert.ok(ads.length <= Math.floor(packed.cells.length / AD_EVERY), cols + ": at most one ad per " + AD_EVERY + " cards");
    for (const a of ads) {
      assert.equal(a.kind, "AD");
      assert.ok((a.w === 5 && a.h === 4) || (a.w === 3 && a.h === 8), "one of the two sizes");
      assert.ok(a.y + a.h <= packed.rows, cols + ": no lower than the feed");
    }
    filled += ads.length;
    assert.deepEqual(fillAds(packed, { cols }), out, "deterministic");
  }
  assert.ok(filled > 0, "the wider grids' ragged ends take ad space (" + filled + ")");
  assert.equal(AD_EVERY, 8);
  // a level feed takes none
  assert.equal(fillAds({ cells: [{ card: { id: "a" }, kind: "LISTING", x: 0, y: 0, w: 5, h: 4, v: "hero" }], rows: 4 }, { cols: 5 }).cells.length, 1);
});

test("THE SIZE BATTERY: across 24 feeds the sizes vary, no column is left behind, and holes stay rare", () => {
  // declared before the final measurement (25 Oct 2026, late), from the owner's
  // ruling that sizes vary like Tetris with stills and motions the biggest:
  //  - variety: no single listing size holds more than 55% of the listings
  //    (the fit-first packing held 73% — this fails on it), and listings use
  //    at least three sizes on a ten-column grid;
  //  - bottom first: no card narrower than a post is ever placed above the
  //    lowest column (a packer that abandons a column fails this; the
  //    weight-only version scored 288 half-rows);
  //  - holes: at most 1% of the packed area on five and ten columns, 2% on
  //    fifteen (measured 0.7%, 0.2%, 1.2%).
  const sample = (seed, n) => braid(
    Array.from({ length: n }, (_, i) => ({ id: seed + "-syn-" + i })),
    Array.from({ length: Math.round(n / 3) }, (_, i) => i % 5 === 3 ? { id: seed + "b" + i, attachments: { event: { id: "e" + i, name: "E" } } } : still(seed + "p" + i)),
    Array.from({ length: Math.round(n / 4) }, (_, i) => ({ id: seed + "pl" + i })),
    Array.from({ length: Math.round(n / 4) }, (_, i) => ({ id: seed + "s" + i, title: "t" })));
  const limit = { 5: 0.01, 10: 0.01, 15: 0.02 };
  for (const seed of "abcdefgh") for (const n of [30, 45, 90]) {
    const list = sample(seed, n);
    for (const cols of [5, 10, 15]) {
      const { cells } = tetrisPack(list, { cols });
      const h = new Array(cols).fill(0);
      for (const c of cells) {
        if (c.w < 5) assert.ok(c.x <= h.indexOf(Math.min(...h)) && h.indexOf(Math.min(...h)) < c.x + c.w, `${seed}${n}@${cols}: ${c.card.id} covers the lowest column`);
        for (let i = 0; i < c.w; i++) h[c.x + i] = c.y + c.h;
      }
      const occ = new Set(); const tops = new Array(cols).fill(0);
      for (const c of cells) for (let i = 0; i < c.w; i++) { tops[c.x + i] = Math.max(tops[c.x + i], c.y + c.h); for (let j = 0; j < c.h; j++) occ.add((c.x + i) + "," + (c.y + j)); }
      let holes = 0; for (let x = 0; x < cols; x++) for (let y = 0; y < tops[x]; y++) if (!occ.has(x + "," + y)) holes++;
      const area = cols * Math.max(...tops);
      assert.ok(holes / area <= limit[cols], `${seed}${n}@${cols}: ${holes} holes of ${area}`);
      const sizes = {}; for (const c of cells) if (c.kind === "LISTING") sizes[c.w + "x" + c.h] = (sizes[c.w + "x" + c.h] || 0) + 1;
      const total = Object.values(sizes).reduce((a, b) => a + b, 0);
      assert.ok(Math.max(...Object.values(sizes)) / total <= 0.55, `${seed}${n}@${cols}: one listing size holds ${JSON.stringify(sizes)}`);
      if (cols === 10 && n >= 45) assert.ok(Object.keys(sizes).length >= 3, `${seed}${n}@10: listings in ${Object.keys(sizes)}`);
    }
  }
  // a card's draw is its own and stable
  assert.equal(preferredSpan({ id: "syn-1" }, 4), preferredSpan({ id: "syn-1" }, 4));
});

test("FIGURE 20 for the carousels (owner, 25 Oct 2026, late: \"simply input figure 20 how it is … the ipod style collapsed cards floating neatly tucked with the other media cards\")", () => {
  // declared before checking: the coverflow is back as it was drawn (three flat,
  // every other card stacked at the ends on its outer edge, opening in the
  // middle); a carousel post renders it alone — no post-card housing, head,
  // caption, counter or actions — and its cell draws no box around it
  const fig = read("app/components/Fig20.jsx");
  assert.match(fig, /export const FLAT = 3;/, "three flat");
  assert.match(fig, /rotateY\(/, "the ends turned");
  assert.match(fig, /s\.pos = s\.target = Math\.floor\(\(n - 1\) \/ 2\);/, "it opens in the middle");
  const post = read("app/components/PostCard.jsx");
  const at = post.indexOf("if (gallery.length > 1) {");
  const bare = post.slice(at, post.indexOf("  return (\n    <article", at));
  assert.match(bare, /<Fig20\n/, "the carousel is Figure 20");
  assert.ok(!/p2head|p2foot|p2cap|p2count|p2acts|Avatar|<Cut/.test(bare), "and nothing around it");
  assert.ok(!/<Strip/.test(post), "the post card no longer uses the strip");
  const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.fcell \.card\.f20post \{[^}]*border: 0;[^}]*background: none;/, "no housing in the cell");
  assert.ok(!/type-carousel|\.p2count|\.p2media \.strip/.test(css), "the housed carousel's rules are gone");
});
