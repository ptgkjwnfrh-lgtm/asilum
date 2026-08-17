// tests/identity.test.js — the device cookie is the anonymous identity.
//
// `lib/identity.js` is where "who is this request" is decided. The coverage
// audit's recommendation 4 asked for one test that a client-claimed uid is not
// honoured; that landed at the route level in `tests/api-routes.test.js`, and
// `accountIdFromIdentity` is covered in `tests/profile-rooms.test.js`. What was
// never covered is the layer underneath both: the HMAC that makes a device
// cookie mean anything at all.
//
// `signedDeviceValue` and `verifiedDevice` are a signature scheme. If they stop
// agreeing, every anonymous visitor silently becomes a new person and loses
// their taste profile; if `verifiedDevice` stops checking, anyone can be anyone
// by editing a cookie. Neither failure raises an error — both just quietly
// change who the server thinks you are.
//
// These tests pin the round trip, every rejection path, the format coupling
// between `newDeviceId` and the regex `verifiedDevice` enforces, and the
// fail-closed behaviour when the signing secret is missing in production.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEVICE_COOKIE, newDeviceId, resolveRequestUser, signedDeviceValue, verifiedDevice,
} from "../lib/identity.js";

// A minimal stand-in for the Next request surface these functions touch.
const requestWith = (cookieValue, headers = {}) => ({
  cookies: { get: (name) => (name === DEVICE_COOKIE && cookieValue !== undefined ? { value: cookieValue } : undefined) },
  headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
});

