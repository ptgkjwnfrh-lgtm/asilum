// tests/business-accounts.test.js — the passport → business upgrade
// (owner law, Aug 13), mem mode. The application rides a REAL brand_cases
// verification case: submitting opens+advances a case, the human decision
// is a CAS-guarded case transition with evidence, a verified business
// never downgrades through the submit path, and the booth roster is
// verification-ordered.

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeShopifyDomain, validBrandName } from "../lib/business.js";
import {
  getBusinessAccount, submitBusinessApplication, decideBusinessApplication,
  listVerifiedBusinesses, listBusinessApplications, getBrandCase,
} from "../lib/db/production.js";

const ACC_A = "11111111-1111-4111-8111-111111111111";
const ACC_B = "22222222-2222-4222-8222-222222222222";

function app(accountId, brand) {
  return {
    accountId,
    brandName: brand,
    websiteUrl: "https://example-" + brand.toLowerCase().replace(/\s+/g, "-") + ".com",
    shopifyDomain: brand.toLowerCase().replace(/\s+/g, "-") + ".myshopify.com",
    statement: "independent label, cut and sewn in-house",
  };
}

test("shopify domain normalizer: accepts real shapes, refuses the rest", () => {
  assert.equal(normalizeShopifyDomain("My-Shop.myshopify.com"), "my-shop.myshopify.com");
  assert.equal(normalizeShopifyDomain("https://my-shop.myshopify.com/admin"), "my-shop.myshopify.com");
  assert.equal(normalizeShopifyDomain("  shop1.myshopify.com  "), "shop1.myshopify.com");
  assert.equal(normalizeShopifyDomain("myshopify.com"), null, "bare apex refused");
  assert.equal(normalizeShopifyDomain("shop.example.com"), null, "non-shopify refused");
  assert.equal(normalizeShopifyDomain("evil.myshopify.com.attacker.io"), null);
  assert.equal(normalizeShopifyDomain(""), null);
  assert.equal(validBrandName("  A  "), null, "one char after trim refused");
  assert.equal(validBrandName("Craig Green"), "Craig Green");
});

test("submit opens a verification case and lands under review", async () => {
  const row = await submitBusinessApplication(app(ACC_A, "Case Study Atelier"));
  assert.equal(row.status, "under_review");
  assert.ok(row.caseId, "application is linked to a case");
  const kase = await getBrandCase(row.caseId);
  assert.equal(kase.kind, "verification");
  assert.equal(kase.status, "under_review", "case advanced open → under_review");
  assert.equal(kase.subjectId, ACC_A);
  assert.ok(kase.evidence.urls.length >= 2, "website + storefront ride as evidence");
  const queue = await listBusinessApplications({ status: "under_review" });
  assert.ok(queue.some((r) => r.accountId === ACC_A));
});

test("approval raises the passport; the case lands verified; the roster lists the booth", async () => {
  const decided = await decideBusinessApplication({
    accountId: ACC_A, approve: true, note: "storefront and site check out", actor: "reviewer-1",
  });
  assert.equal(decided.status, "business");
  const kase = await getBrandCase(decided.caseId);
  assert.equal(kase.status, "verified");
  const roster = await listVerifiedBusinesses();
  assert.equal(roster.length, 1);
  assert.equal(roster[0].brandName, "Case Study Atelier");
});

test("a business account never downgrades through the submit path", async () => {
  await assert.rejects(
    () => submitBusinessApplication(app(ACC_A, "Case Study Atelier")),
    /already a business account/,
  );
  const row = await getBusinessAccount(ACC_A);
  assert.equal(row.status, "business");
});

test("rejection carries the note; reapplying opens a FRESH case and returns to review", async () => {
  const first = await submitBusinessApplication(app(ACC_B, "Second Label"));
  const rejected = await decideBusinessApplication({
    accountId: ACC_B, approve: false, note: "site does not resolve", actor: "reviewer-1",
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reviewNote, "site does not resolve");
  assert.equal((await getBrandCase(first.caseId)).status, "rejected");

  const again = await submitBusinessApplication(app(ACC_B, "Second Label"));
  assert.equal(again.status, "under_review");
  assert.notEqual(again.caseId, first.caseId, "a fresh case — the old one stays in the ledger");
  const approved = await decideBusinessApplication({
    accountId: ACC_B, approve: true, note: "fixed", actor: "reviewer-1",
  });
  assert.equal(approved.status, "business");
});

test("deciding twice is refused; the roster stays verification-ordered", async () => {
  await assert.rejects(
    () => decideBusinessApplication({ accountId: ACC_B, approve: false, note: "x", actor: "reviewer-1" }),
    /not under review/,
  );
  const roster = await listVerifiedBusinesses();
  assert.deepEqual(roster.map((r) => r.brandName), ["Case Study Atelier", "Second Label"],
    "first verified, first booth");
});
