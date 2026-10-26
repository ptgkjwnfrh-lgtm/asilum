// tests/v2-fixtures-sketch.test.js — THE FIXTURES AS DRAWN (the owner's
// fixture sketch, 19 Oct 2026, Figures 1, 1.2, 3 and 5). The deck's cuts
// sit exactly on the seams of its columns, the top fixtures line up with
// the deck's right edge, and the search key morphs the deck instead of
// opening the popup. (The tab indicator light is gone, 26 Oct 2026.) Source reads
// where the markup is the law (a .jsx cannot be imported here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync, readdirSync, statSync } from "node:fs";
const require_fs = () => ({ readdirSync, statSync });
import { PATTERNS } from "../lib/haptics.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const rules = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
const deck = read("app/components/ControlCenter.jsx");
const fr = (sel) => {
  const m = rules.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{[^}]*grid-template-columns: ([^;]+);"));
  assert.ok(m, sel + " has a column template");
  return m[1].trim().split(/\s+/).map((v) => parseFloat(v));
};

test("the deck is the sketch's 745 × 175, stretched 1.1 sideways, and every cut sits on a seam between its columns", () => {
  // (owner, 26 Oct 2026: "let's also widen the central control fixture") the drawn 745, stretched by --dk-sx
  assert.match(rules, /--dk-sx: 1\.1;\s*--dk-w: calc\(var\(--u\) \* 745 \* var\(--dk-sx\)\);/);
  assert.match(rules, /\.cccut \{[^}]*left: calc\(var\(--u\) \* var\(--cut-x\) \* var\(--dk-sx\)\);/, "the cuts stretch with it");
  assert.match(rules, /--dk-h: calc\(var\(--u\) \* 175\);/);
  const outer = fr(".ccrow");
  const keys = fr(".cctabs");
  assert.deepEqual(outer, [40, 665, 40], "two end caps of 40 around the keys");
  assert.equal(keys.reduce((a, b) => a + b, 0), 665, "the five keys fill the middle");
  assert.equal(outer[0] + outer[1] + outer[2], 745, "the deck is 745 wide");
  const seams = [outer[0]];
  for (const k of keys) seams.push(seams[seams.length - 1] + k);
  const cuts = JSON.parse(deck.match(/const CUTS = (\[[^\]]+\]);/)[1]);
  assert.deepEqual(cuts, seams, "a cut on every seam: after the left cap, between each key, before the right cap");
  assert.ok(keys[2] > Math.max(keys[0], keys[1], keys[3], keys[4]), "the POST cell is the widest (the disc)");
});

test("the carvings are carved into the glass: cuts, the disc's ring and the grill bend the backdrop", () => {
  assert.match(deck, /className="cccut"[^>]*data-lens-shape="cut"/);
  assert.match(deck, /className="ccdisc" data-lens-shape="ring"/);
  assert.match(deck, /className="ccgrill" data-lens-shape="slot"/);
  assert.match(read("app/components/InfoDock.jsx"), /className="cccut idcut" data-lens-shape="cut"/, "the Info Dock is cut between its keys");
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /export function lensFeatures\(el\)/);
  assert.match(glass, /drawRefractionMap\(mapRef\.current,[^\n]*, lensFeatures\(el\), bezel === "fixture" \? fixtureBezel\(\) : bezel, xRef\.current, yRef\.current\);/, "the map is drawn with the carvings, as two greys");
  // the grill sits centred under the POST disc: 40 + 123 + 127 + 162 / 2 = 371, stretched with the deck
  const g = rules.match(/\.ccgrill \{[^}]*left: calc\(var\(--u\) \* \(371 \* var\(--dk-sx\) - ([\d.]+)\)\); width: calc\(var\(--u\) \* ([\d.]+)\)/s);
  assert.ok(g, "the grill is placed in sketch units");
  assert.equal(Number(g[1]) * 2, Number(g[2]), "the grill is centred on the disc");
  // (25 Oct 2026, last) the ad ticker is back on the deck as a bubble, beneath the keys and above the vent
  assert.match(deck, /<div className="ccad"><AdStrip typing=\{inSearch\} \/><\/div>/, "the ad bubble on the deck");
  assert.ok(deck.indexOf('className="ccad"') > deck.indexOf('className="ccrow"'), "the bubble comes after the row of keys");
  const ad = rules.match(/\.ccad \{[^}]*padding: 0 calc\(var\(--u\) \* 40 \* var\(--dk-sx\)\) calc\(var\(--u\) \* (\d+)\)/);
  const gr = rules.match(/\.ccgrill \{[^}]*bottom: calc\(var\(--u\) \* (\d+)\); height: max\(4px, calc\(var\(--u\) \* (\d+)\)\)/s);
  assert.ok(ad && gr, "the bubble and the grill are placed in sketch units");
  assert.ok(Number(ad[1]) > Number(gr[1]) + Number(gr[2]), "the bubble ends above the grill's top lip");
  assert.ok(!/<AdStrip/.test(read("app/page.js")), "and off the Feed's head");
});