// Run `fn` with a patched environment, restoring whatever was there before.
function withEnv(patch, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(patch)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ------------------------------------------------------------- the round trip

test("a freshly minted device signs and verifies back to the same identity", () => {
  const uid = newDeviceId();
  const value = signedDeviceValue(uid);

  assert.ok(value, "the test environment can sign");
  assert.equal(value.split(".").length, 2, "the cookie is uid.signature");
  assert.equal(value.slice(0, value.lastIndexOf(".")), uid);
  assert.equal(verifiedDevice(requestWith(value)), uid, "and it verifies back");
});

test("newDeviceId emits exactly the shape verifiedDevice will accept", () => {
  // These two live in one file but are independently editable. If the id format
  // drifts from the regex, every visitor silently becomes a new person on their
  // next request — no error, just a lost taste profile.
  const ID_SHAPE = /^u-[0-9a-f-]{36}$/;
  for (let i = 0; i < 25; i++) {
    const uid = newDeviceId();
    assert.match(uid, ID_SHAPE, `${uid} matches the shape verifiedDevice enforces`);
    assert.equal(verifiedDevice(requestWith(signedDeviceValue(uid))), uid);
  }
  // Distinct per call — a shared id would merge strangers' profiles.
  const many = new Set(Array.from({ length: 200 }, () => newDeviceId()));
  assert.equal(many.size, 200);
});

// ---------------------------------------------------------------- forgery

test("a tampered uid does not verify", () => {
  const uid = newDeviceId();
  const [, signature] = signedDeviceValue(uid).split(".");

  // Same valid signature, one character of the uid changed.
  const swapped = uid.slice(0, -1) + (uid.endsWith("a") ? "b" : "a");
  assert.notEqual(swapped, uid);
  assert.equal(verifiedDevice(requestWith(swapped + "." + signature)), null);
});

test("a tampered or borrowed signature does not verify", () => {
  const mine = newDeviceId();
  const theirs = newDeviceId();
  const mineSigned = signedDeviceValue(mine);
  const [, theirSignature] = signedDeviceValue(theirs).split(".");
  const [, mySignature] = mineSigned.split(".");

  // Another identity's signature, however genuine, is not mine.
  assert.equal(verifiedDevice(requestWith(mine + "." + theirSignature)), null);

  // One flipped hex character.
  const flipped = mySignature.slice(0, -1) + (mySignature.endsWith("a") ? "b" : "a");
  assert.equal(verifiedDevice(requestWith(mine + "." + flipped)), null);

  // Positive counterpart, so the rejections above are not vacuous.
  assert.equal(verifiedDevice(requestWith(mineSigned)), mine);
});

test("malformed cookies are refused before any comparison is attempted", () => {
  const uid = newDeviceId();
  const [, signature] = signedDeviceValue(uid).split(".");

  const malformed = {
    "no cookie at all": undefined,
    "empty": "",
    "no separator": uid + signature,
    "separator first": "." + signature,
    "empty signature": uid + ".",
    "signature too short": uid + ".abc",
    "signature not hex": uid + "." + "z".repeat(64),
    "uid not a device id": "sb-11111111-1111-1111-1111-111111111111." + signature,
    "uid uppercase": uid.toUpperCase() + "." + signature,
    "empty uid": "." + signature,
  };
  for (const [why, value] of Object.entries(malformed)) {
    assert.equal(verifiedDevice(requestWith(value)), null, why);
  }

  // The shape checks are load-bearing, not cosmetic: `timingSafeEqual` throws
  // on buffers of differing length, so a short signature reaching it would turn
  // a forged cookie into a 500 instead of a clean rejection.
  assert.doesNotThrow(() => verifiedDevice(requestWith(uid + ".ab")));

  // NOTE, from mutation-testing this file: the `dot < 1` guard in
  // `verifiedDevice` is redundant and no test can prove otherwise. Loosening it
  // to `dot < 0` changes nothing observable, because a separator at index 0
  // leaves `uid === ""`, which fails the shape regex on the very next line. It
  // is defence in depth, deliberately left alone — recorded here so the next
  // reader does not go hunting for the test that "should" cover it.
});

// -------------------------------------------------- the claimed-uid rule

test("a device caller's claimed id is ignored — the cookie decides", async () => {
  const mine = newDeviceId();
  const req = requestWith(signedDeviceValue(mine));

  // Whatever is claimed, the answer is the cookie's owner.
  for (const claimed of [mine, newDeviceId(), "u-00000000-0000-0000-0000-000000000000"]) {
    assert.equal(await resolveRequestUser(req, claimed), mine);
  }
  // Including a stale first-load id, which is the case this rule was written for.
  assert.equal(await resolveRequestUser(req, "u-stale"), mine);
});

test("claiming an account identity without a bearer token resolves to nobody", async () => {
  // `sb-` routes into the account branch, which requires a verified Supabase
  // bearer. A valid DEVICE cookie must not rescue the claim — that would let a
  // device identity act as an account.
  const req = requestWith(signedDeviceValue(newDeviceId()));
  assert.equal(await resolveRequestUser(req, "sb-11111111-1111-1111-1111-111111111111"), null);

  // Even with an Authorization header that is not a usable bearer.
  const withHeader = requestWith(signedDeviceValue(newDeviceId()), { authorization: "Bearer not-a-real-token" });
  assert.equal(await resolveRequestUser(withHeader, "sb-11111111-1111-1111-1111-111111111111"), null);
});

test("an absent, oversized or non-string claim is refused outright", async () => {
  const req = requestWith(signedDeviceValue(newDeviceId()));
  for (const claimed of ["", null, undefined, 42, {}, [], "x".repeat(81)]) {
    assert.equal(await resolveRequestUser(req, claimed), null, JSON.stringify(claimed));
  }
  // 80 characters is the boundary and is allowed through to the cookie check.
  assert.notEqual(await resolveRequestUser(req, "u" + "x".repeat(79)), null);
});

test("no cookie means no identity, whatever is claimed", async () => {
  const req = requestWith(undefined);
  assert.equal(verifiedDevice(req), null);
  assert.equal(await resolveRequestUser(req, newDeviceId()), null);
});

// ------------------------------------------------------------ the secret

test("production without a usable signing secret fails closed", () => {
  const uid = newDeviceId();
  const signedInDev = signedDeviceValue(uid);

  withEnv({ NODE_ENV: "production", DEVICE_COOKIE_SECRET: undefined }, () => {
    assert.equal(signedDeviceValue(uid), null, "nothing can be signed");
    assert.equal(verifiedDevice(requestWith(signedInDev)), null, "and nothing verifies");
  });

  // A secret shorter than 32 characters is treated as no secret at all.
  withEnv({ NODE_ENV: "production", DEVICE_COOKIE_SECRET: "tooshort" }, () => {
    assert.equal(signedDeviceValue(uid), null, "a weak secret is not a secret");
  });

  // Positive counterpart: a long enough secret works in production.
  withEnv({ NODE_ENV: "production", DEVICE_COOKIE_SECRET: "s".repeat(32) }, () => {
    const value = signedDeviceValue(uid);
    assert.ok(value, "a 32-character secret signs");
    assert.equal(verifiedDevice(requestWith(value)), uid);
  });

  // And the environment is back as it was, so the rest of the file still signs.
  assert.ok(signedDeviceValue(uid), "env restored");
});

test("a cookie signed under a different secret does not verify", () => {
  const uid = newDeviceId();
  let signedElsewhere;
  withEnv({ NODE_ENV: "production", DEVICE_COOKIE_SECRET: "a".repeat(32) }, () => {
    signedElsewhere = signedDeviceValue(uid);
    assert.equal(verifiedDevice(requestWith(signedElsewhere)), uid, "valid under its own secret");
  });
  withEnv({ NODE_ENV: "production", DEVICE_COOKIE_SECRET: "b".repeat(32) }, () => {
    assert.equal(verifiedDevice(requestWith(signedElsewhere)), null, "worthless under another");
  });
});

test("the cookie name is part of the contract with every existing device", () => {
  // Renaming this logs out every anonymous visitor in the world at once, with
  // no error anywhere — their profile simply stops being found.
  assert.equal(DEVICE_COOKIE, "asilum-device");
});
