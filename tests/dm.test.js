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
  foldersForNewConversation, messagingEnabled, normalizeBody, rateBucketFor, readBucketFor,
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

  // AND SO ARE THESE. A MINOR finding of the 23 Aug register: P0005 and 42501
  // fell through to "this person is not reachable right now." P0005 is raised
  // on a message that was unsent or redacted — a fact about the MESSAGE — so
  // reacting to something the other person had just withdrawn told the reader
  // their correspondent had become unreachable. The vagueness above protects
  // somebody's privacy; spending it here bought nothing and said something
  // false.
  const gone = describeRefusal("P0005", {});
  assert.equal(gone.reason, "message-gone");
  assert.doesNotMatch(gone.message, /reachable/, "nobody became unreachable");
  assert.doesNotMatch(gone.message, /person/i, "and it is not about a person at all");

  const mark = describeRefusal("42501", {});
  assert.equal(mark.reason, "mark-unavailable");
  assert.doesNotMatch(mark.message, /reachable/);

  // The two that MUST stay collapsed are still the only ones that collapse.
  const collapsed = ["P0001", "P0002"].map((c) => describeRefusal(c, {}).reason);
  assert.deepEqual(collapsed, ["not-reachable", "not-reachable"]);
  for (const code of ["P0003", "P0004", "P0005", "42501"]) {
    assert.notEqual(describeRefusal(code, {}).reason, "not-reachable",
      `${code} is a fact about the conversation, not a claim about a person`);
  }

  // An unknown code still collapses — a refusal nobody has described yet must
  // not invent a specific reason for itself.
  assert.equal(describeRefusal("P9999", {}).reason, "not-reachable");

  // And MY OWN block still outranks every one of them: the caller is entitled
  // to their own answer whatever the trigger said.
  for (const code of ["P0001", "P0003", "P0005", "42501"]) {
    assert.equal(describeRefusal(code, { callerBlockedThem: true }).reason, "you-blocked-them");
  }
});

