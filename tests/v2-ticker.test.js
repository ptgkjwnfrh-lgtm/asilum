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
// it frosted dark make it like light grey or something").
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
//   - the band: a LIGHT GREY cloud — a haze no darker than rgb 170 in any
//     channel, with white puffs, more opaque than the deck's near-clear glass
//     yet never opaque — one token, the same in both themes; the white words
//     GLOW in a smoke bloom (a white core and halo over a dark bloom, dense at
//     the letter, wider and fainter outward) so they read on it; it runs the
//     deck's WHOLE width
//     (the bubble has no side padding) and turns round each side as a
//     quarter cylinder: WRAP_SLICES slices whose shown widths sum to the
//     radius, squeezed ever harder toward the silhouette, the last nearly
//     edge-on, the band continuous through every slice; the face (between
//     the two radii) begins 34 units in, where the pill began 40, its height
//     unchanged;
//   - the label: ADs knocked out of a solid glowing white chip (the chip
//     white, the word the deck's ink), no red, no red glow; no status
//     lights (the two red squares are gone).
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
  assert.match(strip, /text: it\.ticker \|\| it\.line/, "the ticker prints each entry's ticker words");
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
  assert.match(css, /\.adstrip\.run \.adband \{ animation: adcrawl var\(--crawl-s\) linear infinite; \}/);
  assert.match(css, /@keyframes adcrawl \{ from \{ transform: translateX\(0\); \} to \{ transform: translateX\(calc\(-1 \* var\(--crawl-l\)\)\); \} \}/, "a transform, the compositor's");
  assert.match(css, /\.adstrip\.held \.adband \{ animation-play-state: paused; \}/);
  assert.match(strip, /\(held \|\| typing \? " held" : ""\)/, "held on hover, focus and typing");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.adstrip\.run \.adband \{ animation: none; \} \}/);
});

