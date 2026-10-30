// tests/v2-ticker-button.test.js — THE SIDE BUTTONS (owner, 28 Oct 2026: "make like a phyical comic button in the
// middle right on the page so i can open and close the ad ticker", then "also add a button in the same spot to
// switch from light to dark").
//
// Declared before measuring:
//   - mounted once, by the shell; at the middle of the page's right edge, fixed, over the page and under popups
//     (hidden while one is up);
//   - a press folds the ticker when it is open and opens it when it is folded, by the Design Console's own test
//     event and modes (lib/placements.js TICKER_TESTS) — so it is this page view only, and with nothing live the
//     ticker runs its labelled samples, never an invented ad;
//   - it follows the ticker itself (the AdStrip's `open` class), whoever moved it, and says which way it will go;
//   - comic and physical: an inked outline, a hard offset shadow it sinks into when pressed; colours through tokens;
//   - the theme's button, in the same stack: a press turns the page to the other theme and keeps it, exactly as
//     Settings pins one (data-theme on <html>, asilum-theme), and it follows the theme whoever turns it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TICKER_TESTS } from "../lib/placements.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const btn = read("app/components/SideButtons.jsx");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

test("mounted once, at the middle of the right edge, over the page and under popups", () => {
  assert.equal((read("app/shell.js").match(/<SideButtons \/>/g) || []).length, 1);
  // (going live, 29 Oct 2026: "hide them live") the test controls are never on the production deploy; previews and
  // local builds keep them
  assert.match(read("app/shell.js"), /\{testControls \? <SideButtons \/> : null/, "mounted only with the test controls");
  assert.match(read("app/shell.js"), /export default function Shell\(\{ children, testControls = true \}\)/);
  assert.match(read("app/layout.js"), /const TEST_CONTROLS = process\.env\.VERCEL_ENV !== "production";/, "off where Vercel names the deploy production");
  assert.match(read("app/layout.js"), /<Shell testControls=\{TEST_CONTROLS\}>\{children\}<\/Shell>/);
  assert.match(css, /\.sidebtns \{ position: fixed; right: 10px; top: 50%; z-index: 64; transform: translateY\(-50%\);/);
  assert.match(btn, /<div className="sidebtns">\s*<TickerButton \/>\s*<ThemeButton \/>\s*<\/div>/, "the ticker's and the theme's, stacked");
  assert.match(css, /\[data-popup\] \.sidebtns \{ opacity: 0; pointer-events: none; \}/, "out of the way of a popup");
});

test("a press folds an open ticker and opens a folded one, by the console's own test", () => {
  assert.deepEqual([...TICKER_TESTS], ["open", "fold"]);
  assert.match(btn, /const \[OPEN, FOLD\] = TICKER_TESTS;/);
  assert.match(btn, /const tickerOpen = \(\) => typeof document !== "undefined" && !!document\.querySelector\("\.adstrip\.open"\);/);
  assert.match(btn, /const next = tickerOpen\(\) \? FOLD : OPEN;\s*window\.dispatchEvent\(new CustomEvent\("asilum:ticker-test", \{ detail: \{ mode: next \} \}\)\);/);
  assert.match(read("app/components/AdStrip.jsx"), /window\.addEventListener\("asilum:ticker-test", on\);/, "the ticker listens for it");
  assert.ok(!/fetch\(|ticker:|label:/.test(btn), "it sends a test, never an entry of its own");
});

test("it follows the ticker, and says which way it will go", () => {
  assert.match(btn, /mo\.observe\(strip, \{ attributes: true, attributeFilter: \["class"\] \}\);/);
  assert.match(btn, /aria-pressed=\{open\}/);
  assert.match(btn, /aria-label=\{open \? "fold the ad ticker" : "open the ad ticker"\}/);
});

test("comic and physical, in tokens", () => {
  const face = css.match(/\n\.tickbtnface \{([^}]*)\}/)[1]; // the face's own rule, not a variant's
  assert.match(face, /border: 2\.5px solid var\(--comic-ink\);/, "inked");
  assert.match(face, /box-shadow: 0 6px 0 var\(--comic-ink\)/, "a hard offset shadow");
  assert.match(css, /\.tickbtn:active \.tickbtnface \{ transform: translateY\(5px\); box-shadow: 0 1px 0 var\(--comic-ink\)/, "it sinks into its shadow when pressed");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(btn), "no colour in the component");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css.match(/\.tickbtn[^{]*\{[^}]*\}/g).join("")), "the button's rules only name tokens");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.tickbtnface \{ transition: none; \} \}/);
});

test("the theme's button: the other theme, through the one turn Settings makes, following whoever turns it", () => {
  const theme = btn.slice(btn.indexOf("function ThemeButton"), btn.indexOf("export default function SideButtons"));
  assert.match(theme, /const next = theme === "dark" \? "light" : "dark";/);
  assert.match(theme, /applyTheme\(next\);/, "the shared turn (lib/theme.js)");
  assert.match(read("app/settings/page.js"), /function setThemeMode\(mode\) \{\s*setTheme\(mode\);\s*applyTheme\(mode\);\s*\}/, "the same turn Settings makes");
  const settings = read("app/settings/page.js"), at = settings.indexOf("function setThemeMode");
  const settingsTurn = settings.slice(at, settings.indexOf("\n  }\n", at));
  assert.ok(!/localStorage|dataset\.theme =/.test(theme + settingsTurn), "neither writes the theme itself any more");
  assert.match(theme, /mo\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \["data-theme"\] \}\);/);
  assert.match(theme, /aria-label=\{"switch to the " \+ next \+ " theme"\}/);
  assert.match(css, /\.themebtn \.tickbtnface \{ background-color: var\(--comic-ink\); color: var\(--comic-on\);/);
  assert.match(css, /\.themebtn\.dark \.tickbtnface \{ background-color: var\(--comic-on\); color: var\(--comic-ink\); \}/);
});

test("an owner's large-card size survives the first paint (the prepaint accepts what the console accepts)", () => {
  // the console's control is in svh (lib/uilab.js --ed-feed-large); the prepaint once dropped it
  assert.match(read("app/layout.js"), /\^\(none\|-\?\\\\d\+\(\\\\\.\\\\d\+\)\?\(px\|em\|s\|%\|svh\)\?\)\$/);
  assert.match(read("lib/uilab.js"), /const SAFE_VALUE = \/\^\(none\|-\?\\d\+\(\\\.\\d\+\)\?\(px\|em\|s\|%\|svh\)\?\)\$\/;/);
});