test("the caller's own block is answerable on EVERY path, not just first contact", async () => {
  // The MINOR finding this closes: lib/dm.js promises "Yours is always
  // explained, and always with the undo", and the route could only honour it
  // where it happened to have resolved the other person already — first
  // contact by handle. Every send into an existing conversation, and every
  // reaction, had nobody to ask about.
  //
  // The decliner is the ONLY person this product lets create a block, so they
  // were also the most likely person to hit the collapsed answer about their
  // own decision.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const route = readFileSync(
    fileURLToPath(new URL("../app/api/dm/route.js", import.meta.url)), "utf8");

  assert.match(route, /const peer = them \|\| await peerOf\(me, conversationId\)/,
    "the send path resolves the counterparty when the handle branch did not");
  assert.match(route, /await peerOfMessage\(me, body\.messageId\)/,
    "and the reaction path resolves it from the message");

  // No `failure(error)` call in a MessageRefused catch may go without the
  // caller-block question being asked first.
  const reactBlock = route.slice(route.indexOf('if (op === "react")'));
  assert.match(reactBlock.slice(0, 900), /callerBlockedThem: mine/,
    "the reaction path used to call failure(error) with no extra at all");
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

// --- the wire contract between the route and the panel ----------------------
//
// THIS EXISTS BECAUSE THE TWO HALVES DISAGREED AND NOTHING NOTICED. The route
// deliberately strips `otherId` from every inbox item and substitutes `handle`
// ("the uuid never leaves the server"), while the panel rendered
// `c.otherId.slice(0, 8)`. The result was a TypeError on the first render with
// any conversation at all — and with no error boundary anywhere in app/, the
// whole client tree came down, on every tab, because the mail desk lives in
// the header.
//
// Two behavioural suites could not catch it: the store tests prove SQL and the
// browser check ran with a stubbed fetch whose shape I wrote by hand to match
// the client. Only the two real halves, compared, catches this.

test("every field the panel reads off an inbox row is one the route sends", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const route = readFileSync(root + "app/api/dm/route.js", "utf8");
  const panel = readFileSync(root + "app/components/MailDesk.jsx", "utf8");

  // What listFolder produces, then what the route's op=inbox mapping does to
  // it — executed, not assumed, so a change to the mapping changes this test.
  const row = {
    id: "c0ffee00-0000-4000-8000-000000000000", state: "accepted",
    otherId: "deadbeef-0000-4000-8000-000000000000", folder: "inbox",
    unread: 2, muted: false, lastActivityAt: "2026-08-23T00:00:00Z", preview: "hi",
  };
  const handles = { [row.otherId]: "some-handle" };
  const { otherId, state, ...rest } = row;                // the route's own line
  const wire = { ...rest, handle: handles[otherId] || null };

  assert.ok(!("otherId" in wire), "the route strips the uuid — that is the point");
  assert.equal(wire.handle, "some-handle");

  // AND IT STRIPS `state`. That column is SHARED by both sides, so the
  // opener's own inbox row carried the word "declined" — naming outright the
  // fact describeRefusal collapses P0001 and P0002 to hide. The panel keys its
  // request controls on `folder`, which is per-side and says only where the
  // thread sits for the reader.
  assert.ok(!("state" in wire),
    "a shared state column on a per-side payload is the refusal spelled out");
  assert.ok("folder" in wire, "the per-side fact is the one the panel needs");

  // Every `c.<field>` the panel reads must exist on the wire object.
  const read = new Set([...panel.matchAll(/\bc\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]));
  const missing = [...read].filter((f) => !(f in wire));
  assert.deepEqual(missing, [],
    `the panel reads ${JSON.stringify(missing)} off an inbox row, and the route does not send it`);

  // and the mapping in the route is still the one this test modelled
  assert.match(route, /page\.items\.map\(\(\{ otherId, state, \.\.\.rest \}\)/,
    "if the route's mapping changes, this test's model must change with it");
});

test("the activity payload does not name WHY a null is null", async () => {
  // peerActivity returns `reciprocal` so the store can say which case it hit —
  // your signals off, theirs off, a block, an unaccepted knock, a conversation
  // you are not in. Forwarding that flag defeats the indistinguishability the
  // nulls exist to provide: `reciprocal:false` means "yours", and
  // `reciprocal:true` with a null readUpTo means "theirs". The panel never
  // read it.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const route = readFileSync(root + "app/api/dm/route.js", "utf8");
  const panel = readFileSync(root + "app/components/MailDesk.jsx", "utf8");

  const stored = { typing: null, readUpTo: null, reciprocal: true };
  const { reciprocal, ...activity } = stored;             // the route's own line
  assert.deepEqual(activity, { typing: null, readUpTo: null });
  assert.ok(!("reciprocal" in activity));

  assert.match(route, /const \{ reciprocal, \.\.\.activity \} = await peerActivity/,
    "if the route stops stripping it, this test's model must change with it");
  // A property access, not the word: the panel says "reciprocal" in the
  // checkbox copy on purpose, and a regex that cannot tell those apart is a
  // test of its own cleverness.
  assert.doesNotMatch(panel, /\.reciprocal\b/,
    "and nothing in the panel reads it off the wire");
});

test("the block list is projected like the inbox: handle and conversation, no uuid", async () => {
  // The register found op=blocks returning raw account uuids while the file
  // three lines up asserts "the uuid never leaves the server". Both cannot be
  // true. This models the route's projection the way the inbox test above
  // models its own — executed, not assumed.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const route = readFileSync(root + "app/api/dm/route.js", "utf8");
  const panel = readFileSync(root + "app/components/MailDesk.jsx", "utf8");

  const stored = {
    accountId: "deadbeef-0000-4000-8000-000000000000",
    conversationId: "c0ffee00-0000-4000-8000-000000000000",
    source: "decline", at: "2026-08-23T00:00:00Z",
  };
  const handles = {};   // someone who knocked without ever publishing a room
  const { accountId, ...rest } = stored;                  // the route's own line
  const wire = { ...rest, handle: handles[accountId] || null };

  assert.ok(!("accountId" in wire), "the uuid does not reach the client");
  assert.equal(wire.handle, null, "and a handle is not guaranteed — knocking needs no room");
  assert.ok(wire.conversationId, "which is why the conversation id must be there to name them");

  assert.match(route, /blocks\.map\(\(\{ accountId, \.\.\.rest \}\)/,
    "if the route's projection changes, this test's model must change with it");
  assert.match(panel, /act\("unblock", naming\)/,
    "and the panel addresses the undo by that projection, never by uuid");
});

test("the panel never renders a raw account id", async () => {
  // The uuid staying server-side is a privacy property, not a detail: it is
  // the identifier that makes the handle search skippable.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const panel = readFileSync(
    fileURLToPath(new URL("../app/components/MailDesk.jsx", import.meta.url)), "utf8");
  assert.doesNotMatch(panel, /\botherId\b/,
    "the panel must address people by handle only");
  assert.doesNotMatch(panel, /\baccountId\b/);
});

test("the safety controls do not share a rate budget with the chatter", () => {
  // A SERIOUS finding of the 23 Aug register. Everything except `send` shared
  // one 240/hour bucket, and the two highest-frequency writes in the product
  // were in it: `typing` fires up to once per 2.5s while composing — 1440/hour
  // from a single composer — and `read` fires on every thread open, while
  // `block`, `decline`, `unblock` and `mute` drew from the same 240. The
  // route's comment claimed "a burst of READS cannot exhaust the ability to
  // block". The traffic that could exhaust it was writes in that very bucket.
  const presence = ["typing", "read"].map(rateBucketFor);
  const safety = ["block", "decline", "unblock", "mute"].map(rateBucketFor);

  for (const p of presence) assert.equal(p.scope, "dm-presence");
  for (const s of safety) assert.equal(s.scope, "dm-act",
    "the controls a person reaches for when they need them");
  assert.notEqual(presence[0].scope, safety[0].scope,
    "which is the whole point: one cannot starve the other");

  // A single composer can spend 1440/hour on its own, so the presence budget
  // has to clear that with room, and it must never be the safety budget.
  assert.ok(presence[0].limit > 1440, "a typist must not throttle their own indicator");

  assert.equal(rateBucketFor("send").scope, "dm-send", "sending keeps its own tighter bucket");
  assert.ok(rateBucketFor("send").limit < safety[0].limit);
  assert.equal(rateBucketFor("something-new").scope, "dm-act",
    "an unknown op falls into the tight bucket, not the generous one");
  assert.equal(rateBucketFor(undefined).scope, "dm-act");
});

test("every read op is bounded, including the ones nobody thought about", async () => {
  // An UNVERIFIED claim of the 23 Aug register, checked and true: four of the
  // six GET ops had no per-subject quota at all — `summary`, polled by every
  // signed-in reader on a 45-second timer; `inbox`, a keyset page carrying a
  // correlated unread count AND a correlated preview subquery per row;
  // `thread`, a member probe plus a 101-row read plus a reactions aggregate
  // plus the palette; and `blocks`.
  //
  // The default is what matters. The two ops that WERE limited got limits
  // because somebody reasoned about enumeration and about polling; the other
  // four were simply never considered. A table with a bounded default cannot
  // acquire an unbounded op by omission.
  for (const op of ["summary", "inbox", "thread", "blocks", "", undefined, "an-op-not-written-yet"]) {
    const bucket = readBucketFor(op);
    assert.ok(bucket.limit > 0, `${op} must be bounded`);
    assert.equal(bucket.scope, "dm-inbox");
  }
  assert.equal(readBucketFor("find").scope, "dm-find", "enumeration keeps its tight bucket");
  assert.ok(readBucketFor("find").limit < readBucketFor("summary").limit);
  assert.equal(readBucketFor("activity").scope, "dm-activity",
    "and polling keeps its generous one — throttling it makes the indicator lie");

  // and the aggregate breakers are REAL, which is the half a per-subject quota
  // cannot do: a flood of fresh identities shares no subject. Called, not
  // read off a table — a budget of 0 is how this file disables a breaker, so
  // "the key exists" proves nothing.
  const { consumeGlobalBudget } = await import("../lib/security/rateLimit.js");
  for (const scope of ["dm-read", "dm-write"]) {
    const drawn = await consumeGlobalBudget(scope);
    assert.equal(drawn.allowed, true, `${scope} allows ordinary traffic`);
    assert.ok(drawn.limit > 0, `${scope} has a real ceiling, not a disabled one`);
    assert.ok(drawn.used >= 1, "and drawing from it actually costs");
  }

  const route = (await import("node:fs")).readFileSync(
    (await import("node:url")).fileURLToPath(new URL("../app/api/dm/route.js", import.meta.url)), "utf8");
  assert.match(route, /consumeGlobalBudget\("dm-read"\)/, "the read path draws it");
  assert.match(route, /consumeGlobalBudget\("dm-write"\)/, "and so does the write path");
});
