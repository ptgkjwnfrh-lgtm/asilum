// tests/api-routes-round-2.test.js — the next four routes through the
// harness, continuing docs/audit-test-coverage-2026-08-16.
//
// /api/boards, /api/business, /api/wardrobe, /api/editorial. Chosen because
// they are the largest remaining unmentioned routes AND because three of them
// carry an invariant that is stated in a comment and enforced nowhere else:
//   * the PUBLIC board view must not leak the owner's uid
//   * the booth roster is public but account ids are not
//   * the editorial byline is SERVER truth — a caller cannot spoof "ASILUM"
//     or another member's handle
//
// Every test mints its own device, so the real quotas these routes enforce
// (boards 20/min, business 10/hour, wardrobe 60/hour) cannot leak between tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { callRoute, newDevice, loadRoute } from "./helpers/route.js";
import { submitBusinessApplication, decideBusinessApplication } from "../lib/db/production.js";

const boards = await loadRoute("app/api/boards/route.js");
const business = await loadRoute("app/api/business/route.js");
const wardrobe = await loadRoute("app/api/wardrobe/route.js");
const editorial = await loadRoute("app/api/editorial/route.js");

// --------------------------------------------------------------- /api/boards

test("/api/boards GET needs either a user or a board id", async () => {
  const res = await callRoute(boards.GET, { path: "/api/boards" });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /user or id required/i);
});

test("/api/boards GET refuses an unauthenticated user listing", async () => {
  const res = await callRoute(boards.GET, { path: "/api/boards", query: { user: "u-whoever" } });
  assert.equal(res.status, 401);
});

test("/api/boards GET ignores the claimed user and lists the cookie's owner", async () => {
  // Same rule as /api/reset, different route. Listing someone else's boards by
  // asking is the failure this closes.
  const mine = newDevice();
  const other = newDevice();
  await callRoute(boards.POST, {
    path: "/api/boards", cookies: mine.cookies, json: { user: mine.uid, name: "mine only" },
  });
  const res = await callRoute(boards.GET, {
    path: "/api/boards", cookies: mine.cookies, query: { user: other.uid },
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.boards));
  assert.ok(res.body.boards.every((b) => b.userId === mine.uid),
    "every board returned must belong to the COOKIE owner, never the claimed id");
});

test("/api/boards GET rejects an over-long board id before looking it up", async () => {
  const res = await callRoute(boards.GET, { path: "/api/boards", query: { id: "b".repeat(81) } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /invalid board id/i);
});

test("/api/boards GET answers 404 honestly for an unknown board", async () => {
  const res = await callRoute(boards.GET, { path: "/api/boards", query: { id: "no-such-board-xyz" } });
  assert.equal(res.status, 404);
  assert.match(res.body.error, /board not found/i);
});

test("/api/boards public share view does not leak the owner's uid", async () => {
  // cleanBoard(board, { includeOwner: false }) — stated in the route, enforced
  // nowhere else. A share link that carries the owner's identity is the bug.
  const owner = newDevice();
  const created = await callRoute(boards.POST, {
    path: "/api/boards", cookies: owner.cookies, json: { user: owner.uid, name: "share me" },
  });
  assert.equal(created.status, 200, "board creation must succeed for the rest of this test to mean anything");
  const boardId = created.body.board.id;

  // Fetched by id, with NO cookie at all — the public share path.
  const res = await callRoute(boards.GET, { path: "/api/boards", query: { id: boardId } });
  assert.equal(res.status, 200);
  assert.equal(res.body.board.userId, undefined, "the owner's uid must be stripped from a public board");
  assert.equal(res.body.owned, false, "an anonymous viewer does not own it");
  assert.ok(!JSON.stringify(res.body).includes(owner.uid),
    "the owner's uid must not appear anywhere in the public payload");
});

test("/api/boards POST requires identity, then requires a name or an item", async () => {
  const anon = await callRoute(boards.POST, { path: "/api/boards", json: { user: "u-whoever" } });
  assert.equal(anon.status, 401);

  const me = newDevice();
  const empty = await callRoute(boards.POST, {
    path: "/api/boards", cookies: me.cookies, json: { user: me.uid },
  });
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /name or item required/i);
});

// ------------------------------------------------------------- /api/business

