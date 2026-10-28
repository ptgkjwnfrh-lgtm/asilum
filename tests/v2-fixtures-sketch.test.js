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
  assert.match(glass, /drawRefractionMap\(mapRef\.current,[^\n]*, lensFeatures\(el\), bezel === "fixture" \? fixtureBezel\(\) : bezel, xRef\.current, yRef\.current, mapScale\(w, h\),/, "the map is drawn with the carvings, as two greys, at the screen's own pixels and its own (layout) size");
  // the grill sits centred under the POST disc: 40 + 123 + 127 + 162 / 2 = 371, stretched with the deck
  const g = rules.match(/\.ccgrill \{[^}]*left: calc\(var\(--u\) \* \(371 \* var\(--dk-sx\) - ([\d.]+)\)\); width: calc\(var\(--u\) \* ([\d.]+)\)/s);
  assert.ok(g, "the grill is placed in sketch units");
  assert.equal(Number(g[1]) * 2, Number(g[2]), "the grill is centred on the disc");
  // (25 Oct 2026, last) the ad ticker is back on the deck as a bubble, beneath the keys and above the vent
  assert.match(deck, /<div className="ccad"><AdStrip typing=\{inSearch\} \/><\/div>/, "the ad bubble on the deck");
  assert.ok(deck.indexOf('className="ccad"') > deck.indexOf('className="ccrow"'), "the bubble comes after the row of keys");
  // (28 Oct 2026) the ticker wraps the whole deck: the bubble has no side padding (tests/v2-ticker.test.js)
  const ad = rules.match(/\.ccad \{[^}]*padding: 0 0 calc\(var\(--u\) \* (\d+)\)/);
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
  assert.match(rules, /\.mhkeys \{[^}]*height: calc\(var\(--u\) \* 88 \* var\(--mk, 1\)\);/, "the keys in the sketch's 88-unit row (10% bigger since 28 Oct 2026, --mk)");
  assert.match(rules, /\.idkey \{[^}]*width: calc\(var\(--u\) \* 97 \* var\(--mk, 1\)\);/s, "three keys of the drawn 292");
  assert.match(rules, /\.passportbtn \{[^}]*width: calc\(var\(--u\) \* 97 \* var\(--mk, 1\)\);/s, "the globe a key of the same width");
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
  // (28 Oct 2026) or "full", the wheel's: the whole half, so its bend runs in to the plus
  assert.match(glass, /const bez = bezel === "full" \? Math\.max\(6, Math\.min\(w, h\) \/ 2\)\n\s*: Math\.max\(6, Math\.min\(BEZEL, Math\.min\(w, h\) \/ 2, bezel \? \(bezel < 1 \? Math\.min\(w, h\) \* bezel : bezel\) : Infinity\)\);/, "56px at most, never past the middle, and as thin as the pane asks (a fraction, or px)");
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
  assert.match(rules, /\.brandfix \{\n  position: relative; z-index: 2; flex: none; align-self: flex-start;/, "in the Masthead's row, over its line");
  // (28 Oct 2026, the new logo: "the same placement as the old logo", then "more in the corner") its capitals
  // as tall as the old ones (rows 11–139 of 200), lifted so its bar sits over the line (the next test)
  assert.match(rules, /--wm-u: calc\(var\(--wm-w\) \* 129 \/ 900 \/ 120\.75\);/);
  assert.match(rules, /--wm-w: clamp\(107\.25px, 28\.875vw, 151\.25px\);/, "the old logo's measure");
  const wm = read("app/components/Wordmark.jsx");
  assert.match(wm, /<span className="wmword idlabel"><i>\*<\/i><span className="wmcaps">ASILUM<\/span><\/span>/, "the name, for assistive technology");
  assert.ok(!/CHEVRON_CHANCE|wmchev|wmsq|wmblk|wmimg/.test(wm), "the chevron run, the block bar and the masked picture are retired");
  // no red glows anywhere (owner, 19 Oct 2026) — the asterisk's glow is the bar's white (28 Oct)
  assert.ok(!/text-shadow: 0 0 \d+px color-mix\(in srgb, var\(--warn\)/.test(rules), "no red text glows");
  assert.ok(!/box-shadow: 0 0 \d+px var\(--warn\)/.test(rules), "no red light glows");
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
    // (28 Oct 2026) each pass bends the pre-filtered backdrop (LENS_PREFILTER), so a squeeze averages
    assert.match(defs, new RegExp(`<feDisplacementMap data-lens="1" in="src" in2="lgmap" scale=\\{${sc}\\} xChannelSelector="R" yChannelSelector="G" result="bent${c}" />`), "the " + c + " pass");
  }
  assert.match(defs, /in="bentR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chR"/, "each colour kept alone");
  assert.match(defs, /in="chRG" in2="chB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lens"/, "summed");
  assert.match(defs, /<feComposite in="lensW" in2="frostW" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" \/>/, "blended into the clear middle by the weight");
  const chain = rg.slice(rg.indexOf("function v1Chain"), rg.indexOf("export const V1_RAINBOW"));
  assert.equal([...chain.matchAll(/<feDisplacementMap data-pb="1" in="src" in2="map" scale="\$\{s[rgb]\}"/g)].length, 3, "Safari: the same three pulls, in the pane's square");
  assert.match(chain, /`<feComposite in="lens" in2="SourceGraphic" operator="over"\/>`/, "outside the wheel a card is untouched");
  // the wheel's alone
  const sw = read("app/components/ScrollWheel.jsx");
  assert.match(sw, /dispersion: V1_RAINBOW, bezel: "full" \}\);/, "the wheel passes it, over its whole face");
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
  // (28 Oct 2026) it moves by transform alone: its box always rests where the plus is carried, and closed it is carried down by --eject
  assert.match(rules, /\.ccwheel \{\n  position: absolute; z-index: 1; left: 50%; top: calc\(var\(--cy\) - var\(--eject\)\);/, "the wheel centred where the plus is carried");
  assert.match(rules, /\.ccwheel \{\n  position: absolute; z-index: 1; left: 50%; top: calc\(var\(--cy\) - var\(--eject\)\);[^}]*transform: translate\(-50%, -50%\) translateY\(var\(--eject\)\) scale\(0\.2\);/, "on its centre; closed, carried down to the slot by transform");
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
  assert.match(sw, /export const SPOKES = Object\.freeze\(\{ hub: 0\.2, n: 2, reach: 0\.95, sharp: 0\.5 \}\);/, "the spokes start at the plus's rim (28 Oct 2026)");
  assert.deepEqual(files.filter((f) => /data-lens-shape="spokes"/.test(read(f))), ["app/components/ScrollWheel.jsx"], "the wheel's alone");
  assert.match(rules, /\.ccwspokes \{ position: absolute; inset: 0; border-radius: 50%; pointer-events: none; \}/, "a shape that paints nothing");
  // the slot is empty
  assert.ok(!existsSync(new URL("../app/components/ClearDisc.jsx", import.meta.url)), "no Clear Disc");
  assert.ok(!/cdlens|ClearDisc|--cd-turn/.test(rules + read("app/components/ControlCenter.jsx")), "no CD styling");
});

