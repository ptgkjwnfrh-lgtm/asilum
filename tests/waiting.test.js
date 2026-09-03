// tests/waiting.test.js
// A FEATURE WHOSE FAILURE MODE IS SILENCE NEEDS A POSITIVE TEST.
//
// This one shipped broken in its first draft and looked fine: `answeredBy`
// read `served.items` when the search engine returns `served.results`, so every
// want came back unanswered. Nothing threw. Nothing logged. The feature was
// silent — which is also exactly what it does when it is working correctly.
//
// Every assertion below therefore checks BOTH directions: that it speaks when
// it should, and stays quiet when it should.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { answeredBy, wantsFor, whatArrived, channelStatus, CHANNELS } from "../lib/waiting/index.js";
import { getProductPool } from "../lib/search/index.js";

test("IT SPEAKS — a want the catalog can answer comes back with pieces", async () => {
  // The test that would have caught the wrong-key bug. Without it, a broken
  // engine is indistinguishable from a quiet one.
  const pool = await getProductPool();
  const brand = pool.find((p) => p.brand)?.brand;
  assert.ok(brand, "the seed catalog must have a brand to search for");
  const answers = await answeredBy({ query: brand });
  assert.ok(answers.length > 0, `"${brand}" is in the catalog and must be findable`);
  assert.ok(answers[0].id, "an answer is a real piece, not a score");
});

test("IT STAYS QUIET — a want nothing answers returns nothing", async () => {
  assert.deepEqual(await answeredBy({ query: "zzzz nothing is called this" }), []);
  assert.deepEqual(await answeredBy({ query: "" }), []);
  assert.deepEqual(await answeredBy(null), []);
});

test("ANSWERED means the search would now SUCCEED, not that we found a lookalike", () => {
  // The definition matters: the want was recorded when that exact search
  // served zero, so the only defensible test is whether it still would.
  const src = readFileSync("lib/waiting/index.js", "utf8");
  assert.match(src, /searchProducts\(want\.query/,
    "it must ask the real engine, not re-implement matching");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /rankSearchResults/,
    "a hand-rolled ranker drifts from search and answered 170 false positives");
});

test("REPLAYING A QUERY IS NOT SOMEBODY SEARCHING", async () => {
  // Without log:false this feature poisons its own evidence — it would write
  // search rows nobody typed, into the very log it reads wants from.
  const src = readFileSync("lib/waiting/index.js", "utf8");
  assert.match(src, /log: false/, "replays must not be logged");
  const engine = readFileSync("lib/search/index.js", "utf8");
  assert.match(engine, /if \(log\) logSearch\(/,
    "searchProducts must honour the option");
});

test("a want is an EMPTY search — the one signal that is a record of asking", () => {
  // Not the taste profile (what you tend to like), not saves (things you
  // found), not dwell (attention). An empty search is the person typing the
  // words and us answering nothing, and both halves are in the log.
  const db = readFileSync("lib/db/production.js", "utf8");
  assert.match(db, /result_count = 0/, "only empty searches count as wants");
  assert.match(db, /WHERE user_id=\$1/, "and only this person's own");
});

test("NO EMPTY STATE — a want with no answer is omitted, never returned empty", async () => {
  // Rendering "still nothing for: rick owens ring boots" would be a
  // notification about our own failure. docs/INVISIBLE-MACHINERY.md.
  const src = readFileSync("lib/waiting/index.js", "utf8");
  assert.match(src, /if \(items\.length\) out\.push/,
    "only wants WITH answers may be returned");
  assert.deepEqual(await whatArrived(null), [], "no identity, nothing to answer");
});

test("the feed carries it, and omits the key entirely when there is nothing", () => {
  const feed = readFileSync("app/api/feed/route.js", "utf8");
  assert.match(feed, /\.\.\.\(arrived\.length \? \{ arrived \} : \{\}\)/,
    "absent, not empty — a reader with no answered wants sees no trace");
  assert.match(feed, /userId \? await whatArrived/,
    "and only for a reader we can identify");
});

test("NO CONTROL — nothing in the app offers an alert to configure", () => {
  // The competitor's version is a Discord you join and an alert you maintain.
  // There is no settings page here, no brand watchlist, no price ceiling.
  for (const file of ["app/settings/page.js", "app/board/page.js"]) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const control of [/create alert/i, /notify me/i, /watchlist/i,
                           /alert settings/i, /price alert/i]) {
      assert.doesNotMatch(src, control, `${file} must not offer an alert to configure`);
    }
  }
});

test("channels are declared, and only the built one claims to work", () => {
  const status = channelStatus();
  const built = status.filter((c) => c.built);
  assert.deepEqual(built.map((c) => c.id), ["on-platform"],
    "only the surface that needs no permission is live");
  for (const c of status.filter((x) => !x.built)) {
    assert.ok(c.needs && c.needs.length > 10, `${c.id} must state what it awaits`);
  }
  assert.ok(CHANNELS.some((c) => c.id === "discord"),
    "discord is declared as one channel among others");
  assert.ok(CHANNELS.some((c) => c.id === "weekly-digest"));
});

test("wantsFor never throws, whatever the store does", async () => {
  assert.deepEqual(await wantsFor(null), []);
  assert.deepEqual(await wantsFor(""), []);
});
