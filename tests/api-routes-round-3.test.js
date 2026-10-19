// tests/api-routes-round-3.test.js — /api/moodboard, /api/tickets,
// /api/profile/room, /api/wardrobe/photo through the harness.
//
// Continuing docs/audit-test-coverage-2026-08-16. Each of these carries a rule
// the codebase states and nothing enforced:
//   * moodboard DERIVES palette names server-side — "client-supplied labels
//     are never trusted" — and a malformed palette rejects the WHOLE request
//   * tickets refuse any checkout step before consent is on file
//   * profile rooms give a device identity an honest gate, "never a fake room"
//   * an unkeyed integration answers an honest 503, per the honesty contract
//
// Every test mints its own device, so the real quotas (moodboard 30/hour,
// tickets, rooms, wardrobe-photo 10/hour) cannot leak between tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { callRoute, newDevice, loadRoute } from "./helpers/route.js";

const moodboard = await loadRoute("app/api/moodboard/route.js");
const tickets = await loadRoute("app/api/tickets/route.js");
const room = await loadRoute("app/api/profile/room/route.js");
const photo = await loadRoute("app/api/wardrobe/photo/route.js");

// ------------------------------------------------------------ /api/moodboard

test("/api/moodboard refuses an unauthenticated write and read", async () => {
  const post = await callRoute(moodboard.POST, {
    path: "/api/moodboard", json: { user: "u-whoever", kind: "text", prompt: "x" },
  });
  assert.equal(post.status, 401);

  const get = await callRoute(moodboard.GET, {
    path: "/api/moodboard", query: { user: "u-whoever" },
  });
  assert.equal(get.status, 401);
});

test("/api/moodboard rejects a malformed filenames shape rather than throwing", async () => {
  const me = newDevice();
  for (const filenames of [undefined, "not-an-array", [], new Array(25).fill("a.jpg")]) {
    const res = await callRoute(moodboard.POST, {
      path: "/api/moodboard", cookies: me.cookies,
      json: { user: me.uid, kind: "upload", uploadId: "up-1", filenames },
    });
    assert.equal(res.status, 400, `filenames=${JSON.stringify(filenames)?.slice(0, 30)} must be a 400`);
    assert.match(res.body.error, /filenames must be an array/i);
  }
});

test("/api/moodboard never trusts a client-supplied palette label", async () => {
  // The route's own words: canonical colour names and weights are derived
  // server-side by paletteFromSwatches; "client-supplied labels are never
  // trusted". A caller sending a hex with a lying name must not get that name
  // back on the record.
  const me = newDevice();
  const res = await callRoute(moodboard.POST, {
    path: "/api/moodboard", cookies: me.cookies,
    json: {
      user: me.uid, kind: "upload", uploadId: `up-${me.uid}`,
      filenames: ["black-wool-coat.jpg"],
      // Pure black, deliberately mislabelled.
      palette: [{ hex: "#000000", weight: 1, name: "NOT_A_REAL_COLOR_NAME" }],
    },
  });
  assert.equal(res.status, 200, "a well-formed upload is accepted");
  // Asserted POSITIVELY, not just as an absence: an absence-only assertion
  // would still pass if the route stopped returning a palette at all, which is
  // the vacuum that bit the booth-roster test in round 2.
  assert.ok(Array.isArray(res.body.palette) && res.body.palette.length === 1,
    "the response carries exactly the one swatch that was sent");
  assert.equal(res.body.palette[0].name, "black",
    "#000000 must be named by the server's own colour table, not by the caller");
  assert.equal(res.body.palette[0].hex, "#000000", "the hex itself is the caller's, and survives");
  assert.ok(!JSON.stringify(res.body).includes("NOT_A_REAL_COLOR_NAME"),
    "and the caller's label appears nowhere in the response or the record");
});

