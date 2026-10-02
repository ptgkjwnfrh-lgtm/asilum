// tests/dm-stage-c.test.js — the pure half of Stage C (V.2 brief §3–§4).
// The laws that need a database are in tests/postgres-integration.test.js
// ("DM stage C: …"); these are the parts a route and a composer share.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_AFTER_MONTHS, DM_TEXT_MAX_BYTES, DM_TEXT_MAX_GRAPHEMES, EDIT_WINDOW_MS, SHARE_REFUSED_COPY,
  UNSEND_WINDOW_MS, archiveBoundary, bodyRefusal, clearNoticesEnabled, describeRefusal, graphemes,
  isArchived, normalizeSearchText, parseDmSearch, rateBucketFor, readBucketFor, utf8Bytes, withinWindow,
} from "../lib/dm.js";
import { excerptAround } from "../lib/db/dm/edits.js";

test("the search syntax: the brief's four forms, parsed deterministically", () => {
  assert.deepEqual(parseDmSearch("*no-emos-allowed"), { handle: "no-emos-allowed", text: "", exact: false, empty: false });
  assert.deepEqual(parseDmSearch("Jerry's ice cream"), { handle: null, text: "Jerry's ice cream", exact: false, empty: false });
  assert.deepEqual(parseDmSearch("*no-emos-allowed: Jerry’s ice cream"), { handle: "no-emos-allowed", text: "Jerry's ice cream", exact: false, empty: false }, "the curly apostrophe is folded");
  assert.deepEqual(parseDmSearch("“ice cream”"), { handle: null, text: "ice cream", exact: true, empty: false }, "typographic quotes are quotes");
  assert.deepEqual(parseDmSearch('*NO-emos-allowed:"ice  cream"'), { handle: "no-emos-allowed", text: "ice cream", exact: true, empty: false }, "handle case-folded, whitespace collapsed");
  assert.equal(parseDmSearch("   ").empty, true);
  assert.equal(parseDmSearch("").empty, true);
  assert.equal(parseDmSearch("*").empty, true, "a bare star names nobody");
  assert.equal(normalizeSearchText("‘a’  ‚b‛ “c” „d‟"), "'a' 'b' \"c\" \"d\"");
});

test("the text limit refuses with its count and never truncates", () => {
  assert.equal(DM_TEXT_MAX_GRAPHEMES, 1000);
  assert.equal(DM_TEXT_MAX_BYTES, 8192);
  assert.equal(bodyRefusal("x".repeat(1000)), null);
  const r = bodyRefusal("x".repeat(1001));
  assert.equal(r.code, "too-long"); assert.equal(r.graphemes, 1001); assert.match(r.message, /1001/);
  assert.equal(graphemes("👩‍👩‍👧é"), 2, "a family and a composed letter are two clusters");
  assert.equal(utf8Bytes("é"), 2);
  const heavy = bodyRefusal("👩‍👩‍👧".repeat(1000));
  assert.equal(heavy.code, "too-many-bytes", "1,000 clusters that weigh 18,000 bytes hit the byte ceiling");
});

test("the owner's hour: 59:59 is inside, 60:00 is outside, and the client's clock is not consulted", () => {
  assert.equal(EDIT_WINDOW_MS, 3_600_000); assert.equal(UNSEND_WINDOW_MS, 3_600_000);
  const sent = Date.parse("2026-10-02T10:00:00.000Z");
  assert.equal(withinWindow(sent, EDIT_WINDOW_MS, sent + 3_599_999), true, "59:59.999");
  assert.equal(withinWindow(sent, EDIT_WINDOW_MS, sent + 3_600_000), false, "60:00.000");
  assert.equal(withinWindow("2026-10-02T10:00:00.000Z", EDIT_WINDOW_MS, sent + 1000), true, "an ISO string works too");
  assert.equal(withinWindow("garbage", EDIT_WINDOW_MS, sent), false, "an unreadable time is outside every window");
});

