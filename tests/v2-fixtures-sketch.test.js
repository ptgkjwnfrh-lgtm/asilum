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
  // (26 Oct 2026) the Info Dock is buttons on the Masthead now, no pane of its own to cut
  assert.ok(!/cccut|idcut/.test(read("app/components/InfoDock.jsx")), "the Info Dock's cuts left with its pane");
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

test("the Masthead: a full-width glass strip, the wordmark at the left and the bare keys at the right, both in line with the deck's edges", () => {
  // (26 Oct 2026, the owner: "I kind of miss the liquid glass full-length header, let's add it so the logo can
  // sit on it and the infodeck can be taken away leaving just the buttons"). Declared: one strip of the
  // fixtures' glass the width of the page and --head-h tall, padded in to the deck's edges so the wordmark
  // starts where the deck starts and the globe ends where it ends; the Info Dock and the Passport keep no pane.
  assert.match(rules, /\.fixture \{[^}]*height: var\(--head-h\); padding: env\(safe-area-inset-top, 0px\) var\(--dk-edge\) 0;/s);
  assert.match(rules, /\.fixture \{[^}]*justify-content: space-between;/s, "the wordmark at one end, the keys at the other");
  assert.match(rules, /\.mhkeys \{[^}]*height: calc\(var\(--u\) \* 88\);/, "the keys in the sketch's 88-unit row");
  assert.match(rules, /\.idkey \{[^}]*width: calc\(var\(--u\) \* 97\);/s, "three keys of the drawn 292");
  assert.match(rules, /\.passportbtn \{[^}]*width: calc\(var\(--u\) \* 97\);/s, "the globe a key of the same width");
  const mast = read("app/components/Masthead.jsx");
  assert.match(mast, /className="masthead fixture"/);
  assert.ok(mast.indexOf("<Wordmark") < mast.indexOf("<InfoDock") && mast.indexOf("<InfoDock") < mast.indexOf("<PassportButton"), "wordmark, then the dock's keys, then the globe");
  for (const f of ["app/components/InfoDock.jsx", "app/components/PassportButton.jsx"]) {
    const src = read(f);
    assert.ok(!/useLiquidGlass|fxrim|\bfixture\b"/.test(src), f + " has no pane of its own");
  }
  // the popup clears the strip
  assert.match(rules, /\.sheetscrim \{[^}]*padding: calc\(var\(--head-h\) \+ 8px\) 0 var\(--cc-space\);/s);
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

test("the September recipe on the fixtures: a slight 84 / 86 / 88 split, the Safari page bend, the lamps and the meniscus", () => {
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /export const PULL = \[84, 86, 88\];/, "a slight split (26 Oct 2026: the owner's faint rainbow, not the old 80 / 86 / 92 red line)");
  assert.match(glass, /export const BEZEL = 56;/);
  assert.match(glass, /const GLASS_N = 1\.5;/);
  assert.match(glass, /const bez = Math\.max\(6, Math\.min\(BEZEL, Math\.min\(w, h\) \/ 2, bezel \? \(bezel < 1 \? Math\.min\(w, h\) \* bezel : bezel\) : Infinity\)\);/, "56px at most, never past the middle, and as thin as the pane asks (a fraction, or px)");
  assert.match(read("app/components/Masthead.jsx"), /useLiquidGlass\(glassRef, \{ id: "lg-masthead", strength: 1, open: MASTHEAD_OPEN, bend: FIXTURE_BEND, bezel: "fixture", shine: false \}\)/, "the Masthead: full strength, only its bottom edge lenses, the page bends under it on WebKit");
  assert.match(read("app/components/Masthead.jsx"), /MASTHEAD_OPEN = Object\.freeze\(\{ top: false, right: false, bottom: true, left: false \}\)/);
  for (const [f, id] of [["app/components/Masthead.jsx", "lg-masthead"], ["app/components/ControlCenter.jsx", "lg-deck"]]) {
    const src = read(f);
    assert.match(src, new RegExp(`useLiquidGlass\\(glassRef, \\{ id: "${id}", strength: 1, (open: MASTHEAD_OPEN, )?bend: FIXTURE_BEND`), f + " runs the header's full strength, no extra prism, and bends the page on WebKit");
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
  for (const [f, n, ref] of [["app/components/ControlCenter.jsx", 3, "glassRef"], ["app/components/InfoDock.jsx", 1, "keysRef"], ["app/components/PassportButton.jsx", 1, "keyRef"]]) {
    const src = read(f);
    assert.match(src, new RegExp("useHingedKeys\\(" + ref), f + " holds the pressed state");
    assert.ok((src.match(/\bhkey\b/g) || []).length >= n, f + " hinges its keys");
  }
  // the panes run the one fixture bezel; the deck wears the shine rim (the Masthead is flush with three screen edges: no rim)
  for (const f of ["app/components/ControlCenter.jsx", "app/components/Masthead.jsx"]) assert.match(read(f), /bezel: "fixture"/, f + " runs the one fixture bezel");
  assert.match(deck, /<i className="fxrim" aria-hidden="true" \/>/, "the deck wears the shine rim");
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
  assert.equal(passes.length, 6, "two passes, sideways then up and down, for each of red, green and blue");
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
  assert.ok(!/\.fixture \.fxrim/.test(rules), "the Masthead wears no rim: three of its edges are the screen's");
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
  // (26 Oct 2026) on the Masthead: in its flow, the strip's padding puts its left edge on the deck's
  assert.match(rules, /\.brandfix \{\n  position: relative; flex: none; align-self: flex-start;/, "in the Masthead's row");
  // (26 Oct 2026) the word's foot (row 140 of the artwork's 200) sits the stamp gap above the stamped line
  assert.match(rules, /\.brandfix \{[^}]*margin-top: calc\(var\(--mh-line-top\) - var\(--mh-gap\) - var\(--wm-w\) \* 140 \/ 900\);/s, "its foot over the stamped line");
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
  assert.ok(!/\[data-popup\] \.brandfix/.test(rules) && /\[data-popup\] \.fixture \{ opacity: 0\.55;/.test(rules), "it dims with the Masthead it sits on under a popup, once (26 Oct 2026)");
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


// THE RED BEZEL LINE (owner, 26 Oct 2026: "the odd red bezel line" on a
// Feed piece card and along the top fixtures, reddish on top and yellow-green
// below). Two causes: the far-reach card's 2px red frame round its
// photograph (gone), and the glass's dispersion — red, green and blue pulled
// 80 / 86 / 92 (wider still under `prism`), so wherever the bend met an edge
// the colours parted into hard lines. Then the owner's correction the same
// day: "I still want slight rainbow on all the liquid glass" — so the split
// comes back slight, the same small spread on every pane, never the old one.
test("no red bezel, a faint rainbow: the reach frame is gone, and every glass splits colour by a little", () => {
  // (26 Oct 2026, the owner's correction: "I still want slight rainbow on all the liquid glass".) Declared
  // before measuring: PULL is three pulls rising red -> green -> blue; the spread (blue - red) is above 0
  // and at most 4 — a third of the old 80 / 86 / 92, whose 12 drew the hard red line; both chains (the
  // backdrop lens every pane renders through LiquidGlassDefs, and Safari's page bend) run all three; no
  // prism widens it for one pane; and the far-reach card's red frame, a separate artifact, stays gone.
  assert.ok(!/\.card\.reach[^{]*\{[^}]*(border|outline|box-shadow)[^}]*var\(--red\)/.test(rules), "no accent frame on a far-reach card");
  const glass = read("app/components/LiquidGlass.jsx");
  const code = glass.replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const m = code.match(/export const PULL = \[(\d+(?:\.\d+)?), (\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\];/);
  assert.ok(m, "three pulls, red / green / blue");
  const [r, g, b] = m.slice(1).map(Number);
  assert.ok(r < g && g < b, "red bends least, blue most");
  assert.ok(b - r > 0, "a split is present");
  assert.ok(b - r <= 4, `the spread stays slight: ${b - r} of at most 4 (the old 80 / 86 / 92 was 12)`);
  // both chains use all three pulls
  const defs = code.slice(code.indexOf("export function LiquidGlassDefs"), code.indexOf("export function restrictLens"));
  const lensScales = new Set([...defs.matchAll(/feDisplacementMap[^>]*scale=\{(\w+)\}/g)].map((x) => x[1]));
  assert.deepEqual([...lensScales].sort(), ["sb", "sg", "sr"], "the panes' lens runs red, green and blue apart");
  assert.match(defs, /const \[sr, sg, sb\] = pulls\(strength, spread\);/);
  const bend = code.slice(code.indexOf("export function createPageBend"), code.indexOf("let serial = 0;"));
  const bendScales = new Set([...bend.matchAll(/feDisplacementMap[^>]*scale="\$\{(\w+)\}"/g)].map((x) => x[1]));
  assert.deepEqual([...bendScales].sort(), ["sb", "sg", "sr"], "Safari's page bend runs them apart too");
  assert.match(bend, /const \[sr, sg, sb\] = pulls\(strength, spread\);/);
  // and only under the pane: outside it the map is a flat 128 (not quite neutral), and a split there drew a
  // faint coloured line down every bent card's whole border — the bend's primitives take the pane's rectangle
  // as their subregion and the element passes through untouched elsewhere
  assert.ok([...bend.matchAll(/<feDisplacementMap data-pb="1"/g)].length === 3, "the three pulls carry the pane's subregion");
  assert.match(bend, /`<feComposite in="lens" in2="SourceGraphic" operator="over"\/>`/, "outside the pane the element is untouched");
  assert.match(code, /for \(const n of f\.querySelectorAll\("\[data-pb\]"\)\) \{ n\.setAttribute\("x", px\); n\.setAttribute\("y", py\); n\.setAttribute\("width", pw\); n\.setAttribute\("height", ph\); \}/, "place() sets the subregion to the pane");
  // every pane of liquid glass goes through the one hook, so through the one spread; no pane widens it
  for (const f of ["app/components/Masthead.jsx", "app/components/ControlCenter.jsx", "app/components/SheetHost.jsx", "app/components/PieceFloat.jsx", "app/components/GlassPane.jsx"]) {
    const src = read(f);
    assert.match(src, /useLiquidGlass\(/, f + " is a pane of the one glass");
    assert.ok(!/prism/.test(src), f + " passes no prism");
  }
  assert.ok(!/prism/.test(code), "no prism option");
  // THE FIXTURES' RAINBOW (owner, the same day: "a little more rainbow on the fixtures", still no hard
  // line). Declared: FIXTURE_PULL rises red -> blue, its spread is wider than PULL's and at most 6 (half
  // the 12 that drew the line); the panes on the fixture bezel (the Masthead, the deck) get it in both
  // chains; every other pane keeps PULL.
  const fm = code.match(/export const FIXTURE_PULL = \[(\d+(?:\.\d+)?), (\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\];/);
  assert.ok(fm, "the fixtures' three pulls");
  const [fr, fg, fb] = fm.slice(1).map(Number);
  assert.ok(fr < fg && fg < fb, "red least, blue most");
  assert.ok(fb - fr > b - r, `the fixtures split wider than the other glass (${fb - fr} > ${b - r})`);
  assert.ok(fb - fr <= 6, `and stay slight: ${fb - fr} of at most 6`);
  assert.match(code, /<LiquidGlassDefs [^>]*spread=\{bezel === "fixture" \? FIXTURE_PULL : PULL\} \/>/, "the panes' lens");
  assert.match(code, /createPageBend\(\{ [^}]*spread: bezel === "fixture" \? FIXTURE_PULL : PULL \}\)/, "Safari's page bend");
  for (const f of ["app/components/Masthead.jsx", "app/components/ControlCenter.jsx"]) assert.match(read(f), /bezel: "fixture"/, f + " is a fixture");
  for (const f of ["app/components/SheetHost.jsx", "app/components/PieceFloat.jsx", "app/components/GlassPane.jsx"]) assert.ok(!/bezel: "fixture"/.test(read(f)), f + " keeps the faint split");
});

// THE STAMPED LINE (owner, 26 Oct 2026, the reference 4.jpg, "Ref 2"). Declared before measuring: the
// pattern read left to right is three thin (1/2), then four times [short, short, short, long] (1, 1, 1, 2),
// every gap 0.45; it runs from the left edge of the A (column 19 of the artwork's 900, the first column the
// word's ink reaches) to the Passport's globe, ending on the globe's centre with the last long block lit and
// centred there; the columns are fractions so it fills the span at any width; it is pressed into the glass
// (an inset shade on the upper edge, a caught light on the lower), the reference's slate in light; the gap
// to the word is larger than the artwork's 4/900; and the word masks no longer carry the old bar.
test("the stamped line: Ref 2 pressed into the Masthead from the A to the globe, the lit block under the globe", async () => {
  const mast = read("app/components/Masthead.jsx");
  const stamp = JSON.parse(mast.match(/export const STAMP = Object\.freeze\((\[[^\]]*\])\);/)[1]);
  assert.deepEqual(stamp, [0.5, 0.5, 0.5, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2], "three thin, then four [short, short, short, long]");
  assert.match(mast, /export const STAMP_GAP = 0\.45;/);
  // the grid: a bar and a gap per block, the last block's column half its length; its fractions sum to 28.6
  const cols = stamp.map((w, i) => (i === stamp.length - 1 ? [w / 2] : [w, 0.45])).flat();
  assert.equal(Math.round(cols.reduce((a, c) => a + c, 0) * 100) / 100, 28.6);
  assert.match(mast, /STAMP\.map\(\(w, i\) => \(i === STAMP\.length - 1 \? `\$\{w \/ 2\}fr` : `\$\{w\}fr \$\{STAMP_GAP\}fr`\)\)\.join\(" "\)/, "fractions: it fills its span at every width");
  assert.match(mast, /className=\{i === STAMP\.length - 1 \? "lit" : undefined\} style=\{\{ gridColumn: 2 \* i \+ 1 \}\}/, "each block in its own column, the last one lit");
  assert.ok(mast.indexOf("<Wordmark") < mast.indexOf('className="mhstamp"'), "under the word");
  assert.match(rules, /\.mhstamp \{[^}]*left: calc\(var\(--dk-edge\) \+ var\(--wm-w\) \* 19 \/ 900\);/s, "from the A's left edge");
  assert.match(rules, /\.mhstamp \{[^}]*right: calc\(var\(--dk-edge\) \+ var\(--u\) \* 97 \/ 2\);/s, "to the globe's centre (the last key, 97 units)");
  assert.match(rules, /\.mhstamp i\.lit \{ width: 200%; background: var\(--wm-lit\); \}/, "the lit block, twice its column, centred on the globe");
  assert.match(rules, /\.mhstamp i \{[^}]*box-shadow: inset 0 1px 1px var\(--stamp-sink\), inset 0 -0\.5px 0 var\(--stamp-catch\), 0 0\.5px 0 var\(--stamp-catch\);/s, "pressed in, not painted on");
  assert.match(rules, /\[data-theme="light"\] \{[^}]*--wm-bar: #3d4c5b;/s, "the reference's slate in light");
  assert.match(rules, /--mh-gap: calc\(var\(--wm-w\) \* 12 \/ 900\);/, "a larger gap than the artwork's 4");
  const wmw = rules.match(/\.masthead \{[^}]*--wm-w: (clamp\([^)]*\));/s)[1];
  assert.match(rules, new RegExp("\\.wmimg \\{ position: relative; display: block; width: " + wmw.replace(/[()*.+]/g, "\\$&") + ";"), "the line's measure is the wordmark's");
  // the masks: no bar left under the word; the word's ink starts at column 19
  const sharp = (await import("sharp")).default;
  for (const f of ["logo-ink.png", "logo-light.png"]) {
    const { data, info } = await sharp(new URL("../public/model/" + f, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let inked = 0;
    for (let y = 141; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) inked++;
    assert.equal(inked, 0, f + " carries no bar");
  }
  const ink = await sharp(new URL("../public/model/logo-ink.png", import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let first = -1;
  for (let x = 0; x < 900 && first < 0; x++) for (let y = 0; y < 141; y++) if (ink.data[(y * 900 + x) * 4 + 3] > 40) { first = x; break; }
  assert.equal(first, 19, "the A's left edge is column 19");
});
