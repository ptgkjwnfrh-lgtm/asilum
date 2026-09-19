import test from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;

const { amountToMinor, resolveAvailability, validateListingContract } = await import("../lib/catalog/contract.js");
const { normalizeSourceProduct } = await import("../lib/ingest/adapters/normalize.js");
const { normalizeEbayItem, guessEra } = await import("../lib/ingest/ebay.js");

test("money keeps currency exponents exact", () => {
  assert.equal(amountToMinor("1234", "JPY"), "1234");
  assert.equal(amountToMinor("12.34", "EUR"), "1234");
  assert.equal(amountToMinor("1.234", "KWD"), "1234");
  assert.equal(amountToMinor("1.2", "KRW"), null, "fractional KRW is not rounded into a lie");
  assert.equal(amountToMinor("10", ""), null, "currency is never guessed");
});
test("unknown or contradictory stock is never boolean-available", () => {
  assert.deepEqual(resolveAvailability("unknown", undefined), { availability: "unknown", isAvailable: false, conflict: false });
  assert.deepEqual(resolveAvailability("available", false), { availability: "unknown", isAvailable: false, conflict: true });
  const item = normalizeSourceProduct({
    id: "x", title: "coat", price: "10", currency: "EUR",
    url: "https://merchant.example/x", availability_status: "unknown",
  }, "merchant");
  assert.equal(item.is_available, false);
});

test("normalization never promotes brand to designer or invents brand, era, or currency", () => {
  const item = normalizeSourceProduct({
    id: "x", title: "mystery wool coat", price: "10",
    url: "https://merchant.example/x", availability_status: "available",
  }, "merchant");
  assert.equal(item.brand, null);
  assert.deepEqual(item.designers, []);
  assert.equal(item.era, null);
  assert.equal(item.currency, null);
  assert.equal(guessEra("mystery wool coat"), null);

  const ebay = normalizeEbayItem({
    itemId: "v1|1|0", title: "Beautiful wool coat", price: { value: "30", currency: "EUR" },
    itemWebUrl: "https://www.ebay.de/itm/1",
  });
  assert.equal(ebay.brand, null, "title words are not a brand claim");
  assert.equal(ebay.era, null, "an undated offer stays undated");
});

test("connection identity prevents two stores' product 123 colliding", () => {
  const base = {
    id: "123", title: "coat", price: "10", currency: "USD",
    url: "https://merchant.example/x", availability_status: "available",
  };
  const a = normalizeSourceProduct({ ...base, connection_id: "shop-a" }, "shopify");
  const b = normalizeSourceProduct({ ...base, connection_id: "shop-b" }, "shopify");
  assert.notEqual(a.id, b.id);
  assert.equal(a.source_product_id, "123");
  assert.equal(b.source_product_id, "123");
});

test("the publication contract quarantines missing source facts", () => {
  const result = validateListingContract({ schema_version: 1, source_name: "shopify" });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" | "), /connection identity|source listing id|price and currency|policy/);
});