test("/api/business booth roster is public and leaks no account ids", async (t) => {
  // A booth is a public storefront; the account behind it is not.
  //
  // SEEDS A VERIFIED BUSINESS FIRST, deliberately. The first draft of this
  // test iterated `booths` and asserted each one's keys — and passed against a
  // route reverted to include accountId, because with no verified businesses
  // the loop body never ran. That is precisely the law-2 anti-pattern ("a test
  // asserting the benign case passes against the bug"); it was caught by
  // running the revert, which is the only thing that catches it.
  const accountId = "11111111-2222-4111-8111-" + String(Date.now()).slice(-12);
  await submitBusinessApplication({
    accountId, brandName: "Booth Test Brand",
    websiteUrl: "https://booth-test.example.com", shopifyDomain: "booth-test.myshopify.com",
    statement: null,
  });
  await decideBusinessApplication({ accountId, approve: true, note: "seeded by test", actor: "test" });
  t.after(async () => {
    // mem-only fixture; nothing to purge on Postgres because this test does
    // not run against it. Left explicit so a future pg run does not inherit a
    // silent assumption.
  });

  const res = await callRoute(business.GET, { path: "/api/business", query: { booths: "1" } });
  assert.equal(res.status, 200, "the roster needs no authentication");
  assert.equal(res.body.total, 10, "ten booths, per the hotlist law");
  assert.ok(res.body.booths.length >= 1,
    "the seed must be visible — otherwise the key assertions below are vacuous");
  assert.equal(res.body.open, 10 - res.body.booths.length, "open + taken must account for all ten");

  const seeded = res.body.booths.find((b) => b.brandName === "Booth Test Brand");
  assert.ok(seeded, "the seeded brand appears on the public roster");
  // sourceName joined the public shape 18 Aug (business↔inventory link): it
  // is the brand's inventory NAMESPACE, already public in every item id —
  // never an account identifier. The law this pins is unchanged: no
  // accountId, no uid, nothing that names the person behind the booth.
  assert.deepEqual(Object.keys(seeded).sort(), ["brandName", "sourceName", "verifiedAt", "websiteUrl"],
    "a booth exposes its storefront and its inventory namespace — no accountId, no uid");
  assert.equal(seeded.sourceName, null, "unlinked business shows null, not undefined");
  assert.ok(!JSON.stringify(res.body).includes(accountId),
    "the account id behind a booth must not appear anywhere in the public payload");
});

test("/api/business GET refuses an unauthenticated account read", async () => {
  const res = await callRoute(business.GET, { path: "/api/business", query: { user: "u-whoever" } });
  assert.equal(res.status, 401);
});

test("/api/business tells a device identity it is a passport without an account", async () => {
  const device = newDevice();
  const res = await callRoute(business.GET, {
    path: "/api/business", cookies: device.cookies, query: { user: device.uid },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "passport", account: false },
    "a u- identity has no account under it, and the route says so rather than guessing");
});

test("/api/business POST refuses a device identity with 403, not 401", async () => {
  // The distinction matters: 401 would mean 'prove who you are' to someone who
  // already has. The honest answer is 'this needs a signed-in account'.
  const device = newDevice();
  const res = await callRoute(business.POST, {
    path: "/api/business", cookies: device.cookies,
    json: {
      user: device.uid, brandName: "Test Brand",
      shopifyDomain: "test.myshopify.com", websiteUrl: "https://example.com",
    },
  });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /ride on a signed-in account/i);
});

// NOTE — why the field validation on /api/business POST is not tested here.
// brandName / shopifyDomain / websiteUrl are validated AFTER the accountId
// gate, so a device identity can never reach them and this harness cannot mint
// an `sb-` identity (that needs a real Supabase bearer). Asserting them would
// require faking identity, which would test the fake. They belong in a
// Postgres/account-backed test, or a direct unit test of lib/business.js.

// ------------------------------------------------------------- /api/wardrobe

test("/api/wardrobe refuses every verb without identity", async () => {
  const g = await callRoute(wardrobe.GET, { path: "/api/wardrobe", query: { user: "u-whoever" } });
  assert.equal(g.status, 401);

  const p = await callRoute(wardrobe.POST, {
    path: "/api/wardrobe", json: { user: "u-whoever", source: "manual", title: "x" },
  });
  assert.equal(p.status, 401);

  const patch = await callRoute(wardrobe.PATCH, {
    path: "/api/wardrobe", method: "PATCH", json: { user: "u-whoever", id: "1", status: "retired" },
  });
  assert.equal(patch.status, 401);

  const del = await callRoute(wardrobe.DELETE, {
    path: "/api/wardrobe", method: "DELETE", json: { user: "u-whoever", id: "1" },
  });
  assert.equal(del.status, 401);
});