test("the type and the band: Share Tech Mono at -8.5 to -9, white and glowing, on a light grey cloud", () => {
  const st = rule(".adstrip");
  assert.match(st, /font: 400 max\(10px, calc\(var\(--u\) \* 25\)\)\/1 var\(--mono\);/, "Share Tech Mono, regular");
  assert.match(read("app/globals.css"), /--mono: "Share Tech Mono"/);
  const ls = Number(st.match(/letter-spacing: (-?[\d.]+)em;/)[1]);
  assert.ok(ls <= -0.085 && ls >= -0.09, "the owner's -8.5 to -9: " + ls);
  assert.match(st, /color: var\(--ad-glyph\);/);
  assert.match(rule(".adword"), /text-shadow: var\(--ad-glow\);/, "glowing");
  assert.match(css, /--ad-glyph: #f4f9fc;/, "white");
  const clouds = [...css.matchAll(/--ad-cloud: ([^;]+);/g)].map((m) => m[1]);
  assert.equal(clouds.length, 1, "one light grey band for both themes");
  const c = clouds[0];
  assert.ok((c.match(/radial-gradient\(/g) || []).length >= 5, "heavily clouded: puffs all along the band");
  assert.ok([...c.matchAll(/radial-gradient\([^,]+, rgba\((\d+), (\d+), (\d+),/g)].every((m) => m.slice(1, 4).every((v) => Number(v) === 255)), "white puffs");
  const base = c.match(/linear-gradient\(180deg, rgba\((\d+), (\d+), (\d+), ([\d.]+)\), rgba\((\d+), (\d+), (\d+), ([\d.]+)\)\)$/);
  assert.ok(base, "a haze under the puffs");
  const [r1, g1, b1, a1, r2, g2, b2, a2] = base.slice(1).map(Number);
  assert.ok(Math.min(r1, g1, b1, r2, g2, b2) >= 170, "light grey, never dark: " + base[0]);
  assert.ok(Math.max(r1, g1, b1, r2, g2, b2) - Math.min(r1, g1, b1, r2, g2, b2) <= 40, "grey, not a colour");
  assert.ok(Math.min(a1, a2) >= 0.5 && Math.max(a1, a2) <= 0.75, "more clouded than the glass, never opaque");
  // (then: "make the ad text glow or something to make it more legible") a white core and halo on top, a
  // smoke bloom beneath that darkens the cloud round each letter, ever wider and fainter
  const glow = css.match(/--ad-glow: ([^;]+);/)[1].split(/,(?![^()]*\))/).map((x) => x.trim());
  assert.match(glow[0], /^0 0 1px #ffffff$/, "a white core");
  assert.match(glow[1], /^0 0 [\d.]+px rgba\(255, 255, 255, [\d.]+\)$/, "lit by a tight white halo");
  const bloom = glow.slice(2).map((g) => g.match(/^0 0 ([\d.]+)px rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/));
  assert.ok(bloom.length >= 3 && bloom.every(Boolean), "a smoke bloom of at least three layers");
  assert.ok(bloom.every((m) => Math.max(+m[2], +m[3], +m[4]) <= 40), "dark smoke");
  for (let i = 1; i < bloom.length; i++) assert.ok(+bloom[i][1] > +bloom[i - 1][1] && +bloom[i][5] < +bloom[i - 1][5], "each wider and fainter");
  assert.ok(+bloom[0][5] >= 0.9, "dense right at the letter, where legibility is won");
  assert.match(rule(".adface, .adslice"), /background: var\(--ad-cloud\);/, "one cloudscape along the face and every slice");
});

test("the band wraps the whole deck: edge to edge, round each side as a quarter cylinder", () => {
  assert.match(css, /\.ccad \{[^}]*padding: 0 0 calc\(var\(--u\) \* 30\);/, "no side padding: the band runs the deck's whole width");
  const r = Number(rule(".adstrip").match(/--ad-r: calc\(var\(--u\) \* ([\d.]+) \* var\(--dk-sx\)\);/)[1]);
  assert.ok(r < 40 && 40 - r <= 6, "the face begins " + r + " units in, where the pill began 40: longer by at most 6 a side");
  assert.match(rule(".adstrip"), /height: calc\(var\(--u\) \* 52\);/, "its height unchanged");
  const w = wrapSlices();
  assert.equal(w.left.length, WRAP_SLICES);
  assert.ok(WRAP_SLICES >= 4, "enough slices that the squeeze reads as a curve");
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
  assert.match(css, /--ad-q: 1\.5708;/, "a quarter turn of band each side");
  // the band in its unrolled coordinates in every piece: continuous round both sides
  assert.match(css, /\.adface \.adband \{ left: calc\(-1 \* var\(--ad-q\) \* var\(--ad-r\)\); \}/);
  assert.match(css, /\.adslice\.l \.adband \{ left: calc\(-1 \* var\(--from\) \* var\(--ad-r\)\); \}/);
  assert.match(css, /\.adslice\.r \.adband \{ left: calc\(-1 \* \(100cqw - 2 \* var\(--ad-r\) \+ var\(--ad-q\) \* var\(--ad-r\) \+ var\(--from\) \* var\(--ad-r\)\)\); \}/);
  assert.match(read("app/components/AdStrip.jsx"), /track\.offsetWidth - 2 \* r \+ Math\.PI \* r/, "the crawl covers the whole unrolled band");
});

test("ADs: a negative imprint in a solid glowing white chip", () => {
  const strip = read("app/components/AdStrip.jsx");
  assert.match(strip, /<span className="adslot" aria-hidden="true">ADs<\/span>/);
  const chip = rule(".adslot");
  assert.match(chip, /background: var\(--ad-chip\); color: var\(--ad-chip-ink\); box-shadow: var\(--ad-chip-glow\);/);
  assert.match(css, /--ad-chip: #f6fbff;/, "solid white");
  assert.match(css, /--ad-chip-ink: #0b0e11;/, "the word cut to the deck's ink");
  assert.match(css, /--ad-chip-glow: 0 0 1px #ffffff, 0 0 6px rgba\(255, 255, 255, [\d.]+\)/, "glowing white");
  assert.ok(!/var\(--red\)|--glow-r|var\(--warn\)/.test(chip), "no red");
  assert.ok(!/\.adslot[,)]/.test(css), "no group rule gives it the red glow any more");
  assert.ok(!/devlights|<Lamp/.test(strip), "no red squares");
});
