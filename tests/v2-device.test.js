// tests/v2-device.test.js — THE DEVICE (owner, 18 Oct 2026, evening;
// CONSTITUTION A6 third addendum): the louder rainbow glass, the original
// gradients and the dark phosphor glow, the ">>>>>>" load-in, the warning
// lights, the piece floating over the fogged Feed, the original passport.
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
  assert.match(strip(read("app/components/PostCard.jsx")), /<BlockText as="p" className="p2text" text=\{caption\} play=\{more\} \/>/, "a tapped caption (IMG_1143 Fig. 7: unfolded from its chevrons)");
  assert.match(strip(read("app/components/PostCard.jsx")), /<BlockText className="fine" text=\{\[String\(event\.kind/, "an opened BRDCST event");
  assert.match(strip(read("app/components/MapSheet.jsx")), /<BlockText as="p" text=\{place\.organizer\} \/>/, "the place's description");
  assert.match(strip(read("app/components/PersonOverview.jsx")), /<BlockText as="p" className="povsum" text=\{person\.summary\} \/>/, "Read more → the overview");
  assert.match(strip(read("app/components/ListingSheet.jsx")), /<BlockText className="cclbl" text=\{"BEHIND THE PRODUCT"/, "behind the product");
  assert.match(strip(read("app/components/MediaFloat.jsx")), /\{up \? <BlockText as="p" className="mftext"/, "the floating media's caption, raised");
  assert.match(rules, /\.blktext \.blkrun \{ color: transparent;[^}]*repeating-linear-gradient\(90deg, var\(--blk\)/, "the run is drawn as even blocks (Ref 1), in the ink");
  assert.match(rules, /\.blktext \.blkrest \{ color: transparent; \}/, "the not-yet text keeps its place");
  // the folded caption: a block the length of each word (Ref 2)
  assert.match(strip(read("app/components/PostCard.jsx")), /<BlockLine className="p2fold-line" text=\{caption\} \/>/);
  assert.match(rules, /\.blkline \.blkw \{[^}]*color: transparent; background: var\(--blk\);/);
  assert.ok(!/>>>>/.test(read("app/components/Blocks.jsx")) && !/>>>>/.test(read("app/components/PostCard.jsx")), "no chevrons stand in for text any more");
});

test("the warning lights: square, dark at rest, blinking like an eject light on a purchase, a bag or an offer, then dark; the deck's pair answers", () => {
  const listing = strip(read("app/components/ListingSheet.jsx"));
  for (const where of [/onClick=\{\(e\) => \{ blinkLamp\(e\); toBag\(\); \}\}[^\n]*<Lamp \/>/, /<button type="submit" className="buy" onClick=\{blinkLamp\}><Lamp \/>send ✓/, /onClick=\{async \(e\) => \{ blinkLamp\(e\); setBuying\(true\);/, /blinkLamp\(e\); setTimeout\(\(\) => setTicket\(true\), 420\);[^\n]*<Lamp \/>request purchase/]) {
    assert.match(listing, where);
  }
  // (19 Oct) the pair rides with the ad strip at the head of the Feed (AdStrip.jsx)
  const deck = strip(read("app/components/AdStrip.jsx"));
  assert.match(deck, /<span className="devlights" ref=\{lightsRef\} aria-hidden="true"><Lamp \/><Lamp \/><\/span>/);
  assert.match(deck, /window\.addEventListener\("asilum:bag", on\)/, "a piece in the bag blinks the strip's lights");
  assert.match(rules, /\.lamp \{[^}]*width: 7px; height: 7px;[^}]*background: color-mix\(in srgb, var\(--warn\) 22%, transparent\)/s, "square, dark at rest");
  assert.match(rules, /\.lamp\[data-blink="eject"\] \{ animation: ejectlight 1\.8s steps\(1, end\) forwards; \}/, "it blinks and stays dark at the end");
  assert.match(rules, /@keyframes ejectlight \{[^}]*0%, 20%, 40%, 60% \{[^}]*\}\s*10%, 30%, 50%, 70%, 100% \{/s);
  assert.match(rules, /prefers-reduced-motion: reduce\) \{ \.mrzcursor \{ animation: none; \} \.lamp\[data-blink\] \{ animation: ejectonce/, "reduced motion: one soft light, no blinking");
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

test("the louder rainbow on the popup; the fixtures are the September glass (19 Oct): the bend's own split, no drifting film", () => {
  const lg = strip(read("app/components/LiquidGlass.jsx"));
  assert.match(lg, /PULL\.map\(\(v, i\) => \(v \* strength \* \(1 \+ prism \* \(i - 1\) \* 0\.28\)\)/, "red, green and blue pulled apart by the prism");
  assert.match(read("app/components/SheetHost.jsx"), /prism: 1/, "the popup splits colour");
  // (19 Oct, the owner: "do this" — the September recipe) the fixtures run the header's 80 / 86 / 92 with no extra prism
  for (const f of ["app/components/InfoDock.jsx", "app/components/PassportButton.jsx", "app/components/ControlCenter.jsx"]) {
    assert.ok(!/prism: 1/.test(read(f)), f + " splits colour by the bend alone");
  }
  assert.match(rules, /@keyframes irisdrift \{ to \{ --iris-drift: 360deg; \} \}/);
  assert.ok(!/\.fixture, \.ccenter \{ animation: irisdrift/.test(rules), "the fixtures carry no drifting film");
  assert.match(rules, /conic-gradient\(from calc\(var\(--iris-a, 200deg\) \* -1 \+ var\(--iris-drift, 0deg\)\)/, "the popup's film turns against the rim");
  assert.match(rules, /prefers-reduced-motion: reduce\) \{\n  \.fixture, \.ccenter \{ transition: none; \}/, "reduced motion: the fixtures' lamps stop gliding");
});

test("the original ground and the dark phosphor glow: blue to white, green to black; dark words glow in their own colour; light never", () => {
  // (25 Oct, evening: "too white") the ice blue the whole way down, never to white
  assert.match(block('[data-theme="light"] {'), /linear-gradient\(180deg, #27465e 0%, #d7e8f4 24%, #e9f2f8 50%, #d7e8f4 76%, #27465e 100%\)/, "a dark blue from the top and the bottom, the ice blue between (owner, late)");
  // (19 Oct 2026, "make the background more black") a breath of green at the top, black almost at once
  assert.match(block(":root {"), /linear-gradient\(180deg, #06120c 0%, #030907 30%, #010302 62%, #000000 100%\)/, "green to black, blacker");
  assert.match(block(":root {"), /--glow: 0 0 1px currentColor, 0 0 9px color-mix\(in srgb, currentColor 55%, transparent\)/);
  assert.match(block(":root {"), /--glow-ink: none;/, "body text never glows");
  assert.match(block('[data-theme="light"] {'), /--glow: none;/, "light never glows");
  // (19 Oct 2026) the dark headline is the original phosphor, no longer chrome washed to mint
  assert.match(rules, /:root:not\(\[data-theme="light"\]\) \.headline \{ background: linear-gradient\(180deg, #b8ffd6 0%, #7dffb5 42%, #46ff96 100%\);/, "the original phosphor green");
});

test("the original passport (iteration 5, 7db2b89): plus registration band, the 01, the print lines, its own teal and phosphor, the machine zone at the foot", () => {
  const sec = strip(read("app/components/PassportSecurity.jsx"));
  assert.match(sec, /function Plus\(\{ x, y, s = 5, tone = "s" \}\)/);
  assert.match(sec, /<Plus key=\{i\}/);
  assert.match(sec, /<span className="ppvpage">01<\/span>/);
  const board = strip(read("app/board/page.js"));
  assert.ok(board.indexOf("<PassportSecurity") < board.indexOf('<div className="ppmrz">'), "the MRZ sits at the foot, under the hologram window");
  assert.match(board, /<div className="ppnation">ASILUM <b>\*<\/b> FASHION PASSPORT<\/div>/, "no magazine");
  assert.match(rules, /\[data-theme="light"\] \.ppdoc \{ --sig: #0b7584; \}/, "the document's own teal");
  assert.match(rules, /:root:not\(\[data-theme="light"\]\) \.ppdoc \{ --sig: #46ff96; \}/, "phosphor in dark");
  assert.match(rules, /\.pv-r \{ stroke: var\(--red\); opacity: 0\.75; \}/, "the pluses have their tones again");
  assert.match(rules, /\.ppphoto::after \{ background:[^}]*repeating-linear-gradient\(0deg, transparent 0 2px,/s, "the photo slot's print lines");
  assert.match(rules, /\.ppdoc \.ppmrz \{[^}]*border-top: 1px dashed var\(--line\);[^}]*font-family: var\(--mono\);/s);
});
