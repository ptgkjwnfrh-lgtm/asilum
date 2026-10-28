// tests/v2-ticker.test.js — THE AD TICKER ROUND THE DECK (owner, 28 Oct 2026,
// with the MAD-S player's wrap-round display as the reference: "lets have it
// stretch all the across the center fixture, so if the center fixture was a
// 3d object the add ticker should stretch all around it, the glowing red
// "ADs" should be a negative imprint in a solid glowing white mini rectangle
// … the glowing white text to be on an a heavly clouded track to make the
// text more visible and on dark mode the track, i dont want its placement to
// move but i would like it ever so slightly lengthened … use share tech mono
// in regular with a -8.5 to -9 kerning … all BRDCST should simply be
// displayed by their title and all actual ads should start with "AD:"
// following whatever the advertiser wants to put"; then "i said clouded no
// black, i just wanted it more clouded than the fixture and i wanted the bar
// to stretch the entirety of the fixture like i meant if the fixture was a
// object the ad ticker would wrap around the whole thing 360 degrees not just
// stuck on the middle, also get rid of those two red squares"; then "why is
// it frosted dark make it like light grey or something"; "we gotta find a way
// to make the ad text glow or something to make it more legible"; then
// "obviously with dark mode since everything is dark the clouding can be dark
// because the glow will make it ledgible. i think for light mode we can make
// it black like the logo. also the add square should be red and smaller";
// then "fix the corners of the ad bar the rendering of the 3d wrap is kind of
// choppy").
//
// Declared before measuring:
//   - what it prints: a BRDCST (the SPONSORED rows) and a listed event print
//     their title alone; an ad prints "AD: " and the advertiser's words, never
//     "AD: AD:"; an ad with no words never runs; a device's promotion draft
//     prints as an ad and says it is a draft; the labelled `line` the cover's
//     placements block prints is untouched; no ad source exists, so no ad runs;
//   - the crawl: the band covers the whole track even one sequence along,
//     loops by exactly one sequence (no seam), at CRAWL_PX_S; nothing
//     measured, no crawl; it is linear, holds on hover / focus / typing and
//     stops under reduced motion; the ticker no longer swaps entries on a timer;
//   - the type: Share Tech Mono, weight 400, letter-spacing between -0.09em and
//     -0.085em (Procreate's kerning is a per-cent of the em: -8.5 to -9);
//     white with a glow;
//   - the band, by theme: in DARK a dark grey cloud (no channel above 70 nor
//     below 15 — dark, never black — at 0.6–0.85, faint white puffs) and the
//     words white, glowing white; in LIGHT a light grey cloud (no channel
//     below 170, 0.5–0.75, white puffs) and the words the logo's black
//     (#001512), unlit; both clouds heavily puffed; it runs the
//     deck's WHOLE width
//     (the bubble has no side padding) and turns round each side as a
//     quarter cylinder — SMOOTHLY: each side's cloud and shade are one piece,
//     never sliced (sliced, every slice's cloud and shade stepped and the turn
//     read as stripes), the shade one gradient deepening toward the
//     silhouette, the words fading out before it; the words alone are cut
//     into WRAP_SLICES (at least 12) slices whose shown widths sum to the
//     radius, squeezed ever harder toward the silhouette, the last nearly
//     edge-on, the band continuous through every slice; the face (between
//     the two radii) begins 34 units in, where the pill began 40, its height
//     unchanged;
//   - the label: ADs knocked out of a SMALL solid red chip (--warn, smaller
//     than the words) glowing red as the logo's asterisk does, its word cut
//     to the band's own tone in each theme; no status lights (the two red
//     squares are gone).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tickerItems, adLine, titleLine } from "../lib/placements.js";
import { crawlFor, wrapSlices, CRAWL_PX_S, WRAP_SLICES } from "../lib/adcrawl.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel) => { const m = css.match(new RegExp("(^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}")); return m ? m[2] : ""; };

