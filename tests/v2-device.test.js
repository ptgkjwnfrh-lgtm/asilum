// tests/v2-device.test.js — THE DEVICE (owner, 18 Oct 2026, evening;
// CONSTITUTION A6 third addendum): the louder rainbow glass, the original
// gradients and the dark phosphor glow, the ">>>>>>" load-in, the warning
// lights, the piece floating over the fogged Feed, the passport (the original
// of 18 Oct, in the Tron language since 31 Oct 2026).
// Pure where it can be; source reads where the markup is the law.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockFrame, BLOCK_RUN } from "../lib/feed/blocks.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const css = read("app/globals.css");
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
const block = (name) => { const i = css.indexOf(name); return css.slice(i, css.indexOf("\n}", i)); };

test("the block frame (owner, 25 Oct 2026: blocks, not chevrons): the text arrives behind a six-block run and never changes length", () => {
  assert.equal(BLOCK_RUN, 6);
  const t = "silly little vid promoting my new song";
  for (let n = -BLOCK_RUN; n <= t.length + 2; n++) {
    const f = blockFrame(t, n);
    assert.equal(f.shown + f.run + f.rest, t, "nothing reflows at n=" + n + ": the run is the text itself, drawn as blocks");
    assert.ok(f.run.length <= BLOCK_RUN);
    assert.equal(f.shown + t.slice(f.shown.length), t, "what is shown is the start of the text");
  }
  assert.deepEqual(blockFrame("abcdefghij", 2), { shown: "ab", run: "cdefgh", rest: "ij" });
  assert.deepEqual(blockFrame("abc", 0), { shown: "", run: "abc", rest: "" }, "a short text: the run never passes the end");
  assert.deepEqual(blockFrame("abc", 99), { shown: "abc", run: "", rest: "" });
  assert.deepEqual(blockFrame(null, 3), { shown: "", run: "", rest: "" });
});

