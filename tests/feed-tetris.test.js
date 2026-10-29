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
import { tetrisPack, fillAds, AD_EVERY, spansFor, kindOf, galleryOf, feedColsFor, motionRail, SPANS, RAIL_MAX, RAIL_MIN, SIZE, LARGE_SHARE, SCREEN_ROWS, CLASS_OF, isLarge, TILE } from "../lib/feed/tetris.js";
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
  // (owner, 25 Oct 2026, late: listings medium only) multiples of six, so two medium listings fill a phone's row
  assert.equal(feedColsFor(375), 6);
  assert.equal(feedColsFor(711), 12);
  assert.equal(feedColsFor(1440), 18);
  const css = read("app/globals.css");
  assert.match(css, /\.fgridwrap \{ container-type: inline-size;/);
  // (owner, 28 Oct 2026) the row is sized from the screen: six rows and five gaps are a large card, 80% of it (90% until the owner's "a large is now 80%")
  assert.match(css, /grid-auto-rows: calc\(\(var\(--ed-feed-large, 80svh\) - 5 \* var\(--fgap\)\) \/ 6\);/, "a large card is 80% of the screen");
  assert.equal(SIZE.LARGE[1], 6, "the CSS divides by the large card's rows");
  assert.equal(LARGE_SHARE, 0.8);
});

test("THE FOUR SIZES, a hard rule (owner, 28 Oct 2026)", () => {
  // declared before measuring: "motion and still cards are the largest … around 90% of the screen if centered,
  // lising cards are medium roughly 4 listing cards should take up 90% centered, music and location cards are
  // small 6 small cards should take up 90% of the screen, a brdcst is in a wide small … the same width and
  // hieght of two small cards side by side". In grid cells, a gap counted as part of a row (it is: rows and
  // gaps tile), so four mediums, six smalls and a large cover the same place exactly.
  const [lw, lh] = SIZE.LARGE, [mw, mh] = SIZE.MEDIUM, [sw, sh] = SIZE.SMALL, [ww, wh] = SIZE.WIDE;
  assert.deepEqual([2 * mw, 2 * mh], [lw, lh], "four mediums, two by two, are a large");
  assert.deepEqual([2 * sw, 3 * sh], [lw, lh], "six smalls, two by three, are a large");
  assert.deepEqual([ww, wh], [2 * sw, sh], "a wide small is two smalls side by side");
  for (const k of ["STILL", "MOTION", "STILL+BRDCST", "MOTION+BRDCST", "CAROUSEL", "RAIL"]) assert.equal(CLASS_OF[k], "LARGE", k);
  assert.equal(CLASS_OF.LISTING, "MEDIUM");
  assert.equal(CLASS_OF.SONG, "SMALL"); assert.equal(CLASS_OF.PLACE, "SMALL");
  assert.equal(CLASS_OF.BRDCST, "WIDE");
  for (const [k, cls] of Object.entries(CLASS_OF)) assert.deepEqual(SPANS[k].map(([w, h]) => [w, h]), [[...SIZE[cls]]], k + ": one size, its class's");
  assert.deepEqual(SPANS.AD.map(([w, h]) => [w, h]), [[...SIZE.WIDE], [...SIZE.MEDIUM]], "two ad spaces: BRDCST-size and medium");
  assert.deepEqual(SPANS.ECHO, [], "an echo lives on the rail above the stream");
  assert.equal(SCREEN_ROWS, lh / 0.8);
  assert.equal(kindOf({ id: "x" }), "LISTING");
  assert.equal(kindOf({ id: "p", __post: still("p", { images: [{ src: "a" }, { src: "b" }] }) }), "CAROUSEL");
  assert.equal(kindOf({ id: "p", __post: still("p") }), "STILL");
  assert.equal(kindOf({ id: "p", __post: still("p", { attachments: { event: { id: "e" } } }) }), "STILL+BRDCST");
  assert.equal(kindOf({ id: "b", __post: { id: "b", attachments: { event: { id: "e" } } } }), "BRDCST");
  assert.equal(kindOf({ id: "pl", __place: { id: "pl" } }), "PLACE");
  assert.equal(kindOf({ id: "r", __rail: [] }), "RAIL");
  assert.equal(kindOf({ id: "ad:0:0", __ad: { size: "ad" } }), "AD");
  assert.ok(!isLarge({ id: "ad:0", __ad: true }), "an ad space is never large");
  assert.equal(galleryOf({ attachments: { media: [{ url: "a" }, { url: "b" }] } }).length, 2);
  assert.equal(galleryOf({}).length, 0);
});