test("what the ticker prints: a BRDCST its title, an ad \"AD: \" and the advertiser's words", () => {
  const today = "2026-10-28";
  const items = tickerItems({
    ads: [{ id: "a1", copy: "  Spring   sample sale, 40% off ", href: "/u/shop" }, { id: "a2", copy: "AD: already prefixed" }, { id: "a3", copy: "   " }],
    placements: [{ id: "b1", name: "Oasis – Live Forever", kind: "runway", startsAt: "2026-11-14", href: "/?post=9" }],
    drafts: [{ id: "d1", kind: "pop-up", name: "My pop-up", startsAt: "2026-11-05" }, { id: "p1", kind: "promotion", draftId: "d1" }],
    places: [{ id: "pfw", name: "Paris Fashion Week", kind: "runway", dated: true, sourceUrl: "https://example.org", startsAt: "2026-11-01" }],
    today,
  });
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(by["ad:a1"].ticker, "AD: Spring sample sale, 40% off", "AD: and the advertiser's own words");
  assert.equal(by["ad:a2"].ticker, "AD: already prefixed", "never AD: AD:");
  assert.ok(!by["ad:a3"], "an ad with no words never runs");
  assert.equal(by["sponsored:b1"].ticker, "OASIS – LIVE FOREVER", "a BRDCST by its title alone");
  assert.equal(by["sponsored:b1"].line, "OASIS – LIVE FOREVER : RUNWAY NOV 14", "the placements block's labelled line is untouched");
  assert.equal(by["listed:pfw"].ticker, "PARIS FASHION WEEK", "a listed event by its title");
  assert.equal(by["draft:p1"].ticker, "AD: MY POP-UP : POP UP NOV 5 (DRAFT)", "a device's own request reads as an ad, and as a draft");
  assert.deepEqual(items.map((i) => i.kind), ["ad", "ad", "sponsored", "draft", "listed"], "ads, then BRDCST, then drafts, then listed events");
  assert.equal(adLine(""), "");
  assert.equal(titleLine({ name: " x " }), "X");
  // no ad source exists: the hook passes none, so no ad ever runs
  const hook = read("app/components/Placements.jsx");
  assert.ok(!/ads:/.test(hook), "nothing feeds ads yet — none is invented");
  const strip = read("app/components/AdStrip.jsx");
  assert.match(strip, /text: monoText\(it\.ticker \|\| it\.line\)/, "the ticker prints each entry's ticker words");
  assert.match(strip, /said: it\.label\.toLowerCase\(\) \+ ": "/, "and speaks its label: a BRDCST is read as sponsored");
});

test("the crawl: one sequence a loop, the track always covered, no timer swapping entries", () => {
  const c = crawlFor(250, 336);
  assert.equal(c.len, 250, "the loop slides exactly one sequence: no seam");
  assert.ok((c.copies - 1) * 250 >= 336, "one sequence along, the band still covers the track");
  assert.equal(c.seconds, Math.round((250 / CRAWL_PX_S) * 100) / 100);
  assert.ok(CRAWL_PX_S >= 20 && CRAWL_PX_S <= 60, "an unhurried read");
  assert.deepEqual(crawlFor(0, 336), { copies: 2, len: 0, seconds: 0 }, "nothing measured, no crawl");
  assert.equal(crawlFor(1000, 336).copies, 2);
  const strip = read("app/components/AdStrip.jsx");
  assert.ok(!/setInterval|ROTATE_MS|adnav|adbtn/.test(strip), "no timer swapping entries, no buttons");
  assert.match(css, /\.adstrip\.run \.adband \{ animation: adcrawl var\(--crawl-s\) linear infinite, /, "a linear glide");
  assert.match(css, /@keyframes adcrawl \{ from \{ transform: translateX\(0\); \} to \{ transform: translateX\(calc\(-1 \* var\(--crawl-l\)\)\); \} \}/, "a transform, the compositor's");
  assert.match(css, /\.adstrip\.held \.adband \{ animation-play-state: paused; \}/);
  assert.match(strip, /\(held \|\| typing \? " held" : ""\)/, "held on hover, focus and typing");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.adstrip\.run \.adband \{ animation: none; \} \}/);
});

