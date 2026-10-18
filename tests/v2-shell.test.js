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
    assert.match(body, /--glow:\s*none;/, block + " --glow");
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
  assert.match(dark, /--bg:\s*#070b0c;/);
  assert.match(dark, /--red:\s*#8cf0a6;/, "the dark accent is a subtle phosphorus green");
  assert.match(dark, /--sig:\s*#6e9cff;/);
});

test("the fixtures are glass pills with the restrained rainbow rim, and the post disc is round", () => {
  assert.match(rules, /\.fixture \{[^}]*position: fixed;[^}]*border-radius: 999px;/s);
  assert.match(rules, /\.fixture::after, \.ccenter::after \{[^}]*conic-gradient/s, "the rainbow is a rim, drawn once for the fixtures and the deck");
  assert.match(rules, /\.ccdisc \{[^}]*border-radius: 50%;/s);
  assert.match(rules, /prefers-reduced-transparency: reduce/, "reduced transparency drops the blur");
});

// THE WIRE DOES NOT EXIST (owner, 18 Oct 2026: "THE WIRE DOESN'T EXIST
// ANYMORE"). It is the Feed. No visible word may say otherwise: every page,
// layout and component under app/ (the API's own messages included) and the
// deck's data, read with the comments stripped. Identifiers (WireCard,
// fetchWire, WIRE_UPLOADS_ENABLED, the "wire" data keys) are code, not copy,
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
  for (const f of ["app/components/WireCard.jsx", "app/components/PlaceCard.jsx", "app/components/MapSheet.jsx", "app/components/ListingSheet.jsx"]) {
    assert.deepEqual(read(f).match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], f + " carries no literal colour");
  }
});