// THE NEW LOGO AND ITS LINE (owner, 28 Oct 2026: "new logo, the asterisk should be in helvetica regular
// size font size 131 and "ASILUM" is in michroma regular size in font size 161 and tracking 5% with -15
// kerning. the thick solid oblong white line should glow a stark white however the solid black text
// should not, the asterisk and the solid white line should have the same glow, the broken line that
// stretches across the masthead should be replaced by a solid thin white glowing line. the new logo
// should have the same placement as the old logo"; "all the text information is from procreate").
// Declared before measuring:
//   - the logo is type, not a picture: the word Michroma at 161, the asterisk Helvetica at 131, in one
//     unit system; the old picture and its masks are gone and nothing names them;
//   - it is the owner's artwork (docs/brand/asilum-logo-2026-10-28.jpg), measured there: every letter's
//     inked left edge, the bar's ends and depth, and the asterisk's box within 2px of the artwork's
//     2000 (Michroma's side bearings at 161, measured in Chromium, carry an origin to its ink), and the
//     letters evenly spaced — one spacing between every pair, as Procreate's tracking sets it;
//   - the asterisk's top on the capitals' line; the bar's top on the baseline;
//   - ONE glow in two colours (then: "the asterisk must glow red"): the bar and the Masthead's line wear
//     the white --wm-glow, the asterisk the red --wm-glow-r, radius for radius and strength for strength;
//     nothing else wears either; the word wears no filter and no shadow;
//   - (then: "the line … should reach to the end of the hit box of the passport button. also the line
//     should sit under the thick logo line … the logo should stay the same size but [more in the corner]
//     … the info dock and passport buttons should be about 10% bigger, also the stretched mast head line
//     should break at the gap points of the buttons and there should be faint lines in between the
//     buttons like on the center fixture") the line is white, thin, in the white glow, under the bar
//     (the logo lifted so its bar's foot is the stamp gap above the line) and just under the bigger
//     glyphs; laid from the logo's left edge along every key showing to the globe's hit box, broken at
//     the meetings (lib/mastline.js, the next test); the cuts the deck's hairline, 65 units, centred on
//     the keys' row; the keys 10% bigger, the logo the same size;
//   - the Masthead's children are the wordmark, the line, its cuts and the keys; the stamped line is
//     gone (no .mhstamp, no STAMP, no --stamp-blue).
test("the new logo: type set from the owner's artwork, one glow — red on the asterisk, white on the bar and the Masthead's line, broken at the keys", async () => {
  const css = read("app/globals.css");
  const wm = read("app/components/Wordmark.jsx");
  // type, in one unit system
  assert.match(wm, /word: 161, star: 131, cap: 120\.75, base: 121,/);
  assert.match(rules, /\.wmink \{ font: 400 161px var\(--mich\); fill: var\(--wm-ink\); \}/, "Michroma 161");
  assert.match(rules, /\.wmstar \{ font: 400 131px var\(--helvetica\); fill: var\(--wm-star\); \}/, "Helvetica 131");
  assert.match(css, /--helvetica: Helvetica, "Helvetica Neue", Arial, sans-serif;/, "Helvetica first: its asterisk is the artwork's");
  assert.match(wm, /<text className="wmink" x=\{WM\.x\.join\(" "\)\} y=\{WM\.base\}>ASILUM<\/text>/, "each letter at its own origin");
  assert.match(wm, /<text className="wmstar" x="0" y=\{WM\.starY\}>\*<\/text>/);
  assert.match(wm, /<rect className="wmbar" x=\{WM\.bar\.x\} y=\{WM\.base\} width=\{WM\.bar\.w\} height=\{WM\.bar\.h\} \/>/, "the bar's top on the baseline");
  for (const f of ["logo.jpg", "logo-word-ink.png", "logo-star.png", "logo-word-light.png", "logo-ink.png", "logo-light.png"]) assert.ok(!existsSync("public/model/" + f), f + " is gone");
  assert.ok(!/logo[\w-]*\.(png|jpg)|wmimg|--wm-mask|--metal/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "nothing in the styles names the picture");
  // the owner's artwork, measured
  const nums = (re) => wm.match(re)[1].split(",").map(Number);
  const X = nums(/x: Object\.freeze\(\[([^\]]*)\]\)/);
  const bar = wm.match(/bar: Object\.freeze\(\{ x: ([\d.]+), w: ([\d.]+), h: ([\d.]+) \}\)/).slice(1).map(Number);
  const starY = Number(wm.match(/starY: ([\d.]+),/)[1]);
  const ADV = [171.06, 168.39, 45.28, 130.81, 166.66]; // A S I L U advances at 161 (Chromium, 28 Oct 2026)
  const LSB = [5.03, 10.46, 15.09, 15.09, 10.69, 15.41]; // A S I L U M left side bearings at 161
  const gaps = X.slice(1).map((x, i) => x - X[i] - ADV[i]);
  for (const g of gaps) assert.ok(Math.abs(g - -15.5) <= 0.8, "one spacing between every pair: " + gaps.map((v) => v.toFixed(2)));
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(new URL("../docs/brand/asilum-logo-2026-10-28.jpg", import.meta.url).pathname).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, C = info.channels, p = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
  const dark = (q) => q[0] + q[1] + q[2] < 150, white = (q) => Math.min(...q) > 240, red = (q) => q[0] > 180 && q[1] < 90 && q[2] < 90;
  const inkCols = []; for (let x = 0; x < W; x++) for (let y = 690; y < 915; y++) if (dark(p(x, y))) { inkCols.push(x); break; }
  const lefts = inkCols.filter((x, i) => i === 0 || inkCols[i - 1] !== x - 1);
  assert.equal(lefts.length, 6, "six letters in the artwork");
  let capTop = 0; for (let y = 600; y < 915 && !capTop; y++) if (dark(p(743, y))) capTop = y; // the I's top
  const k = (916 - capTop) / 120.75; // artwork pixels per unit: the capitals' 120.75
  const ox = lefts[0] - LSB[0] * k; // the A's origin
  X.forEach((x, i) => assert.ok(Math.abs(ox + (x + LSB[i]) * k - lefts[i]) <= 2, "ASILUM"[i] + " where the artwork has it: " + (ox + (x + LSB[i]) * k).toFixed(1) + " vs " + lefts[i]));
  let wb = [W, 0, info.height, 0]; for (let y = 880; y < 1100; y++) for (let x = 0; x < W; x++) if (white(p(x, y))) wb = [Math.min(wb[0], x), Math.max(wb[1], x), Math.min(wb[2], y), Math.max(wb[3], y)];
  assert.ok(Math.abs(ox + bar[0] * k - wb[0]) <= 2 && Math.abs(ox + (bar[0] + bar[1]) * k - (wb[1] + 1)) <= 2, "the bar's ends");
  assert.ok(Math.abs(916 - wb[2]) <= 1 && Math.abs(bar[2] * k - (wb[3] + 1 - wb[2])) <= 2, "flush under the baseline, as deep as drawn");
  let rb = [W, 0, info.height, 0]; for (let y = 600; y < 900; y++) for (let x = 100; x < 400; x++) if (red(p(x, y))) rb = [Math.min(rb[0], x), Math.max(rb[1], x), Math.min(rb[2], y), Math.max(rb[3], y)];
  assert.ok(Math.abs(rb[0] - lefts[0]) <= 2, "the asterisk's left edge on the A's");
  assert.ok(Math.abs(rb[2] - capTop) <= 2, "its top on the capitals' line");
  assert.ok(Math.abs(starY - 0.717 * 131 - (121 - 120.75)) <= 1, "Helvetica's asterisk (0.717em tall above its baseline) set so");
  // one glow, in two colours (then: "the asterisk must glow red"): the bar's white and the asterisk's red,
  // the same radii and the same strengths
  const glow = css.match(/--wm-glow: ([^;]+);/)[1], glowR = css.match(/--wm-glow-r: ([^;]+);/)[1];
  assert.match(glow, /^drop-shadow\(0 0 [\d.]+px #ffffff\)( drop-shadow\(0 0 [\d.]+px rgba\(255, 255, 255, [\d.]+\)\))+$/, "white, stark");
  // each drop-shadow as [radius, strength]: a bare colour is full strength, an rgba its alpha, a mix its share
  const shape = (g) => g.split("drop-shadow(0 0 ").slice(1).map((t) => [parseFloat(t), (t.match(/(\d+)%/) || [])[1] ? Number(t.match(/(\d+)%/)[1]) / 100 : (t.match(/rgba\([^)]*, ([\d.]+)\)/) || [])[1] ? Number(t.match(/rgba\([^)]*, ([\d.]+)\)/)[1]) : 1]);
  assert.equal(shape(glow).length, 3);
  assert.deepEqual(shape(glowR), shape(glow), "the red glow is the white one's, radius for radius, strength for strength");
  assert.ok(/var\(--warn\)/.test(glowR) && !/#fff|255, 255, 255/.test(glowR), "in the asterisk's own red");
  const wearing = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /var\(--wm-glow(-r)?\)/.test(m[2])).map((m) => m[1].trim() + " " + m[2].match(/var\(--wm-glow(-r)?\)/)[0]).sort();
  assert.deepEqual(wearing, [".mhline var(--wm-glow)", ".wmlitbar var(--wm-glow)", ".wmlitstar var(--wm-glow-r)"], "the asterisk red, the bar and the line white, nothing else");
  assert.match(wm, /<svg className="wmlit wmlitstar" viewBox=\{VIEW\} focusable="false">\s*<text className="wmstar"/, "the asterisk on its own layer");
  assert.match(wm, /<svg className="wmlit wmlitbar" viewBox=\{VIEW\} focusable="false">\s*<rect className="wmbar"/, "the bar on its own");
  assert.ok(!/\.(wmink|wmtype|wmart|wordmark|brandfix)\b[^{,]*\{[^}]*(filter|text-shadow|box-shadow)/.test(rules), "the word does not glow");
  assert.match(css, /--wm-bar: #ffffff;/);
  // the line
  const mast = read("app/components/Masthead.jsx");
  const body = mast.slice(mast.indexOf('<header ref={glassRef} className="masthead fixture">'), mast.indexOf("</header>"));
  const kids = [...body.matchAll(/\n {6}<(\w+)(?: className=(?:"([^"]+)"|\{"(\w+)"))?/g)].map((m) => m[2] || m[3] || m[1]);
  assert.deepEqual(kids, ["brandfix", "mhline", "mhcuts", "mhkeys"], "the Masthead: the wordmark, the line, its cuts, the keys");
  assert.match(mast, /const next = mastLine\(mark \? mark\.getBoundingClientRect\(\)\.left - o : NaN, keys\);/, "from the logo's left edge, along the keys");
  assert.match(mast, /\[\.\.\.row\.querySelectorAll\("\.idkey, \.passportbtn"\)\]\.filter\(\(k\) => k\.offsetWidth > 0\)\.map\(box\)/, "every key showing, the globe's hit box the last");
  const line = rules.match(/\.mhline \{([^}]*)\}/)[1];
  assert.match(line, /top: calc\(env\(safe-area-inset-top, 0px\) \+ var\(--mh-line-top\)\); height: var\(--mh-line-h\);/, "thin, just under the glyphs");
  assert.match(line, /filter: var\(--wm-glow\);/, "in the logo's glow");
  assert.match(rules, /\.mhline i \{[^}]*background: var\(--wm-bar\);[^}]*left: calc\(var\(--a\) \+ var\(--gl\) \* var\(--mh-break\) \/ 2\);\s*width: calc\(var\(--b\) - var\(--a\) - \(var\(--gl\) \+ var\(--gr\)\) \* var\(--mh-break\) \/ 2\);/s, "white stretches, broken by half a break each side");
  assert.match(rules, /\.brandfix \{[^}]*margin-top: calc\(var\(--mh-line-top\) - var\(--mh-gap\) - var\(--wm-u\) \* 203\.6\);/s, "the bar's foot the stamp gap above the line: the line under the bar");
  assert.equal(121 + bar[2], 203.6, "203.6 is the bar's foot");
  // the cuts: the deck's hairline, between keys, centred on the keys' row
  const cut = rules.match(/\.mhcuts i \{([^}]*)\}/)[1];
  const deckCut = rules.match(/\.cccut \{([^}]*)\}/)[1];
  assert.equal(cut.match(/background: ([^;]+);/)[1], deckCut.match(/background: ([^;]+);/)[1], "the deck's own hairline colour");
  assert.match(cut, /width: 1px; transform: translateX\(-50%\);/);
  assert.match(cut, /top: calc\(env\(safe-area-inset-top, 0px\) \+ 33px - var\(--u\) \* 65 \/ 2\); height: calc\(var\(--u\) \* 65\);/, "as long as the deck's (65 units), on the row's middle");
  assert.match(rules, /--mh-line-h: max\(1\.5px, calc\(var\(--wm-w\) \* 12 \/ 900\)\);/, "2px on a desktop, 1.5 on a phone");
  assert.ok(!/mhstamp|--stamp-blue/.test(css) && !/STAMP/.test(mast), "the stamped line is gone");
  // the keys 10% bigger ("the info dock and passport buttons should be about 10% bigger"), the logo not
  assert.match(rules, /--mk: 1\.1;/);
  for (const sel of ["\\.mhkeys \\{[^}]*height: calc\\(var\\(--u\\) \\* 88 \\* var\\(--mk, 1\\)\\)", "\\.idkey \\{[^}]*width: calc\\(var\\(--u\\) \\* 97 \\* var\\(--mk, 1\\)\\)", "\\.passportbtn \\{[^}]*width: calc\\(var\\(--u\\) \\* 97 \\* var\\(--mk, 1\\)\\)", "\\.idkey \\.ic \\{ width: calc\\(var\\(--u\\) \\* 50 \\* var\\(--mk, 1\\)\\)", "\\.passportbtn \\.ic \\{ width: calc\\(var\\(--u\\) \\* 50 \\* var\\(--mk, 1\\)\\)"]) assert.match(rules, new RegExp(sel, "s"), sel);
  assert.match(rules, /--mh-line-top: calc\(33px \+ max\(var\(--u\) \* 25 \* var\(--mk\), 9\.5px \* var\(--mk\)\) \+ 2\.5px\);/, "the line still just under the (bigger) glyphs");
  assert.match(rules, /--wm-w: clamp\(107\.25px, 28\.875vw, 151\.25px\);/, "the logo the same size");
});

