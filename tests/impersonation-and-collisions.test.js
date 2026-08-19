// tests/impersonation-and-collisions.test.js — gaps 1 + 2 + 3's screen, in
// memory mode. Laws: a public report opens a REAL case in the impersonation
// track (under_review, named opener, https evidence) and files the human's
// moderation task; the duplicate-brand screen flags for the reviewer and
// never refuses; the image screen flags cross-source collisions and always
// excludes a source's own photos.

import test from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;

const {
  openImpersonationReport, findBrandNameCollisions, normalizeBrandName,
  submitBusinessApplication, getBrandCase, listModerationTasks,
} = await import("../lib/db/production.js");
const { saveImageFingerprint, findImageCollisions, screenItemImages } =
  await import("../lib/db/imageFingerprints.js");

const R = "44444444-4444-4444-8444-444444444444";

test("a report opens an impersonation case, under review, with the reporter on the ledger", async () => {
  const { caseId } = await openImpersonationReport({
    reporterAccountId: R,
    brandName: "Atelier Example",
    evidenceUrls: ["https://atelier.example/lookbook", "https://fake.example/copy"],
    note: "they lifted our whole spring drop",
  });
  const kase = await getBrandCase(caseId);
  assert.equal(kase.kind, "impersonation");
  assert.equal(kase.status, "under_review");
  assert.equal(kase.openedBy, "account:" + R);
  assert.equal(kase.evidence.urls.length, 2);
  const tasks = await listModerationTasks({ status: "open" });
  assert.ok(tasks.some((t) => t.kind === "impersonation-report" && t.subjectId === caseId),
    "the human's task exists");
});

test("http evidence is refused by the case validator itself", async () => {
  await assert.rejects(() => openImpersonationReport({
    reporterAccountId: R, brandName: "Atelier Example",
    evidenceUrls: ["http://insecure.example/x"],
  }), /evidence URL refused/);
});

test("duplicate-brand screen: exact-normalized and near names flag, short and self do not", async () => {
  await submitBusinessApplication({
    accountId: "55555555-5555-4555-8555-555555555555", brandName: "Maison Vergo",
    websiteUrl: "https://vergo.example", shopifyDomain: "vergo.myshopify.com", statement: null,
  });
  assert.equal(normalizeBrandName("MAISON-Vergo!!"), "maisonvergo");
  const exact = await findBrandNameCollisions("maison vergo");
  assert.equal(exact.length, 1);
  assert.equal(exact[0].match, "exact");
  const near = await findBrandNameCollisions("Maison Verga");
  assert.equal(near.length, 1);
  assert.equal(near[0].match, "near");
  const self = await findBrandNameCollisions("Maison Vergo", "55555555-5555-4555-8555-555555555555");
  assert.equal(self.length, 0, "an application never collides with itself");
  const far = await findBrandNameCollisions("Completely Other House");
  assert.equal(far.length, 0);
});

test("image screen: cross-source collision flags, own source never does, absence is reported", async () => {
  await saveImageFingerprint({
    itemId: "house-a-coat", sourceName: "house-a",
    imageUrl: "https://a.example/coat.jpg", dhash: "aaaaaaaaaaaaaaaa",
  });
  const hits = await findImageCollisions("aaaaaaaaaaaaaaa8", { excludeSource: "house-b" });
  assert.equal(hits.length, 1, "two-bit-near photo collides");
  assert.equal((await findImageCollisions("aaaaaaaaaaaaaaaa", { excludeSource: "house-a" })).length, 0,
    "a source's own photos are never collisions");

  const items = [
    { id: "house-b-copy", title: "copy", img: "https://b.example/stolen.jpg", source_name: "house-b" },
    { id: "house-b-dead", title: "dead image", img: "https://b.example/404.jpg", source_name: "house-b" },
  ];
  const screen = await screenItemImages(items, {
    excludeSource: "house-b",
    fingerprint: async (url) => (url.includes("stolen") ? "aaaaaaaaaaaaaaaa" : null),
  });
  assert.equal(screen.collisions.length, 1);
  assert.equal(screen.collisions[0].itemId, "house-b-copy");
  assert.equal(screen.collisions[0].against[0].sourceName, "house-a");
  assert.deepEqual(screen.unfingerprinted, ["house-b-dead"]);
  assert.equal(screen.fingerprints.size, 1);
});
