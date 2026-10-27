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
//   - the material: the wheel's pane is the shared LiquidGlass hook and the
//     fixtures' glass recipe, carrying the V.1 rainbow (27 Oct 2026; pinned
//     in tests/v2-fixtures-sketch.test.js); no ink ring, no accent, no
//     painted colour on the wheel, the tray or the cards; the marks are the
//     stamped tone;
//   - the look: the plus (.ccdisc) keeps its drawing; the slot (.ccspindle)
//     is left an empty space (27 Oct); reduced motion drops the travel.

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
  // (27 Oct 2026) a card changes half-way between two detents, so a detent is the middle of a card's turn
  assert.equal(W.stepsFor(0, 22), 0, "short of half-way, the same card");
  assert.equal(W.stepsFor(0, 23), 1, "a card on, past half-way");
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

// THE MAGNET (owner, 27 Oct 2026: "a subtle magnetic snapping attached to the cards and the disc").
// Declared before measuring: let go anywhere, the wheel comes to rest exactly on a detent (a multiple of
// STEP_DEG); let go slowly, it settles onto the NEAREST detent without changing card (no step); flicked, it
// coasts and still rests on a detent, the steps it fired adding up to the detents it turned (each card once,
// never back and forth); the pull is the Disc's own (lib/disc.js tuning, SLOW_DEG_PER_S), and it settles
// within a third of a second from half a step off.
test("the magnet: let go, the wheel comes to rest on the detent of the card in front, with the Disc's pull", async () => {
  const D = await import("../lib/disc.js");
  const sw = read("lib/scrollwheel.js");
  assert.match(sw, /import \{ tuning, SLOW_DEG_PER_S \} from "\.\/disc\.js";/, "the Disc's physics, not a second rotary's");
  assert.equal(W.DETENTS, 8);
  assert.equal(W.restAngle(30), 45);
  assert.equal(W.restAngle(-23), -45);
  const run = (state, dt = 16, cap = 2000) => {
    let s = { ...state }, steps = 0, frames = 0;
    for (; frames < cap; frames++) {
      const n = W.magnetStep(s, dt);
      steps += W.stepsFor(s.angle, n.angle);
      s = n;
      if (n.settled) break;
    }
    return { ...s, steps, frames };
  };
  for (const a of [5, 20, 30, 44, -10, 400]) {
    const r = run({ angle: a, velocity: 0 });
    assert.ok(r.settled && r.angle === W.restAngle(a), `let go at ${a}: rests on ${W.restAngle(a)}, got ${r.angle}`);
    assert.equal(r.steps, 0, `let go at ${a}: no card changes while it settles`);
  }
  assert.ok(run({ angle: 22, velocity: 0 }).frames * 16 <= 333, "half a step off settles within a third of a second");
  for (const v of [300, 900, -700, W.MAX_DEG_PER_S]) {
    const r = run({ angle: 10, velocity: v });
    assert.ok(r.settled && r.angle % W.STEP_DEG === 0, `flicked at ${v}: rests on a detent (${r.angle})`);
    assert.equal(r.steps, Math.round(r.angle / W.STEP_DEG) - Math.round(10 / W.STEP_DEG), "each card stepped once, net");
  }
  // the pull is the Disc's: at its slow threshold it is nothing, at rest it is the Disc's snap for eight items
  const atRest = W.magnetStep({ angle: 30, velocity: 0 }, 16);
  assert.ok(Math.abs((atRest.angle - 30) / (45 - 30) - D.tuning(8).snap) < 1e-9, "the Disc's snap strength");
  const fast = W.magnetStep({ angle: 30, velocity: D.SLOW_DEG_PER_S * 2 }, 16);
  assert.ok(Math.abs(fast.angle - (30 + (D.SLOW_DEG_PER_S * 2 * 16) / 1000)) < 1e-9, "fast, it spins free");
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
  assert.match(sw, /settle\(flick \? d\.v : 0, still\);/, "every release ends on a detent, a flick coasting first");
  assert.match(sw, /if \(still\) \{ turn\(restAngle\(s\.angle\) - s\.angle\); return; \}/, "reduced motion: straight onto the detent, no coast");
  assert.match(sw, /const next = magnetStep\(\{ angle: s\.angle, velocity: s\.v \}, dt\);/, "the magnet's law drives the release");
  assert.match(sw, /turn\(restAngle\(state\.current\.angle\) \+ k \* STEP_DEG - state\.current\.angle\);/, "a key goes detent to detent");
});