test("/api/moodboard rejects a malformed palette atomically", async () => {
  // "Malformed palettes reject the whole request (400, atomic)" — the upload
  // must not be half-saved with the palette dropped.
  const me = newDevice();
  const res = await callRoute(moodboard.POST, {
    path: "/api/moodboard", cookies: me.cookies,
    json: {
      user: me.uid, kind: "upload", uploadId: `up-bad-${me.uid}`,
      filenames: ["x.jpg"], palette: "not-a-palette",
    },
  });
  assert.equal(res.status, 400, "a malformed palette fails the request, it does not get silently ignored");

  // And nothing was recorded for that identity.
  const after = await callRoute(moodboard.GET, {
    path: "/api/moodboard", cookies: me.cookies, query: { user: me.uid },
  });
  assert.equal(after.status, 200);
  const records = after.body.uploads || after.body.records || [];
  assert.equal(records.length, 0, "a rejected upload leaves no record behind — that is what atomic means");
});

// -------------------------------------------------------------- /api/tickets

test("/api/tickets refuses every verb without identity", async () => {
  const post = await callRoute(tickets.POST, { path: "/api/tickets", json: { user: "u-x", itemId: "i-1" } });
  assert.equal(post.status, 401);

  const get = await callRoute(tickets.GET, { path: "/api/tickets", query: { user: "u-x" } });
  assert.equal(get.status, 401);

  const patch = await callRoute(tickets.PATCH, {
    path: "/api/tickets", method: "PATCH", json: { user: "u-x", id: "1", action: "cancel" },
  });
  assert.equal(patch.status, 401);
});

test("/api/tickets POST requires an itemId, then a product that exists", async () => {
  const me = newDevice();
  const noItem = await callRoute(tickets.POST, {
    path: "/api/tickets", cookies: me.cookies, json: { user: me.uid },
  });
  assert.equal(noItem.status, 400);
  assert.match(noItem.body.error, /itemId required/i);

  const unknown = await callRoute(tickets.POST, {
    path: "/api/tickets", cookies: me.cookies, json: { user: me.uid, itemId: "no-such-product-xyz" },
  });
  assert.equal(unknown.status, 404, "a ticket cannot be opened against a product that does not exist");
  assert.match(unknown.body.error, /product not found/i);
});

