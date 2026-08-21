// tests/steward.test.js — the steward's own laws.
//
// The steward reports on the live machine, so its tests must not need one: a
// fake `query` answers each check with the rows it would have read. What is
// pinned here is not SQL but JUDGEMENT — what counts as a blocker, what
// happens when a check cannot run, and the one rule the whole board rests on:
// silence is never a pass.

import test from "node:test";
import assert from "node:assert/strict";

import { runSteward, exitCodeFor, schemaVersionsFrom, CHECKS, ATTENTION } from "../lib/steward/index.js";
import {
  rlsCoverage, orderProjection, foreignCounters, catalogIntegrity, worseOf,
  searchAnswerRate, interpretationCoverage, brainLearning, unknownDemand,
} from "../lib/steward/checks.js";

/** A query stub: match on a fragment of the SQL, answer with rows. */
function fakeQuery(routes) {
  return async (sql) => {
    for (const [fragment, rows] of routes) {
      if (sql.includes(fragment)) return { rows };
    }
    throw new Error(`unstubbed query: ${sql.slice(0, 60)}`);
  };
}

test("with no database, every check is unmeasurable — and never ok", async () => {
  const report = await runSteward({});
  assert.equal(report.findings.length, CHECKS.length);
  assert.equal(report.summary.ok, 0, "an unread check must never be reported as healthy");
  assert.equal(report.summary.unmeasurable, CHECKS.length);
  assert.equal(exitCodeFor(report), 2, "unmeasurable must move the exit code — a dark board is not a green one");
});

test("a check that throws becomes a finding, not a crash", async () => {
  const query = async () => { throw new Error("relation \"items\" does not exist"); };
  const report = await runSteward({ query });
  assert.equal(report.findings.length, CHECKS.length, "one broken check must not take the report down");
  const broken = report.findings.filter((f) => f.state === "unmeasurable");
  assert.ok(broken.length > 0);
  assert.match(broken[0].evidence, /relation "items" does not exist/,
    "the error's own words are the evidence — a swallowed message is indistinguishable from a pass");
});

test("RLS on with no policy is a blocker, in its own words", async () => {
  const found = await rlsCoverage.run({ query: fakeQuery([["pg_tables", [{ tablename: "business_accounts" }]]]) });
  assert.equal(found.state, "blocker");
  assert.match(found.evidence, /business_accounts/);
  assert.match(found.evidence, /locked out/);

  const clean = await rlsCoverage.run({ query: fakeQuery([["pg_tables", []]]) });
  assert.equal(clean.state, "ok");
});

test("an order paid in the ledger but unpaid in the projection is a blocker", async () => {
  // Fragments are matched in order, so the specific ones lead: all three of
  // this check's queries contain "from orders".
  const drifted = await orderProjection.run({ query: fakeQuery([
    ["fee_cents", [{ n: 0 }]],
    ["from orders o", [{ n: 1 }]],
    ["from orders", [{ n: 4 }]],
  ]) });
  assert.equal(drifted.state, "blocker");
  assert.match(drifted.evidence, /paid event and an unpaid projection/);

  // No orders at all is genuinely ok — not unmeasurable, not a warning.
  const empty = await orderProjection.run({ query: fakeQuery([["count(*)::int as n from orders", [{ n: 0 }]]]) });
  assert.equal(empty.state, "ok");
});

test("foreign counters: a share, not a scare", async () => {
  const q = (foreign, total) => fakeQuery([
    ["not exists", [{ n: foreign }]],
    ["from popularity", [{ n: total }]],
  ]);
  assert.equal((await foreignCounters.run({ query: q(0, 900) })).state, "ok");
  assert.equal((await foreignCounters.run({ query: q(53, 968) })).state, "note",
    "the wire legitimately writes some — production's own reading must not read as an alarm");
  assert.equal((await foreignCounters.run({ query: q(500, 968) })).state, "warn",
    "a majority of foreign counters means a writer is mislabeling ids");
});

test("a catalog item without a price cannot be shown honestly", async () => {
  const r = await catalogIntegrity.run({ query: fakeQuery([["from items", [
    { total: 915, bad_price: 3, no_title: 0, no_brand: 0 },
  ]]]) });
  assert.equal(r.state, "blocker");
  assert.match(r.evidence, /3 item\(s\) cannot be shown honestly/);
});

