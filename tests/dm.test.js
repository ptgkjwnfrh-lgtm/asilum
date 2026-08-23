// tests/dm.test.js — the DM vocabulary, and the store's refusal to fake it.
//
// The LAWS are triggers and are proven in tests/postgres-integration.test.js
// against a real database. What is tested here is everything that is genuinely
// isomorphic — the folder rule, the refusal wording, the cursor — plus the one
// property that keeps the two halves honest: in memory mode the store REFUSES
// rather than implementing a second version of the law.

import test from "node:test";
import assert from "node:assert/strict";

import {
  BODY_MAX, FOLDERS, decodeCursor, describeRefusal, dmMediaEnabled, encodeCursor,
  foldersForNewConversation, messagingEnabled, normalizeBody,
} from "../lib/dm.js";

test("messaging is ABSENT by default, and media needs a second switch", () => {
  // FEATURE-FLAGS.md: "feature absent (not 'coming soon' fake states in API
  // responses)". OWNER-DECISIONS #3 keeps media behind its own flag until a
  // CSAM provider, a DMCA agent and named moderators exist.
  const before = { m: process.env.MESSAGING_ENABLED, d: process.env.DM_MEDIA_ENABLED };
  try {
    delete process.env.MESSAGING_ENABLED; delete process.env.DM_MEDIA_ENABLED;
    assert.equal(messagingEnabled(), false, "off unless explicitly on");
    assert.equal(dmMediaEnabled(), false);

    process.env.MESSAGING_ENABLED = "1";
    assert.equal(messagingEnabled(), true);
    assert.equal(dmMediaEnabled(), false, "messaging on does NOT turn media on");

    process.env.DM_MEDIA_ENABLED = "1";
    assert.equal(dmMediaEnabled(), true, "both switches, and only both");

    delete process.env.MESSAGING_ENABLED;
    assert.equal(dmMediaEnabled(), false, "media cannot outlive messaging");
  } finally {
    if (before.m === undefined) delete process.env.MESSAGING_ENABLED; else process.env.MESSAGING_ENABLED = before.m;
    if (before.d === undefined) delete process.env.DM_MEDIA_ENABLED; else process.env.DM_MEDIA_ENABLED = before.d;
  }
});

test("a stranger's first message lands in REQUESTS — the owner's ruling", () => {
  // Per-side: the sender chose to send it, so their own copy is in their inbox.
  assert.deepEqual(foldersForNewConversation({}), { sender: "inbox", recipient: "requests" });
  assert.deepEqual(foldersForNewConversation({ knownToRecipient: true }),
    { sender: "inbox", recipient: "inbox" },
    "a thread you asked for should not arrive as a request");
  for (const f of Object.values(foldersForNewConversation({}))) {
    assert.ok(FOLDERS.includes(f), `${f} is not a real folder`);
  }
});

test("MY OWN block is explained; someone else's refusal is not", () => {
  // The ambiguity protects a recipient from a harasser probing who blocked
  // them. Applied to the caller's OWN block it withholds information from the
  // only person entitled to it — and tells them a business that legally
  // cannot close its DMs is "not reachable".
  const mine = describeRefusal("P0001", { callerBlockedThem: true });
  assert.equal(mine.reason, "you-blocked-them");
  assert.match(mine.message, /unblock/, "the undo is in the message");

  // Theirs: blocked and closed-DMs must be INDISTINGUISHABLE.
  assert.deepEqual(describeRefusal("P0001", {}), describeRefusal("P0002", {}),
    "distinguishing these tells a stranger which one it was");
  assert.equal(describeRefusal("P0001", {}).reason, "not-reachable");

  // These two are safe to be specific about: they are facts about the
  // conversation and the product, not about the other person's choices.
  assert.equal(describeRefusal("P0003", {}).reason, "awaiting-reply");
  assert.equal(describeRefusal("P0004", {}).reason, "business-always-open");
});