test("the type and the band: Share Tech Mono at -8.5 to -9; dark — white and glowing on a dark cloud; light — the logo's black on a light grey cloud", () => {
  const st = rule(".adstrip");
  assert.match(st, /font: 400 max\(10px, calc\(var\(--u\) \* 25\)\)\/1 var\(--mono\);/, "Share Tech Mono, regular");
  assert.match(read("app/globals.css"), /--mono: "Share Tech Mono"/);
  const ls = Number(st.match(/letter-spacing: (-?[\d.]+)em;/)[1]);
  assert.ok(ls <= -0.085 && ls >= -0.09, "the owner's -8.5 to -9: " + ls);
  assert.match(st, /color: var\(--ad-glyph\);/);
  assert.match(rule(".adword"), /text-shadow: var\(--ad-glow\);/, "glowing");
  const tok = (name, src = css) => (src.match(new RegExp(name + ": ([^;]+);")) || [])[1];
  const lightBlock = css.match(/\[data-theme="light"\] \{([^}]*--ad-cloud[^}]*)\}/)[1];
  const lightMedia = css.match(/@media \(prefers-color-scheme: light\) \{ :root:not\(\[data-theme="dark"\]\) \{([^}]*--ad-cloud[^}]*)\} \}/)[1];
  // dark (the root): a dark cloud, white glowing words
  assert.equal(tok("--ad-cloud"), "var(--ad-cloud-dark)");
  assert.equal(tok("--ad-glyph"), "#f4f9fc", "white in dark");
  assert.match(tok("--ad-glow"), /^0 0 1px rgba\(255, 255, 255, [\d.]+\)(, 0 0 [\d.]+px rgba\(255, 255, 255, [\d.]+\))+$/, "glowing white in dark");
  // light (both ways a page can be light): the light cloud, the logo's black, no glow
  for (const blk of [lightBlock, lightMedia]) {
    assert.equal(tok("--ad-cloud", blk), "var(--ad-cloud-light)");
    assert.equal(tok("--ad-glyph", blk), "#001512", "the logo's black in light");
    assert.equal(tok("--ad-glyph", blk), tok("--wm-ink", blk), "exactly the logo's ink");
    assert.equal(tok("--ad-glow", blk), "none", "unlit, as the logo's word is");
  }
  const haze = (c) => { const m = c.match(/linear-gradient\(180deg, rgba\((\d+), (\d+), (\d+), ([\d.]+)\), rgba\((\d+), (\d+), (\d+), ([\d.]+)\)\)$/); return m && m.slice(1).map(Number); };
  const dark = tok("--ad-cloud-dark"), light = tok("--ad-cloud-light");
  for (const c of [dark, light]) {
    assert.ok((c.match(/radial-gradient\(/g) || []).length >= 5, "heavily clouded: puffs all along the band");
    assert.ok([...c.matchAll(/radial-gradient\([^,]+, rgba\((\d+), (\d+), (\d+),/g)].every((m) => m.slice(1, 4).every((v) => Number(v) === 255)), "white puffs");
  }
  const [d1, d2, d3, da, d5, d6, d7, db] = haze(dark);
  assert.ok(Math.max(d1, d2, d3, d5, d6, d7) <= 70 && Math.min(d1, d2, d3, d5, d6, d7) >= 15, "dark grey in dark — never black");
  assert.ok(Math.min(da, db) >= 0.6 && Math.max(da, db) <= 0.85, "clouded, never opaque");
  const [l1, l2, l3, la, l5, l6, l7, lb] = haze(light);
  assert.ok(Math.min(l1, l2, l3, l5, l6, l7) >= 170, "light grey in light");
  assert.ok(Math.min(la, lb) >= 0.5 && Math.max(la, lb) <= 0.75, "clouded, never opaque");
  assert.match(rule(".adface, .adside"), /background: var\(--ad-cloud\);/, "one cloudscape along the face and each side");
});

test("the band wraps the whole deck: edge to edge, round each side as a quarter cylinder", () => {
  assert.match(css, /\.ccad \{[^}]*padding: 0 0 calc\(var\(--u\) \* 30\);/, "no side padding: the band runs the deck's whole width");
  const r = Number(rule(".adstrip").match(/--ad-r: calc\(var\(--u\) \* ([\d.]+) \* var\(--dk-sx\)\);/)[1]);
  assert.ok(r < 40 && 40 - r <= 6, "the face begins " + r + " units in, where the pill began 40: longer by at most 6 a side");
  assert.match(rule(".adstrip"), /height: calc\(var\(--u\) \* 52\);/, "its height unchanged");
  const w = wrapSlices();
  assert.equal(w.left.length, WRAP_SLICES);
  assert.ok(WRAP_SLICES >= 12, "enough slices that the squeeze reads as a curve, not kinks (6 kinked)");
  const shown = (side) => side.reduce((n, g) => n + g.scale * w.arc, 0);
  assert.ok(Math.abs(shown(w.left) - 1) < 1e-9 && Math.abs(shown(w.right) - 1) < 1e-9, "each side shows exactly one radius wide");
  assert.ok(Math.abs(w.arc * WRAP_SLICES - Math.PI / 2) < 1e-9, "each side is a quarter turn of band");
  // left: outermost first, so the squeeze eases off toward the face; right: the mirror
  for (let j = 1; j < WRAP_SLICES; j++) assert.ok(w.left[j].scale > w.left[j - 1].scale && w.right[j].scale < w.right[j - 1].scale, "ever harder toward the silhouette");
  assert.ok(w.left[0].scale < 0.15 && w.right[WRAP_SLICES - 1].scale < 0.15, "nearly edge-on at the silhouette");
  assert.ok(w.left[WRAP_SLICES - 1].scale > 0.95, "nearly flat where it meets the face");
  // the slices tile the side with no gap: each begins where the last showed its end
  for (let j = 1; j < WRAP_SLICES; j++) {
    assert.ok(Math.abs(w.left[j].at - (w.left[j - 1].at + w.left[j - 1].scale * w.arc)) < 1e-9, "left tiles");
    assert.ok(Math.abs(w.right[j].at - (w.right[j - 1].at + w.right[j - 1].scale * w.arc)) < 1e-9, "right tiles");
    assert.ok(Math.abs(w.left[j].from - j * w.arc) < 1e-9 && Math.abs(w.right[j].from - j * w.arc) < 1e-9, "and the band runs on through them");
  }
  assert.match(rule(".adslice"), /transform-origin: 0 50%; transform: scaleX\(var\(--s\)\);/, "each slice squeezed from its own left edge");
  // smooth: the side's cloud and shade are one piece; the slices carry the words and nothing else
  assert.ok(!/background|::after|box-shadow/.test(rule(".adslice")) && !/\.adslice::after/.test(css), "a slice draws no cloud and no shade of its own");
  assert.match(rule(".adside.l"), /left: 0; background-position: calc\(-1 \* \(var\(--ad-q\) - 1\) \* var\(--ad-r\)\) 0;/, "the left side's cloud meets the face's where they join");
  for (const k of ["l", "r"]) {
    const shade = rule(".adside." + k + "::after");
    assert.match(shade, /linear-gradient\((90|270)deg, var\(--ad-turn-c\) 0%, /, "one gradient, darkest at the silhouette");
    assert.match(shade, /transparent 100%\); \}?$|transparent 100%\)/, "and gone where the side meets the face");
    assert.ok((shade.match(/color-mix/g) || []).length >= 3, "eased through several stops, not a step");
  }
  // (then: the words are typed out before the silhouette instead of fading — the last test)
  assert.match(read("app/components/AdStrip.jsx"), /<span className=\{"adside " \+ sideKey\} aria-hidden="true">\s*\{slices\.map/);
  assert.match(css, /--ad-q: 1\.5708;/, "a quarter turn of band each side");
  // the band in its unrolled coordinates in every piece: continuous round both sides
  assert.match(css, /\.adface \.adband \{ left: calc\(-1 \* var\(--ad-q\) \* var\(--ad-r\)\); \}/);
  assert.match(css, /\.adside\.l \.adslice \.adband \{ left: calc\(-1 \* var\(--from\) \* var\(--ad-r\)\); \}/);
  assert.match(css, /\.adside\.r \.adslice \.adband \{ left: calc\(-1 \* \(100cqw - 2 \* var\(--ad-r\) \+ var\(--ad-q\) \* var\(--ad-r\) \+ var\(--from\) \* var\(--ad-r\)\)\); \}/);
  assert.match(read("app/components/AdStrip.jsx"), /track\.offsetWidth - 2 \* r \+ Math\.PI \* r/, "the crawl covers the whole unrolled band");
});