test("every card is placed exactly once, inside the grid, overlapping nothing, the same way every time", () => {
  const list = feed();
  for (const cols of [6, 12, 18]) {
    const a = tetrisPack(list, { cols });
    const b = tetrisPack(list, { cols });
    assert.deepEqual(a, b, "deterministic");
    assert.deepEqual(a.cells.map((c) => c.card.id).sort(), list.map((c) => c.id).sort(), cols + ": every card once");
    const m = audit(a.cells, cols);
    assert.equal(m.overlaps, 0, cols + ": no overlap");
    assert.equal(m.outside, 0, cols + ": inside the grid");
  }
});

test("like Tetris: no gap between the cards; a full-width card never sits over a hole", () => {
  // (owner, 28 Oct 2026: "there must never be a large gap in between the cards") a row is a sixth of a large
  // card, a sixth of 80% of the screen: any trapped cell is a large gap. Packed as the page packs.
  const list = feed();
  for (const cols of [6, 12, 18]) {
    const { cells } = fillAds(tetrisPack(list, { cols, ads: true }), { cols });
    const m = audit(cells, cols);
    assert.equal(m.holes, 0, `${cols} columns: ${m.holes} holes`);
    assert.equal(m.fullOverHole, 0, cols + ": a full card waits for a level row");
  }
});

