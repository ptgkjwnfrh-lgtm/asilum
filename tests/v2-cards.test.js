// tests/v2-cards.test.js — THE FADED SQUARES (owner, 28 Oct 2026: "lets experiment with the cards. i kind
// of want them to be squares but instead of bezels it has faded edges" — square corners, every card of the
// Feed).
//
// Declared before measuring:
//   - every card in a Feed cell, the BRDCST stage and strip of a post with an event, and every carousel
//     card: no corner and no border (no bezel);
//   - every surface among them fades out on all four edges into the page — two gradient masks
//     intersected, transparent at the edge, full a --card-fade in — the carousel's housing excepted (it
//     has no surface; its cards fade one by one) and the AdSpace excepted (its dashed outline marks an
//     empty slot; it is only squared);
//   - the fade never reaches a visible word or icon — measured in the browser at 375 and 800 over the
//     Feed's cards — so no wider than the width that measured clean (10px, 2.5cqw); the owner can tune it live (Design Console --ed-card-fade, 0 a hard square);
//   - the rule is the Feed's alone: cards elsewhere keep the rounded floor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALL_CONTROLS } from "../lib/uilab.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel) => { const m = css.match(new RegExp("(^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}")); return m ? m[2] : ""; };

test("the Feed's cards are faded squares: no corner, no bezel, all four edges feathered into the page", () => {
  const square = rule(".fgrid .fcell > .card, .fgrid .fcell .card.wpostcard.p2.withevent .p2stage, .fgrid .fcell .card.wpostcard.p2.withevent .brdcst, .fgrid .f20card");
  assert.match(square, /border-radius: 0; border: 0;/, "square, and no bezel");
  const fade = rule(".fgrid .fcell > .card:not(.adspace):not(.f20post), .fgrid .f20card");
  const edge = "linear-gradient\\((90|180)deg, transparent, #000 var\\(--card-fade\\), #000 calc\\(100% - var\\(--card-fade\\)\\), transparent\\)";
  assert.match(fade, new RegExp("(^|\\s)mask-image: " + edge.replace("(90|180)", "90") + ", " + edge.replace("(90|180)", "180") + ";"), "both axes, transparent at every edge");
  assert.match(fade, new RegExp("-webkit-mask-image: " + edge.replace("(90|180)", "90") + ", " + edge.replace("(90|180)", "180") + ";"), "Safari too");
  assert.match(fade, /-webkit-mask-composite: source-in; mask-composite: intersect;/, "intersected: a corner fades both ways");
  // the width: measured in the browser (28 Oct 2026, 375 and 800, the Feed's 87 cards, every visible text
  // box and icon clipped to what shows): at clamp(6px, 3.5cqw, 14px) four cards had a word or an icon
  // 10–12px from an edge, inside the fade; at clamp(5px, 2.5cqw, 10px), none. Pinned so it cannot creep back
  const m = fade.match(/--card-fade: var\(--ed-card-fade, clamp\(([\d.]+)px, ([\d.]+)cqw, ([\d.]+)px\)\);/);
  assert.ok(m, "a fluid fade");
  const [lo, rel, hi] = m.slice(1).map(Number);
  assert.ok(hi <= 10 && rel <= 2.5 && lo <= hi && lo >= 3, "no wider than the measured safe width (10px, 2.5cqw): " + m[0]);
  // the exceptions: the carousel housing has no surface; the AdSpace keeps its dashed outline, squared
  assert.match(rule(".fgrid .fcell > .card.adspace"), /border-radius: 0; border: 1px dashed/);
  // the console knob
  const knob = ALL_CONTROLS.find((c) => c.key === "--ed-card-fade");
  assert.ok(knob && knob.min === 0 && knob.unit === "px", "0 is a hard square edge");
  assert.deepEqual(knob.selectors, [".fcell .card", ".f20card"]);
  // the Feed's alone: the rounded floor stays for cards elsewhere
  assert.match(css, /\.card, \.noticerow, [^{]*\{ border-radius: var\(--radius-card\); \}/);
});
