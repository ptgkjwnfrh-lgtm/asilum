// tests/theme-contrast.test.js — the interaction colour must stay readable.
//
// --sig paints every clickable word in the house (the grouped rule at the end
// of globals.css), so it is body text in practice, not decoration. The Aug-16
// launch audit measured it at 3.32:1 on the light background — under the 4.5:1
// AA needs, and the relaxed 3:1 large-text threshold never applied because card
// titles are 16px, below the 18.66px bold that "large" starts at.
//
// The token was darkened to #0b7584 (same hue and saturation, lower lightness).
// This test recomputes the ratio from globals.css itself, so a future palette
// edit that reintroduces the failure fails here rather than in someone's eyes.
//
// It checks the TOKENS, which is what a stylesheet can prove. It does not
// replace measuring the rendered page — that was done in the browser, across
// all 194 visible --sig elements in both themes, with transitions disabled.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

// Relative luminance, WCAG 2.x.
function luminance(hex) {
  const [r, g, b] = hex.replace("#", "").match(/../g)
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Pull a token out of a specific block: `:root` (dark) or `[data-theme="light"]`.
function token(block, name) {
  const start = css.indexOf(block);
  assert.notEqual(start, -1, `${block} block exists in globals.css`);
  const body = css.slice(start, css.indexOf("}", start));
  const m = body.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `${block} defines --${name} as a 6-digit hex`);
  return m[1];
}

const AA = 4.5;

test("the light theme's interaction colour is readable on its own background", () => {
  const sig = token('[data-theme="light"]', "sig");
  const bg = token('[data-theme="light"]', "bg");
  const paper = token('[data-theme="light"]', "paper");

  const onBg = contrast(sig, bg);
  const onPaper = contrast(sig, paper);

  assert.ok(onBg >= AA,
    `--sig ${sig} on --bg ${bg} is ${onBg.toFixed(2)}:1, needs ${AA} — it paints every clickable word`);
  assert.ok(onPaper >= AA,
    `--sig ${sig} on --paper ${paper} is ${onPaper.toFixed(2)}:1, needs ${AA}`);
});

test("the dark theme's interaction colour is readable too", () => {
  const sig = token(":root", "sig");
  const bg = token(":root", "bg");
  const onBg = contrast(sig, bg);
  assert.ok(onBg >= AA, `--sig ${sig} on --bg ${bg} is ${onBg.toFixed(2)}:1, needs ${AA}`);
});

test("body text passes in both themes", () => {
  // --ink is the workhorse; if it ever regresses the whole product goes with it.
  for (const block of [":root", '[data-theme="light"]']) {
    const ratio = contrast(token(block, "ink"), token(block, "bg"));
    assert.ok(ratio >= AA, `${block}: --ink on --bg is ${ratio.toFixed(2)}:1`);
  }
});

// NOTE — what is deliberately NOT asserted here.
// --red measures 3.92:1 on the light background and --p2 3.15:1. Both are real,
// both predate this change, and neither is the interaction voice: --red is the
// ALERT/IDENTITY accent and --p2 is used for graphic elements (strokes,
// gradients, one dock label). Repainting them is a separate design decision, and
// asserting a threshold they do not meet would just ship a red suite. They are
// recorded in the handover instead.