test("a body is stripped, bounded, and an empty one stays empty", () => {
  assert.equal(normalizeBody("  hello  "), "hello");
  // Written as escapes, not literal bytes: a stripped literal would leave
  // `assert.equal("ab", "ab")`, a tautology that passes with the strip removed.
  assert.equal(normalizeBody("a\u0007b"), "ab", "BEL is stripped");
  assert.equal(normalizeBody("a\u0000b\u001Fc\u007Fd"), "abcd", "NUL, unit-sep and DEL too");
  assert.equal(normalizeBody("keep\ttab\nand newline"), "keep\ttab\nand newline");
  assert.equal(normalizeBody("\r\nx\r\n"), "x");
  assert.equal(normalizeBody("   "), "");
  assert.equal(normalizeBody(null), "");
  assert.equal(normalizeBody("x".repeat(BODY_MAX + 500)).length, BODY_MAX);
});

test("the inbox cursor carries a tiebreaker AND a snapshot", () => {
  // Without the id, two rows sharing a timestamp make `<` skip one and `<=`
  // loop forever. Without the snapshot, a conversation that becomes active
  // mid-scroll jumps above the cursor and is never shown — while the badge
  // still counts it.
  const c = encodeCursor({
    activityAt: "2026-08-23T10:00:00.000Z",
    conversationId: "11111111-1111-4111-8111-111111111111",
    snapshot: "2026-08-23T11:00:00.000Z",
  });
  const back = decodeCursor(c);
  assert.equal(back.conversationId, "11111111-1111-4111-8111-111111111111");
  assert.equal(back.activityAt, "2026-08-23T10:00:00.000Z");
  assert.equal(back.snapshot, "2026-08-23T11:00:00.000Z");

  for (const junk of ["", "nonsense", "a~b", "2026-08-23T10:00:00Z~not-a-uuid~2026-08-23T11:00:00Z",
                      "bad~11111111-1111-4111-8111-111111111111~2026-08-23T11:00:00Z"]) {
    assert.equal(decodeCursor(junk), null, `${junk} must not decode`);
  }
  assert.equal(encodeCursor({ activityAt: null, conversationId: "x", snapshot: "y" }), "");
});

// --- the store's honesty ----------------------------------------------------

test("in memory mode the store REFUSES rather than faking the laws", async () => {
  // The whole reason this module has no mem mirror. The laws are triggers; a
  // JS reimplementation is a second law, and the unit suite would certify the
  // second one while production runs the first. lib/db/production.js:2645
  // records that exact failure already: "Every unit test runs mem, which is
  // why it survived."
  const dm = await import("../lib/db/dm.js");
  const uuid = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  const paths = [
    () => dm.unreadSummary(uuid),
    () => dm.listFolder(uuid, {}),
    () => dm.openConversation(uuid, other),
    () => dm.blockAccount(uuid, other),
    () => dm.setDmsOpen(uuid, false),
    () => dm.readDmsOpen(uuid),
    () => dm.listBlocks(uuid),
  ];
  for (const run of paths) {
    await assert.rejects(run, (e) => e.code === "DM_UNAVAILABLE",
      "every law-bearing path must refuse, not approximate");
  }
});

test("the store keys on the bare auth uuid, and says so before it touches a pool", async () => {
  // Checked BEFORE the pool, so a bad id is a clear error rather than an
  // unavailability. ADR-002, and the v38 lesson.
  const dm = await import("../lib/db/dm.js");
  const good = "11111111-1111-4111-8111-111111111111";
  for (const wrong of ["u-" + good, "sb-" + good, "guest", "", null]) {
    await assert.rejects(() => dm.blockAccount(wrong, good), /bare auth uuid/);
  }
  await assert.rejects(() => dm.blockAccount(good, good), /cannot block yourself/);
  await assert.rejects(() => dm.openConversation(good, good), /with yourself/);
});
