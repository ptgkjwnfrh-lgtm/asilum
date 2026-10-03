import test from "node:test";
import assert from "node:assert/strict";

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  dispatchEvent() {},
};

const { bagAdd, bagLineKey, bagList, bagRemove, bagSetQuantity } = await import("../lib/client.js");

test("legacy and native items share one versioned bag without identity collision", () => {
  storage.clear();
  bagAdd({ id: "external-1", title: "External", price: 10, currency: "USD" });
  const native = {
    id: "item-native", title: "Native", price: 20, price_cents: 2_000,
    commerce_rail: "native_storefront", source_name: "asilum-native",
    native_listing_id: "listing-one", default_variant_id: "variant-blue",
    storefront_slug: "objects",
  };
  bagAdd(native);
  bagAdd(native);
  const rows = bagList();
  assert.equal(rows.length, 2, "adding the same listing+variant is idempotent");
  assert.equal(rows[0].quantity, 1, "legacy lines migrate to quantity one");
  assert.equal(rows[0].price_cents, 1_000, "legacy display price migrates to cents");
  assert.equal(rows[1].bag_key, "native:listing-one:variant-blue");
  assert.equal(rows[1].storefront_slug, "objects");

  bagSetQuantity(rows[1].bag_key, 3);
  assert.equal(bagList()[1].quantity, 3);
  bagRemove(rows[1].bag_key);
  assert.deepEqual(bagList().map((row) => row.id), ["external-1"]);
  assert.equal(bagLineKey({ id: "x" }), "x");
});