// THE LINE'S STRETCHES (lib/mastline.js). Declared before measuring: one stretch from the logo to the
// first key, one under each key; a break (half each side) wherever two stretches meet and nowhere else —
// never at the logo's left edge, never at the globe's right edge, which the line reaches exactly; a cut
// at each meeting of two keys and only there; keys out of order or empty are handled; no keys, no line.
test("the Masthead's line: a stretch under the logo and one under each key, broken where they meet, a cut between keys", async () => {
  const { mastLine, sameLine } = await import("../lib/mastline.js");
  const keys = [{ left: 272, right: 315 }, { left: 186, right: 229 }, { left: 229, right: 272 }, { left: 315, right: 358 }];
  const { segs, cuts } = mastLine(17, keys);
  assert.deepEqual(segs.map((g) => [g.a, g.b, g.gl, g.gr]), [[17, 186, 0, 1], [186, 229, 1, 1], [229, 272, 1, 1], [272, 315, 1, 1], [315, 358, 1, 0]]);
  assert.deepEqual(cuts, [229, 272, 315], "between keys only: none before the first, none after the globe");
  assert.equal(segs[segs.length - 1].b, 358, "to the end of the globe's hit box");
  assert.equal(segs[0].a, 17, "from the logo's left edge");
  assert.deepEqual(mastLine(17, []), { segs: [], cuts: [] }, "no keys, no line");
  assert.deepEqual(mastLine(NaN, keys), { segs: [], cuts: [] }, "no logo, no line");
  assert.deepEqual(mastLine(17, [{ left: 200, right: 200 }, null, { left: 186, right: 229 }]).segs.length, 2, "an empty key draws nothing");
  assert.ok(sameLine(mastLine(17, keys), mastLine(17.2, keys)) && !sameLine(mastLine(17, keys), mastLine(20, keys)), "re-laid only when it moves");
});