test("the top fixtures sit at the top right, the Passport's right edge in line with the deck's, 8 apart (shrunk from the drawn 18)", () => {
  assert.match(rules, /\.passportbtn \{[^}]*right: var\(--dk-edge\); width: calc\(var\(--u\) \* 82\);/s);
  const off = Number(rules.match(/\.infodock \{ right: calc\(var\(--dk-edge\) \+ var\(--u\) \* (\d+)\); \}/)[1]);
  assert.equal(off, 82 + 8, "the Info Dock ends 8 short of the Passport (owner, 19 Oct: the gap shrunk)");
  assert.match(rules, /\.idkey \{[^}]*width: calc\(var\(--u\) \* 97\);/s, "three keys of the drawn 292");
  assert.ok(!/\.infodock \{[^}]*left:/s.test(rules.split(".infodock {")[1].split("}")[0]), "not the top left any more");
});

test("the indicator light is gone, the plus is smaller, the fixtures' buttons are softer (owner, 26 Oct 2026)", () => {
  // declared before checking: "for the central control let's take away the indicator light … the plus in
  // the upload button, let's shrink it slightly … all the buttons on the fixtures, thin them ever so
  // slightly and dim the white brightness and lower the buttons' opacity slightly"
  assert.ok(!existsSync(new URL("../app/components/TabIndicator.jsx", import.meta.url)), "the light's component is deleted");
  assert.ok(!existsSync(new URL("../lib/indicator.js", import.meta.url)), "and its timing");
  assert.ok(!/TabIndicator|indicatorHeld|blinkIndicator|tabind/.test(deck + read("app/components/InfoDock.jsx")), "nothing draws or blinks it");
  assert.ok(!/\.tabind/.test(rules), "no rules left for it");
  assert.ok(!("blink" in PATTERNS) && !("blink2" in PATTERNS), "its vibrations are gone");
  assert.match(deck, /function keyTap\(e\) \{[\s\S]*?haptic\("tick"\);/, "a fixture key still answers with one subtle tick");
  assert.match(rules, /\.ccenter \.tabl\.ccpost \.ccdisc \.ic \{ width: 54%; height: 54%;/, "the plus at 54% of the disc (was 62%)");
  assert.match(rules, /:is\(\.ccenter \.tabl, \.ccenter \.mailbtn, \.idkey, \.passportbtn\) \.ic g \{ stroke-width: 1; \}/, "a thinner stroke (the shared 1.15)");
  assert.match(rules, /:is\(\.ccenter \.tabl, \.ccenter \.mailbtn, \.idkey, \.passportbtn\) \.ic \{ opacity: 0\.88; \}/, "a little lower opacity");
  assert.match(rules, /\.passportbtn:not\(\.cur\)\) \.ic \{ color: color-mix\(in srgb, var\(--ink\) 86%, var\(--bg\)\); \}/, "the white dimmed toward the ground, a current key keeps its red");
});

test("search morphs the deck upward; the popup waits for the first character; one field on screen", () => {
  const press = deck.slice(deck.indexOf("function press(id)"), deck.indexOf('if (id === "post")'));
  assert.ok(!/openSheet\("search"\)/.test(press), "the search key does not open the popup");
  assert.match(deck, /if \(scope\.id === "global" && v\.trim\(\) && !searchPopupUp\) openSheet\("search"\);/, "typing opens it");
  assert.match(rules, /\.ccenter\.ccsearching \{ height: calc\(var\(--dk-h\) \+ var\(--ad-h\) \+ var\(--dk-rise\)\); \}/, "the deck extends upward");
  assert.match(rules, /--ad-h: calc\(var\(--u\) \* 64\);/, "the deck is taller by the ad bubble");
  assert.match(rules, /prefers-reduced-motion: reduce\) \{ \.ccenter \{ transition: none; \} \.ccsearch \{ animation: none; \} \}/);
  assert.match(read("app/components/SearchSheet.jsx"), /\{dock\.mode !== "search" \? \(\n\s*<label className="srchfield">/, "the popup hides its own field while the deck's bar is up");
  assert.match(read("app/components/SheetHost.jsx"), /useFocusTrap\(ref, open, \{ companion: "\.ccsearch" \}\)/, "the popup does not steal the caret");
});

test("the September recipe on the fixtures: full pull split 80/86/92, the Safari page bend, the lamps and the meniscus", () => {
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /export const PULL = \[80, 86, 92\];/);
  assert.match(glass, /export const BEZEL = 56;/);
  assert.match(glass, /const GLASS_N = 1\.5;/);
  assert.match(glass, /const bez = Math\.max\(6, Math\.min\(BEZEL, Math\.min\(w, h\) \/ 2, bezel \? \(bezel < 1 \? Math\.min\(w, h\) \* bezel : bezel\) : Infinity\)\);/, "56px at most, never past the middle, and as thin as the pane asks (a fraction, or px)");
  for (const [f, id] of [["app/components/InfoDock.jsx", "lg-infodock"], ["app/components/PassportButton.jsx", "lg-passportbtn"], ["app/components/ControlCenter.jsx", "lg-deck"]]) {
    const src = read(f);
    assert.match(src, new RegExp(`useLiquidGlass\\(glassRef, \\{ id: "${id}", strength: 1, bend: FIXTURE_BEND`), f + " runs the header's full strength, no extra prism, and bends the page on WebKit");
    assert.match(src, /useGlassLamps\(glassRef/, f + " carries the lamp under the water");
    assert.match(src, /shine: false/, f + " does not answer the pointer");
  }
  // (19 Oct, fourth pass) no surface hover reactions: no dome, no hovered lamp, no pointer shine, no hover fills
  assert.ok(!/DOME|ripple|pointerover/.test(glass.slice(glass.indexOf("export function useGlassLamps"))), "the lamp hook does not listen to the pointer");
  assert.match(glass, /if \(!still && shine\) \{/, "the pane's pointer shine can be turned off");
  assert.match(rules, /\.ccenter::before \{ background: var\(--glass-sheen\); \}/, "the gloss only");
  assert.ok(!/--fx-sheen-half:[^;]*var\(--g[xy]/s.test(rules), "the top fixtures' gloss does not follow the pointer either");
  assert.ok(!/(\.ccenter \.tabl|\.idkey|\.passportbtn|\.ccenter \.mailbtn|\.ccclose):hover/.test(rules), "no hover fills on the fixtures' keys");
  // the glow spread cut by 45% (owner, 19 Oct): the lamp, the glyphs, the disc, the indicator
  assert.match(rules, /\.glass-light \{[^}]*filter: blur\(7\.7px\);[^}]*radial-gradient\(77px 29px/s, "the lamp at 55% of September's 14px blur and 140 × 52 halo");
  assert.match(rules, /drop-shadow\(0 0 2\.75px color-mix/, "the glyph glow at 55% of 5px");
  assert.match(rules, /0 0 3\.85px color-mix\(in srgb, currentColor 35%/, "the disc's glow at 55% of 7px");
  // the press shades a whisper, and the fixtures are 10% more opaque
  assert.match(rules, /color-mix\(in srgb, var\(--shade\) 7%, transparent\)\);\n  box-shadow: inset 0 -1px 0 color-mix\(in srgb, var\(--shade\) 10%, transparent\);/);
  assert.match(rules, /--fx-tint: rgba\(0, 0, 0, 0\.275\);/, "27.5% black in dark");
  assert.match(rules, /--fx-tint: rgba\(255, 255, 255, 0\.275\);/, "27.5% white in light");
  // one glow for every key (the dock's, the globe's, the deck's), its strength cut 25%: 45% -> 33.75%
  assert.match(rules, /drop-shadow\(0 0 2\.75px color-mix\(in srgb, currentColor 33\.75%, transparent\)\)/);
  assert.ok(!/\.ccgrill \{[^}]*box-shadow/s.test(rules), "the vent casts no shadow");
});

test("the owner's second pass (19 Oct): hairline cuts, the 15% touch, the dark glow, Michroma everywhere", () => {
  assert.match(rules, /\.cccut \{[^}]*width: 1px;[^}]*background: color-mix\(in srgb, var\(--ink\) 14%, transparent\);/s, "a cut is the search field's outline");
  assert.match(rules, /\.ccfield \{[^}]*border: 1px solid color-mix\(in srgb, var\(--ink\) 14%, transparent\);/s, "…which is this");
  assert.match(deck, /data-lens-shape="cut" data-lens-band="6" data-lens-gain="0\.08"/, "and barely bends");
  assert.match(rules, /background: linear-gradient\(var\(--fx-tint\), var\(--fx-tint\)\), var\(--fx-glass\);/);
  assert.match(rules, /:root:not\(\[data-theme="light"\]\) :is\(\.ccenter \.tabl, \.ccenter \.mailbtn, \.idkey, \.passportbtn\) \.ic \{\n  filter: drop-shadow/, "the keys glow in dark only");
  // (25 Oct 2026, late: the owner's mockup) Michroma is the words' face; Inter carries the body and Share Tech Mono the small print beside it
  assert.match(rules, /--mich: "Michroma"/, "--mich is Michroma");
  assert.match(rules, /--helv: "Inter"/); assert.match(rules, /--serif: "Inter"/); assert.match(rules, /--mono: "Share Tech Mono"/);
  for (const tok of []) {
    assert.match(rules, new RegExp(tok + ': "Michroma"'), tok + " is Michroma");
  }
});

test("the third pass (19 Oct): hinged keys, short cuts, a vent with no outline, a thin bezel, one stroke, the shine rim", () => {
  // every key but POST is a flap hinged on its top edge; the hinge is never drawn
  for (const [f, n] of [["app/components/ControlCenter.jsx", 3], ["app/components/InfoDock.jsx", 1], ["app/components/PassportButton.jsx", 1]]) {
    const src = read(f);
    assert.match(src, /useHingedKeys\(glassRef/, f + " holds the pressed state");
    assert.ok((src.match(/\bhkey\b/g) || []).length >= n, f + " hinges its keys");
    assert.match(src, /bezel: "fixture"/, f + " runs the one fixture bezel");
    assert.match(src, /<i className="fxrim" aria-hidden="true" \/>/, f + " wears the shine rim");
  }
  assert.ok(!/ccpost[^"]*hkey|hkey[^"]*ccpost/.test(deck), "the upload disc is not hinged");
  assert.match(rules, /\.hkey \{\n  transform-origin: 50% 0;/, "hinged on the top edge");
  assert.match(rules, /\.hkey\[data-pressed\] \{\n  transform: perspective\(220px\) rotateX\(-17deg\)/, "the lower edge tips into the glass");
  assert.match(rules, /\.hkey, \.hkey\[data-pressed\], \.hkey \.ic, \.hkey\[data-pressed\] \.ic \{ transform: none; transition: none; \}/, "reduced motion: no tipping");
  const hinge = read("app/components/hinge.js");
  assert.match(hinge, /export const MIN_PRESS_MS = 110;/, "a quick tap still shows");
  assert.match(hinge, /e\.key !== " " && e\.key !== "Enter"/, "the keyboard presses the same way");
  // the cuts are shorter, the vent has no outline
  assert.match(rules, /top: calc\(var\(--u\) \* 58\); bottom: calc\(var\(--u\) \* 52\);/);
  assert.ok(!/\.ccgrill \{[^}]*border:/s.test(rules), "the vent carries no outline");
  assert.match(rules, /\.fixture \.ic \*, \.ccenter \.ic \* \{ vector-effect: non-scaling-stroke; stroke-width: 1\.5px; \}/, "one stroke on every glyph");
  assert.match(rules, /\.fxrim \{[^}]*padding: 0\.75px;[^}]*linear-gradient\(135deg, var\(--fx-rim-hi\)/s, "a hairline that catches the light at two corners");
});

test("the bend is centred: no coloured map ever reaches a displacement, and the three fixtures share one bezel", () => {
  // (19 Oct) the owner saw the warp curve to the left; a grid under the deck showed every vertical line
  // hooking left along its lips. A colour map is colour-managed even inside the filter, which leaks the
  // up-and-down pull into a sideways one. Declared: every displacement reads a GREY map (lgxa / lgya), and
  // each pass reads the direction it leaves alone from the alpha channel, held at one half.
  const glass = read("app/components/LiquidGlass.jsx");
  const defs = glass.slice(glass.indexOf("export function LiquidGlassDefs"), glass.indexOf("export function restrictLens"));
  const passes = [...defs.matchAll(/<feDisplacementMap [^>]*\/>/g)].map((m) => m[0]);
  assert.equal(passes.length, 6, "two passes for each of red, green and blue");
  for (const p of passes) {
    assert.match(p, /in2="lg[xy]a"/, "a grey map: " + p);
    assert.match(p, /(xChannelSelector="R" yChannelSelector="A")|(xChannelSelector="A" yChannelSelector="R")/, "one direction a pass: " + p);
  }
  assert.match(defs, /<feColorMatrix in="lgx" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0\.5" result="lgxa" \/>/, "the alpha held at a half");
  assert.ok(!/in2="lgmap"/.test(defs), "the colour map is off the chain");
  assert.match(glass, /export const FIXTURE_BEZEL_UNITS = 175 \* 0\.26;/, "one bezel for the deck, the Info Dock and the globe");
  assert.match(glass, /Math\.min\(0\.5, Math\.max\(0\.4, [^\n]*\* 0\.001\)\)/, "in the same --u as globals.css");
  assert.match(rules, /--u: clamp\(0\.4px, 0\.1vw, 0\.5px\);/);
});

test("the top fixtures shine like the deck: their gloss is the deck's at their half height, the rim calmer", () => {
  // declared: the top specular and bottom light reach half as deep (16px -> 8px, 8px -> 4px), the diagonal
  // band at half strength, in both palettes; the deck keeps September's own gloss
  assert.match(rules, /\.ccenter::before \{ background: var\(--glass-sheen\); \}/);
  assert.match(rules, /\.fixture::before \{ background: var\(--fx-sheen-half\); \}/);
  const halves = [...rules.matchAll(/--fx-sheen-half:\s*\n\s*linear-gradient\(180deg,[^)]*\)[^)]*\)[^)]*\) (\d+(?:\.\d+)?)px\)/g)].map((m) => Number(m[1]));
  assert.deepEqual(halves, [8, 8], "half the 16px top specular, both palettes");
  assert.equal((rules.match(/--fx-sheen-half:/g) || []).length, 2);
  assert.match(rules, /\.fixture \.fxrim \{ opacity: 0\.6; \}/);
});


test("another key leaves search: the deck rises only for SEARCH, and every other fixture key brings it down", async () => {
  const D = await import("../lib/dockstate.js");
  // the state module is pure enough to drive: open search, then a utility
  D.setMode("search");
  D.leaveSearch();
  assert.equal(D.getDock().mode, "base", "leaving search drops the deck");
  D.leaveSearch(); // a no-op outside search: it must not close a popup that is not search's
  assert.equal(D.getDock().mode, "base");
  const src = read("lib/dockstate.js");
  assert.match(src, /export function leaveSearch\(\) \{ if \(state\.mode === "search"\) closeSearch\(\); \}/);
  assert.match(src, /if \(id === "search"\) state\.mode = "search";/, "only the search popup enters search mode");
  assert.ok(!/id === "likes" \|\| id === "messages"/.test(src), "Likes and Messages no longer raise the deck by themselves");
  // the three fixtures call it, the deck on the press itself (before POST or MESSAGES act)
  assert.match(deck, /onPointerDownCapture=\{keyDown\}/);
  assert.match(deck, /t\.getAttribute\("aria-label"\) === "search"\) return;\n[^\n]*\n\s*leaveSearch\(\);/, "every key but SEARCH itself");
  assert.match(read("app/components/InfoDock.jsx"), /if \(dock\.mode === "search"\) \{ leaveSearch\(\); openSheet\(id\); return; \}/);
  assert.match(read("app/components/PassportButton.jsx"), /onClick=\{leaveSearch/);
});

test("the wordmark is a fixture in the top-left corner, and nothing on the site is italic", () => {
  assert.match(rules, /\.brandfix \{\n  position: fixed; z-index: 66; left: var\(--dk-edge\);/, "fixed, its left edge on the deck's");
  assert.match(rules, /\.brandfix \{[^}]*height: calc\(var\(--u\) \* 88\);[^}]*flex-direction: column; justify-content: center;/s, "its middle on the top fixtures' middle");
  // (19 Oct) the name in metal, a touch bolder; the asterisk smaller, at the top of the capitals; a
  // thick translucent bar and one square under the word, within its width
  // the metal and its halo on the capitals only, so the red asterisk takes none of the green glow
  assert.match(rules, /\.wmcaps \{[^}]*background: var\(--metal\);[^}]*-webkit-text-stroke: 0\.5px var\(--metal-edge\);/s);
  assert.match(rules, /\.wordmark \.wmcaps \{ filter: drop-shadow/);
  assert.ok(!/\.wmword \{[^}]*(filter|background):/s.test(rules));
  // the asterisk small and up in the corner, plain red: no stroke, no glow
  assert.match(rules, /\.wmword i \{[^}]*font-size: 0\.6em;[^}]*top: -0\.68em;[^}]*color: var\(--warn\);[^}]*text-shadow: none; \}/s);
  assert.ok(!/\.wmword i \{[^}]*-webkit-text-stroke/s.test(rules), "not bolded");
  // (25 Oct, late) THE LOGO IS THE OWNER'S IMAGE (public/model/logo.jpg); the name stays for assistive technology.
  // (26 Oct 2026: "make it more blue so it's visible, and phosphorus green in dark mode") two masks cut from
  // it colour it: the word and bar in --wm-ink (a blue in light, the title card's chrome-to-mint in dark), the
  // asterisk in --warn (red in both, as the title card has it)
  assert.match(rules, /\.wmimg \{ position: relative; display: block; width: clamp\(107\.25px, 28\.875vw, 151\.25px\); aspect-ratio: 900 \/ 200; \}/, "top left, 25% then 10% bigger than half the Info Dock (owner, 26 Oct), the artwork's proportions");
  assert.match(rules, /\.wmink \{ --wm-mask: url\(\/model\/logo-ink\.png\); background: var\(--wm-ink\); \}/);
  assert.match(rules, /\.wmstar \{ --wm-mask: url\(\/model\/logo-star\.png\); background: var\(--wm-star, var\(--warn\)\); \}/);
  assert.match(rules, /--wm-ink: var\(--metal\);/, "dark: the title card's chrome washing to phosphor green");
  // (same day: "let's go back to the original color for light mode") light paints the artwork's own colours
  assert.match(rules, /\[data-theme="light"\] \{[^}]*--wm-ink: url\(\/model\/logo-light\.png\) center \/ 100% 100% no-repeat;\s*--wm-star: url\(\/model\/logo-light\.png\)/s, "light: the artwork's colours, darker (owner, 26 Oct: darker and bolder)");
  assert.ok(!/#3f7ef2/.test(rules), "the blue is gone");
  assert.match(rules, /:root:not\(\[data-theme="light"\]\) \.wmimg \{ filter: drop-shadow/, "dark glows, as the title card does");
  assert.ok(!/\.wordmark\.brandfix \{ (height: auto|mix-blend-mode)/.test(rules), "no blending, and no height override: the mark sits on the fixtures' middle");
  for (const f of ["logo.jpg", "logo-ink.png", "logo-star.png", "logo-light.png"]) assert.ok(existsSync("public/model/" + f), f + " is in the model folder");
  assert.equal((rules.match(/--metal: linear-gradient/g) || []).length, 2, "metal in both palettes");
  assert.ok(!/\n\.wordmark \{[^}]*filter:/.test(rules), "no glow in light: the phosphor glow is dark-only");
  const wm = read("app/components/Wordmark.jsx");
  assert.match(wm, /<span className="wmword idlabel"><i>\*<\/i><span className="wmcaps">ASILUM<\/span><\/span>/);
  assert.match(wm, /<span className="wmimg" aria-hidden="true"><i className="wmink" \/><i className="wmstar" \/><\/span>/, "the artwork as two masked layers");
  assert.ok(!/CHEVRON_CHANCE|wmchev|wmsq|wmblk/.test(wm), "the line, its square, the chevron run and the block bar are all retired for the picture");
  // no red glows anywhere (owner, 19 Oct 2026)
  for (const sel of ["\\.wmimg", "\\.wmstar"]) assert.ok(!new RegExp(sel + " \\{[^}]*box-shadow: 0 0").test(rules), sel + " does not glow");
  assert.ok(!/text-shadow: 0 0 \d+px color-mix\(in srgb, var\(--warn\)/.test(rules), "no red text glows");
  assert.ok(!/box-shadow: 0 0 \d+px var\(--warn\)/.test(rules), "no red light glows");
  assert.match(wm, /<span className="wmword idlabel"><i>\*<\/i><span className="wmcaps">ASILUM<\/span><\/span>/, "the name, for assistive technology");
  assert.match(rules, /\[data-popup\] \.brandfix \{ transform: scale\(0\.92\); opacity: 0\.55; \}/, "it dims with the fixtures under a popup");
  assert.ok(!/\.feedmark/.test(rules), "the Feed's masthead mark is gone");
  // nothing italic: no rule, no default slant, no synthesized oblique
  const css = read("app/globals.css");
  assert.ok(!/italic|oblique/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "no rule slants anything");
  assert.match(rules, /:where\(em, i, cite, var, dfn, address, q\) \{ font-style: normal; \}/);
  assert.match(rules, /html \{ font-synthesis-style: none; \}/);
  const { readdirSync, statSync } = require_fs();
  const offenders = [];
  const walk = (d) => { for (const f of readdirSync(new URL("../" + d, import.meta.url))) { const q = d + "/" + f; if (statSync(new URL("../" + q, import.meta.url)).isDirectory()) walk(q); else if (/\.(jsx?|mjs|css)$/.test(f) && /fontStyle:\s*["']italic|font-style:\s*italic/.test(read(q))) offenders.push(q); } };
  walk("app");
  assert.deepEqual(offenders, [], "no component slants a word inline either");
});

