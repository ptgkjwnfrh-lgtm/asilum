// tests/copy-law.test.js — what the app is allowed to call itself and its parts.
//
// Three owner directives, 17 August, all of them naming rules rather than one-off
// edits — so they are enforced as rules and a new page inherits them:
//
//   1. The app is a PERSONALIZED FASHION TERMINAL. "Fashion intelligence OS" is
//      retired; it survived in the wordmark tagline, the page title, the og and
//      twitter titles, the passport authority field and the security strip.
//   2. The engine is "The Asterisk system" in prose. Not bare "Asterisk".
//   3. NO PUBLIC MENTION OF THE LEARNING BRIDGES. Six of them exist and they are
//      the core of lib/brain, but they were being advertised in the site
//      description, the feed's routing line, the ticker and a status chip. How
//      the ranking works is not a reader-facing product claim.
//
// Scope: app/ only. lib/brain names its bridges freely — that is the engine's own
// vocabulary, and `_bridge`, `bridgeMix` and `BRIDGE_REASON` are identifiers, not
// copy. The rule is about what a reader is shown.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + p, "utf8");

function appFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(ROOT + dir)) {
      const rel = `${dir}/${entry}`;
      if (statSync(ROOT + rel).isDirectory()) walk(rel);
      else if (/\.(js|jsx)$/.test(entry)) out.push(rel);
    }
  })("app");
  return out;
}

// Comments are exempt throughout: they carry the reasoning for these very rules,
// and a rule that forbids explaining itself is a rule nobody can maintain.
const codeOnly = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

test("the app is a personalized fashion terminal, and nothing calls it the old name", () => {
  const offenders = appFiles().filter((f) => /fashion intelligence/i.test(codeOnly(read(f))));
  assert.deepEqual(offenders, [], "these still use the retired product name");

  // Positive: the descriptor a reader meets in prose and metadata.
  assert.match(read("app/layout.js"), /personalized fashion terminal/);
  // (17 Oct) the wordmark is "*ASILUM" alone — tests/brand-name.test.js owns the lockup.
  // (19 Oct) the wordmark is a fixture of its own, top left, mounted once by the shell;
  // (26 Oct) it sits on the Masthead, which the shell mounts once
  assert.match(read("app/components/Masthead.jsx"), /<Wordmark className="brandfix" \/>/, "the Masthead carries the wordmark");
  assert.match(read("app/shell.js"), /<Masthead kind=\{accountKind\} pathname=\{pathname\} \/>/, "the shell mounts the Masthead");
  assert.ok(!/<Wordmark/.test(read("app/page.js")), "the Feed no longer prints a second one");
});

test("no public mention of the learning bridges", () => {
  const offenders = [];
  for (const f of appFiles()) {
    if (f.startsWith("app/api/")) continue; // server internals, never rendered
    const code = codeOnly(read(f));
    // Identifiers are fine; prose is not. Match the word only where it sits
    // inside a rendered string, bounded to that string.
    for (const m of code.matchAll(/["'`][^"'`\n]{0,200}?\bbridges?\b[^"'`\n]{0,200}?["'`]/gi)) {
      offenders.push(`${f}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [], "these advertise the ranking machinery to readers");
});

test("the engine is called The Asterisk system in prose", () => {
  // Bare "Asterisk" followed by a verb is the shape that reads as a bare name —
  // "Asterisk is styling", "Asterisk routed", "Asterisk orders". Chrome labels
  // ("ASTERISK GUIDING", the /asterisk route, component names) are deliberately
  // untouched: they name the destination and the control, not the system.
  const offenders = [];
  for (const f of appFiles()) {
    const code = codeOnly(read(f));
    for (const m of code.matchAll(/(?<!The )(?<!the )\bAsterisk\s+(is|was|routed|orders|remembers|holds|learned|guides)\b/g)) {
      offenders.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], 'these say "Asterisk <verb>" instead of "the Asterisk system"');

  // Positive, so the rule cannot be satisfied by deleting the sentences.
  assert.match(read("app/stylist/page.js"), /The Asterisk system is styling/);
  assert.match(read("app/discover/page.js"), /The Asterisk system is using your Passport/);
  assert.match(read("app/page.js"), /The Asterisk system routed this feed/); // (25 Oct) "it's the feed", not an edit
});

test("the ticker carries the house lines when nothing eligible runs", () => {
  // (V.2, 17 Oct) the marquee left with the header; the ad ticker carries
  // the house lines as its fallback (lib/dock.js HOUSE_LINES). (19 Oct) The
  // ticker runs at the head of the Feed now, off the deck (AdStrip.jsx).
  const dock = read("lib/dock.js");
  const cc = read("app/components/AdStrip.jsx");
  assert.match(read("app/components/ControlCenter.jsx"), /<AdStrip typing=\{inSearch\} \/>/, "the deck carries the strip, in its bubble (owner, 25 Oct 2026, last)");
  // Verbatim, including the owner's spacing in "A S I L U M".
  for (const line of [
    "ARE YOU SEEKING A S I L U M",
    "DISCOVERY - COMMERCE - COMMUNITY",
    "DISCOVER FROM ARCHIVES ACROSS THE WORLD",
  ]) {
    assert.ok(dock.includes(`"${line}"`), `the ticker must carry: ${line}`);
  }
  // And they are the FALLBACK — a placement, a draft or a listed event still wins the strip.
  assert.match(cc, /HOUSE_LINES\[i % HOUSE_LINES\.length\]/);
  assert.match(cc, /const cur = items && items\.length \? items\[i % items\.length\] : null;/);
});