test("/api/wardrobe GET is served private and never cached", async () => {
  const me = newDevice();
  const res = await callRoute(wardrobe.GET, {
    path: "/api/wardrobe", cookies: me.cookies, query: { user: me.uid },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user, me.uid);
  assert.match(res.headers.get("Cache-Control") || "", /no-store/,
    "a private wardrobe must never be cacheable");
});

test("/api/wardrobe PATCH validates status before touching the row", async () => {
  const me = newDevice();
  const bad = await callRoute(wardrobe.PATCH, {
    path: "/api/wardrobe", method: "PATCH", cookies: me.cookies,
    json: { user: me.uid, id: "1", status: "deleted" },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /active or retired/i);

  const missing = await callRoute(wardrobe.PATCH, {
    path: "/api/wardrobe", method: "PATCH", cookies: me.cookies,
    json: { user: me.uid, id: "no-such-item", status: "retired" },
  });
  assert.equal(missing.status, 404, "a valid status against an unknown id is a 404, not a 400");
});

test("/api/wardrobe DELETE answers 404 for someone else's item id", async () => {
  const me = newDevice();
  const res = await callRoute(wardrobe.DELETE, {
    path: "/api/wardrobe", method: "DELETE", cookies: me.cookies,
    json: { user: me.uid, id: "not-mine-999" },
  });
  assert.equal(res.status, 404, "lookups are scoped to the caller, so another owner's id is simply not found");
});

// ------------------------------------------------------------ /api/editorial

test("/api/editorial GET rejects an unknown kind and a malformed id", async () => {
  const kind = await callRoute(editorial.GET, { path: "/api/editorial", query: { kind: "nonsense" } });
  assert.equal(kind.status, 400);
  assert.match(kind.body.error, /unknown editorial kind/i);

  const id = await callRoute(editorial.GET, { path: "/api/editorial", query: { id: "abc" } });
  assert.equal(id.status, 400);
  assert.match(id.body.error, /bad post id/i);
});

test("/api/editorial POST requires identity, then a signed-in account", async () => {
  const anon = await callRoute(editorial.POST, {
    path: "/api/editorial", json: { user: "u-whoever", text: "hello" },
  });
  assert.equal(anon.status, 401, "no proof at all is still 401");

  // A device cookie is real, proven identity — and still not allowed to
  // publish. 403 rather than 401 says exactly that.
  const me = newDevice();
  const device = await callRoute(editorial.POST, {
    path: "/api/editorial", cookies: me.cookies, json: { user: me.uid, text: "a transmission" },
  });
  assert.equal(device.status, 403);
  assert.match(device.body.error, /requires a signed-in account/i);
});

test("the wire's account gate is checked before the text is ever parsed", async () => {
  // Ordering is a security property, not a style choice: if sanitization ran
  // first, a caller who cannot post could still use the endpoint to probe what
  // the sanitizer accepts, one 400-vs-403 at a time.
  const me = newDevice();
  for (const text of ["   ", "", "x".repeat(6000), "<script>alert(1)</script>"]) {
    const res = await callRoute(editorial.POST, {
      path: "/api/editorial", cookies: me.cookies, json: { user: me.uid, text },
    });
    assert.equal(res.status, 403,
      `text=${JSON.stringify(text).slice(0, 24)} must be refused by the gate, not judged by the sanitizer`);
  }
});

// NOTE — THE BYLINE RULE LOST ITS TEST, AND THAT IS THE HONEST RECORD.
// `deriveAuthorHandle()` ignores caller input so nobody can post as "ASILUM"
// or as another member. That was tested here by posting with a device identity
// and asserting the byline came back as `reader-<hash>`. Requiring a signed-in
// account to post (the Aug-16 audit's anonymous-abuse P0) makes that path
// unreachable: the harness cannot mint an `sb-` identity, which needs a real
// Supabase bearer. The rule is still enforced in the route; it is simply no
// longer covered here, and it belongs in an account-backed test rather than
// being faked. Recorded rather than quietly dropped.

test("/api/editorial permalink 404s honestly for a post that does not exist", async () => {
  const res = await callRoute(editorial.GET, { path: "/api/editorial", query: { id: "999999999999999" } });
  assert.equal(res.status, 404);
  assert.deepEqual(res.body.posts, [], "a miss is an empty list plus a 404, never an invented post");
});
