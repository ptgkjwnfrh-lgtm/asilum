// tests/v2-shell.test.js — THE V.2 SHELL (owner's blueprint, 17 Oct 2026,
// Foundations): three fixtures, five deck keys, the palette, the faces, and
// no CRT. Pure data where it can be; source reads where the markup is the
// law. The blueprint supersedes the 1 October brief where they differ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DECK, UTILITIES } from "../lib/dock.js";
import { navFor, deckFor, fixtureFor } from "../lib/nav.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// the glyph names, read from the component's own table (a .jsx cannot be
// imported under node's test runner)
const ICON_NAMES = [...read("app/components/Icons.jsx").matchAll(/^  ([a-z]+): <g /gm)].map((m) => m[1]);
const css = read("app/globals.css");
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

test("every deck key and every utility has a glyph", () => {
  for (const k of DECK) assert.ok(ICON_NAMES.includes(k.icon), `icon ${k.icon} for ${k.id}`);
  for (const u of UTILITIES) assert.ok(ICON_NAMES.includes(u.icon), `icon ${u.icon} for ${u.id}`);
  for (const n of navFor("passport")) assert.ok(ICON_NAMES.includes(n.icon), `icon ${n.icon} for ${n.label}`);
  assert.ok(ICON_NAMES.includes("globe") && ICON_NAMES.includes("bell") && ICON_NAMES.includes("post") && ICON_NAMES.includes("disc"));
});

test("the deck has exactly five keys and the Info Dock exactly three utilities, none a route of its own", () => {
  assert.equal(DECK.length, 5);
  assert.equal(UTILITIES.length, 3);
  for (const k of DECK) assert.ok(!("href" in k), k.id + " resolves its route through lib/nav.js, never carries one");
  assert.equal(deckFor("passport").length, 2);
  assert.ok(fixtureFor("passport", "passport"));
});

test("no CRT: scanlines, the grid, the glow and the wash are gone from the tokens and nothing renders the chrome", () => {
  for (const block of [":root {", '[data-theme="light"] {']) {
    const i = css.indexOf(block);
    const body = css.slice(i, css.indexOf("\n}", i));
    assert.match(body, /--scan:\s*transparent;/, block + " --scan");
    assert.match(body, /--grid-ln:\s*transparent;/, block + " --grid-ln");
    // (18 Oct, A6 third addendum) the phosphor glow is back in DARK only, in each word's own colour
    if (block === ":root {") assert.match(body, /--glow:\s*0 0 1px currentColor,/, block + " --glow glows in the word's own colour");
    else assert.match(body, /--glow:\s*none;/, block + " --glow");
    assert.match(body, /--glow-ink:\s*none;/, block + " --glow-ink");
    assert.match(body, /--backlight:\s*none;/, block + " --backlight");
    assert.match(body, /--wash:\s*none;/, block + " --wash");
  }
  // (second pass, 17 Oct) the chrome's rules are DELETED, not hidden — and so
  // are the header's, the old thumb bar's and the ORB HUB second interface's
  for (const sel of [".os-crt", ".os-blob", ".os-plus", ".os-frame", ".os-status", ".tophead", ".thbar", ".marquee", ".snav", ".acctpanel", ".bagpanel", ".searchpanel", "[data-model", "--tabbar-h"]) {
    assert.ok(!rules.includes(sel), sel + " must be gone from globals.css");
  }
  // code, not comments: the shell's header explains what left and names it
  const shell = read("app/shell.js").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  for (const cls of ["os-crt", "os-blob", "os-plus", "os-frame", "OsStatus", "tophead", "marquee"]) {
    assert.ok(!shell.includes(cls), "the shell must not render " + cls);
  }
  assert.ok(!/text-shadow:\s*var\(--glow-ink\)/.test(rules.split("html, body {")[1].split("}")[0]), "body text carries no glow");
});

