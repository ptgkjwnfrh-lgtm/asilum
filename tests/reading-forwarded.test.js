// tests/reading-forwarded.test.js — the disclosure has to reach the reader.
//
// The engine writes a note for almost every query: which word it could not
// match, which house it read a word as, what an era or a size narrowed to,
// what an exclusion removed, what a model-assisted read applied. Across a
// 141-query corpus only 12 produced no note at all.
//
// /api/discover took `results` and dropped every one of them — so ~91% of
// what the engine had to say was computed and thrown away one line before the
// response, and "leather jacket" on the primary results page was 170
// outerwear items with zero caveat: the exact Aug 5 defect the disclosure
// layer was written to end, reintroduced by a route that did not carry it.
//
// This suite pins the contract at the source: every disclosure the engine
// produces is a field on its result, and the shapes the routes forward are
// the shapes the engine actually returns. VERBATIM — a route may never
// synthesise or reword a note.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { searchProducts } from "../lib/search/index.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the engine returns a disclosure for the queries that need one", async () => {
  const cases = [
    ["leather jacket", /no "leather" in outerwear/],
    ["green jacket", /reading "green" as the designer Craig Green/],
    ["90s jacket", /reading "90s" as the 1990s/],
    ["japanese coat", /reading "japanese" as the house's base/],
    ["medium jacket", /fits like US M/],
    ["no logo hoodie", /excluding "logo" by name/],
    ["jun takahashi", /designer credit/],
    ["rickowens", /reading "rickowens" as Rick Owens/],
    ["shoes", /reading "shoes" as the footwear category/],
    ["like rick owens", /other houses in Rick Owens' vein/],
  ];
  for (const [q, re] of cases) {
    const r = await searchProducts(q, { limit: 24 });
    assert.match(String(r.note || ""), re, `${q}: ${r.note}`);
  }
});

test("/api/discover forwards the reading, and does not invent one", () => {
  const src = read("../app/api/discover/route.js");
  // The fields the engine produces are carried, by name.
  for (const field of ["note:", "unmatchedTokens:", "interpreted:", "cultural:"]) {
    assert.ok(src.includes(field), `discover route must forward ${field}`);
  }
  // Verbatim: the route reads result.note and never builds a sentence.
  assert.ok(src.includes("note: result.note || null"));
  assert.equal(/note:\s*`/.test(src), false, "a route may never template a note");
});

test("/api/search forwards the tiers that describe themselves", () => {
  const src = read("../app/api/search/route.js");
  assert.ok(src.includes("cultural: out.cultural"));
  assert.ok(src.includes("semantic: out.semantic"));
  assert.ok(src.includes("note: out.note"));
});

test("the discover page renders the note in the existing typography", () => {
  const src = read("../app/discover/page.js");
  assert.ok(src.includes("setEngineNote"), "the page reads the forwarded note");
  assert.ok(src.includes("{engineNote}"), "and renders it");
  // The existing note class, not a new panel — the constitution's UI rule.
  const block = src.slice(src.indexOf("{engineNote ? ("), src.indexOf("{engineNote ? (") + 220);
  assert.match(block, /className="areadnote"/);
});

test("a confidence bar is not what gets published", () => {
  // A cultural read is capped at 0.45 and a literal name match reaches 0.71;
  // one bar would compare unlike quantities. The sentence is the disclosure.
  const src = read("../app/discover/page.js");
  assert.equal(/confidenceScore.*width|width.*confidenceScore/.test(src), false);
});
