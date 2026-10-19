// tests/ebay-account-deletion.test.js — the eBay marketplace account deletion
// endpoint, invoked for real (helpers/route.js). The hash is checked against
// an independent computation of eBay's published order
// (challengeCode + verificationToken + endpoint), not against the route's own
// helper — a helper that hashed in the wrong order would agree with itself.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { callRoute, loadRoute } from "./helpers/route.js";

const route = await loadRoute("app/api/ebay/account-deletion/route.js");
const PATH = "/api/ebay/account-deletion";
const TOKEN = "asilum_verify_0123456789abcdef0123456789abcdef";

beforeEach(() => {
  delete process.env.EBAY_DELETION_VERIFICATION_TOKEN;
  delete process.env.EBAY_DELETION_ENDPOINT;
});

test("idle without a verification token: an honest 503, GET and POST", async () => {
  const get = await callRoute(route.GET, { path: PATH, query: { challenge_code: "abc" } });
  assert.equal(get.status, 503);
  assert.match(get.body.error, /EBAY_DELETION_VERIFICATION_TOKEN/);
  const post = await callRoute(route.POST, { path: PATH, json: { metadata: {}, notification: {} } });
  assert.equal(post.status, 503);
});

test("a token outside the portal's shape (32–80 of [A-Za-z0-9_-]) is treated as unset", async () => {
  for (const bad of ["short", "has spaces in it and is long enough to pass", "x".repeat(81), "dots.are.not.allowed.0123456789012345"]) {
    process.env.EBAY_DELETION_VERIFICATION_TOKEN = bad;
    const res = await callRoute(route.GET, { path: PATH, query: { challenge_code: "abc" } });
    assert.equal(res.status, 503, `token ${JSON.stringify(bad.slice(0, 12))} must not be accepted`);
  }
});

test("GET without challenge_code is a 400 once the token is set", async () => {
  process.env.EBAY_DELETION_VERIFICATION_TOKEN = TOKEN;
  const res = await callRoute(route.GET, { path: PATH });
  assert.equal(res.status, 400);
});

test("the challenge response is sha256hex(challengeCode + verificationToken + endpoint), endpoint = SITE_ORIGIN + path by default", async () => {
  process.env.EBAY_DELETION_VERIFICATION_TOKEN = TOKEN;
  const code = "c7f3-eBay-challenge-code";
  const res = await callRoute(route.GET, { path: PATH, query: { challenge_code: code } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type").split(";")[0], "application/json");
  const expected = createHash("sha256").update(code + TOKEN + "https://www.asilummagazine.com" + PATH).digest("hex");
  assert.equal(res.body.challengeResponse, expected);
  assert.equal(Object.keys(res.body).length, 1, "eBay's contract is one field");
});

test("EBAY_DELETION_ENDPOINT overrides the hashed endpoint string verbatim", async () => {
  process.env.EBAY_DELETION_VERIFICATION_TOKEN = TOKEN;
  process.env.EBAY_DELETION_ENDPOINT = "https://asilummagazine.com/api/ebay/account-deletion";
  const res = await callRoute(route.GET, { path: PATH, query: { challenge_code: "k" } });
  const expected = createHash("sha256").update("k" + TOKEN + "https://asilummagazine.com/api/ebay/account-deletion").digest("hex");
  assert.equal(res.body.challengeResponse, expected);
});

test("a notification is acknowledged with a 200 and never echoed", async () => {
  process.env.EBAY_DELETION_VERIFICATION_TOKEN = TOKEN;
  const res = await callRoute(route.POST, {
    path: PATH,
    json: { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: { username: "someone", userId: "u1", eiasToken: "t" } } },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { acknowledged: true });
});
