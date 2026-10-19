// Typed outcomes and stable cursors (19 Sep 2026, docs/v2/CONTRACTS.md).
//
// Law A: empty and unavailable are different outcomes with different status
//        codes; a failure names a code and says whether a retry is worth it.
// Law B: a page cursor is bound to the query, the filters, the eligibility
//        context and a snapshot of the ordered list. Page two never repeats
//        or skips page one; a cursor from another context or a changed list
//        is refused as stale, never silently re-ranked.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { envelope, failure, outcomeOf, OUTCOMES, API_CONTRACT_VERSION } from "../lib/api/outcome.js";
import { encodeCursor, decodeCursor, snapshotOf, bindingOf } from "../lib/search/cursor.js";
import { callRoute, loadRoute, newDevice } from "./helpers/route.js";

test("law A: the envelope says ok or empty; a failure is typed, coded and retryable-flagged", () => {
  assert.equal(outcomeOf(3), "ok");
  assert.equal(outcomeOf(0), "empty");
  const env = envelope({ count: 0 });
  assert.equal(env.contractVersion, API_CONTRACT_VERSION);
  assert.equal(env.outcome, "empty");
  assert.match(env.requestId, /^[0-9a-f-]{36}$/);
  const down = failure("unavailable", "desk_down", "retry later");
  assert.equal(down.status, 503);
  assert.equal(down.body.error.retryable, true);
  assert.equal(down.body.error.code, "desk_down");
  assert.equal(failure("stale_cursor", "x", "y").status, 409);
  assert.equal(failure("stale_cursor", "x", "y").body.error.retryable, false);
  assert.equal(failure("invalid", "x", "y").status, 400);
  assert.equal(failure("unauthorized", "x", "y").status, 401);
  assert.throws(() => failure("ok", "x", "y"), /not a failure outcome/);
  for (const o of ["ok", "empty", "unavailable", "unauthorized", "invalid", "stale_cursor", "rate_limited"]) {
    assert.ok(OUTCOMES.includes(o), o);
  }
});

test("law A: /api/search and /api/tickets no longer answer a failure with an empty 200", () => {
  const search = fs.readFileSync(new URL("../app/api/search/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(search, /catch \{\s*\/\/ engine failure degrades/, "the silent degrade is gone");
  assert.match(search, /catch \(error\) \{[\s\S]{0,900}failure\("unavailable", "search_engine_failed"/);
  const tickets = fs.readFileSync(new URL("../app/api/tickets/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(tickets, /catch \{\s*return NextResponse\.json\(\{ tickets: \[\] \}\)/);
  assert.match(tickets, /failure\("unavailable", "tickets_unavailable"/);
});

test("law A: an empty read is outcome empty with 200, on the ticket desk", async () => {
  const route = await loadRoute("app/api/tickets/route.js");
  const device = newDevice();
  const res = await callRoute(route.GET, { path: "/api/tickets", cookies: device.cookies, query: { user: device.uid } });
  assert.equal(res.status, 200);
  const body = res.body;
  assert.equal(body.outcome, "empty");
  assert.deepEqual(body.tickets, []);
});

test("law B: a cursor round-trips, and refuses a tamper, another context, and a changed list", () => {
  const binding = bindingOf({ q: "jacket", sort: "" });
  const snapshotId = snapshotOf(["a", "b", "c"]);
  const cursor = encodeCursor({ offset: 48, snapshotId, binding });
  assert.deepEqual(decodeCursor(cursor, { binding, snapshotId }), { ok: true, offset: 48, snapshotId, binding });
  assert.equal(decodeCursor(cursor + "x", { binding, snapshotId }).reason, "signature");
  assert.equal(decodeCursor("nonsense", { binding, snapshotId }).reason, "malformed");
  assert.equal(decodeCursor(cursor, { binding: bindingOf({ q: "coat", sort: "" }), snapshotId }).reason, "context");
  assert.equal(decodeCursor(cursor, { binding, snapshotId: snapshotOf(["a", "c", "b"]) }).reason, "snapshot",
    "the same ids in another ORDER is another list");
});

test("law B: /api/discover pages by cursor with no duplicate and no skip, and names a stale cursor", async () => {
  const route = await loadRoute("app/api/discover/route.js");
  const first = await callRoute(route.GET, { path: "/api/discover", query: { q: "jacket", limit: "5" } });
  assert.equal(first.status, 200);
  const page1 = first.body;
  assert.equal(page1.outcome, "ok");
  assert.equal(page1.totalIsExact, true);
  assert.equal(typeof page1.snapshotId, "string");
  assert.ok(page1.nextCursor, "a full page carries a cursor");
  assert.equal(page1.items.length, 5);
  assert.equal(page1.note !== undefined, true, "the reading is still forwarded");

  const second = await callRoute(route.GET, { path: "/api/discover", query: { q: "jacket", limit: "5", cursor: page1.nextCursor } });
  assert.equal(second.status, 200);
  const page2 = second.body;
  assert.equal(page2.offset, 5);
  assert.equal(page2.snapshotId, page1.snapshotId);
  const ids1 = new Set(page1.items.map((it) => it.id));
  for (const it of page2.items) assert.ok(!ids1.has(it.id), `${it.id} repeated on page two`);
  // the legacy offset walk must land on the same second page
  const legacy = await callRoute(route.GET, { path: "/api/discover", query: { q: "jacket", limit: "5", offset: "5" } });
  assert.deepEqual(legacy.body.items.map((it) => it.id), page2.items.map((it) => it.id));

  const other = await callRoute(route.GET, { path: "/api/discover", query: { q: "coat", limit: "5", cursor: page1.nextCursor } });
  assert.equal(other.status, 409);
  const stale = other.body;
  assert.equal(stale.outcome, "stale_cursor");
  assert.equal(stale.error.code, "cursor_context");
  assert.equal(stale.error.retryable, false);

  const garbage = await callRoute(route.GET, { path: "/api/discover", query: { q: "jacket", limit: "5", cursor: "zzz.zzz" } });
  assert.equal(garbage.status, 400);
  assert.equal(garbage.body.outcome, "invalid");
});

test("law B: the browse rack (no query) pages by cursor too, and the last page carries none", async () => {
  const route = await loadRoute("app/api/discover/route.js");
  const first = await callRoute(route.GET, { path: "/api/discover", query: { limit: "96" } });
  const page1 = first.body;
  assert.equal(page1.outcome, page1.items.length ? "ok" : "empty");
  let cursor = page1.nextCursor;
  const seen = new Set(page1.items.map((it) => it.id));
  let pages = 1;
  while (cursor && pages < 30) {
    const res = await callRoute(route.GET, { path: "/api/discover", query: { limit: "96", cursor } });
    assert.equal(res.status, 200);
    const body = res.body;
    for (const it of body.items) { assert.ok(!seen.has(it.id), "repeat across pages"); seen.add(it.id); }
    cursor = body.nextCursor;
    pages++;
  }
  assert.equal(cursor, null, "the walk ends");
  assert.equal(seen.size, page1.total, "every item served exactly once");
});