test("ADs: a negative imprint in a small solid red chip glowing red", () => {
  const strip = read("app/components/AdStrip.jsx");
  assert.match(strip, /<span className="adslot" aria-hidden="true">ADs<\/span>/);
  const chip = rule(".adslot");
  assert.match(chip, /background: var\(--ad-chip\); color: var\(--ad-chip-ink\); box-shadow: var\(--ad-chip-glow\);/);
  assert.equal(css.match(/--ad-chip: ([^;]+);/)[1], "var(--warn)", "solid red");
  assert.match(css, /--ad-chip-glow: 0 0 1px var\(--warn\), 0 0 [\d.]+px color-mix\(in srgb, var\(--warn\) \d+%, transparent\)/, "glowing red, as the logo's asterisk glows");
  const size = Number(chip.match(/font-size: ([\d.]+)em;/)[1]);
  assert.ok(size < 1 && size >= 0.65, "smaller than the words: " + size);
  assert.match(css, /--ad-chip-ink: #262c32;/, "cut to the dark band's tone");
  assert.match(css, /\[data-theme="light"\] \{[^}]*--ad-chip-ink: #c2c8ce;/, "and to the light band's");
  assert.ok(!/\.adslot[,)]/.test(css), "no group rule gives it the red glow any more");
  assert.ok(!/devlights|<Lamp/.test(strip), "no red squares");
});

// THE TICKER'S RULES, ITS BEZEL AND ITS TYPING (owner, 28 Oct 2026: "why does the the bezel that is on the
// top and bottom of the ticker dissapear it should run the entirety, also lets give it some rules, if there
// is now ads or brdcsts the ticker should collapse and turn into a glowing white line that acts like the one
// on the mast head, broken between the button gaps. and the center fixture is allowed to shorten … if the
// user has no service the ticker … should open immediatly after regaining service, when a user first opens
// the app the first animation should be the ticker opening. all these animations should be quick and
// smooth … all the adds on the ticker should be flowing extremely smooth like a rolex no actual ticking,
// and instead of the text always appearing allow it to be typed in and typed out as its "circling" its way
// around the track"). Declared before measuring:
//   - the rule: open only online AND with an ad, a BRDCST or the device's own ad draft; a listed event or
//     the house lines alone never hold it open; offline shuts it; "online" reads the placements again;
//   - first load: the deck renders with the ticker folded (data-ad="line"), so its opening is the first
//     thing that moves;
//   - folded: the deck is the row alone (--ad-h 0), the bubble folds up into a glowing white line in the
//     Masthead's glow under the keys — a stretch under each key, broken at each cut between them (AD_LINE:
//     the cuts in pairs); the bubble's height moves in step with the deck's (same duration, same curve);
//     every open/fold move on the ladder, none longer than --dur-3 (quick);
//   - the bezel: the top and bottom rim lines on the face AND both sides;
//   - the glide: linear, never stepped; the typing: only the mask's edges step, n steps a loop, n the
//     sequence's cells, the loop exactly n cells; the edges on cell boundaries, round each side at
//     TYPE_DEG; text folded onto the monospaced grid; the dot between entries is characters, not a margin.
test("the ticker's rule: open only online with an ad or a BRDCST to carry; folded, a broken glowing line and a shorter deck", async () => {
  const { tickerOpen, OPENS_TICKER } = await import("../lib/placements.js");
  const it = (kind) => ({ kind });
  assert.deepEqual([...OPENS_TICKER].sort(), ["ad", "draft", "sponsored"]);
  assert.equal(tickerOpen([it("sponsored")]), true, "a BRDCST opens it");
  assert.equal(tickerOpen([it("ad")]), true, "an ad opens it");
  assert.equal(tickerOpen([it("draft")]), true, "the device's own ad request opens it, for its author");
  assert.equal(tickerOpen([it("listed")]), false, "a listed event alone does not");
  assert.equal(tickerOpen([]), false, "nothing to carry, folded");
  assert.equal(tickerOpen(null), false, "still reading, folded");
  assert.equal(tickerOpen([it("sponsored")], false), false, "no service, folded");
  const strip = read("app/components/AdStrip.jsx");
  assert.match(strip, /const open = test \? test === "open" : tickerOpen\(items, online\);/, "the rule decides, unless the console is testing it");
  assert.match(strip, /window\.addEventListener\("online", sync\);\s*window\.addEventListener\("offline", sync\);/, "service lost and found");
  assert.match(read("app/components/Placements.jsx"), /window\.addEventListener\("online", load\);/, "service back: read again at once");
  const cc = read("app/components/ControlCenter.jsx");
  assert.match(cc, /const \[adOpen, setAdOpen\] = useState\(false\);/, "the first render is folded, so opening is the first move");
  assert.match(cc, /data-ad=\{adOpen \? "open" : "line"\}/);
  assert.match(css, /:root:has\(\.ccenter\[data-ad="line"\]\) \{ --ad-h: 0px; \}/, "folded, the deck is the row alone");
  assert.match(rule(".ccad"), /transition: height var\(--dur-3\) var\(--ease-out\);/);
  assert.match(css, /\.ccenter \{[^}]*transition: height var\(--dur-3\) var\(--ease-out\);/, "the bubble and the deck move in step");
  // the line: the cuts in pairs, a stretch under each key, broken at each cut, in the Masthead's glow
  const cuts = JSON.parse(cc.match(/const CUTS = (\[[^\]]*\]);/)[1]);
  assert.match(cc, /export const AD_LINE = Object\.freeze\(CUTS\.slice\(0, -1\)\.map\(\(a, i\) => Object\.freeze\(\[a, CUTS\[i \+ 1\]\]\)\)\);/);
  assert.equal(cuts.length - 1, 5, "five stretches, one under each key");
  const line = rule(".ccadline");
  assert.match(line, /filter: var\(--wm-glow\);/, "the Masthead's glow");
  assert.match(rule(".ccadline i"), /background: var\(--wm-bar\);[^}]*left: calc\(var\(--u\) \* var\(--a\) \* var\(--dk-sx\) \+ var\(--ad-brk\) \/ 2\); width: calc\(var\(--u\) \* \(var\(--b\) - var\(--a\)\) \* var\(--dk-sx\) - var\(--ad-brk\)\);/s, "broken by half a break each side of every cut");
  assert.match(css, /\.ccenter\[data-ad="line"\] \.ccadline \{ opacity: 1;/);
  // quick: every open and fold move on the ladder, none past --dur-3
  for (const sel of [".adstrip", ".adstrip.shut", ".ccadline", '.ccenter[data-ad="line"] .ccadline', ".ccad"]) {
    const t = (rule(sel).match(/transition: ([^;]*);/) || [])[1] || "";
    assert.ok(t && !/--dur-4/.test(t), sel + " moves quickly: " + t);
  }
  assert.match(rule(".adstrip.shut"), /transform: scaleY\(0\.04\); opacity: 0; pointer-events: none;/, "folded up into the line");
  assert.match(strip, /inert=\{open \? undefined : ""/, "and out of reach while folded");
});

test("the bezel runs the band's whole length, round both sides", () => {
  assert.match(rule(".adface, .adside"), /box-shadow: var\(--ad-rim\);/, "the face and both sides");
  assert.match(css, /--ad-rim: inset 0 1px 0 rgba\(255, 255, 255, [\d.]+\), inset 0 -1px 0 rgba\(255, 255, 255, [\d.]+\);/, "top and bottom");
  assert.ok(!/box-shadow/.test(rule(".adface")), "not the face's alone");
});

test("the glide never steps; the words are typed in and out, a whole character at a time, on the grid", async () => {
  const { typingFor, monoText, SEP, TYPE_DEG } = await import("../lib/adcrawl.js");
  const t = typingFor({ seqW: 361.9, cell: 4.525, r: 15.5, unrolled: 340 - 31 + Math.PI * 15.5 });
  assert.equal(t.n, 80, "the sequence in cells");
  assert.ok(Math.abs(t.len - 80 * 4.525) < 1e-9, "a loop is exactly n cells, so the steps keep time with the glide forever");
  for (const e of [t.out, t.in]) assert.ok(Math.abs(e / 4.525 - Math.round(e / 4.525)) < 1e-9, "each edge on a cell boundary");
  const reach = 15.5 * (Math.PI / 2 - (TYPE_DEG * Math.PI) / 180);
  assert.ok(Math.abs(t.out - reach) <= 4.525 / 2 + 1e-9, "typed out round the left side, at TYPE_DEG");
  assert.ok(t.in > t.out, "typed in after it is typed out, round the right side");
  assert.equal(typingFor({ seqW: 0, cell: 4, r: 10, unrolled: 300 }), null, "nothing measured, no typing");
  assert.ok(TYPE_DEG > 0 && TYPE_DEG < 90);
  assert.equal(monoText("Café – “AD” …"), "Café – “AD” …", "the face carries Latin-1 and the common marks");
  assert.equal(monoText("\u0101\u6771"), "a?", "a letter off the grid folds to its plain letter, anything else to ?");
  assert.equal(SEP, "  \u00b7  ", "the dot between entries is five cells");
  assert.match(read("app/components/AdStrip.jsx"), /text: monoText\(it\.ticker \|\| it\.line\)/, "every entry on the grid");
  assert.ok(!/\.adword::after/.test(css), "no margin between entries to break the grid");
  // the glide: linear; the typing: the mask's edges step, n a loop, in the band's own frame
  assert.match(css, /\.adstrip\.run \.adband \{ animation: adcrawl var\(--crawl-s\) linear infinite, adtype var\(--crawl-s\) steps\(var\(--t-n\), end\) infinite; \}/);
  assert.match(css, /@keyframes adtype \{ from \{ -webkit-mask-position: 0 0; mask-position: 0 0; \} to \{ -webkit-mask-position: var\(--crawl-l\) 0; mask-position: var\(--crawl-l\) 0; \} \}/, "one cell a step, a loop's worth in a loop");
  assert.match(rule(".adband"), /mask-image: linear-gradient\(90deg, transparent var\(--t-out\), #000 var\(--t-out\), #000 var\(--t-in\), transparent var\(--t-in\)\);/, "hard edges: whole letters");
  assert.match(rule(".adband"), /white-space: pre;/, "every space a cell");
  assert.ok(!/steps\(/.test((css.match(/@keyframes adcrawl \{[^}]*\}[^}]*\}/) || [""])[0]), "the glide itself never steps");
});

// THE TICKER TEST (owner, 28 Oct 2026: "create a button so i can test the animation"). Declared before
// measuring: the Design Console's TICKER section replays the opening (fold, then open once the fold has
// finished), opens, folds, and goes back to live; it lasts for the page view only (nothing stored); with
// nothing live to carry, the opened ticker runs entries that say they are samples — labelled SAMPLE,
// linking nowhere — and live entries always run alongside; back to live, the rule decides again; and the
// console stops above the deck, so the animation it drives stays in view.
test("the Design Console can replay, open and fold the ticker — with labelled samples, for the page view only", async () => {
  const { TICKER_SAMPLE, TICKER_TESTS } = await import("../lib/placements.js");
  assert.deepEqual([...TICKER_TESTS], ["open", "fold"]);
  for (const s of TICKER_SAMPLE) {
    assert.equal(s.label, "SAMPLE", "labelled a sample");
    assert.equal(s.href, null, "linking nowhere");
    assert.match(s.ticker, /SAMPLE/, "and saying so on the band");
  }
  assert.ok(TICKER_SAMPLE.some((s) => s.kind === "ad") && TICKER_SAMPLE.some((s) => s.kind === "sponsored"), "one of each, so both kinds of line show");
  const strip = read("app/components/AdStrip.jsx");
  assert.match(strip, /window\.addEventListener\("asilum:ticker-test", on\);/);
  assert.match(strip, /const items = test === "open" && !\(live \|\| \[\]\)\.some\(\(it\) => OPENS_TICKER\.includes\(it\.kind\)\) \? \[\.\.\.TICKER_SAMPLE, \.\.\.\(live \|\| \[\]\)\] : live;/, "samples only when nothing live opens it, and never instead of the live entries");
  assert.match(strip, /const open = test \? test === "open" : tickerOpen\(items, online\);/, "back to live, the rule decides");
  const dc = read("app/components/DesignConsole.jsx");
  for (const label of ["REPLAY OPENING ▶", "OPEN", "FOLD", "BACK TO LIVE"]) assert.ok(dc.includes(">" + label + "</button>"), label);
  assert.match(dc, /window\.dispatchEvent\(new CustomEvent\("asilum:ticker-test", \{ detail: \{ mode: m \} \}\)\)/);
  assert.match(dc, /send\("fold"\);\s*replayTimer\.current = setTimeout\(\(\) => send\("open"\), TICKER_REPLAY_MS\);/, "replay: fold, then open");
  const replay = Number(dc.match(/export const TICKER_REPLAY_MS = (\d+);/)[1]);
  assert.ok(replay > 220 && replay <= 600, "open again once the fold (--dur-2, 220ms) has finished, and no slower");
  const testFn = dc.slice(dc.indexOf("function testTicker"), dc.indexOf("function resetAll"));
  assert.ok(!/localStorage|saveOverrides|sessionStorage/.test(testFn), "nothing stored: the page view only");
  assert.match(rule(".dc"), /bottom: calc\(var\(--cc-bottom\) \+ var\(--dk-h\) \+ var\(--ad-h\) \+ 12px\);/, "the console stops above the deck");
  assert.match(css, /\.dc \{ top: auto; left: 8px; right: 8px; bottom: calc\(var\(--cc-bottom\) \+ var\(--dk-h\) \+ var\(--ad-h\) \+ 12px\);/, "on a phone too");
});
