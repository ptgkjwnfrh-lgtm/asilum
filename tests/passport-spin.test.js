// tests/passport-spin.test.js — THE PASSPORT, LIFTED AND SPUN (owner, 3 Nov
// 2026: "I want a user to click on their passport and have it isolate it in
// space and spin it"). Held here:
//   * a tap on the document on /board lifts it — never a tap on a key, a
//     field, the photo slot or the signature pad — and a quiet key does the
//     same for the keyboard;
//   * the lifted card is the page the board prints, read-only, over the fog
//     of the floating piece, with the back on the same box;
//   * the turn: the front held, a slow spin winding into one fast full turn,
//     settling onto the back, where the asterisk blinks red three times and
//     holds one glow, then round to the front — and no more than three
//     flashes in any second;
//   * the back is black in dark and the feed's ground in light, the asterisk
//     and the word in the logo's white; red only on the blink;
//   * Escape, the fog, × put it back; focus is kept inside and given back;
//     reduced motion lifts the card and holds it still;
//   * no literal colour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEGMENTS, turnAt } from "../lib/passport/turn.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const board = strip(read("app/board/page.js"));
const spin = strip(read("app/components/PassportSpin.jsx"));

test("a tap on the document lifts it; a tap on a control does not; the keyboard has a key", () => {
  assert.match(board, /<div className="ppdoc lg" ref=\{ppRef\} aria-label="passport document — Enter lifts it to spin" lang="en" tabIndex=\{0\} onClick=\{liftPassport\} onKeyDown=\{liftByKey\}>/, "the page itself is the trigger, by pointer and by key");
  assert.match(board, /function liftByKey\(e\) \{\s*if \(e\.target !== e\.currentTarget\) return;\s*if \(e\.key === "Enter" \|\| e\.key === " "\) \{ e\.preventDefault\(\); setSpin\(true\); \}/, "Enter or Space on the page itself; a key in a field is the field's");
  assert.match(board, /function liftPassport\(e\) \{\s*if \(e\.target\.closest\("button, input, label, a, textarea, \.ppsigpad"\)\) return;\s*setSpin\(true\);/, "a key, a field, the photo slot and the signature pad keep their own taps");
  assert.match(board, /<button className="txtbtn ppspinkey" onClick=\{\(\) => setSpin\(true\)\}>LIFT &amp; SPIN →<\/button>/, "the quiet key, for the keyboard");
  assert.match(board, /\{spin && !shared && <PassportSpin uid=\{uid\} info=\{pinfo\} taste=\{taste\} lang=\{lang\} mrz=\{mrz\} photo=\{ppPhoto\} map=\{docMap\} onClose=\{\(\) => setSpin\(false\)\} \/>\}/, "the lifted card is handed the same page the board prints");
  assert.match(css, /\n\.ppdoc\.lg \{ cursor: zoom-in; \}/, "the page says it lifts");
});

test("the lifted card: the page read-only in front, the back on the same box, the fog behind, put back from anywhere", () => {
  assert.match(spin, /<PassportDocument uid=\{uid\} info=\{info\} taste=\{taste\} lang=\{lang\} mrz=\{mrz\} photo=\{photo\} \/>/, "read-only: no editable, no onPhoto, no onWrite");
  assert.match(spin, /<PassportSecurity map=\{map\} \/>/, "the map under it, as on the board");
  assert.match(spin, /<div className="ppspinface ppspinback" aria-hidden="true">\s*<span className="ppspinast" ref=\{astRef\}>\*<\/span>\s*<span className="ppspinword">ASILUM TASTE PASSPORT<\/span>\s*<\/div>/, "the back: the asterisk over the one line, and nothing else");
  assert.match(spin, /role="dialog" aria-modal="true"/);
  assert.match(spin, /useEscape\(onClose, true\);\s*useFocusTrap\(layerRef, true\);/, "Escape closes; focus kept inside and given back");
  assert.match(spin, /className="ppspinfog" aria-label="back to the page" tabIndex=\{-1\} onClick=\{onClose\}/, "the fog puts it back");
  assert.match(spin, /className="floatclose ppspinclose" aria-label="back to the page" onClick=\{onClose\}/, "× puts it back");
  assert.match(spin, /document\.body\.style\.overflow = "hidden";/, "the page behind does not scroll");
  assert.match(css, /\n\.ppspin \{ position: fixed; inset: 0; z-index: 90;/, "over the page, at the floating piece's height");
  assert.match(css, /\n\.ppspinfog \{[^}]*background: var\(--fog\);[^}]*backdrop-filter: blur\(9px\) saturate\(120%\); \}/, "the floating piece's fog");
  assert.match(css, /\n\.ppspincard \{[^}]*aspect-ratio: 100 \/ 148\.2; transform-style: preserve-3d;/, "the card the page's own shape, in 3D");
  assert.match(css, /\n\.ppspinface \{[^}]*backface-visibility: hidden;/, "each face hides when it turns away");
});

test("the turn: hold, slow, one fast turn, settle on the back, blink and glow, return — and the blink is safe", () => {
  assert.deepEqual(SEGMENTS.map(([n]) => n), ["hold", "slow", "fast", "settle", "back", "return"]);
  assert.equal(turnAt(0).angle, 0, "held at the front");
  assert.equal(turnAt(1.0).angle, 0);
  const slowEnd = turnAt(3.0).angle; assert.ok(slowEnd > 99 && slowEnd <= 100, "the slow spin winds to 100°");
  assert.ok(turnAt(3.75).angle >= 459.9, "one full turn more in the fast part");
  assert.equal(Math.round(turnAt(5.15).angle), 540, "settled on the back (180° mod 360)");
  const back = (u) => turnAt(5.15 + u);
  assert.equal(back(0.1).red, false); assert.equal(back(0.4).red, true); assert.equal(back(0.55).red, false); assert.equal(back(0.7).red, true); assert.equal(back(1.0).red, true); assert.equal(back(1.2).red, false);
  // no more than three flashes in any one-second window (WCAG 2.3.1): count the red onsets
  let onsets = []; let was = false;
  for (let u = 0; u <= 2.8; u += 0.01) { const r = back(u).red; if (r && !was) onsets.push(u); was = r; }
  assert.equal(onsets.length, 3, "three flashes");
  assert.ok(onsets[2] - onsets[0] <= 1.0 ? onsets.length <= 3 : true);
  assert.ok(back(1.95).glow > 0.99, "the held glow swells once");
  assert.equal(back(2.7).glow, 0);
  assert.equal(turnAt(5.15 + 2.8 + 1.8).angle, 720, "back round to the front");
  assert.equal(turnAt(99).angle, 720, "and rests there");
});

test("the back: black in dark, the feed's ground in light; the logo's white; red only on the blink; no literal colour", () => {
  assert.match(css, /\n\.ppspinback \{[^}]*background: var\(--bg\); color: var\(--wm-bar\);/, "black in dark (--bg is #030505 there), the logo's white");
  assert.match(css, /\n\[data-theme="light"\] \.ppspinback \{ background: linear-gradient\(180deg, color-mix\(in srgb, var\(--ink\) 18%, var\(--bg\)\),/, "the feed's grey-blue in light: the ink into the ground, never the page's red tint");
  assert.match(css, /\n\.ppspinast \{[^}]*font-family: var\(--helv\); font-weight: 700;[^}]*color: transparent; -webkit-text-stroke: 0\.6cqw var\(--wm-bar\);/, "an outline, Helvetica's asterisk, in the logo's white");
  assert.match(css, /\n\.ppspinast\.red \{ -webkit-text-stroke-color: var\(--warn\);/, "red on the blink, the house red");
  assert.match(css, /\n\.ppspinword \{ font-family: var\(--mich\);[^}]*letter-spacing: -0\.06em; -webkit-text-stroke: 0\.02em currentColor;/, "the word in the logo's set");
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(spin), "PassportSpin.jsx carries a literal colour");
});

test("reduced motion: the card lifts and holds still; the hand still turns it", () => {
  assert.match(spin, /const reduced = \(\) => [^\n]*prefers-reduced-motion: reduce/);
  assert.match(spin, /import \{ TURN, turnAt \} from "\.\.\/\.\.\/lib\/passport\/turn\.js";/, "one clock for the stage and the tests");
  assert.match(spin, /const turn = still \? \{ angle: 0, red: false, glow: 0 \} : turnAt\(t\);/, "no turn, no blink");
  assert.match(spin, /const sway = still \|\| t < TURN \? 0 : /, "no sway");
  assert.match(spin, /card\.addEventListener\("pointerdown", down\)/, "the drag stays");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.ppspin, \.ppspinstage \{ animation: none; \} \}/);
});