test("expanding a compacted description loads it in behind blocks: the caption, the event, the place, the overview, behind the product", () => {
  const ch = strip(read("app/components/Blocks.jsx"));
  assert.match(ch, /prefers-reduced-motion: reduce/, "reduced motion: the text is simply there");
  assert.match(ch, /aria-label=\{t\}/, "the full text is the accessible name from the first frame");
  assert.match(strip(read("app/components/PostCard.jsx")), /<BlockText as="p" className="p2text" text=\{text\} play=\{more\} \/>/, "a tapped caption (IMG_1143 Fig. 7: unfolded from its chevrons)");
  assert.match(strip(read("app/components/PostCard.jsx")), /<BlockText className="fine" text=\{\[String\(event\.kind/, "an opened BRDCST event");
  assert.match(strip(read("app/components/MapSheet.jsx")), /<BlockText as="p" text=\{place\.organizer\} \/>/, "the place's description");
  assert.match(strip(read("app/components/PersonOverview.jsx")), /<BlockText as="p" className="povsum" text=\{person\.summary\} \/>/, "Read more → the overview");
  assert.match(strip(read("app/components/ListingSheet.jsx")), /<BlockText className="cclbl" text=\{"BEHIND THE PRODUCT"/, "behind the product");
  assert.match(strip(read("app/components/MediaFloat.jsx")), /\{up \? <BlockText as="p" className="mftext"/, "the floating media's caption, raised");
  assert.match(rules, /\.blktext \.blkrun \{ color: transparent;[^}]*repeating-linear-gradient\(90deg, var\(--blk\)/, "the run is drawn as even blocks (Ref 1), in the ink");
  assert.match(rules, /\.blktext \.blkrest \{ color: transparent; \}/, "the not-yet text keeps its place");
  // the folded caption: a block the length of each word (Ref 2)
  assert.match(strip(read("app/components/PostCard.jsx")), /<BlockLine className="p2fold-line" text=\{text\} \/>/);
  assert.match(rules, /\.blkline \.blkw \{[^}]*color: transparent; background: var\(--blk\);/);
  assert.ok(!/>>>>/.test(read("app/components/Blocks.jsx")) && !/>>>>/.test(read("app/components/PostCard.jsx")), "no chevrons stand in for text any more");
});

test("the warning lights: square, dark at rest, blinking like an eject light on a purchase, a bag or an offer, then dark; the deck's pair is gone", () => {
  const listing = strip(read("app/components/ListingSheet.jsx"));
  for (const where of [/onClick=\{\(e\) => \{ blinkLamp\(e\); toBag\(\); \}\}[^\n]*<Lamp \/>/, /<button type="submit" className="buy" onClick=\{blinkLamp\}><Lamp \/>send ✓/, /onClick=\{async \(e\) => \{ blinkLamp\(e\); setBuying\(true\);/, /blinkLamp\(e\); setTimeout\(\(\) => setTicket\(true\), 420\);[^\n]*<Lamp \/>request purchase/]) {
    assert.match(listing, where);
  }
  // (28 Oct 2026: "get rid of those two red squares") the ticker's pair is gone, and nothing calls to it
  const deck = strip(read("app/components/AdStrip.jsx"));
  assert.ok(!/devlights|<Lamp|blinkLamp/.test(deck), "no lights on the ticker");
  assert.ok(!/devlights/.test(rules) && !/asilum:lamp/.test(read("app/components/Blocks.jsx")), "no rule and no event left for them");
  assert.match(rules, /\.lamp \{[^}]*width: 7px; height: 7px;[^}]*background: color-mix\(in srgb, var\(--warn\) 22%, transparent\)/s, "square, dark at rest");
  assert.match(rules, /\.lamp\[data-blink="eject"\] \{ animation: ejectlight 1\.8s steps\(1, end\) forwards; \}/, "it blinks and stays dark at the end");
  assert.match(rules, /@keyframes ejectlight \{[^}]*0%, 20%, 40%, 60% \{[^}]*\}\s*10%, 30%, 50%, 70%, 100% \{/s);
  assert.match(rules, /prefers-reduced-motion: reduce\) \{ \.lamp\[data-blink\] \{ animation: ejectonce/, "reduced motion: one soft light, no blinking");
  assert.match(block(":root {"), /--shade/);
  assert.match(rules, /:root \{ --warn: #ff4136;/, "the lights are red in dark too");
});

test("a double tap floats the piece over the fogged Feed, reactive to movement; one tap still opens the listing", () => {
  const page = strip(read("app/page.js"));
  assert.match(page, /const DOUBLE_TAP_MS = 280;/);
  assert.match(page, /if \(onFloat && now - tap\.current\.at < DOUBLE_TAP_MS\) \{\s*clearTimeout\(tap\.current\.timer\);/, "the second tap cancels the pending open");
  assert.match(page, /setTimeout\(\(\) => \{ tap\.current\.at = 0; onOpen\(\); \}, onFloat \? DOUBLE_TAP_MS : 0\)/, "one tap opens the listing a beat later");
  assert.match(page, /createPortal\(<PieceFloat item=\{floatItem\}/);
  const float = strip(read("app/components/PieceFloat.jsx"));
  assert.match(float, /useTilt\(cardRef, null, true\);/, "it turns with the phone or the cursor");
  assert.match(float, /useLiquidGlass\(cardRef, \{ id: "lg-piecefloat"/, "the card is the rainbow glass");
  assert.match(float, /className="pfloatfog"/);
  assert.match(float, /openSheet\("listing", \{ item, title: "LISTING" \}\)/, "OPEN LISTING hands over to the one hub");
  assert.match(rules, /\.pfloatfog \{[^}]*background: var\(--fog\);[^}]*backdrop-filter: blur\(9px\)/s, "the Feed behind is fogged, still there, not black");
  assert.match(rules, /\.float \{[^}]*background: var\(--fog\);/s, "the photograph float wears the same fog");
  assert.match(strip(read("app/components/FloatView.jsx")), /export function useTilt\(cardRef, haloRef = null, tilt = true\)/);
});

test("the popup's film; the fixtures are the September glass (19 Oct): one pull for every colour (26 Oct), no drifting film", () => {
  const lg = strip(read("app/components/LiquidGlass.jsx"));
  // (26 Oct 2026, "the odd red bezel line") the 80 / 86 / 92 split and the popup's prism are gone: every colour bends alike
  assert.match(lg, /export const PULL = 86;\n[^]*const pull = \(PULL \* strength\)\.toFixed\(1\);/, "one pull for every colour (26 Oct 2026: \"take away the rainbow\"), scaled by the pane's strength");
  for (const f of ["app/components/SheetHost.jsx", "app/components/PieceFloat.jsx", "app/components/InfoDock.jsx", "app/components/PassportButton.jsx", "app/components/ControlCenter.jsx"]) {
    assert.ok(!/prism/.test(read(f)), f + " passes no prism");
  }
  // (30 Oct 2026) the drift's keyframes and property went with the junk sweep: nothing animated them
  assert.ok(!/irisdrift|--iris-drift/.test(rules), "the fixtures carry no drifting film");
  assert.match(rules, /conic-gradient\(from calc\(var\(--iris-a, 200deg\) \* -1\)/, "the popup's film turns against the rim");
  assert.match(rules, /prefers-reduced-motion: reduce\) \{\n  \.fixture, \.ccenter \{ transition: none; \}/, "reduced motion: the fixtures' lamps stop gliding");
});

test("the original ground and the dark phosphor glow: blue to white, green to black; dark words glow in their own colour; light never", () => {
  // (25 Oct, evening: "too white") the ice blue the whole way down, never to white
  assert.match(block('[data-theme="light"] {'), /linear-gradient\(180deg, #27465e 0%, #d7e8f4 24%, #e9f2f8 50%, #d7e8f4 76%, #27465e 100%\)/, "a dark blue from the top and the bottom, the ice blue between (owner, late)");
  // (19 Oct 2026, "make the background more black") a breath of green at the top, black almost at once
  assert.match(block(":root {"), /linear-gradient\(180deg, #0b0d0e 0%, #060708 30%, #020303 62%, #000000 100%\)/, "grey to black (no green since 29 Oct), blacker");
  assert.match(block(":root {"), /--glow: 0 0 1px currentColor, 0 0 9px color-mix\(in srgb, currentColor 55%, transparent\)/);
  assert.ok(!/--glow-ink/.test(rules), "body text never glows: there is no ink glow to reach for");
  assert.match(block('[data-theme="light"] {'), /--glow: none;/, "light never glows");
  // (29 Oct 2026, "glowing white nomore green") the dark headline is chrome washed to white, in a white halo
  assert.match(rules, /:root:not\(\[data-theme="light"\]\) \.headline \{ background: linear-gradient\(180deg, #ffffff 0%, #f1f6f8 42%, #dbe5ea 100%\);[^}]*drop-shadow\(0 0 10px rgba\(255, 255, 255, 0\.34\)\)/, "white, glowing white");
});

test("the passport in the Tron language (owner, 31 Oct 2026): the original's pluses, 01 and print lines kept; the name cut out of the logo's plate; a four-line machine zone at the foot; no hairline on the document", () => {
  const sec = strip(read("app/components/PassportSecurity.jsx"));
  assert.match(sec, /function Plus\(\{ x, y, s = 5, tone = "s" \}\)/);
  assert.match(sec, /<Plus key=\{i\}/);
  assert.match(sec, /<span className="ppvpage">01<\/span>/);
  assert.match(sec, /<MrzLine text=\{MICROPRINT\.repeat\(16\)\} width=\{0\} \/>/, "the microprint is a machine-readable line");
  const board = strip(read("app/board/page.js"));
  assert.ok(board.indexOf("<PassportSecurity") < board.indexOf('<div className="ppmrz">'), "the MRZ sits at the foot, under the hologram window");
  assert.match(board, /<PassportPlate \/>/, "the name is the plate (PassportPlate.jsx), not a line of type");
  assert.ok(!/<div className="ppnation">/.test(board), "no nation line of type left on the document");
  assert.match(board, /\{mrz\.map\(\(line, i\) => <MrzLine key=\{i\} text=\{line\} cursor=\{i === mrz\.length - 1\} \/>\)\}/, "every line of the zone through MrzLine, the cursor on the last");
  const plate = strip(read("app/components/PassportPlate.jsx"));
  assert.match(plate, /<mask id=\{cut\}/);
  assert.match(plate, /<rect className="ppplatebar" width=\{W\} height=\{H\} rx="9" mask=\{`url\(#\$\{cut\}\)`\} \/>/, "the plate drawn through the mask: the letters are holes");
  assert.match(plate, /ASILUM <tspan className=\{star\}>\*<\/tspan> FASHION PASSPORT/, "no magazine");
  assert.match(rules, /\.ppcut \{ fill: #000; \}/, "the letters cut");
  assert.match(rules, /\.ppcutstar \{ fill: #fff; \}/, "the asterisk not cut");
  assert.match(rules, /\.ppplatebar \{ fill: var\(--wm-bar\); \}/, "the logo's plate");
  assert.match(rules, /\.ppplatestar \{ fill: var\(--wm-star\); \}/, "the logo's asterisk");
  assert.match(rules, /\.ppplateglow \{ filter: var\(--wm-glow\); \}/, "the logo's glow");
  assert.match(rules, /\[data-theme="light"\] \.ppdoc \{ --sig: #0b7584; \}/, "the document's own teal");
  assert.match(rules, /:root:not\(\[data-theme="light"\]\) \.ppdoc \{ --sig: #f4f9fc; \}/, "white in dark (no green since 29 Oct)");
  assert.match(rules, /\.pv-r \{ stroke: var\(--red\); opacity: 0\.75; \}/, "the pluses keep their tones");
  assert.match(rules, /\.ppphoto::after \{ background:[^}]*repeating-linear-gradient\(0deg, transparent 0 2px,/s, "the photo slot's print lines");
  // no hairline anywhere on the document (the UI law's "no lines"): no border on the frame, the bands, the photo,
  // the microprint or the machine zone, and no dashed rule over the zone
  for (const sel of [".ppdoc", ".ppsec", ".ppnation", ".ppphoto", ".ppmicro", ".ppmrz", ".ppdoc .ppmrz"]) {
    const rule = rules.match(new RegExp("\\n" + sel.replace(/[.]/g, "\\.") + " \\{([^}]*)\\}"));
    assert.ok(rule, sel + " is styled");
    assert.ok(!/border(-top|-bottom)?:\s*1px/.test(rule[1]), sel + " carries no hairline: " + rule[1].trim().slice(0, 80));
  }
  assert.ok(!/dashed var\(--line\);[^}]*font-family: var\(--mono\)/.test(rules), "the dashed rule over the machine zone is gone");
  assert.ok(!/\.ppsec::after/.test(rules) && !/\.ppsec \{[^}]*background-image/.test(rules), "the strip's iridescent sweep and tiled pluses are gone");
  // the device's line: mono, one line, the data in the document's colour glowing, the filler unlit, the cursor
  // still under reduced motion
  assert.match(rules, /\.mrzline \{ display: block; white-space: nowrap; overflow: hidden; font-family: var\(--mono\); \}/);
  assert.match(rules, /\.mrzline b \{ font-weight: 400; color: var\(--sig\); text-shadow: var\(--glow\); \}/);
  assert.match(rules, /\.mrzline i \{ font-style: normal; color: var\(--red\); opacity: 0\.6; \}/);
  assert.match(rules, /@media \(prefers-reduced-motion: reduce\) \{ \.mrzcursor \{ animation: none; \} \}/);
  assert.match(rules, /\.ppdoc \.ppmrz \{[^}]*container-type: inline-size;/s, "the zone measures itself");
  assert.match(rules, /\.ppdoc \.ppmrz \.mrzline \{ font-size: min\(14px, calc\(\(100cqw - 32px\) \/ 52 \/ 0\.72\)\); \}/, "52 characters always fit the zone");
});
