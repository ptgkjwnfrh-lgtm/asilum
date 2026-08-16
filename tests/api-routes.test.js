// tests/api-routes.test.js — the first tests in this repo that INVOKE an API
// route handler rather than reading its source as a string.
//
// Scope is deliberately the two routes docs/audit-test-coverage-2026-08-16
// ranked first (/api/admin — the only writer of moderation decisions, gated
// solely by ADMIN_TOKEN; /api/privacy — the §18 export/delete obligations),
// plus the invariant that audit found had no executable check anywhere:
// `resolveRequestUser` must never honour a client-claimed uid.
//
// Every test mints its own device via newDevice(), so the real rate limits
// these routes enforce cannot leak between tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { callRoute, newDevice, forgedDevice, loadRoute } from "./helpers/route.js";

// Loaded through loadRoute, not imported statically: the next/server resolve
// hook has to be registered before these modules resolve, and static imports
// are all resolved before any module body runs. See helpers/next-resolve.mjs.
const { GET: adminGET, POST: adminPOST } = await loadRoute("app/api/admin/route.js");
const { GET: privacyGET, DELETE: privacyDELETE } = await loadRoute("app/api/privacy/route.js");
const { POST: resetPOST } = await loadRoute("app/api/reset/route.js");

const GOOD_TOKEN = "test-admin-token-0123456789";

// ADMIN_TOKEN is process-global; set and restore around each admin test so
// ordering cannot decide the result.
async function withAdminToken(value, fn) {
  const previous = process.env.ADMIN_TOKEN;
  if (value === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = value;
  try { return await fn(); } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
}

// ---------------------------------------------------------------- /api/admin

test("/api/admin is disabled honestly when ADMIN_TOKEN is unset", async () => {
  await withAdminToken(undefined, async () => {
    const res = await callRoute(adminGET, { path: "/api/admin", query: { area: "adapters" } });
    assert.equal(res.status, 503, "no token configured must be 503, not 401 — the surface is off, not refusing you");
    assert.match(res.body.error, /admin disabled/i);
  });
});

test("/api/admin refuses a too-short ADMIN_TOKEN rather than accepting it", async () => {
  // A 15-char token is below the documented 16 minimum. Accepting it would be
  // the dangerous failure: the surface would look armed while being trivial.
  await withAdminToken("short-token-123", async () => {
    const res = await callRoute(adminGET, {
      path: "/api/admin", query: { area: "adapters" }, bearer: "short-token-123",
    });
    assert.equal(res.status, 503, "a sub-16-char token must disable the surface even when supplied correctly");
  });
});

test("/api/admin rejects a missing or wrong bearer token", async () => {
  await withAdminToken(GOOD_TOKEN, async () => {
    const none = await callRoute(adminGET, { path: "/api/admin", query: { area: "adapters" } });
    assert.equal(none.status, 401, "no Authorization header");
    assert.match(none.body.error, /bad admin token/i);

    const wrong = await callRoute(adminGET, {
      path: "/api/admin", query: { area: "adapters" }, bearer: GOOD_TOKEN + "x",
    });
    assert.equal(wrong.status, 401, "a token that is a PREFIX of the real one must still fail");

    const truncated = await callRoute(adminGET, {
      path: "/api/admin", query: { area: "adapters" }, bearer: GOOD_TOKEN.slice(0, -1),
    });
    assert.equal(truncated.status, 401, "a truncated token must fail");
  });
});

test("/api/admin serves a read with the correct bearer token", async () => {
  await withAdminToken(GOOD_TOKEN, async () => {
    const res = await callRoute(adminGET, {
      path: "/api/admin", query: { area: "adapters" }, bearer: GOOD_TOKEN,
    });
    assert.equal(res.status, 200, "the happy path must actually work, or the 401s above prove nothing");
    assert.ok(Array.isArray(res.body.adapters), "area=adapters returns the adapter roster");
  });
});

test("/api/admin POST is gated by the same token as GET", async () => {
  // A write surface gated more weakly than its read surface is the classic
  // half-applied auth bug; this pins both to the same gate.
  await withAdminToken(GOOD_TOKEN, async () => {
    const res = await callRoute(adminPOST, {
      path: "/api/admin", json: { action: "tag.add", productId: "p-1", tag: "x" },
    });
    assert.equal(res.status, 401, "an unauthenticated POST must not reach the action dispatch");
  });
  await withAdminToken(undefined, async () => {
    const res = await callRoute(adminPOST, { path: "/api/admin", json: { action: "tag.add" } });
    assert.equal(res.status, 503, "and with no token configured the write surface is off too");
  });
});

// -------------------------------------------------------------- /api/privacy

test("/api/privacy GET requires proof of identity", async () => {
  const res = await callRoute(privacyGET, { path: "/api/privacy" });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /authentication required/i);
});