test("the archive boundary is six CALENDAR months, day clamped", () => {
  assert.equal(ARCHIVE_AFTER_MONTHS, 6);
  assert.equal(archiveBoundary("2026-08-31T10:00:00.000Z"), "2027-02-28T10:00:00.000Z", "31 Aug → 28 Feb, not 3 Mar");
  assert.equal(archiveBoundary("2026-01-31T00:00:00.000Z"), "2026-07-31T00:00:00.000Z");
  assert.equal(archiveBoundary("2024-02-29T00:00:00.000Z"), "2024-08-29T00:00:00.000Z");
  assert.equal(archiveBoundary("2026-03-15T12:00:00.000Z", 1), "2026-04-15T12:00:00.000Z");
  assert.equal(archiveBoundary("nope"), null);
  const sent = Date.parse("2026-04-01T00:00:00.000Z");
  assert.equal(isArchived(sent, Date.parse("2026-09-30T23:59:59.000Z")), false);
  assert.equal(isArchived(sent, Date.parse("2026-10-01T00:00:00.000Z")), true, "exactly six months on, it is archived");
});

test("the share refusal is the owner's words, byte for byte, and the new refusals name only the caller's own act", () => {
  assert.equal(SHARE_REFUSED_COPY, "*this passenger does not want their profile shared\n\n:Connect with them to get to know them more");
  assert.deepEqual(describeRefusal("DM_SHARE_REFUSED"), { reason: "share-refused", message: SHARE_REFUSED_COPY });
  assert.equal(describeRefusal("P0007").reason, "window-closed");
  assert.equal(describeRefusal("P0008").reason, "edit-conflict");
  assert.equal(describeRefusal("P0006").reason, "message-gone");
  assert.equal(describeRefusal("DM_NO_SUCH_PASSENGER").reason, "no-such-passenger");
  assert.equal(describeRefusal("DM_SCHEMA").reason, "not-available-yet");
  // the collapse that protects the other person is untouched
  assert.equal(describeRefusal("P0001").reason, "not-reachable");
  assert.equal(describeRefusal("P0002").reason, "not-reachable");
});

test("buckets: edits and shares are chatter, search has its own allowance, the controls are untouched", () => {
  assert.deepEqual(rateBucketFor("edit"), { scope: "dm-send", limit: 120 });
  assert.deepEqual(rateBucketFor("share-profile"), { scope: "dm-send", limit: 120 });
  assert.deepEqual(rateBucketFor("clear"), { scope: "dm-act", limit: 240 });
  assert.deepEqual(rateBucketFor("block"), { scope: "dm-act", limit: 240 });
  assert.deepEqual(readBucketFor("search"), { scope: "dm-search", limit: 120 });
  assert.notEqual(readBucketFor("search").scope, readBucketFor("inbox").scope, "a search walks every conversation; it does not share the inbox's allowance");
});

test("the clear notice is OFF by default (OWNER-DECISIONS §9) and on by one switch", () => {
  const before = process.env.DM_CLEAR_NOTICES;
  try {
    delete process.env.DM_CLEAR_NOTICES; assert.equal(clearNoticesEnabled(), false, "decided 2 Oct: clearing one's inbox is private");
    process.env.DM_CLEAR_NOTICES = "1"; assert.equal(clearNoticesEnabled(), true, "the brief's requested behaviour, one variable away");
    process.env.DM_CLEAR_NOTICES = "0"; assert.equal(clearNoticesEnabled(), false);
  } finally {
    if (before === undefined) delete process.env.DM_CLEAR_NOTICES; else process.env.DM_CLEAR_NOTICES = before;
  }
});

test("an excerpt is a window around the hit, folded like the search", () => {
  const body = "a".repeat(100) + " Jerry’s ice cream " + "b".repeat(100);
  const ex = excerptAround(body, "jerry's ice cream");
  assert.ok(ex.includes("Jerry's ice cream"), ex);
  assert.ok(ex.length <= 95 && ex.startsWith("…") && ex.endsWith("…"));
  assert.equal(excerptAround("short", "short"), "short");
});
