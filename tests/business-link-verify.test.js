// tests/business-link-verify.test.js — the business↔inventory link and the
// domain-proof evidence collector. Laws under test: only a VERIFIED business
// links a source; one slug, one business; the collector GATHERS evidence and
// never moves a case; every fetch target passes the public-hostname guard.

import test from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;

const { domainToken, tokenAppearsIn, checkDomainProof } = await import("../lib/brands/verify.js");
const {
  submitBusinessApplication, decideBusinessApplication, setBusinessSourceName,
  getBusinessBySourceName, getBusinessAccount,
} = await import("../lib/db/production.js");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function apply(accountId, brand) {
  return submitBusinessApplication({
    accountId, brandName: brand,
    websiteUrl: "https://atelier.example", shopifyDomain: "atelier-example.myshopify.com",
    statement: null,
  });
}

test("token is deterministic, shaped, and account-bound", () => {
  const t = domainToken(A);
  assert.match(t, /^asilum-verify-[0-9a-f]{16}$/);
  assert.equal(domainToken(A), t);
  assert.notEqual(domainToken(B), t);
  assert.equal(domainToken(""), null);
});

test("meta-tag and well-known detection, both attribute orders", () => {
  const t = domainToken(A);
  assert.equal(tokenAppearsIn(`<meta name="asilum-verify" content="${t}">`, t, { requireMeta: true }), true);
  assert.equal(tokenAppearsIn(`<meta content="${t}" name="asilum-verify">`, t, { requireMeta: true }), true);
  assert.equal(tokenAppearsIn(`just text ${t} in a page`, t, { requireMeta: true }), false);
  assert.equal(tokenAppearsIn(`${t}\n`, t), true);
  assert.equal(tokenAppearsIn("nothing here", t), false);
});

test("checkDomainProof finds the meta tag and reports where", async () => {
  const t = domainToken(A);
  const fetchImpl = async (url) => ({
    ok: true,
    text: async () => (new URL(url).pathname === "/"
      ? `<html><head><meta name="asilum-verify" content="${t}"></head></html>`
      : "nope"),
  });
  const report = await checkDomainProof({
    websiteUrl: "https://atelier.example", shopifyDomain: "atelier-example.myshopify.com",
    accountId: A, fetchImpl,
  });
  assert.equal(report.found, true);
  assert.equal(report.method, "meta tag on site root");
  assert.equal(new URL(report.url).hostname, "atelier.example");
});

test("checkDomainProof falls through to the well-known file", async () => {
  const t = domainToken(A);
  const fetchImpl = async (url) => ({
    ok: true,
    text: async () => (url.endsWith("/.well-known/asilum-verify.txt") ? `${t}\n` : "<html></html>"),
  });
  const report = await checkDomainProof({
    websiteUrl: "https://atelier.example", shopifyDomain: "atelier-example.myshopify.com",
    accountId: A, fetchImpl,
  });
  assert.equal(report.found, true);
  assert.equal(report.method, "well-known file");
});

test("a loopback website is never fetched; absence reports checked urls", async () => {
  const fetched = [];
  const fetchImpl = async (url) => { fetched.push(url); return { ok: true, text: async () => "no" }; };
  const report = await checkDomainProof({
    websiteUrl: "http://127.0.0.1/admin", shopifyDomain: "atelier-example.myshopify.com",
    accountId: A, fetchImpl,
  });
  assert.equal(report.found, false);
  assert.equal(fetched.every((u) => !u.includes("127.0.0.1")), true);
  assert.deepEqual(report.checked, fetched);
});

test("a thrown fetch is a refusal, not a throw", async () => {
  const report = await checkDomainProof({
    websiteUrl: "https://atelier.example", shopifyDomain: "atelier-example.myshopify.com",
    accountId: A, fetchImpl: async () => { throw new Error("down"); },
  });
  assert.equal(report.found, false);
});

test("link law: under_review cannot link; verified can; slug is exclusive", async () => {
  await apply(A, "Atelier Example");
  await assert.rejects(() => setBusinessSourceName(A, "atelier-example"), /verified business/);
  await decideBusinessApplication({ accountId: A, approve: true, note: "founding cohort", actor: "owner" });
  const linked = await setBusinessSourceName(A, "atelier-example");
  assert.equal(linked.sourceName, "atelier-example");
  assert.equal((await getBusinessBySourceName("atelier-example")).accountId, A);

  await apply(B, "Second House");
  await decideBusinessApplication({ accountId: B, approve: true, note: "founding cohort", actor: "owner" });
  await assert.rejects(() => setBusinessSourceName(B, "atelier-example"), /another business/);
  assert.ok(!(await getBusinessAccount(B)).sourceName, "a refused link must leave nothing behind");
});
