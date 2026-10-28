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

test("the deck is the sketch's 745 × 175, stretched 1.14 sideways, and every cut sits on a seam between its columns", () => {
  // (owner, 26 Oct 2026: "let's also widen the central control fixture") the drawn 745, stretched by --dk-sx
  // (28 Oct 2026: "ever so slightly widen the center fixture") 1.1 → 1.14
  assert.match(rules, /--dk-sx: 1\.14;\s*--dk-w: calc\(var\(--u\) \* 745 \* var\(--dk-sx\)\);/);
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
  assert.match(glass, /drawRefractionMap\(mapRef\.current,[^\n]*, lensFeatures\(el\), bezel === "fixture" \? fixtureBezel\(\) : bezel, xRef\.current, yRef\.current, mapScale\(r\.width, r\.height\)\);/, "the map is drawn with the carvings, as two greys, at the screen's own pixels");
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

test("the September recipe on the fixtures: one pull of 86 for every colour, the Safari page bend, the lamps and the meniscus", () => {
  const glass = read("app/components/LiquidGlass.jsx");
  assert.match(glass, /export const PULL = 86;/, "one pull, no colour split (26 Oct 2026: \"take away the rainbow\")");
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
  assert.equal(passes.length, 2, "two passes, sideways then up and down, every colour alike");
  for (const p of passes) {
    assert.match(p, /in2="lg[xy]a"/, "a grey map: " + p);
    assert.match(p, /(xChannelSelector="R" yChannelSelector="A")|(xChannelSelector="A" yChannelSelector="R")/, "one direction a pass: " + p);
  }
  assert.match(defs, /<feColorMatrix in="lgx" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 0\.5" result="lgxa" \/>/, "the alpha held at a half");
  assert.ok(!/in2="lgmap"/.test(defs), "the colour map is off the chain");
  // (28 Oct 2026: "for the liquid glass bar and the center fixture i want their warp bezel extended slightly") 26% → 31%
  assert.match(glass, /export const FIXTURE_BEZEL_UNITS = 175 \* 0\.31;/, "one bezel for the deck and the Masthead's bar");
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
  // it colour it: the word (its bar cut, 26 Oct) in --wm-ink (a blue in light, the title card's chrome-to-mint in dark), the
  // asterisk in --warn (red in both, as the title card has it)
  assert.match(rules, /\.wmimg \{ position: relative; display: block; width: clamp\(107\.25px, 28\.875vw, 151\.25px\); aspect-ratio: 900 \/ 200; \}/, "top left, 25% then 10% bigger than half the Info Dock (owner, 26 Oct), the artwork's proportions");
  assert.match(rules, /\.wmink \{ --wm-mask: url\(\/model\/logo-word-ink\.png\); background: var\(--wm-ink\); \}/);
  assert.match(rules, /\.wmstar \{ --wm-mask: url\(\/model\/logo-star\.png\); background: var\(--wm-star, var\(--warn\)\); \}/);
  assert.match(rules, /--wm-ink: var\(--metal\);/, "dark: the title card's chrome washing to phosphor green");
  // (same day: "let's go back to the original color for light mode") light paints the artwork's own colours
  assert.match(rules, /\[data-theme="light"\] \{[^}]*--wm-ink: url\(\/model\/logo-word-light\.png\) center \/ 100% 100% no-repeat;\s*--wm-star: url\(\/model\/logo-word-light\.png\)/s, "light: the artwork's colours, darker (owner, 26 Oct: darker and bolder)");
  assert.ok(!/#3f7ef2/.test(rules), "the blue is gone");
  assert.match(rules, /:root:not\(\[data-theme="light"\]\) \.wmimg \{ filter: drop-shadow/, "dark glows, as the title card does");
  assert.ok(!/\.wordmark\.brandfix \{ (height: auto|mix-blend-mode)/.test(rules), "no blending, and no height override: the mark sits on the fixtures' middle");
  for (const f of ["logo.jpg", "logo-word-ink.png", "logo-star.png", "logo-word-light.png"]) assert.ok(existsSync("public/model/" + f), f + " is in the model folder");
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


// THE RED BEZEL LINE AND THE RAINBOW (owner, 26 Oct 2026). "The odd red bezel line" on a Feed piece card
// and along the fixtures had two causes: the far-reach card's 2px red frame (gone), and the glass's
// dispersion, red / green / blue pulled 80 / 86 / 92, which parted the colours into a red line on one edge
// and a yellow-green one on the other. Slighter splits (84 / 86 / 88, the fixtures 83 / 86 / 89) and a
// rainbow film inside the panes followed, and then the owner's last word: "take away the rainbow".
// Declared: PULL is one number; every displacement in both chains (the panes' lens, Safari's page bend)
// runs at that one pull; no channel is lifted out of a bent picture; no prism, no spread, no fixture pull;
// no film; no live rule of a glass pane paints the iris colours or a conic gradient (the popup's retired
// rim and film keep their rules only while they stay `content: none`); the reach frame stays gone; the page
// bend stays confined to the pane.
test("no rainbow on the glass: every colour bends alike on every pane, no film, no rainbow rim, no red frame", () => {
  assert.ok(!/\.card\.reach[^{]*\{[^}]*(border|outline|box-shadow)[^}]*var\(--red\)/.test(rules), "no accent frame on a far-reach card");
  const glass = read("app/components/LiquidGlass.jsx");
  const code = glass.replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.match(code, /export const PULL = 86;/, "one pull");
  assert.ok(!/PULL\s*=\s*\[|FIXTURE_PULL|spread|pulls\(|prism/.test(code), "no per-colour pull, no spread, no fixture pull, no prism");
  const scales = [...code.matchAll(/feDisplacementMap[^>]*scale=(?:\{(\w+)\}|"\$\{(\w+)\}")/g)].map((m) => m[1] || m[2]);
  assert.ok(scales.length >= 3, "the lens and the page bend both found");
  assert.deepEqual([...new Set(scales)], ["pull"], "every displacement at the one pull");
  assert.ok(!/values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/.test(code), "no red channel lifted out of a bent picture");
  const bend = code.slice(code.indexOf("export function createPageBend"), code.indexOf("let serial = 0;"));
  assert.equal([...bend.matchAll(/<feDisplacementMap data-pb="1"/g)].length, 1, "the page bend: one pull, in the pane's subregion");
  assert.match(bend, /`<feComposite in="lens" in2="SourceGraphic" operator="over"\/>`/, "outside the pane the element is untouched");
  // no film
  const css = read("app/globals.css");
  assert.ok(!/lgfilm/.test(code + css), "no rainbow film");
  // no live rainbow on a glass pane
  const PANES = /\.(fixture|masthead|ccenter|sheet|pfloatcard|lgpane|gxcard|ppdoc)\b/;
  const live = [];
  for (const m of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!PANES.test(m[1]) || !/var\(--iris-[1-5]\)|conic-gradient/.test(m[2])) continue;
    const sel = m[1].trim();
    if (/^\.sheet::(after|before)$/.test(sel)) continue; // retired: checked below to stay `content: none`
    live.push(sel);
  }
  assert.deepEqual(live, [], "no glass pane paints the rainbow");
  assert.match(rules, /\.sheet::after \{\n  content: none;/, "the popup's rim stays off");
  assert.match(rules, /\.sheet::before \{ content: none; \}/, "the popup's film stays off");
});

// THE WHEEL'S RAINBOW (owner, 27 Oct 2026: "the disc is the actual liquid glass wheel … the bearing of the
// disc or the center of the disc should be the upload button … i don't want the upload button to rotate,
// only the disc … simply add whatever liquid glass rainbow effect the earlier version of asilum magazine had").
// The one exception to the test above. Declared before measuring:
//   - the rainbow is the V.1 magazine's, restored (LiquidGlass.jsx at bdd5397, 9 Sep): the bezel bends the
//     backdrop through the colour map three times, red / green / blue pulled 80 / 86 / 92, each pass keeps
//     its colour, the three are summed, the weight picture blends the lens into the clear middle; Safari's
//     chain is the same three pulls, inside the pane's square;
//   - it is the wheel's alone: only ScrollWheel.jsx passes it to the glass hook, the split (V1_PULL, a
//     colour lifted alone out of a bent picture) lives in RainbowGlass.jsx alone among every source file,
//     and no glass rule anywhere paints the iris colours or a conic gradient;
//   - the wheel's pane can see the Feed: it is a layer on <body> one level under the deck (inside the deck,
//     a Backdrop Root, the bend reached nothing), bending through its own filter;
//   - the plus is the hub: the open wheel's centre is the ejected plus's centre, and turning moves the
//     wheel's marks only — nothing rotates the plus;
//   - the slot is empty: no Clear Disc, no CD styling anywhere.
test("the wheel's rainbow: the V.1 magazine's glass on the wheel alone, centred on the plus, which never turns", () => {
  const rg = read("app/components/RainbowGlass.jsx");
  assert.match(rg, /export const V1_PULL = Object\.freeze\(\[80, 86, 92\]\);/, "V.1's three pulls");
  const defs = rg.slice(rg.indexOf("function V1Defs"), rg.indexOf("function v1Chain"));
  for (const [c, sc] of [["R", "sr"], ["G", "sg"], ["B", "sb"]]) {
    assert.match(defs, new RegExp(`<feDisplacementMap data-lens="1" in="SourceGraphic" in2="lgmap" scale=\\{${sc}\\} xChannelSelector="R" yChannelSelector="G" result="bent${c}" />`), "the " + c + " pass");
  }
  assert.match(defs, /in="bentR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chR"/, "each colour kept alone");
  assert.match(defs, /in="chRG" in2="chB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lens"/, "summed");
  assert.match(defs, /<feComposite in="lensW" in2="frostW" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" \/>/, "blended into the clear middle by the weight");
  const chain = rg.slice(rg.indexOf("function v1Chain"), rg.indexOf("export const V1_RAINBOW"));
  assert.equal([...chain.matchAll(/<feDisplacementMap data-pb="1" in="SourceGraphic" in2="map" scale="\$\{s[rgb]\}"/g)].length, 3, "Safari: the same three pulls, in the pane's square");
  assert.match(chain, /`<feComposite in="lens" in2="SourceGraphic" operator="over"\/>`/, "outside the wheel a card is untouched");
  // the wheel's alone
  const sw = read("app/components/ScrollWheel.jsx");
  assert.match(sw, /dispersion: V1_RAINBOW \}\);/, "the wheel passes it");
  const files = [];
  const walk = (dir) => { for (const f of readdirSync(new URL("../" + dir, import.meta.url))) { const p = dir + "/" + f; if (statSync(new URL("../" + p, import.meta.url)).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f)) files.push(p); } };
  walk("app"); walk("lib");
  const code = (f) => read(f).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const users = files.filter((f) => /V1_RAINBOW|RainbowGlass/.test(code(f)) && f !== "app/components/RainbowGlass.jsx");
  assert.deepEqual(users, ["app/components/ScrollWheel.jsx"], "no other pane takes the rainbow");
  const SPLIT = /V1_PULL|PULL\s*=\s*\[|values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"|values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"/;
  const splitters = files.filter((f) => SPLIT.test(code(f)));
  assert.deepEqual(splitters, ["app/components/RainbowGlass.jsx"], "no other file parts the colours");
  const painted = [];
  for (const m of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/var\(--iris-\d\)|conic-gradient/.test(m[2])) continue;
    const sel = m[1].trim();
    if (/^\.sheet::(after|before)$/.test(sel)) continue; // retired, `content: none` (the test above)
    if (/\.(fixture|masthead|ccenter|ccwheel|ccwglass|cctray|ccspindle|ccdisc|pccard|sheet|cdlens)\b/.test(sel)) painted.push(sel);
  }
  assert.deepEqual(painted, [], "the rainbow is refraction, never paint");
  // the pane sees the Feed
  assert.match(sw, /createPortal\(\s*<span ref=\{glassRef\} className="ccwglass"/, "the wheel's pane on <body>");
  assert.match(rules, /\.ccwglass \{\n  position: fixed; z-index: 65;/, "one level under the deck (66)");
  assert.match(rules, /\.ccwglass\[data-refract="1"\] \{ -webkit-backdrop-filter: var\(--lg-filter\) saturate\(160%\); backdrop-filter: var\(--lg-filter\) saturate\(160%\); \}/);
  assert.ok(!/\.ccwheel\[data-refract/.test(rules) && !/\.ccwheel \{[^}]*backdrop-filter/.test(rules), "the wheel in the deck draws no glass of its own");
  // the plus is the hub
  assert.match(read("app/globals.css"), /--cy: calc\(50% \+ var\(--u\) \* 3\);\s*\/\* the disc's centre in its key \*\//, "--cy is the plus's centre in its key");
  assert.match(rules, /\.ccenter\[data-wheel="open"\] \.ccpostwrap \.tabl\.ccpost \{ transform: translateY\(calc\(-1 \* var\(--eject\)\)\);/, "the plus carried up by --eject");
  assert.match(rules, /\.ccenter\[data-wheel="open"\] \.ccwheel \{\n  top: calc\(var\(--cy\) - var\(--eject\)\);/, "the wheel centred where the plus is carried");
  assert.match(rules, /\.ccwheel \{\n  position: absolute; z-index: 1; left: 50%; top: var\(--cy\);[^}]*transform: translate\(-50%, -50%\)/, "on its centre");
  const turn = sw.slice(sw.indexOf("function turn("), sw.indexOf("function stopCoast"));
  assert.match(turn, /if \(ringRef\.current\) ringRef\.current\.style\.transform = `rotate\(\$\{s\.angle\}deg\)`;/, "a turn moves the wheel's marks");
  assert.equal([...turn.matchAll(/\.style\.transform/g)].length, 1, "and nothing else");
  for (const m of rules.matchAll(/([^{}]*\.(ccpost|ccdisc)\b[^{}]*)\{([^}]*)\}/g)) assert.ok(!/rotate/.test(m[3]), "the plus never rotates: " + m[1].trim());
  // THE SPOKES (27 Oct: "stems out like in the yeezus cover"): the wheel's pane carries a spokes shape that
  // its map reads — wedges round the hub that pull the Feed back toward the hub, so it streaks outward — and
  // no other pane has one
  const lg = read("app/components/LiquidGlass.jsx");
  assert.match(lg, /if \(f\.kind === "spokes"\) \{/, "the map draws the spokes");
  assert.match(lg, /const pull = Math\.min\(1, \(f\.reach \* \(len - hub\)\) \/ \(PULL \/ 2\)\) \* env \* wedge;\n\s*vx -= \(ex \/ len\) \* pull; vy -= \(ey \/ len\) \* pull;/, "drawn back toward the hub along each ray");
  assert.match(lg, /else if \(kind === "spokes"\) out\.push\(\{ kind, cx:/, "read from the DOM like every carved shape");
  assert.match(sw, /<i className="ccwspokes" data-lens-shape="spokes" data-lens-hub=\{SPOKES\.hub\} data-lens-spokes=\{SPOKES\.n\} data-lens-reach=\{SPOKES\.reach\} data-lens-sharp=\{SPOKES\.sharp\} \/>/, "inside the wheel's pane");
  assert.match(sw, /export const SPOKES = Object\.freeze\(\{ hub: 0\.38, n: 2, reach: 0\.95, sharp: 0\.5 \}\);/);
  assert.deepEqual(files.filter((f) => /data-lens-shape="spokes"/.test(read(f))), ["app/components/ScrollWheel.jsx"], "the wheel's alone");
  assert.match(rules, /\.ccwspokes \{ position: absolute; inset: 0; border-radius: 50%; pointer-events: none; \}/, "a shape that paints nothing");
  // the slot is empty
  assert.ok(!existsSync(new URL("../app/components/ClearDisc.jsx", import.meta.url)), "no Clear Disc");
  assert.ok(!/cdlens|ClearDisc|--cd-turn/.test(rules + read("app/components/ControlCenter.jsx")), "no CD styling");
});

// THE STAMPED LINE (owner, 26 Oct 2026, the reference 4.jpg, "Ref 2"; then, the same day: no line left
// under the word, "from thinner to larger", no colour but the blue block under the globe, thinner).
// Declared before measuring:
//   - nothing under the word but the stamped line: the word masks carry no ink below row 140; the old
//     masks (logo-ink.png, logo-light.png, which carried the bar) are gone and nothing names them; the
//     Wordmark draws only its two masks and the hidden name; no border, shadow or pseudo-element on the
//     wordmark's parts; the Masthead's children are the wordmark, the line and the keys, nothing else;
//   - graduated: four groups of [small, small, small, large], large = 2 x small, small strictly rising
//     from group to group; every gap 0.45; fraction columns, so it fills its span at any width;
//   - from the A's left edge (column 19 of 900, the word's first inked column) to the globe's centre,
//     the last large block centred there;
//   - a stamp, flat ("it should feel like a stamp", then "no shadow at all"): square edges and a tone in
//     the glass (alpha at most 0.25), nothing else (the next test forbids every shadow); no colour of its
//     own but the last block, blue in both themes — the V.1 light theme's ink, #08788a (the owner's
//     picture 5.png, the FRONT COVER headline; 1d0caa6) — flat the same way;
//   - thin: 12/900 of the wordmark's width with a floor of 1.5px (2px on a desktop, 1.5 on a phone),
//     against the artwork's 45.
test("the stamped line: nothing else under the word; graduated, flat stamped marks from the A to the globe, colourless but the one blue block, thin", async () => {
  const css = read("app/globals.css");
  // nothing else under the word
  const sharp = (await import("sharp")).default;
  for (const f of ["logo-word-ink.png", "logo-word-light.png"]) {
    const { data, info } = await sharp(new URL("../public/model/" + f, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let inked = 0;
    for (let y = 141; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) inked++;
    assert.equal(inked, 0, f + " carries no bar");
  }
  for (const f of ["logo-ink.png", "logo-light.png"]) assert.ok(!existsSync("public/model/" + f), f + " (the masks with the bar) is gone");
  assert.ok(!/logo-ink\.png|logo-light\.png/.test(css), "nothing in the styles names the old masks");
  const wm = read("app/components/Wordmark.jsx");
  const drawn = [...wm.slice(wm.indexOf("return (")).matchAll(/className="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(drawn, ["wmimg", "wmink", "wmstar", "wmword idlabel", "wmcaps"], "the wordmark draws the word's two masks and its hidden name, nothing else");
  assert.ok(!/\.(wordmark|brandfix|wmimg|wmink|wmstar)(::?(before|after))/.test(rules), "no pseudo-element under the word");
  assert.ok(!/\.(wordmark|brandfix|wmimg|wmink|wmstar)\b[^{,]*\{[^}]*(border-bottom|text-decoration: underline|box-shadow)/.test(rules), "no rule or shadow under the word");
  const mast = read("app/components/Masthead.jsx");
  const body = mast.slice(mast.indexOf('<header ref={glassRef} className="masthead fixture">'), mast.indexOf("</header>"));
  const kids = [...body.matchAll(/\n {6}<(\w+)(?: className="([^"]+)")?/g)].map((m) => m[2] || m[1]);
  assert.deepEqual(kids, ["brandfix", "mhstamp", "mhkeys"], "the Masthead: the wordmark, the line, the keys");
  assert.match(body, /\n {6}<Wordmark className="brandfix" \/>/);
  // graduated
  const small = JSON.parse(mast.match(/export const STAMP_SMALL = Object\.freeze\((\[[^\]]*\])\);/)[1]);
  assert.match(mast, /export const STAMP = Object\.freeze\(STAMP_SMALL\.flatMap\(\(s\) => \[s, s, s, 2 \* s\]\)\);/, "three small and a large, the large twice the small");
  assert.equal(small.length, 4, "four groups");
  for (let i = 1; i < small.length; i++) assert.ok(small[i] > small[i - 1], "each group a size up");
  assert.equal(small[0], 0.5, "starting from the thin ones");
  assert.match(mast, /export const STAMP_GAP = 0\.45;/);
  assert.match(mast, /STAMP\.map\(\(w, i\) => \(i === STAMP\.length - 1 \? `\$\{w \/ 2\}fr` : `\$\{w\}fr \$\{STAMP_GAP\}fr`\)\)\.join\(" "\)/, "fractions: it fills its span at every width");
  assert.match(mast, /className=\{i === STAMP\.length - 1 \? "lit" : undefined\} style=\{\{ gridColumn: 2 \* i \+ 1 \}\}/, "each block in its own column, the last one the coloured one");
  // the span
  assert.match(rules, /\.mhstamp \{[^}]*left: calc\(var\(--dk-edge\) \+ var\(--wm-w\) \* 19 \/ 900\);/s, "from the A's left edge");
  assert.match(rules, /\.mhstamp \{[^}]*right: calc\(var\(--dk-edge\) \+ var\(--u\) \* 97 \/ 2\);/s, "to the globe's centre (the last key, 97 units)");
  const ink = await sharp(new URL("../public/model/logo-word-ink.png", import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let first = -1;
  for (let x = 0; x < 900 && first < 0; x++) for (let y = 0; y < 141; y++) if (ink.data[(y * 900 + x) * 4 + 3] > 40) { first = x; break; }
  assert.equal(first, 19, "the A's left edge is column 19");
  // a stamp: flat, crisp; one blue block
  const bar = rules.match(/\.mhstamp i \{([^}]*)\}/)[1];
  assert.match(bar, /border-radius: 0;/, "square, crisp edges");
  assert.match(bar, /background: var\(--stamp-recess\);/, "a tone in the glass, not paint");
  const alphas = (name) => [...css.matchAll(new RegExp(name + ": rgba\\([^)]*, ([\\d.]+)\\);", "g"))].map((m) => Number(m[1]));
  assert.equal(alphas("--stamp-recess").length, 2, "a tone in each theme");
  for (const a of alphas("--stamp-recess")) assert.ok(a > 0 && a <= 0.25, "a shade, no more: " + a);
  assert.deepEqual([...rules.matchAll(/\.mhstamp i[^{]*\{[^}]*background: (?!var\(--stamp-recess\))[^;]+;/g)].map((m) => m[0].split("{")[0].trim()), [".mhstamp i.lit"], "the one coloured block");
  assert.match(rules, /\.mhstamp i\.lit \{ width: 200%; background: var\(--stamp-blue\); \}/, "blue, twice its column, centred on the globe");
  const blues = [...css.matchAll(/--stamp-blue: ([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(blues, ["#08788a"], "one blue for both themes: the V.1 light ink of the FRONT COVER picture");
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(blues[0].slice(i, i + 2), 16));
  assert.ok(b > r && b > g, "a blue");
  assert.ok(!/--wm-bar|--wm-lit/.test(css), "the old fills are gone");
  // thinner, and the measure is the wordmark's
  assert.match(rules, /--mh-line-h: max\(1\.5px, calc\(var\(--wm-w\) \* 12 \/ 900\)\);/, "12 of 900, at least 1.5px: 2px on a desktop");
  assert.match(rules, /--mh-gap: calc\(var\(--wm-w\) \* 18 \/ 900\);/, "the word clear of the line");
  const wmw = rules.match(/\.masthead \{[^}]*--wm-w: (clamp\([^)]*\));/s)[1];
  assert.match(rules, new RegExp("\\.wmimg \\{ position: relative; display: block; width: " + wmw.replace(/[()*.+]/g, "\\$&") + ";"), "the line's measure is the wordmark's");
});

// NO SHADOW ON THE STAMPED LINE (owner, 26 Oct 2026: "still too much, no shadow at all"). Declared before
// measuring: no rule that names .mhstamp, and no rule that could reach its bars by cascade (a bare `i` or
// `*`, or one ending in `i` or `*` under .masthead or .fixture), sets box-shadow, filter, backdrop-filter,
// text-shadow, outline or border; the shadow tokens of the earlier stamps are gone. The blue block too.
test("no shadow on the stamped line: no box-shadow, filter, text-shadow, outline or border reaches its bars", () => {
  const css = read("app/globals.css");
  const SHADOWY = /(^|;|\{)\s*(box-shadow|filter|-webkit-filter|backdrop-filter|-webkit-backdrop-filter|text-shadow|outline|border(-(top|bottom|left|right))?)\s*:/;
  const offenders = [];
  for (const m of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(",").map((x) => x.trim()).filter(Boolean);
    const reaches = selectors.some((sel) => {
      if (/mhstamp/.test(sel)) return true;
      const parts = sel.split(/\s+|>/).filter(Boolean);
      const last = parts[parts.length - 1];
      if (!/^(i|\*)(:[\w-]+(\([^)]*\))?)*$/.test(last)) return false;
      const ancestors = parts.slice(0, -1).join(" ");
      return ancestors === "" || /^(:root|html|body|\[data-theme[^\]]*\]|:root\S*|\s)*(\.masthead|\.fixture)?\S*$/.test(ancestors) && (ancestors === "" || /\.masthead|\.fixture/.test(ancestors) || !/\./.test(ancestors));
    });
    if (reaches && SHADOWY.test("{" + m[2])) offenders.push(m[1].trim() + " { " + m[2].trim().slice(0, 80) + " }");
  }
  assert.deepEqual(offenders, [], "nothing shades the stamped line");
  assert.ok(!/--stamp-sink|--stamp-catch|--stamp-edge/.test(css), "the shadow and hairline tokens are gone");
  assert.match(rules, /\.mhstamp i \{[^}]*background: var\(--stamp-recess\);\s*\}/, "a tone and nothing else");
  assert.match(rules, /\.mhstamp i\.lit \{ width: 200%; background: var\(--stamp-blue\); \}/, "the blue block: a flat blue, no shadow");
});