test("the case that trapped cells (seen 25 Oct on a 10-column feed): a wide post after a ragged row waits for the small cards that fill it", () => {
  // small, hero, small, then a 5x13 post: placed at the lowest spot it trapped a 3x4 hole under itself
  const list = [{ id: "s1" }, { id: "h1" }, { id: "s2" }, { id: "w", __post: still("w", { attachments: { event: { id: "e" } } }) }, ...Array.from({ length: 12 }, (_, i) => ({ id: "k" + i }))];
  const { cells } = tetrisPack(list, { cols: 12 });
  const m = audit(cells, 12);
  assert.equal(m.holes, 0, "no cell trapped (" + m.holes + ")");
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

test("the model's songs are all samples", async () => {
  const { SAMPLE_SONGS } = await import("../lib/model/songs.js");
  assert.ok(SAMPLE_SONGS.length > 0 && SAMPLE_SONGS.every((x) => x.sample === true), "each record carries sample: true");
});

test("the page draws what the packer decides, and the cards are the sketch's", () => {
  const page = read("app/page.js");
  // (29 Oct 2026) the reader's mix filters the stream before it is packed (lib/feed/choice.js, tests/v2-feed-eq.test.js)
  assert.match(page, /const shown = filterFeed\(feedList\(list\)\.filter\(\(it\) => !hidden\.has\(String\(it\.id\)\)\), mix\);\n\s*const \{ cells, rows \} = fillAds\(tetrisPack\(shown, \{ cols: feedCols, ads: true \}\), \{ cols: feedCols \}\);/, "the page packs with the ad space as filler");
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
  assert.match(post, /\{carousel \? \(\n\s*<Fig20\n/, "a post of two or more stills has Figure 20 for its media");
  // no × on any card's face: a piece and a song hold the menu too
  assert.ok(!/className="cardpass"/.test(page) && !/className="cardpass"/.test(read("app/components/SongCard.jsx")), "the × lives in the hold menu everywhere");
  assert.match(page, /<HoldMenu id=\{"piece:" \+ it\.id\} what=\{what\} open=\{menu\} onClose=\{closeMenu\} onPass=\{onPass \|\| null\} \/>/, "a piece's PASS is still the brain's signal");
  // Fig. 12: "SELL:handle", one line
  assert.match(page, /<b className="pcmode">\{mode\}\{who \? <span className="pchandle">\{mode \? ":" : ""\}\{who\}<\/span> : null\}<\/b>/, "SELL:handle — or the handle alone on a demo record");
  assert.match(read("app/components/SongCard.jsx"), /if \(!s \|\| !s\.title\) return null;/, "a song card only for a real record");
  // (owner, 28 Oct 2026: "label the sample song cards SAMPLE") a sample record says so on its face, and to a
  // screen reader; every one of the model's songs is a sample
  assert.match(read("app/components/SongCard.jsx"), /\{s\.sample \? <ModelTag kind="sample" \/> : null\}/, "the SAMPLE tag");
  assert.match(read("app/components/SongCard.jsx"), /\(s\.sample \? "sample song: " : "song: "\)/, "and its spoken name");
  assert.match(read("app/globals.css"), /\.card\.songcard:has\(\.songart\.blank\) \.carddots \{ color: var\(--ink\); \}/, "the dots show on a card with no art");
});

// (retired 25 Oct 2026, late) the strip (Strip.jsx, X's "Videos for you") is
// deleted: the carousels and then the recommended motions went back to
// Figure 20 at the owner's word — the FIGURE 20 test below holds them.

test("the post card (owner's post sketch, 25 Oct 2026, IMG_1143): head, red rules, folded caption, four counted blue actions — and no invented count", async () => {
  const post = read("app/components/PostCard.jsx");
  // Figs. 8–11: circle, username, PASS, the red rule
  assert.match(post, /<header className="p2head">\n\s*<span className="p2orb">/);
  // (25 Oct, later) PASS left the head for the HOLD MENU; (28 Oct 2026: "for every card lets add three dot buttons
  // to the right corner to replace that touch and hold feature") the menu opens from THREE DOTS, never a hold
  assert.ok(!/<PassKey/.test(post) && !/className="cardpass"/.test(post), "no × on a post's face");
  assert.match(post, /<HoldMenu id=\{cardId\} what=\{what\} href=\{sample \? null : href\} open=\{menu\} onClose=\{closeMenu\} \/>/);
  const holdm = read("app/components/HoldMenu.jsx");
  assert.ok(!/useHold|LONG_PRESS_MS|onContextMenu|HoldKey/.test(holdm), "no hold: the dots replace it");
  assert.match(holdm, /<button type="button" className="carddots" aria-haspopup="menu" aria-expanded=\{open\} aria-label=\{"options for " \+ what\}/, "the dots: a real key, so a keyboard reaches the menu as a finger does");
  assert.match(holdm, /<Icon name="dots" size=\{20\} \/>/);
  assert.match(holdm, /useEscape\(onClose, open\);/, "Escape puts it away (the one dismissal contract)");
  assert.match(holdm, /if \(onPass\) onPass\(\); else hideCard\(id\); onClose\(\);/, "PASS: the brain's signal on a piece, set aside on this device otherwise");
  assert.match(post, /<CardDots what=\{what\} open=\{menu\} onOpen=\{\(\) => setMenu\(true\)\} \/>\n\s*<HoldMenu id=\{cardId\}/, "a post's dots, in its corner");
  // every card of the Feed: a post, a BRDCST strip, a piece, a song, a place — and no hold anywhere
  for (const f of ["app/components/PostCard.jsx", "app/page.js", "app/components/SongCard.jsx", "app/components/PlaceCard.jsx"]) {
    const src = read(f);
    assert.match(src, /<CardDots what=\{what\} open=\{menu\} onOpen=\{\(\) => setMenu\(true\)\} \/>/, f + ": the three dots");
    assert.ok(!/useHold|\{\.\.\.hold\}|HoldKey/.test(src), f + ": no touch-and-hold");
  }
  assert.match(read("app/components/PlaceCard.jsx"), /<HoldMenu id=\{"place:" \+ p\.id\} what=\{what\} open=\{menu\} onClose=\{closeMenu\} \/>/, "a place is set aside by the id the Feed filters on");
  assert.ok(!/className="bspass"/.test(post), "the BRDCST strip's × folded into its menu");
  const dotsCss = read("app/globals.css");
  assert.match(dotsCss, /\.carddots \{ position: absolute; top: 2cqw; right: 2\.4cqw;/, "top-right, where the × was");
  assert.ok(!/\.cardpass|\.bspass|\.holdopt/.test(dotsCss.replace(/\/\*[\s\S]*?\*\//g, "")), "the retired corner keys leave no rule");
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
  assert.match(post, /<BlockLine className="p2fold-line" text=\{text\} \/>/, "the caption folds into blocks, one per word (owner, 25 Oct: the blocks replace the chevrons)");
  assert.match(post, /<span className="idlabel">read the caption: \{text\}<\/span>/, "the folded caption is still read aloud");
  assert.match(post, /<Icon name="fold"/);
  // Figs. 2–5: the four actions, the stamp is STAMP, the bubble is not built and says so; no counts beneath (owner, late: "get rid of the three dots")
  assert.match(post, /icon="stamp"/);
  assert.match(post, /className="wpcact soon" title="comments are not built yet"/);
  assert.ok(!/className="p2n"/.test(post) && !/count3/.test(post), "no counts, invented or otherwise");
  assert.match(read("app/components/Icons.jsx"), /strokeWidth: 1\.15,/, "one thin stroke");
  // (owner, 28 Oct 2026: "the like, comment, stamp, and share button should be a little bit more visible") 0.78 -> 0.92
  assert.match(read("app/globals.css"), /\.p2acts \{[^}]*opacity: 0\.92; \}/, "a little transparent, less than before");
  // the ring: a real sound control, on a motion only
  assert.match(post, /\{motion && videoRef \? <SoundRing video=\{\(\) => videoRef\.current\} \/> : null\}/, "the sound ring on a motion's caption");
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
  // (a carousel and the recommended motions are Figure 20 at a post's size)
  const posts = ["STILL", "MOTION", "STILL+BRDCST", "MOTION+BRDCST", "CAROUSEL", "RAIL"].flatMap(area);
  const rest = ["LISTING", "SONG", "PLACE", "BRDCST", "AD"].flatMap(area);
  assert.ok(Math.min(...posts) > Math.max(...rest), `posts ${Math.min(...posts)} > others ${Math.max(...rest)}`);
});

test("every card at its class's size, on every grid", () => {
  const list = braid(Array.from({ length: 45 }, (_, i) => ({ id: "syn-" + i })), [still("p0"), still("p1"), { id: "b", attachments: { event: { id: "e", name: "E" } } }], Array.from({ length: 10 }, (_, i) => ({ id: "pl" + i })), Array.from({ length: 10 }, (_, i) => ({ id: "s" + i, title: "t" })));
  for (const cols of [6, 12, 18]) for (const c of tetrisPack(list, { cols }).cells) {
    if (c.kind === "AD") continue;
    assert.deepEqual([c.w, c.h], [...SIZE[CLASS_OF[c.kind]]], `${cols}: ${c.card.id} (${c.kind})`);
  }
});

test("ad space fills the ragged end: only where it fits exactly, never over a card, never lower than the feed", () => {
  // declared before measuring: after fillAds there is no overlap, every ad is one of
  // the two sizes, none reaches below the feed's lowest card, and the ragged end
  // shrinks on a grid that has one; the cards' own cells are untouched
  const posts = Array.from({ length: 15 }, (_, i) => i % 5 === 3 ? { id: "b" + i, attachments: { event: { id: "e" + i, name: "E" } } } : still("p" + i));
  const list = braid(Array.from({ length: 45 }, (_, i) => ({ id: "syn-" + i })), posts, Array.from({ length: 10 }, (_, i) => ({ id: "pl" + i })), Array.from({ length: 10 }, (_, i) => ({ id: "s" + i, title: "t" })));
  let filled = 0;
  for (const cols of [6, 12, 18]) {
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
      assert.ok((a.w === 6 && a.h === 2) || (a.w === 3 && a.h === 3), "one of the two sizes");
      assert.ok(a.y + a.h <= packed.rows, cols + ": no lower than the feed");
    }
    filled += ads.length;
    assert.deepEqual(fillAds(packed, { cols }), out, "deterministic");
  }
  assert.ok(filled > 0, "the wider grids' ragged ends take ad space (" + filled + ")");
  assert.equal(AD_EVERY, 8);
  // a level feed takes none
  assert.equal(fillAds({ cells: [{ card: { id: "a" }, kind: "LISTING", x: 0, y: 0, w: 6, h: 3, v: "hero" }], rows: 3 }, { cols: 6 }).cells.length, 1);
});

// two screens, in rows, rounded down (a shorter window is the stricter test)
const TWO_SCREENS = Math.floor(2 * SCREEN_ROWS);
// the measured truth the owner's two hard rules ask for: holes, and two-screen bands without a mix
function rules(cells, cols) {
  const occ = new Set(); const tops = new Array(cols).fill(0);
  for (const c of cells) for (let i = 0; i < c.w; i++) { tops[c.x + i] = Math.max(tops[c.x + i], c.y + c.h); for (let j = 0; j < c.h; j++) occ.add((c.x + i) + "," + (c.y + j)); }
  let holes = 0; for (let x = 0; x < cols; x++) for (let y = 0; y < tops[x]; y++) if (!occ.has(x + "," + y)) holes++;
  const rows = Math.max(0, ...tops), unmixed = [];
  for (let t = 0; t + TWO_SCREENS <= rows; t++) {
    const w = cells.filter((c) => c.y + c.h > t && c.y < t + TWO_SCREENS);
    if (!(w.some((c) => isLarge(c.card)) && w.some((c) => !isLarge(c.card)))) unmixed.push(t);
  }
  return { holes, unmixed, rows };
}

test("THE SIZE BATTERY: across 24 feeds, no gap and always a mix (owner, 28 Oct 2026)", () => {
  // declared before measuring, the owner's hard rules: "there must never be a large gap in between the cards
  // and there should never be 2 full scrolls where it is all mediums, smalls, and wide smalls or just larges
  // there must always be a mix". On 6, 12 and 18 columns, packed as the page packs (ads in the stream and at
  // the ragged end): no trapped cell anywhere, and every band two screens tall holds a large card and another.
  // (The old battery allowed holes of 2/3/4% and pinned listings at least medium; with rows a sixth of 80% of
  // the screen, any hole is a large gap, so the bound is zero.)
  const sample = (seed, n) => braid(
    Array.from({ length: n }, (_, i) => ({ id: seed + "-syn-" + i })),
    Array.from({ length: Math.round(n / 3) }, (_, i) => i % 5 === 3 ? { id: seed + "b" + i, attachments: { event: { id: "e" + i, name: "E" } } } : still(seed + "p" + i)),
    Array.from({ length: Math.round(n / 4) }, (_, i) => ({ id: seed + "pl" + i })),
    Array.from({ length: Math.round(n / 4) }, (_, i) => ({ id: seed + "s" + i, title: "t" })));
  for (const seed of "abcdefgh") for (const n of [30, 45, 90]) {
    const list = sample(seed, n);
    for (const cols of [6, 12, 18]) {
      const { cells } = fillAds(tetrisPack(list, { cols, ads: true }), { cols });
      const r = rules(cells, cols);
      assert.equal(r.holes, 0, `${seed}${n}@${cols}: ${r.holes} holes`);
      assert.deepEqual(r.unmixed, [], `${seed}${n}@${cols}: two screens without a mix from row ${r.unmixed[0]} of ${r.rows}`);
    }
  }
  assert.equal(TILE, SIZE.LARGE[0], "a tile is a large card's place");
});

test("the mix holds when the order fights it: all the larges first, then all the rest", () => {
  // a stream the braid would never make, so the packer alone keeps the rule
  const list = [...Array.from({ length: 12 }, (_, i) => ({ id: "post:" + i, __post: still("p" + i) })), ...Array.from({ length: 40 }, (_, i) => ({ id: "syn-" + i })), ...Array.from({ length: 12 }, (_, i) => ({ id: "pl" + i, __place: { id: "pl" + i } }))];
  for (const cols of [6, 12, 18]) {
    const { cells } = fillAds(tetrisPack(list, { cols, ads: true }), { cols });
    const r = rules(cells, cols);
    assert.deepEqual(r.unmixed, [], `${cols}: two screens without a mix from row ${r.unmixed[0]} of ${r.rows}`);
    assert.equal(r.holes, 0, `${cols}: ${r.holes} holes`);
  }
});

test("FIGURE 20 for the carousels (owner, 25 Oct 2026, late: \"simply input figure 20 how it is … the ipod style collapsed cards floating neatly tucked with the other media cards\")", () => {
  // declared before checking: the coverflow is back as it was drawn (three flat,
  // every other card stacked at the ends on its outer edge, opening in the
  // middle); a carousel post renders it alone — no post-card housing, head,
  // caption, counter or actions — and its cell draws no box around it
  const fig = read("app/components/Fig20.jsx");
  assert.match(fig, /export const FLAT = 3;/, "three flat");
  // (owner, 28 Oct 2026: "slightly widen the centered image") measured at 375px: 261px -> 287px
  assert.match(fig, /const FLAT_SHARE = 0\.8;/, "the centred card a little wider");
  // (same night: "invert the animations … I want it tucked outward") the right
  // stack turns by -deg and the left by +deg about their outer edges
  assert.match(fig, /rotateY\(\$\{\(-sgn \* EDGE_DEG \* ease\)\.toFixed\(1\)\}deg\)/, "the ends tucked outward");
  assert.match(fig, /c\.style\.transformOrigin = sgn > 0 \? "right center" : "left center";/, "each stands on its outer edge");
  // "almost the same height and width of a regular motion or still post": the flat
  // cards fill the stage's height, as many as fit (one in a post-sized cell)
  assert.match(fig, /const flatN = Math\.max\(1, Math\.min\(FLAT, n, Math\.floor\(\(W \* FLAT_SHARE \+ gap\) \/ \(tall \+ gap\)\)\)\);/);
  assert.match(fig, /s\.pos = s\.target = Math\.floor\(\(n - 1\) \/ 2\);/, "it opens in the middle");
  const post = read("app/components/PostCard.jsx");
  // (then: "the caption and the like, comment, stamp and share buttons … floating
  // over top of the feed … the profile pic and user name float as well, so the
  // carousel can have the exact same dimensions as just a regular post") — the
  // post card's own head, caption and actions around Figure 20, on no ground
  assert.match(post, /const carousel = gallery\.length > 1;/);
  assert.match(post, /type-" \+ \(carousel \? "carousel f20post" : type\.toLowerCase\(\)\)/, "the carousel wears f20post");
  // (then: "allow the header and captions to float over top of the actual card, so
  // the carousel cards still have the same height as the regular motion and still
  // cards") the photo-filled stage: the coverflow fills the cell, the head and foot over it
  assert.match(post, /\(hasMedia \? " withmedia" : ""\)/, "the carousel takes the post's photo-filled stage");
  assert.match(post, /\{carousel \? \(\n\s*<Fig20\n\s*aspect=\{1 \/ 2\}/, "1:2 cards, so the centre card is the post's full height");
  assert.match(post, /<Caption text=\{caption\} motion=\{motion\} videoRef=\{videoRef\} \/>\s*<Acts /, "the caption and the four actions");
  const rail = read("app/components/MotionRail.jsx");
  // (same: "VIDEOS YOU MAY LIKE floating where it says the profile pic and user
  // names … for each video it lands on allow its caption to appear")
  assert.match(rail, /<h3 className="p2user">VIDEOS YOU MAY LIKE<\/h3>/, "the head reads VIDEOS YOU MAY LIKE");
  assert.match(rail, /className="card wpostcard p2 withmedia f20post motionrail"/, "laid out as a carousel post");
  assert.match(rail, /<Fig20\n\s*aspect=\{1 \/ 2\}/, "the recommended motions in Figure 20, the centre card full height");
  assert.match(rail, /const onSettle = useCallback\(\(i\) => \{ setAt\(i\);/, "the card it lands on is remembered");
  assert.match(rail, /<Caption key=\{String\(cur\.serverId \?\? cur\.id \?\? at\)\} text=\{caption\} \/>/, "and its caption shows, folding again for each video");
  assert.ok(!existsSync("app/components/Strip.jsx"), "the strip is deleted");
  assert.ok(!/<Strip/.test(post + rail), "nothing uses the strip");
  const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.fcell \.card\.wpostcard\.p2\.f20post \{[^}]*border: 0;[^}]*background: none;/, "no housing: they float on the feed");
  assert.match(css, /\.card\.wpostcard\.p2\.withmedia\.f20post \.p2head, \.card\.wpostcard\.p2\.withmedia\.f20post \.p2foot \{ background: none;/, "no scrims: around the cards there is only the feed");
  assert.ok(!/type-carousel|\.p2count|\.p2media \.strip|\.stripcard|\.mrhead|(^|[^-])\.strip \{/.test(css), "the housed carousel's and the strip's rules are gone");
});

test("the mix holds as long as the feed has both, however few the larges", () => {
  // three fills' worth of pieces to every large on a phone: the larges cannot be every other band, so the
  // packer keeps at most two bands without one until they run out (the owner's rule as far as it can hold)
  const list = [...Array.from({ length: 6 }, (_, i) => ({ id: "post:" + i, __post: still("p" + i) })), ...Array.from({ length: 72 }, (_, i) => ({ id: "syn-" + i }))];
  const { cells } = tetrisPack(list, { cols: 6 });
  const lastLarge = Math.max(...cells.filter((c) => isLarge(c.card)).map((c) => c.y + c.h));
  const r = rules(cells, 6);
  assert.deepEqual(r.unmixed.filter((t) => t + TWO_SCREENS <= lastLarge), [], "mixed until the last large");
  assert.equal(r.holes, 0);
});

test("the end of the feed never lays a card over a gap", () => {
  // what closes no tile at the end: a wide small after a medium would have stood over the medium's empty lane
  for (const tail of [[{ id: "syn-0" }, { id: "b", __post: { id: "b", attachments: { event: { id: "e" } } } }], [{ id: "pl0", __place: { id: "pl0" } }, { id: "syn-1" }, { id: "b2", __post: { id: "b2", attachments: { event: { id: "e" } } } }, { id: "s0", __song: { id: "s0", title: "t" } }]]) {
    for (const cols of [6, 12, 18]) {
      const { cells } = tetrisPack([{ id: "post:x", __post: still("x") }, ...tail], { cols });
      assert.equal(rules(cells, cols).holes, 0, cols + ": " + tail.map((c) => c.id));
      assert.equal(cells.length, tail.length + 1, "every card placed");
    }
  }
});

test("the braid gives each large card a tile's worth of the others", () => {
  // declared: after every still or motion, until the pieces and smalls run short, the cards up to the next
  // one close a large card's place exactly (area 36 cells), so the feed's kinds come one to one
  const posts = Array.from({ length: 12 }, (_, i) => still("p" + i));
  const list = braid(Array.from({ length: 60 }, (_, i) => ({ id: "syn-" + i })), posts, Array.from({ length: 12 }, (_, i) => ({ id: "pl" + i })), Array.from({ length: 12 }, (_, i) => ({ id: "s" + i, title: "t" })));
  const cellsOf = (c) => { const [w, h] = SIZE[CLASS_OF[kindOf(c)]]; return w * h; };
  const blocks = [];
  for (const c of list) { if (isLarge(c)) blocks.push(0); else blocks[blocks.length - 1] += cellsOf(c); }
  assert.equal(blocks.length, 12);
  assert.deepEqual(blocks, blocks.map(() => SIZE.LARGE[0] * SIZE.LARGE[1]), "each block a tile: " + blocks);
});

test("A SMART MIX AND NO GAPS on the model's feed (owner, 26 Oct 2026)", async () => {
  // declared before measuring: "when I'm swiping I don't want two full scrolls to be comprised of just
  // listings, locations, BRDCSTs and/or songs, or motions and stills — I want a smart mix; I am also
  // seeing gaps in the feed, which is against the rules". On the model's own feed, packed as the page
  // packs it: no hole on 6, 12 or 18 columns, and every window two screens tall holds at least one large
  // card AND at least one other card (28 Oct 2026: on every grid now, the rows sized from the screen). With
  // the 25 Oct braid and packing this failed: 125 such windows and 4 holes.
  const { SAMPLE_POSTS } = await import("../lib/model/media.js");
  const { SAMPLE_SONGS } = await import("../lib/model/songs.js");
  const { PLACES } = await import("../lib/places/registry.js");
  const pieces = Array.from({ length: 60 }, (_, i) => ({ id: "syn-" + i }));
  const { rail, rest } = motionRail(SAMPLE_POSTS);
  const list = braid(pieces, rest, PLACES.slice(0, 12), SAMPLE_SONGS);
  if (rail) list.splice(Math.min(6, list.length), 0, rail);
  const media = (c) => isLarge(c);
  for (const cols of [6, 12, 18]) {
    const { cells } = fillAds(tetrisPack(list, { cols, ads: true }), { cols });
    const m = audit(cells, cols);
    assert.equal(m.overlaps, 0, cols + ": no overlap");
    const occ = new Set(); const tops = new Array(cols).fill(0);
    for (const c of cells) for (let i = 0; i < c.w; i++) { tops[c.x + i] = Math.max(tops[c.x + i], c.y + c.h); for (let j = 0; j < c.h; j++) occ.add((c.x + i) + "," + (c.y + j)); }
    let holes = 0; for (let x = 0; x < cols; x++) for (let y = 0; y < tops[x]; y++) if (!occ.has(x + "," + y)) holes++;
    assert.equal(holes, 0, cols + " columns: no gap in the feed");
    {
      const WIN = TWO_SCREENS, rows = Math.max(...tops);
      for (let t = 0; t + WIN <= rows; t++) {
        const w = cells.filter((c) => c.y + c.h > t && c.y < t + WIN);
        assert.ok(w.some((c) => media(c.card)) && w.some((c) => !media(c.card)), cols + ": two screens from row " + t + " hold both kinds");
      }
    }
  }
});