test("/api/tickets PATCH validates its arguments and scopes lookups to the caller", async () => {
  const me = newDevice();
  const missing = await callRoute(tickets.PATCH, {
    path: "/api/tickets", method: "PATCH", cookies: me.cookies, json: { user: me.uid },
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /id and action required/i);

  const notMine = await callRoute(tickets.PATCH, {
    path: "/api/tickets", method: "PATCH", cookies: me.cookies,
    json: { user: me.uid, id: "999999", action: "cancel" },
  });
  assert.equal(notMine.status, 404,
    "another owner's ticket id is simply not found — never someone else's row");
});

test("/api/tickets GET is private and never cached", async () => {
  const me = newDevice();
  const res = await callRoute(tickets.GET, {
    path: "/api/tickets", cookies: me.cookies, query: { user: me.uid },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control") || "", /no-store/,
    "withPrivateCache must mark a personal ticket list uncacheable");
});

// --------------------------------------------------------- /api/profile/room

test("/api/profile/room public read 404s honestly for an unknown handle", async () => {
  const res = await callRoute(room.GET, { path: "/api/profile/room", query: { handle: "nobody-here-xyz" } });
  assert.equal(res.status, 404);
  assert.match(res.body.error, /no room at that handle/i);
});

test("/api/profile/room owner read requires identity", async () => {
  const res = await callRoute(room.GET, { path: "/api/profile/room", query: { user: "u-whoever" } });
  assert.equal(res.status, 401);
});

test("/api/profile/room gives a device identity an honest gate, not a fake room", async () => {
  // ADR-002: rooms are a social/trust domain, so only verified sb- accounts
  // hold one. The route promises a device identity "an honest {available:false}
  // gate, never a fake room" — a fabricated empty room would be the failure.
  const device = newDevice();
  const res = await callRoute(room.POST, {
    path: "/api/profile/room", cookies: device.cookies,
    json: { user: device.uid, op: "room.set", handle: "somehandle" },
  });
  assert.equal(res.status, 403, "a device identity cannot write a room");
  assert.ok(!/"room"\s*:\s*\{/.test(res.text), "and is not handed a fabricated room object");
});

test("/api/profile/room rejects an unknown op", async () => {
  const device = newDevice();
  const res = await callRoute(room.POST, {
    path: "/api/profile/room", cookies: device.cookies,
    json: { user: device.uid, op: "definitely.not.an.op" },
  });
  // The sign-in gate is checked before the op switch, so a device identity
  // gets 403 here; the op validation itself is account-gated. Asserting the
  // gate is what is actually reachable, rather than pretending otherwise.
  assert.equal(res.status, 403);
});

// --------------------------------------------------- /api/wardrobe/photo

test("/api/wardrobe/photo demands multipart, and says so", async () => {
  const me = newDevice();
  const res = await callRoute(photo.POST, {
    path: "/api/wardrobe/photo", cookies: me.cookies, json: { user: me.uid, id: "1" },
  });
  assert.equal(res.status, 415, "a JSON body to a multipart endpoint is a 415");
  assert.match(res.body.error, /multipart\/form-data required/i);
});

test("/api/wardrobe/photo refuses an unauthenticated multipart upload", async () => {
  // Exercises the harness's multipart path: a real FormData with a file part.
  const res = await callRoute(photo.POST, {
    path: "/api/wardrobe/photo",
    form: {
      user: "u-whoever", id: "1", consent: "v1",
      photo: { filename: "p.jpg", type: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
    },
  });
  assert.equal(res.status, 401, "multipart parses, then identity is required");
});

test("/api/wardrobe/photo answers an honest 503 when uploads are not configured", async () => {
  // The honesty contract: an unkeyed integration returns an honest 503, never
  // a fake success. Private storage is unconfigured in the test environment,
  // and the gate sits after identity — so this is the real code path a
  // deployment without storage keys takes.
  //
  // TO BE PRECISE ABOUT WHAT THIS DOES AND DOES NOT SAY: the CURRENT
  // deployment HAS storage configured — verified against the running app,
  // where the same request reaches the consent check and answers 400, not 503.
  // So this pins the unkeyed path (any deploy without storage keys, and the
  // suite's own environment), not today's production behaviour.
  const me = newDevice();
  const res = await callRoute(photo.POST, {
    path: "/api/wardrobe/photo", cookies: me.cookies,
    form: {
      user: me.uid, id: "1", consent: "v1",
      photo: { filename: "p.jpg", type: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
    },
  });
  assert.equal(res.status, 503, "no storage configured must be an honest 503");
  assert.ok(res.body.error, "and it names the reason rather than failing blank");
});

test("/api/wardrobe/photo DELETE requires identity and 404s for an unknown item", async () => {
  const anon = await callRoute(photo.DELETE, {
    path: "/api/wardrobe/photo", method: "DELETE", json: { user: "u-whoever", id: "1" },
  });
  assert.equal(anon.status, 401);

  const me = newDevice();
  const missing = await callRoute(photo.DELETE, {
    path: "/api/wardrobe/photo", method: "DELETE", cookies: me.cookies,
    json: { user: me.uid, id: "no-such-item" },
  });
  assert.equal(missing.status, 404,
    "erasure stays available when the upload kill switch is off — it must reach the lookup, not 503");
});

// NOTE — what is NOT reachable here, stated rather than faked.
// The photo route's consent-version check, JPEG sniffing, size cap and palette
// derivation all sit AFTER the uploadsAvailable() gate, which is closed without
// private-storage keys. Testing them would mean faking storage, which would
// test the fake. They belong in a keyed environment, or in direct unit tests of
// lib/wardrobe/photos.js — itself flagged as untested by the coverage audit.
