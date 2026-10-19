// tests/inventory-intake.test.js — real inventory enters ONLY through the
// checkout engine's own honesty gate. One rule, shared: if these two ever
// disagree, either the intake admits unsellable stock or checkout refuses
// real stock — both are catalog corruption. Batch is atomic: one bad item,
// nothing written.

import test from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;

const { validateIntakeBatch, INTAKE_MAX_ITEMS } = await import("../lib/ingest/intake.js");

const REAL = {
  title: "Wool column coat",
  brand: "Atelier Example",
  price: 240,
  currency: "USD",
  source_product_id: "coat-001",
  source_product_url: "https://atelier.example/shop/coat-001",
  availability_status: "available",
};

test("a real-shaped designer item passes and is namespaced", () => {
  const { ok, problems, normalized } = validateIntakeBatch([REAL], "atelier-example");
  assert.equal(ok, true, JSON.stringify(problems));
  assert.equal(normalized[0].id, "atelier-example-coat-001");
  assert.equal(normalized[0].source_name, "atelier-example");
  assert.equal(normalized[0].availability_status, "available");
});

test("demo-flavoured source names refuse outright", () => {
  for (const source of ["seed", "asilum-seed", "e2e-verification", "test-designs", "demo-house", "sample-rack"]) {
    const { ok, problems } = validateIntakeBatch([REAL], source);
    assert.equal(ok, false, source);
    assert.match(problems[0].reason, /demo\/test|2-40 chars/);
  }
});

test("items the checkout gate would refuse are refused at intake, same words", () => {
  const noUrl = { ...REAL, source_product_id: "coat-002", source_product_url: null };
  const soldOut = { ...REAL, source_product_id: "coat-003", availability_status: "sold" };
  const noPrice = { ...REAL, source_product_id: "coat-004", price: null };
  const { ok, problems } = validateIntakeBatch([REAL, noUrl, soldOut, noPrice], "atelier-example");
  assert.equal(ok, false);
  assert.equal(problems.length, 3);
  assert.match(problems.find((p) => p.index === 1).reason, /demo archive record/); // no live URL = not real
  assert.match(problems.find((p) => p.index === 2).reason, /availability is "sold"/);
  assert.match(problems.find((p) => p.index === 3).reason, /no real price/);
});

test("duplicate source_product_id within a batch refuses", () => {
  const { ok, problems } = validateIntakeBatch([REAL, { ...REAL, title: "Same id again" }], "atelier-example");
  assert.equal(ok, false);
  assert.match(problems[0].reason, /duplicate source_product_id/);
});

test("shape gates: empty, oversized, bad source name", () => {
  assert.equal(validateIntakeBatch([], "atelier-example").ok, false);
  assert.equal(validateIntakeBatch(Array.from({ length: INTAKE_MAX_ITEMS + 1 }, () => REAL), "atelier-example").ok, false);
  assert.equal(validateIntakeBatch([REAL], "Bad Name!").ok, false);
  assert.equal(validateIntakeBatch([REAL], "").ok, false);
});

test("a loopback source URL is not a live source", () => {
  const { ok, problems } = validateIntakeBatch(
    [{ ...REAL, source_product_url: "http://127.0.0.1/shop/x" }], "atelier-example");
  assert.equal(ok, false);
  assert.match(problems[0].reason, /demo archive record/);
});
