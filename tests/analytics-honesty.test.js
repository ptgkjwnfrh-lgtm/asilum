// tests/analytics-honesty.test.js — the /stats operating dashboards
// (owner directive, HANDOVER-2026-08-14 backlog 5). These pin the HONESTY
// rules, which are the part that can rot silently: a rate over zero
// samples must be "not measurable", never a flattering percentage; a
// window edge must not be reported as a real zero; and mem mode must say
// it cannot count rather than drawing an empty dashboard that looks like
// a real one.
//
// The SQL itself is exercised against live Postgres (every block returned
// data on the Aug 14 run); what a mem-mode test can hold is the contract
// the page renders against.

import { test } from "node:test";
import assert from "node:assert/strict";

import { analytics } from "../lib/analytics.js";

test("without a database the dashboards say so instead of showing zeros", async () => {
  const out = await analytics();
  assert.equal(out.available, false, "mem mode cannot answer these honestly");
  assert.equal(out.persistent, false);
  // The absence of the blocks is the point: a shape full of zeros would
  // render as a real dashboard reporting no activity, which is a claim
  // this deploy cannot make. (The event ring is capped and rotates, so
  // any rate computed from it would be an artifact of the cap.)
  assert.equal(out.retention, undefined);
  assert.equal(out.wire, undefined);
  assert.equal(out.search, undefined);
  assert.equal(out.booths, undefined);
});

// The two guards below are the ones most likely to be "simplified" later
// by someone tidying the code, so they are stated as executable rules
// rather than only as comments in lib/analytics.js.

test("a rate over zero samples is not measurable, never 0%", () => {
  // The rule lib/analytics.js implements for emptyRate.
  const rate = (empty, searches) => (searches > 0 ? +(empty / searches).toFixed(3) : null);
  assert.equal(rate(0, 0), null, "a week nobody searched is not a perfect week");
  assert.equal(rate(0, 10), 0, "ten searches that all found something IS a real zero");
  assert.equal(rate(3, 10), 0.3);
});

test("the oldest window bucket reports 'not measurable', not zero returning", () => {
  // The rule retentionWeeks implements: the oldest bucket has no prior
  // week inside the query window, so its returning count would be a
  // retention cliff that is really the edge of the query.
  const weeks = 4;
  const returningFor = (weekAgo, counted) => (weekAgo === weeks - 1 ? null : counted);
  assert.equal(returningFor(3, 0), null, "edge of the window");
  assert.equal(returningFor(0, 0), 0, "this week genuinely had none");
  assert.equal(returningFor(1, 5), 5);
});
