// tests/v2-scrollwheel.test.js — THE WHEEL and THE POST CARDS (owner, 26 Oct
// 2026; the sketches 6.jpg and IMG_1166: "the disc scroll wheel has to be
// made of the same liquid glass as the fixtures. no added colors. also the
// disc scroll wheel should spawn when a carousel is on center of the feed.
// if the upload button is pressed then small cards of the upload options
// should appear. if the subtabs wanted to be selected the cards should [get]
// bigger because they'd be pop ups. it shouldn't bring anyone to another
// confusing tab. also don't change the look of the upload or the disc").
//
// Declared before measuring:
//   - the laws (lib/scrollwheel.js): angles clockwise from twelve, the short
//     way round; a step every 45°, clockwise on; a flick coasts with the
//     Disc's friction, rests under 6°/s, capped so a coast runs a few cards
//     at most; arrows step one, Home / End the ends; a carousel is centred
//     when its middle is within 22% of the screen's middle and half of it is
//     in view, the nearest wins; the POST ring's front item and its spin;
//   - spawning: the deck's data-wheel is open exactly while a centred Feed
//     carousel or the POST cards ask for it, never over a popup or search;
//     the swipe-up opener is gone; turning steps the centred carousel
//     (Figure 20 answers f20step) or, with the cards up, the ring;
//   - the cards: the plus brings up Post Selection's own six types (nothing
//     invented), the front card chosen grows (a growth class) and opens the
//     composer popup ("post") over the root; LISTING says it is not here
//     yet; nothing in the cards, Post Selection or the composer's
//     signed-out note navigates to another page;
//   - the material: the wheel is the fixtures' LiquidGlass (the same hook,
//     the fixture bezel, no shine) and the fixtures' glass recipe; no ink
//     ring, no accent, no rainbow on the wheel, the tray or the cards; the
//     marks are the stamped tone;
//   - the look: the plus (.ccdisc) and the dark disc (.ccspindle) keep their
//     drawing; reduced motion drops the travel.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as W from "../lib/scrollwheel.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const css = read("app/globals.css");
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel) => {
  const i = rules.indexOf("\n" + sel + " {");
  return i < 0 ? null : rules.slice(i, rules.indexOf("}", i) + 1);
};
const cc = read("app/components/ControlCenter.jsx");

test("the wheel's laws: angles, the short way round, a step every 45°, the coast and its cap, the keys", () => {
  assert.deepEqual([[0, -1], [1, 0], [0, 1], [-1, 0]].map(([x, y]) => Math.round(W.angleOf(x, y))), [0, 90, 180, 270], "clockwise from twelve");
  assert.equal(W.deltaDeg(350, 10), 20, "past twelve clockwise is +20, not -340");
  assert.equal(W.deltaDeg(10, 350), -20);
  assert.equal(W.STEP_DEG, 45);
  assert.equal(W.stepsFor(0, 44), 0);
  assert.equal(W.stepsFor(0, 46), 1, "a card on");
  assert.equal(W.stepsFor(0, 100), 2);
  assert.equal(W.stepsFor(10, -40), -1, "a card back");
  assert.equal(W.stepsFor(NaN, 90), 0);
  assert.ok(Math.abs(W.coast(600, 16) - 600 * W.FRICTION) < 1e-9, "a frame keeps FRICTION of the speed");
  assert.equal(W.coast(5, 16), 0, "under STOP it is at rest");
  assert.equal(W.flickSpeed(90, 1), W.MAX_DEG_PER_S, "a hair-apart sample is not a hurricane");
  assert.equal(W.flickSpeed(90, 100), 900);
  let v = W.MAX_DEG_PER_S, total = 0;
  while (v) { total += (v * 16) / 1000; v = W.coast(v, 16); }
  assert.ok(total / W.STEP_DEG <= 7, `the longest coast runs ${Math.round(total / W.STEP_DEG)} cards`);
  assert.deepEqual(["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End", "a"].map(W.keyStep), [1, 1, -1, -1, "first", "last", null]);
});

