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
// following whatever the advertiser wants to put").
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
//   - the track: heavily clouded and dark in BOTH themes (one token, never
//     redefined per theme); its face begins 34 units in where the pill began
//     40 — longer by at most 6 units a side ("ever so slightly"), its height
//     unchanged; its ends curl away round the deck's sides in perspective
//     seen from each hinge, the angle lib/adcrawl.js's CURL_DEG;
//   - the label: ADs knocked out of a solid glowing white chip (the chip
//     white, the word the track's dark), no red, no red glow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tickerItems, adLine, titleLine } from "../lib/placements.js";
import { crawlFor, CRAWL_PX_S, CURL_DEG } from "../lib/adcrawl.js";

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

test("the type and the track: Share Tech Mono at -8.5 to -9, white and glowing, on a clouded track dark in both themes", () => {
  const s = rule(".adstrip");
  assert.match(s, /font: 400 max\(10px, calc\(var\(--u\) \* 25\)\)\/1 var\(--mono\);/, "Share Tech Mono, regular");
  assert.match(read("app/globals.css"), /--mono: "Share Tech Mono"/);
  const ls = Number(s.match(/letter-spacing: (-?[\d.]+)em;/)[1]);
  assert.ok(ls <= -0.085 && ls >= -0.09, "the owner's -8.5 to -9: " + ls);
  assert.match(s, /color: var\(--ad-glyph\);/);
  assert.match(rule(".adword"), /text-shadow: var\(--ad-glow\);/, "glowing");
  assert.match(css, /--ad-glyph: #f4f9fc;/, "white");
  const clouds = [...css.matchAll(/--ad-cloud: ([^;]+);/g)].map((m) => m[1]);
  assert.equal(clouds.length, 1, "one track for both themes");
  assert.ok((clouds[0].match(/radial-gradient/g) || []).length >= 4, "heavily clouded");
  const base = clouds[0].match(/linear-gradient\(180deg, rgba\((\d+), (\d+), (\d+), ([\d.]+)\), rgba\((\d+), (\d+), (\d+), ([\d.]+)\)\)$/);
  assert.ok(base && Number(base[1]) < 40 && Number(base[4]) >= 0.85, "dark and dense under the clouds, so the white reads in light and dark");
  assert.match(rule(".adcurl, .adface"), /background: var\(--ad-cloud\); background-size: 100cqw 100%;/, "one cloudscape across the face and the curls");
});

test("placed where it was, ever so slightly longer; its ends curl round the deck's sides", () => {
  const pad = Number(css.match(/\.ccad \{[^}]*padding: 0 calc\(var\(--u\) \* ([\d.]+) \* var\(--dk-sx\)\)/)[1]);
  const curl = Number(rule(".adstrip").match(/--ad-e: calc\(var\(--u\) \* ([\d.]+) \* var\(--dk-sx\)\);/)[1]);
  const faceStart = pad + curl;
  assert.ok(faceStart < 40 && 40 - faceStart <= 6, "the face begins " + faceStart + " units in, where the pill began 40: longer by at most 6 a side");
  assert.match(rule(".adstrip"), /height: calc\(var\(--u\) \* 52\);/, "its height unchanged");
  assert.match(rule(".adcurl.l"), /transform-origin: 100% 50%; transform: perspective\(calc\(var\(--u\) \* 300\)\) rotateY\(calc\(-1 \* var\(--ad-curl\)\)\);/, "the left end turns away about its hinge, seen from the hinge");
  assert.match(rule(".adcurl.r"), /transform-origin: 0 50%; transform: perspective\(calc\(var\(--u\) \* 300\)\) rotateY\(var\(--ad-curl\)\);/, "and the right");
  assert.equal(Number(css.match(/--ad-curl: ([\d.]+)deg;/)[1]), CURL_DEG, "the CSS turns the curls by lib/adcrawl.js's angle");
  assert.ok(CURL_DEG >= 35 && CURL_DEG < 80, "away, never edge-on");
  assert.ok(!/\.adtrack \{[^}]*perspective:/.test(css), "no shared vantage at the track's middle (from there the far curls went edge-on)");
  // the band runs on through the right curl in the track's own coordinates: continuous across the hinge
  assert.match(css, /\.adcurl\.r \.adband \{ left: calc\(var\(--ad-e\) - 100cqw\); \}/);
  assert.match(css, /\.adwin \.adband \{ left: calc\(-1 \* var\(--win-x\)\); \}/);
});

test("ADs: a negative imprint in a solid glowing white chip", () => {
  const strip = read("app/components/AdStrip.jsx");
  assert.match(strip, /<span className="adslot">ADs<\/span>/);
  const chip = rule(".adslot");
  assert.match(chip, /background: var\(--ad-chip\); color: var\(--ad-chip-ink\); box-shadow: var\(--ad-chip-glow\);/);
  assert.match(css, /--ad-chip: #f6fbff;/, "solid white");
  assert.match(css, /--ad-chip-ink: #0b0e11;/, "the word cut to the track's dark");
  assert.match(css, /--ad-chip-glow: 0 0 1px #ffffff, 0 0 6px rgba\(255, 255, 255, [\d.]+\)/, "glowing white");
  assert.ok(!/var\(--red\)|--glow-r|var\(--warn\)/.test(chip), "no red");
  assert.ok(!/\.adslot[,)]/.test(css), "no group rule gives it the red glow any more");
});