test("the plus brings up the POST cards: Post Selection's own types, the front card grows into its popup, nothing navigates", () => {
  assert.match(cc, /if \(popupUp\) \{ closeSheet\(\); setCards\(true\); return; \}/, "over a popup the plus closes it and brings up the cards (the session hub is gone, 27 Oct 2026)");
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

test("the material and the look: the fixtures' glass, no painted colour, the plus as it was, the slot empty", () => {
  const sw = read("app/components/ScrollWheel.jsx");
  assert.match(sw, /useLiquidGlass\(glassRef, \{ id: "lg-wheel", strength: 1, shine: false, active: open && !!host, bend: WHEEL_BEND, dispersion: V1_RAINBOW \}\)/, "the shared LiquidGlass, with the V.1 rainbow");
  const glass = rules.match(/\.cctray, \.ccwglass \{([^}]*)\}/)[1];
  assert.match(glass, /background: linear-gradient\(var\(--fx-tint\), var\(--fx-tint\)\), var\(--fx-glass\);/, "the fixtures' pane");
  assert.match(glass, /backdrop-filter: saturate\(160%\);/);
  assert.match(rules, /\.ccwglass\[data-refract="1"\] \{[^}]*var\(--lg-filter\) saturate\(160%\)/, "the pane bends through its own filter");
  for (const sel of [".ccwheel", ".ccwring", ".ccwtick", ".cctray", ".pcring", ".pccard"]) {
    const r = rule(sel) || "";
    assert.ok(!/var\(--(red|warn|sig|iris-\d)\)|conic-gradient|--holo|#[0-9a-f]{3,6}\b/i.test(r), sel + " adds no colour");
  }
  assert.ok(!/border: [\d.]+px solid/.test(rule(".ccwheel")), "no ink ring");
  assert.match(rule(".ccwtick"), /background: var\(--stamp-recess\);/, "the marks pressed in, in the glass's tone");
  // the plus keeps its drawing: nothing here restyles .ccdisc
  const block = rules.slice(rules.indexOf(".ccpostwrap {\n  --disc"), rules.indexOf(".pcsoon"));
  const plusRules = [...block.matchAll(/([^{}]*\.ccdisc[^{}]*)\{([^}]*)\}/g)];
  assert.ok(plusRules.length > 0, "the wheel's rules touch the plus only to let it be pressed and focused");
  for (const m of plusRules) {
    const props = m[2].split(";").map((d) => d.split(":")[0].trim()).filter(Boolean);
    assert.ok(props.every((p) => /^(pointer-events|outline|outline-offset)$/.test(p)), "the plus is not redrawn: " + m[1].trim() + " sets " + props.join(", "));
  }
  // (27 Oct 2026) the slot "is simply meant to look like an empty space": no fill, no CD, nothing drawn on it
  assert.match(rule(".ccspindle"), /border-radius: 50%; background: transparent;/, "the slot left empty");
  assert.ok(!/\.ccspindle(::before|::after|\[)/.test(rules) && !/cdlens|ClearDisc/.test(rules + read("app/components/ControlCenter.jsx")), "nothing drawn on it, no CD");
  assert.match(rules, /prefers-reduced-motion: reduce\) \{\n\s*\.ccenter \.ccpostwrap \.tabl\.ccpost, \.cctray, \.ccspindle, \.ccwheel, \.pcring, \.pcring3d, \.pccard,/, "reduced motion: no travel");
});
