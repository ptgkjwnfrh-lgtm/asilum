import test from "node:test";
import assert from "node:assert/strict";
import { normalizeYahooShoppingItem, yahooShoppingAdapter } from "../lib/ingest/adapters/yahooShoppingAdapter.js";
import { normalizeRakutenItem, rakutenAdapter } from "../lib/ingest/adapters/rakutenAdapter.js";
import { requireGrant } from "../lib/ingest/registry.js";

test("Yahoo used inventory keeps exact JPY amounts and is live-only", () => {
  const item = normalizeYahooShoppingItem({ code: "used-1", name: "Used jacket", price: "1234", condition: "used", url: "https://store.example/item/1" });
  assert.equal(item.resale_status, "resale");
  assert.equal(item.money_amount_minor, "1234");
  assert.equal(item.delivery_eligibility, "proxy_required");
  assert.throws(() => requireGrant("yahoo-shopping-jp", "storeMetadata"), /does not allow/);
});

test("Japanese adapters stay disabled without explicit approval and credentials", () => {
  const old = { ...process.env };
  delete process.env.YAHOO_SHOPPING_APPROVED;
  delete process.env.YAHOO_SHOPPING_APP_ID;
  delete process.env.RAKUTEN_ICHIBA_APPROVED;
  delete process.env.RAKUTEN_APPLICATION_ID;
  delete process.env.RAKUTEN_ACCESS_KEY;
  assert.equal(yahooShoppingAdapter.enabled().enabled, false);
  assert.equal(rakutenAdapter.enabled().enabled, false);
  process.env = old;
});

test("Rakuten retail is not mislabeled as resale without a reviewed shop", () => {
  const previous = process.env.RAKUTEN_USED_SHOP_CODES;
  process.env.RAKUTEN_USED_SHOP_CODES = "reviewed-used-shop";
  const base = { itemCode: "shop:item", itemName: "Jacket", itemPrice: "5000", itemUrl: "https://item.rakuten.co.jp/shop/item", availability: 1 };
  assert.equal(normalizeRakutenItem({ ...base, shopCode: "ordinary-retail" }).resale_status, "unknown");
  assert.equal(normalizeRakutenItem({ ...base, shopCode: "reviewed-used-shop" }).resale_status, "resale");
  if (previous === undefined) delete process.env.RAKUTEN_USED_SHOP_CODES;
  else process.env.RAKUTEN_USED_SHOP_CODES = previous;
});
