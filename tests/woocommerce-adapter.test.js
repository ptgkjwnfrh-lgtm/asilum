import test from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;
process.env.WOOCOMMERCE_STORE_APPROVED = "1";
process.env.WOOCOMMERCE_STORE_URL = "https://shop.example";

const { woocommerceAdapter, normalizeWooProduct } = await import("../lib/ingest/adapters/woocommerceAdapter.js");

test("Woo products carry connection-scoped identity and do not invent a brand", () => {
  const item = normalizeWooProduct({
    id: 123, name: "Wool coat", permalink: "https://shop.example/p/123",
    prices: { price: "1000", currency_minor_unit: 2, currency_code: "EUR" },
    is_in_stock: true,
  }, "store-a");
  assert.equal(item.connection_id, "store-a");
  assert.equal(item.brand, null);
});
test("Woo provider failures are unknown, while a real tombstone is removed", async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => ({ ok: false, status: 500 });
  let result = await woocommerceAdapter.checkAvailability("123");
  assert.equal(result.availability_status, "unknown");
  assert.equal(result.source_response_status, 500);

  global.fetch = async () => ({ ok: false, status: 404 });
  result = await woocommerceAdapter.checkAvailability("123");
  assert.equal(result.availability_status, "removed");
});