test("the palette: the owner's reference in light (18 Oct 2026) — an icy ground, slate ink, blue links, a true red accent; the blueprint's black ground, slate, phosphorus green in dark", () => {
  const block = (name) => { const i = css.indexOf(name); return css.slice(i, css.indexOf("\n}", i)); };
  const light = block('[data-theme="light"] {');
  const dark = block(":root {");
  assert.match(light, /--bg:\s*#f4f8fb;/, "the icy ground of the reference");
  assert.match(light, /--paper:\s*#ffffff;/);
  assert.match(light, /--sig:\s*#1d5fd6;/, "links and chosen things are blue");
  assert.match(light, /--red:\s*#c9372a;/, "the accent is the reference's red (the asterisk, the active tab)");
  assert.match(light, /--ink:\s*#253749;/, "slate ink, as the reference reads");
  // (19 Oct 2026) a blacker ground; (29 Oct 2026, "lets make all the colors on darkmode glowing white nomore green")
  // the dark accent glowing white, on the fixtures too — the phosphor green and the fixtures' paler green gone
  assert.match(dark, /--bg:\s*#030505;/);
  assert.match(dark, /--red:\s*#f4f9fc;/, "the dark accent is white (it glows through --glow)");
  assert.ok(!/--red:\s*#(46ff96|8cf0a6)/i.test(css), "no green accent left, on the site or the fixtures");
  // no green in dark at all: every colour in a rule that applies in dark (not a light-only rule), comments aside, is
  // checked; the rainbows (--holo, --iris-*, the passport strip's iridescent sweep) keep their green stop, as a
  // rainbow does
  const rulesOnly = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const greens = [];
  for (const m of rulesOnly.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (/data-theme="light"\]|prefers-color-scheme: light/.test(sel)) continue;
    for (const decl of m[2].split(";")) {
      if (/^\s*--(holo|iris-\d)\s*:/.test(decl) || /rgba\(150, 90, 255, 0\.14\)/.test(decl)) continue;
      for (const c of decl.matchAll(/#([0-9a-f]{6})\b|%23([0-9a-f]{6})|rgba?\((\d+),\s*(\d+),\s*(\d+)/gi)) {
        const [r, g, b] = c[1] || c[2] ? [0, 2, 4].map((i) => parseInt((c[1] || c[2]).slice(i, i + 2), 16)) : [c[3], c[4], c[5]].map(Number);
        if (g > r + 50 && g > b + 20) greens.push(sel.slice(-50) + " → " + c[0]);
      }
    }
  }
  const lightOnly = greens.filter((g) => !/--cursor: #1d7a4c/.test(g));
  assert.deepEqual(lightOnly, [], "no green left in dark");
  // a selected key's lamp is the asterisk's red, in both themes ("the center fixture select buttons have a green
  // glow it should be red")
  assert.match(dark, /--lamp: rgba\(255, 65, 54, 0\.3\);/);
  assert.match(light, /--lamp: rgba\(210, 47, 34, 0\.3\);/);
  assert.match(dark, /--sig:\s*#6e9cff;/);
});

test("the fixtures are glass, the top one a full-width strip (26 Oct 2026), and the post disc is round", () => {
  assert.match(rules, /\.fixture \{[^}]*position: fixed;/s);
  // (26 Oct 2026) the top fixture is the Masthead: flush with the top and both sides, so square; the keys on it are bare
  assert.match(rules, /\.fixture \{[^}]*top: 0; left: 0; right: 0;[^}]*border-radius: 0;/s);
  assert.match(rules, /\.passportbtn \{[^}]*border-radius: calc\(var\(--u\) \* 7\);/s, "the globe a key like the Info Dock's");
  // (18 Oct) the popup's rainbow rim follows the hand
  // (25 Oct 2026, late) the popup wears no rim: `content: none` — the rainbow is the fixtures' alone
  assert.match(rules, /\.sheet::after \{\n  content: none;/, "the popup wears no rim");
  // (19 Oct, "do this") the fixtures are the September glass: near-clear, a saturation lift, no blur, the shadow and the lip, no painted rim
  assert.match(rules, /\.fixture, \.ccenter \{\n[^}]*background: linear-gradient\(var\(--fx-tint\), var\(--fx-tint\)\), var\(--fx-glass\);\n  -webkit-backdrop-filter: saturate\(160%\); backdrop-filter: saturate\(160%\);\n  box-shadow: var\(--glass-shadow\), var\(--glass-lip\);/);
  assert.match(rules, /\.fixture\[data-refract="1"\], \.ccenter\[data-refract="1"\] \{\n  -webkit-backdrop-filter: var\(--lg-filter\) saturate\(160%\); backdrop-filter: var\(--lg-filter\) saturate\(160%\);\n\}/, "the bend, and no blur");
  assert.match(rules, /--fx-glass: rgba\(255, 255, 255, 0\.03\);/, "3% white in dark");
  assert.ok(!/\.(fixture|ccenter)[^{}]*\{[^}]*irisdrift/.test(rules), "no drifting film on the fixtures");
  assert.match(rules, /\.ccdisc \{[^}]*border-radius: 50%;/s);
  assert.match(rules, /prefers-reduced-transparency: reduce/, "reduced transparency drops the blur");
});

// THE WIRE DOES NOT EXIST (owner, 18 Oct 2026: "THE WIRE DOESN'T EXIST
// ANYMORE"). It is the Feed. No visible word may say otherwise: every page,
// layout and component under app/ (the API's own messages included) and the
// deck's data, read with the comments stripped. Identifiers (PostCard,
// fetchPosts, WIRE_UPLOADS_ENABLED, the "wire" data keys) are code, not copy,
// and the word boundaries leave them alone.
test("the Wire does not exist: no visible WIRE / Wire / the wire / wire post anywhere in the app", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const files = [];
  const walk = (d) => { for (const f of readdirSync(new URL("../" + d, import.meta.url))) { const p = d + "/" + f; if (statSync(new URL("../" + p, import.meta.url)).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f)) files.push(p); } };
  walk("app");
  files.push("lib/dock.js", "lib/nav.js");
  const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const hits = [];
  for (const f of files) {
    strip(read(f)).split("\n").forEach((line, i) => { if (/\bWIRE\b|\bWire\b|\bthe wire\b|\bwire posts?\b/.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(hits, [], "the Wire is the Feed now");
  assert.ok(files.length > 100, "the sweep read the app (" + files.length + " files)");
});

// PAGE GRADIENTS (owner, 18 Oct 2026: "I want page gradients too"): --bg
// stays the base; --bg-grad is defined in both palettes and is what the page
// wears; each destination tints its own light through --page-tint, which the
// shell names on <html>. Cards keep their own ground on top of it.
test("page gradients: a --bg-grad in both palettes, worn by the page, tinted per destination", () => {
  const block = (name) => { const i = css.indexOf(name); return css.slice(i, css.indexOf("\n}", i)); };
  for (const b of [":root {", '[data-theme="light"] {']) {
    assert.match(block(b), /--bg-grad:\s*radial-gradient\([^;]*var\(--page-tint\)[^;]*linear-gradient\(/s, b + " defines the page gradient from the page's tint");
    assert.match(block(b), /--bg:\s*#[0-9a-f]{6};/, b + " keeps --bg as the base");
  }
  assert.match(rules, /\nhtml \{ background-color: var\(--bg\); background-image: var\(--bg-grad\);/, "the page wears it");
  assert.match(rules, /\nbody \{ background: transparent; \}/, "body is clear above it");
  // the shared html, body block must not reset the page's background with a shorthand (it did, in the first cut)
  assert.ok(!/html, body \{[^}]*background\s*:/s.test(rules), "nothing after the page rule resets <html>'s background");
  assert.match(rules, /\[data-page="passport"\] \{ --page-tint: var\(--red\); \}/);
  assert.match(read("app/shell.js"), /document\.documentElement\.dataset\.page = page;/, "the shell names the page");
  for (const f of ["app/components/PostCard.jsx", "app/components/PlaceCard.jsx", "app/components/MapSheet.jsx", "app/components/ListingSheet.jsx"]) {
    assert.deepEqual(read(f).match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], f + " carries no literal colour");
  }
});

// THE DARK POPUP BACKDROP (owner, 18 Oct 2026: "on dark mode if there is a
// popup the background should be darker, not a cloudy white"). The scrim was
// --ink at 42% — near-white in the dark palette. It is --scrim now: a deep
// translucent black in dark (on :root, under the device's dark and under the
// pinned dark alike), the reference's slate wash in light (unchanged, so the
// search popup of 6.jpg does not move). Shadows mix from --shade, black in dark.
test("dark popup backdrop: the scrim deepens the page in dark on both dark paths; light keeps the slate wash; no shadow glows white", () => {
  const block = (name) => { const i = css.indexOf(name); return css.slice(i, css.indexOf("\n}", i)); };
  const darkScrim = /--scrim:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*(0?\.\d+)\);/;
  const m = block(":root {").match(darkScrim);
  assert.ok(m, ":root (dark) defines --scrim as an rgba");
  assert.ok(Math.max(+m[1], +m[2], +m[3]) <= 16, "the dark scrim is near-black, not a wash of the light ink");
  assert.ok(+m[4] >= 0.6, "and deep enough to lower the page");
  assert.match(block('[data-theme="light"] {'), /--scrim:\s*color-mix\(in srgb, #1d3446 74%, transparent\);/, "light: the dark blue cloud under a popup (the owner's mockup, 25 Oct)");
  assert.match(rules, /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \{ --shade: #000000; --scrim: rgba\(1, 3, 4, 0\.74\); \} \}/, "the device's dark");
  assert.match(rules, /\n\[data-theme="dark"\] \{ --shade: #000000; --scrim: rgba\(1, 3, 4, 0\.74\); \}/, "the pinned dark");
  assert.match(rules, /\.sheetscrim \{[^}]*background: var\(--scrim\);/s, "the popup's scrim is the token");
  const shadows = rules.match(/box-shadow:[^;}]*/g) || [];
  assert.deepEqual(shadows.filter((d) => /color-mix\(in srgb, var\(--ink\)/.test(d)), [], "no shadow is mixed from the light ink");
});

// THE OG REACTIVE RAINBOW LIQUID GLASS (owner, 18 Oct 2026: "the liquid glass
// isn't liquid enough — I want the OG reactive rainbow liquid glass you made
// for ASILUM"). The 8 Sep glass (LiquidGlass.jsx: the displacement map, the
// pointer's shine) is back on the fixtures, the deck and every popup; one
// listener set drives the rim from the pointer, the tilt and the scroll,
// writing only to the glass elements and never reading layout per frame;
// reduced motion stops it; the popup's scrim is no backdrop root.
test("the OG reactive rainbow liquid glass: on the fixtures, the deck and every popup; reactive to pointer, tilt and scroll; still under reduced motion", () => {
  const lg = read("app/components/LiquidGlass.jsx");
  assert.match(lg, /export function useGlassReactive\(\)/);
  const hook = lg.slice(lg.indexOf("export function useGlassReactive"));
  assert.match(hook, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return undefined;/, "reduced motion: nothing listens");
  for (const ev of ["pointermove", "scroll", "deviceorientation"]) assert.match(hook, new RegExp('addEventListener\\("' + ev + '"'), ev);
  const tick = hook.slice(hook.indexOf("const tick"), hook.indexOf("const wake"));
  assert.ok(!/getBoundingClientRect|offsetWidth|offsetHeight|getComputedStyle/.test(tick), "the frame writes; it never reads layout");
  assert.match(tick, /document\.querySelectorAll\(GLASS_REACTIVE\)/, "it writes to the glass elements, not to <html>");
  assert.ok(!/documentElement\.style\.setProperty/.test(hook), "never on the root");
  assert.match(read("app/shell.js"), /useGlassReactive\(\);/, "the shell runs it once");
  for (const [f, id] of [["app/components/Masthead.jsx", "lg-masthead"], ["app/components/ControlCenter.jsx", "lg-deck"], ["app/components/SheetHost.jsx", "lg-popup"]]) {
    const src = read(f);
    assert.match(src, new RegExp('useLiquidGlass\\(\\w+, \\{ id: "' + id + '"'), f + " is a pane of the OG glass");
    // (19 Oct) the popup's rim answers the hand; the fixtures' glass does not answer the pointer at all
    if (id === "lg-popup") assert.match(src, /lgrx/, f + " answers the reactive rim");
    else assert.match(src, /shine: false/, f + " carries no surface reaction");
  }
  assert.match(read("app/components/SheetHost.jsx"), /bend: "\.card"/, "where WebKit cannot bend a backdrop, the cards under the popup's edges bend");
  assert.match(rules, /\.sheetscrim \{ -webkit-backdrop-filter: none; backdrop-filter: none; \}/, "the scrim is no backdrop root, so the popup has a page to bend");
  assert.match(rules, /\[data-popup\] \.main \{ filter: blur\(14px\) saturate\(0\.8\);/, "the page is clouded under a popup (25 Oct, evening)");
  // (29 Oct 2026, "all the pop up tabs have to look like cards four rounded corners and it being centered in the
  // screen, lowkey every pop up tab should be the size of a large card") every popup one centred large card; the
  // search no longer rises flat out of the deck, the phone's bottom sheet is gone (tests/v2-popup-card.test.js)
  assert.match(rules, /\.sheetscrim \{\n  position: fixed; inset: 0; z-index: 64; display: flex; align-items: center; justify-content: center;/);
  assert.match(rules, /\.sheet \{\n  width: var\(--pop-w\); height: var\(--pop-h\);[^}]*border-radius: var\(--radius-card\);/s);
  assert.ok(!/deckrise/.test(rules + read("app/components/SheetHost.jsx")), "the search's flat foot is retired");
  assert.match(rules, /\.sheet\[data-refract="1"\] \{[^}]*var\(--lg-filter\)/s);
  assert.match(rules, /\.fixture\[data-refract="1"\], \.ccenter\[data-refract="1"\] \{[^}]*var\(--lg-filter\)/s);
  assert.match(rules, /prefers-reduced-transparency: reduce\) \{[^}]*\.sheet\[data-refract="1"\][^}]*backdrop-filter: none/s, "reduced transparency drops the glass");
  // the popup's glass would trap a fixed child: the overlays it opens render on <body>
  const listing = read("app/components/ListingSheet.jsx");
  assert.match(listing, /createPortal\(<FloatView[^]*document\.body\)/);
  assert.match(listing, /createPortal\(<TicketFlow[^]*document\.body\)/);
  assert.match(read("app/components/dismiss.js"), /if \(above && above !== surface\) return;/, "a stacked modal keeps its focus");
  assert.match(read("app/components/TicketFlow.jsx"), /role="dialog" aria-modal="true" aria-label="purchase request"/);
});

// ROUNDED EVERYWHERE (owner, 18 Oct 2026: "everything should be rounded
// out"). Three radius tokens on :root; a floor that rounds every button and
// field unless a rule of its own rounds it otherwise; the shell-visible
// surfaces on the tokens; no underline-only (hairline) field left squared.
test("rounded everywhere: three radius tokens, a floor for every key and field, the shell's surfaces on them, no square hairline field", () => {
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  for (const t of ["--radius-card", "--radius-field", "--radius-key"]) assert.match(root, new RegExp(t + ":\\s*\\d+px;"), t);
  assert.match(rules, /\nbutton, \.btn, a\.btn \{ border-radius: var\(--radius-key\); \}/, "every button is rounded unless rounded otherwise");
  assert.match(rules, /\ninput:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\), select, textarea \{ border-radius: var\(--radius-field\); \}/, "every field");
  assert.match(rules, /\.card, [^{]*\{ border-radius: var\(--radius-card\); \}/, "every card");
  assert.match(rules, /--sheet-radius: calc\(var\(--radius-card\) \+ 2px\);/, "the popup and the deck in the same family");
  assert.match(rules, /\.imgwrap \{ position: relative; border-radius: var\(--ed-img-rad, var\(--radius-card\)\);/, "a card's photograph is rounded by default");
  // no field is a hairline with square corners any more
  const squareFields = (rules.match(/\{[^}]*border-bottom:\s*\d+px solid var\(--line\);[^}]*border-radius:\s*0[;\s]/g) || []);
  assert.deepEqual(squareFields, [], "no underline-only field with square corners");
  assert.ok(!/border: none; border-bottom: [12]px solid var\(--line\); border-radius: 0;/.test(rules));
});

// SOFTENED TWICE (owner, 26 Oct 2026: everything "too rounded", then "a
// little less round again" — sharpen the corners, keep them rounded). Every
// rounded-rectangle radius that was 12px and up scaled by 0.73 twice: the
// tokens 22/18/14 are 12/9/7, the popup's 36 is 19, the fixtures' drawn
// corners 34/26/18 are 18/14/9 of --u. Pills (999px) and circles (50%) keep
// their shape.
test("softened corners: the radius scale is 12/9/7, nothing rounder than 13px but the popup's 19 and a pill, the fixtures and the popup on the same scale", () => {
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  assert.match(root, /--radius-card: 12px;/);
  assert.match(root, /--radius-field: 9px;/);
  assert.match(root, /--radius-key: 7px;/);
  assert.match(rules, /--dk-r: calc\(var\(--u\) \* 18\);/, "the deck");
  assert.match(rules, /\.ccenter \.tabl \{[^}]*border-radius: calc\(var\(--u\) \* 9\);/s, "the deck's keys");
  // a rounded rectangle is at most 13px: every px radius between 14 and 99 is gone (999px pills and 50% circles stay)
  const radii = [...rules.matchAll(/border-radius:([^;}]*)/g)].map((m) => m[1]);
  const tooRound = radii.filter((v) => !v.includes("--sheet-radius") && [...v.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)px/g)].some((n) => +n[1] > 13 && +n[1] < 100));
  assert.deepEqual(tooRound, [], "no rounded rectangle above 13px");
  assert.equal(radii.filter((v) => v.includes("max(var(--sheet-radius), 19px)")).length, 0, "the popup is a card now (29 Oct 2026): a card's corners, 12 (it was 19, 26, 36)");
  const tooRoundU = radii.filter((v) => [...v.matchAll(/var\(--u\) \* (\d+)/g)].some((n) => +n[1] > 18));
  assert.deepEqual(tooRoundU, [], "no fixture corner above 18 of --u");
  assert.match(rules, /\.ccdisc \{[^}]*border-radius: 50%;/s, "the post disc is still a circle");
  assert.match(rules, /\.btn, \.fitbtn, \.platform, \.chip \{ border-radius: var\(--ed-rad-btn, 999px\); \}/, "the pills are still pills");
});