test("/api/privacy GET serves a bare request from the signed cookie alone", async () => {
  // The §6 export is a person clicking "download my data" — a bare GET has
  // nothing to claim, so identity is whatever the signed cookie proves.
  const device = newDevice();
  const res = await callRoute(privacyGET, { path: "/api/privacy", cookies: device.cookies });
  assert.equal(res.status, 200, "a valid device cookie with no ?user= must be served");
  assert.ok(res.body && typeof res.body === "object", "an export payload comes back");
  assert.equal(res.headers.get("Content-Disposition"),
    'attachment; filename="asilum-personal-data.json"', "it is a download");
  assert.match(res.headers.get("Cache-Control") || "", /no-store/,
    "a person's whole personalization export must never be cacheable");
});

test("/api/privacy GET refuses an sb- claim with no bearer token", async () => {
  // An account claim goes through the normal path and needs its bearer, even
  // when a perfectly valid device cookie is present.
  const device = newDevice();
  const res = await callRoute(privacyGET, {
    path: "/api/privacy",
    query: { user: "sb-11111111-1111-4111-8111-111111111111" },
    cookies: device.cookies,
  });
  assert.equal(res.status, 401, "a device cookie must not authenticate an account id");
});

test("/api/privacy DELETE demands the exact confirmation phrase", async () => {
  const device = newDevice();
  const missing = await callRoute(privacyDELETE, {
    path: "/api/privacy", method: "DELETE", cookies: device.cookies, json: { user: device.uid },
  });
  assert.equal(missing.status, 400, "no confirm phrase");
  assert.match(missing.body.error, /confirmation phrase/i);

  const wrong = await callRoute(privacyDELETE, {
    path: "/api/privacy", method: "DELETE", cookies: device.cookies,
    json: { user: device.uid, confirm: "delete personalization" },
  });
  assert.equal(wrong.status, 400, "the phrase is case-sensitive and exact");
});

test("/api/privacy DELETE requires identity before it considers the phrase", async () => {
  // Order matters: an unauthenticated caller must not be able to probe whether
  // their phrase was right.
  const res = await callRoute(privacyDELETE, {
    path: "/api/privacy", method: "DELETE",
    json: { user: "u-someone-else", confirm: "DELETE PERSONALIZATION" },
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /authentication required/i);
});

test("/api/privacy DELETE refuses a non-JSON content type", async () => {
  const device = newDevice();
  const res = await callRoute(privacyDELETE, {
    path: "/api/privacy", method: "DELETE", cookies: device.cookies,
    rawBody: "user=x&confirm=y", headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  assert.equal(res.status, 415, "form encoding keeps cookie-auth writes inside the CSRF simple-request envelope");
});

// ----------------------------------------------- the client-claimed-uid rule

test("a client-claimed uid is never honoured — the cookie decides", async () => {
  // asilum-architecture: 'Never trust a client-claimed uid.' Before this test
  // that rule had no executable check anywhere in the suite — resolveRequestUser
  // was not named in a single test file (docs/audit-test-coverage-2026-08-16).
  const mine = newDevice();
  const someoneElse = newDevice();

  const res = await callRoute(resetPOST, {
    path: "/api/reset", cookies: mine.cookies, json: { user: someoneElse.uid },
  });

  assert.equal(res.status, 200, "the request is authentic — my cookie is valid");
  assert.equal(res.body.userId, mine.uid,
    "the wiped profile must be the COOKIE's owner, never the claimed id");
  assert.notEqual(res.body.userId, someoneElse.uid,
    "honouring the claim would let anyone wipe anyone's taste profile");
});

test("a forged device signature authenticates nobody", async () => {
  const forged = forgedDevice();
  const res = await callRoute(resetPOST, {
    path: "/api/reset", cookies: forged.cookies, json: { user: forged.uid },
  });
  assert.equal(res.status, 401, "a well-formed uid with a wrong HMAC must not authenticate");
});

test("/api/reset rejects an unauthenticated caller", async () => {
  const res = await callRoute(resetPOST, { path: "/api/reset", json: { user: "u-whoever" } });
  assert.equal(res.status, 401);
});