test("a carousel is centred: its middle near the screen's, half of it in view, the nearest wins", () => {
  const H = 800;
  assert.equal(W.centredIndex([], H), -1);
  assert.equal(W.centredIndex([{ top: 250, bottom: 550 }], H), 0, "dead centre");
  assert.equal(W.centredIndex([{ top: 0, bottom: 200 }], H), -1, "at the top: not centred");
  assert.equal(W.centredIndex([{ top: 400, bottom: 700 }], H), 0, "its middle 150 below: within 22% (176)");
  assert.equal(W.centredIndex([{ top: 500, bottom: 800 }], H), -1, "its middle 250 below: no");
  assert.equal(W.centredIndex([{ top: -500, bottom: 1300 }], H), -1, "less than half of it in view");
  assert.equal(W.centredIndex([{ top: 100, bottom: 420 }, { top: 300, bottom: 560 }], H), 1, "the nearer of two");
  assert.equal(W.ringItem(0, 6), 0);
  assert.equal(W.ringItem(7, 6), 1);
  assert.equal(W.ringItem(-1, 6), 5, "round the back");
  assert.equal(W.ringSpin(1, 6), -60, "the ring turns the next card to the front");
});

test("the wheel spawns over a centred carousel or the POST cards, and turns what it is over", () => {
  assert.match(cc, /const wheel = canWheel && \(cards \|\| \(!!centred && centred !== snoozed\)\);/, "a centred carousel or the cards");
  assert.match(cc, /const canWheel = !popupUp && !inSearch;/, "never over a popup or in search");
  assert.match(cc, /data-wheel=\{wheel \? "open" : undefined\}/);
  assert.match(cc, /const i = centredIndex\(stages\.map\(\(el\) => el\.getBoundingClientRect\(\)\), window\.innerHeight\);/, "the Feed's carousels, measured");
  assert.match(cc, /document\.querySelectorAll\("\.main \.f20stage"\)/, "Figure 20 is the Feed's carousel");
  assert.match(cc, /window\.addEventListener\("scroll", wake, \{ passive: true \}\);/, "looked for as the page scrolls");
  assert.match(cc, /if \(cards\) \{ setRing\(\(r\) => r \+ by\); return; \}\n\s*if \(centred\) centred\.dispatchEvent\(new CustomEvent\("f20step", \{ detail: \{ by \} \}\)\);/, "the cards' ring, else the centred carousel");
  const fig = read("app/components/Fig20.jsx");
  assert.match(fig, /stage\.addEventListener\("f20step", step\);/, "Figure 20 answers the wheel");
  assert.match(fig, /else if \(Number\.isFinite\(d\.by\)\) go\(Math\.round\(s\.target\) \+ d\.by\);/);
  assert.match(cc, /useEscape\(\(\) => putAway\(true\), wheel\);/, "Escape puts it away");
  // one press, one put-away: the wheel handled Escape too, React re-rendered between the two handlers,
  // and the second saw the cards already gone — one Escape closed the cards AND snoozed the carousel
  assert.ok(!/"Escape"/.test(strip(read("app/components/ScrollWheel.jsx"))), "Escape is the deck's alone, never handled twice");
  assert.match(cc, /if \(cards\) setCards\(false\);\n\s*else if \(centred\) setSnoozed\(centred\);/, "from a carousel, until another is centred");
  assert.ok(!/isEject|holdMove|onPointerMove=\{holdMove\}|postKey/.test(cc), "the swipe-up opener is gone");
  const sw = read("app/components/ScrollWheel.jsx");
  assert.match(sw, /const steps = stepsFor\(before, s\.angle\);\n\s*if \(steps\) \{ haptic\("tick"\); onStep\(steps\); \}/, "a step and a tick every 45°");
  assert.ok(!/scrollBy|scrollTo/.test(sw), "it turns a carousel, it does not scroll the page");
  assert.match(sw, /const still = window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches;\n\s*if \(still \|\|/, "reduced motion: no coast");
});

test("the plus brings up the POST cards: Post Selection's own types, the front card grows into its popup, nothing navigates", () => {
  assert.match(cc, /if \(popupUp\) \{ haptic\("press"\); toggleHub\(\); return; \}/, "over a popup the plus is still the session hub");
  assert.match(cc, /setCards\(\(c\) => !c\);/, "the plus brings the cards up and takes them down");
  assert.match(cc, /data-cards=\{cards && canWheel \? "open" : undefined\}/);
  assert.match(cc, /function chooseCard\(t\) \{\n\s*setCards\(false\);\n\s*openSheet\("post", \{ kind: t\.id, title: t\.label \}\);/, "a card opens its popup, the composer, over the root");
  const pc = read("app/components/PostCards.jsx");
  assert.match(pc, /import \{ POST_TYPES, POST_SOON \} from "\.\/PostSelection\.jsx";/, "the six types of Post Selection, nothing invented");
  assert.match(pc, /setGrow\(i\);[\s\S]*setTimeout\(\(\) => \{ setGrow\(null\); onChoose\(t\); \}, still \? 0 : GROW_MS\);/, "the front card grows, then its popup opens");
  assert.match(pc, /if \(POST_SOON\[t\.id\]\) \{ setSoon\(t\.id\); haptic\("error"\); return; \}/, "LISTING says it is not here yet");
  assert.match(rule(".pccard.grow"), /scale\(2\.6\); opacity: 0;/, "growing toward the popup");
  // nothing navigates: no link, no router, no location change in the cards, Post Selection, or the composer's signed-out note
  for (const f of ["app/components/PostCards.jsx", "app/components/PostSelection.jsx"]) {
    assert.ok(!/href=|router\.|window\.location|location\.assign|<Link\b/.test(read(f)), f + " navigates nowhere");
  }
  const composer = read("app/components/PostComposer.jsx");
  assert.ok(!/href="\/board"/.test(composer), "the composer's signed-out note no longer sends anyone to the account page");
  assert.match(composer, /new CustomEvent\("asilum:signup-open", \{ detail: \{ mode: "signin" \} \}\)/, "it opens sign-in over the popup");
  assert.match(read("app/components/SheetHost.jsx"), /post: \{/, "the composer is a popup view");
});

test("the material and the look: the fixtures' glass, no added colour, the plus as it was", () => {
  const sw = read("app/components/ScrollWheel.jsx");
  assert.match(sw, /useLiquidGlass\(ref, \{ id: "lg-wheel", strength: 1, bezel: "fixture", shine: false, active: open \}\)/, "the fixtures' LiquidGlass");
  const glass = rules.match(/\.cctray, \.ccwheel \{([^}]*)\}/)[1];
  assert.match(glass, /background: linear-gradient\(var\(--fx-tint\), var\(--fx-tint\)\), var\(--fx-glass\);/, "the fixtures' pane");
  assert.match(glass, /backdrop-filter: saturate\(160%\);/);
  assert.match(rules, /\.ccwheel\[data-refract="1"\] \{[^}]*var\(--lg-filter\) saturate\(160%\)/, "the fixtures' bend");
  for (const sel of [".ccwheel", ".ccwring", ".ccwtick", ".cctray", ".pcring", ".pccard"]) {
    const r = rule(sel) || "";
    assert.ok(!/var\(--(red|warn|sig|iris-\d)\)|conic-gradient|--holo|#[0-9a-f]{3,6}\b/i.test(r), sel + " adds no colour");
  }
  assert.ok(!/border: [\d.]+px solid/.test(rule(".ccwheel")), "no ink ring");
  assert.match(rule(".ccwtick"), /background: var\(--stamp-recess\);/, "the marks pressed in, in the glass's tone");
  // the plus and the dark disc keep their drawing: nothing here restyles .ccdisc, and the dark disc is as built
  const block = rules.slice(rules.indexOf(".ccpostwrap {\n  --disc"), rules.indexOf(".pcsoon"));
  const plusRules = [...block.matchAll(/([^{}]*\.ccdisc[^{}]*)\{([^}]*)\}/g)];
  assert.ok(plusRules.length > 0, "the wheel's rules touch the plus only to let it be pressed and focused");
  for (const m of plusRules) {
    const props = m[2].split(";").map((d) => d.split(":")[0].trim()).filter(Boolean);
    assert.ok(props.every((p) => /^(pointer-events|outline|outline-offset)$/.test(p)), "the plus is not redrawn: " + m[1].trim() + " sets " + props.join(", "));
  }
  // (27 Oct 2026) the dark disc became the Clear Disc, drawn over it on <body> (tests/v2-fixtures-sketch.test.js)
  assert.match(rule(".ccspindle"), /border-radius: 50%; background: transparent;/, "the disc under the Clear Disc is still the button, undrawn");
  assert.match(rules, /prefers-reduced-motion: reduce\) \{\n\s*\.ccenter \.ccpostwrap \.tabl\.ccpost, \.cctray, \.ccspindle, \.ccwheel, \.pcring, \.pcring3d, \.pccard,/, "reduced motion: no travel");
});