test("findings are ranked worst-first, and attention is the top of that order", async () => {
  const report = await runSteward({ query: fakeQuery([
    ["pg_tables", [{ tablename: "locked_table" }]],           // blocker
    ["from items", [{ total: 10, bad_price: 0, no_title: 0, no_brand: 2 }]], // note
    ["count(*)::int as n from orders", [{ n: 0 }]],           // ok
    ["from edges where a = b", [{ n: 0 }]],                   // ok
    ["not exists", [{ n: 0 }]],
    ["from popularity", [{ n: 10 }]],
    ["from edges", [{ n: 5 }]],
    ["from app_schema_migrations", [{ version: 7 }, { version: 8 }]],
    ["from interactions", [{ n: 0 }]],
  ]) });
  assert.equal(report.findings[0].state, "blocker", "the worst finding leads the board");
  const ranks = report.findings.map((f) => f.state);
  const firstOk = ranks.indexOf("ok");
  assert.ok(firstOk === -1 || !ranks.slice(firstOk).includes("blocker"), "no blocker may sit below an ok");
  assert.ok(report.attention.every((f) => ATTENTION.includes(f.state)));
  assert.equal(exitCodeFor(report), 1, "a blocker exits 1");
});

test("the exit contract distinguishes 'nothing to do' from 'could not look'", async () => {
  assert.equal(exitCodeFor({ summary: { blocker: 0, warn: 0, unmeasurable: 0 } }), 0);
  assert.equal(exitCodeFor({ summary: { blocker: 0, warn: 0, unmeasurable: 3 } }), 2);
  assert.equal(exitCodeFor({ summary: { blocker: 1, warn: 0, unmeasurable: 0 } }), 1);
});

test("schema versions are read from filenames, ignoring the un-versioned files", () => {
  assert.deepEqual(
    schemaVersionsFrom(["schema.sql", "schema-v7.sql", "schema-alpha.sql", "schema-v36.sql", "notes.md"]),
    [7, 36]);
});

test("worseOf keeps the worse of two states", () => {
  assert.equal(worseOf("ok", "blocker"), "blocker");
  assert.equal(worseOf("warn", "note"), "warn");
  assert.equal(worseOf("unmeasurable", "ok"), "unmeasurable");
});

// ---- the model's own live quality ------------------------------------------

test("a rate below the sample floor is unmeasurable, never healthy", async () => {
  // The trap this closes: 0 zero-results out of 3 searches is 0%, which reads
  // like a perfect score and means nothing at all.
  const thin = await searchAnswerRate.run({ query: fakeQuery([["search_logs", [{ total: 3, zero: 0 }]]]) });
  assert.equal(thin.state, "unmeasurable");
  assert.match(thin.evidence, /under the 25 needed/);

  const real = await searchAnswerRate.run({ query: fakeQuery([["search_logs", [{ total: 411, zero: 9 }]]]) });
  assert.equal(real.state, "ok", "production's own 2.2% must not read as an alarm");

  const broken = await searchAnswerRate.run({ query: fakeQuery([["search_logs", [{ total: 400, zero: 120 }]]]) });
  assert.equal(broken.state, "warn", "30% unanswered is the cultural read having stopped working");
  assert.match(broken.action, /SEARCH_CULTURE_FALLBACK/);
});

test("searches answered without being read break the explanation contract", async () => {
  const bad = await interpretationCoverage.run({ query: fakeQuery([["search_logs", [{ total: 200, read: 120 }]]]) });
  assert.equal(bad.state, "warn");
  const good = await interpretationCoverage.run({ query: fakeQuery([["search_logs", [{ total: 411, read: 411 }]]]) });
  assert.equal(good.state, "ok");
});

test("events arriving without profiles is a blocker, not a shrug", async () => {
  // The outage that hides: an unpersonalized feed still looks like a feed.
  const stopped = await brainLearning.run({ query: fakeQuery([["from profiles", [{ profiles: 12, actors: 4000 }]]]) });
  assert.equal(stopped.state, "blocker");
  assert.match(stopped.action, /still looks like a feed/);

  const healthy = await brainLearning.run({ query: fakeQuery([["from profiles", [{ profiles: 4153, actors: 4073 }]]]) });
  assert.equal(healthy.state, "ok");

  // Nobody has acted yet: genuinely ok, and not a division by zero.
  const empty = await brainLearning.run({ query: fakeQuery([["from profiles", [{ profiles: 0, actors: 0 }]]]) });
  assert.equal(empty.state, "ok");
});

test("repeat demand for an unanswered question is the research signal", async () => {
  const quiet = await unknownDemand.run({ query: fakeQuery([["unknown_queries", [{ demanded: 0, total: 3 }]]]) });
  assert.equal(quiet.state, "ok");
  const loud = await unknownDemand.run({ query: fakeQuery([["unknown_queries", [{ demanded: 6, total: 20 }]]]) });
  assert.equal(loud.state, "warn");
  assert.match(loud.evidence, /two or more people/);
});
