// tests/shopify-import.test.js — the consented store import. Laws: variant
// truth decides availability; every item passes the checkout gate or is
// skipped LOUDLY; a non-Shopify response is an error, not an empty success;
// currency is the operator's explicit word, never guessed from the payload
// (products.json does not carry one).

import test from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;

const { mapShopifyProducts, importShopifyInventory, shopifyProductsUrl, stripHtml } =
  await import("../lib/brands/shopify.js");

const DOMAIN = "atelier-example.myshopify.com";
const PAYLOAD = {
  products: [
    {
      id: 111, title: "Wool column coat", handle: "wool-column-coat", vendor: "Atelier Example",
      product_type: "outerwear",
      body_html: "<p>Bonded&nbsp;wool, <b>structured</b> shoulder.</p>",
      variants: [
        { id: 1, price: "260.00", available: false },
        { id: 2, price: "240.00", available: true },
      ],
      images: [{ src: "https://cdn.shopify.com/s/files/coat-front.jpg" }],
    },
    {
      id: 222, title: "Sold-out slip dress", handle: "slip-dress", vendor: "Atelier Example",
      body_html: "", variants: [{ id: 3, price: "180.00", available: false }], images: [],
    },
  ],
};

test("products.json url is guarded and shaped", () => {
  assert.match(shopifyProductsUrl(DOMAIN), /^https:\/\/atelier-example\.myshopify\.com\/products\.json\?limit=250$/);
  assert.equal(shopifyProductsUrl("not-a-shop.example.com"), null);
  assert.equal(shopifyProductsUrl(""), null);
});

test("html strips to prose", () => {
  assert.equal(stripHtml("<p>Bonded&nbsp;wool, <b>structured</b> shoulder.</p>"), "Bonded wool, structured shoulder.");
});

test("mapping: cheapest AVAILABLE variant prices it; variant truth decides availability", () => {
  const raws = mapShopifyProducts(PAYLOAD, DOMAIN, { currency: "CAD" });
  assert.equal(raws.length, 2);
  assert.equal(raws[0].price, 240);
  assert.equal(raws[0].currency, "CAD");
  assert.equal(raws[0].availability_status, "available");
  assert.equal(raws[0].source_product_id, "wool-column-coat");
  assert.equal(raws[0].source_product_url, `https://${DOMAIN}/products/wool-column-coat`);
  assert.equal(raws[0].brand, "Atelier Example");
  assert.equal(raws[1].availability_status, "sold");
});

test("import: gate-passers land, the sold-out is skipped with the gate's own words", async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify(PAYLOAD) });
  const result = await importShopifyInventory({ shopifyDomain: DOMAIN, sourceName: "atelier-example", currency: "CAD", fetchImpl });
  assert.equal(result.error, undefined);
  assert.equal(result.imported.length, 1);
  assert.equal(result.imported[0].id, "atelier-example-wool-column-coat");
  assert.equal(result.imported[0].availability_status, "available");
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].handle, "slip-dress");
  assert.match(result.skipped[0].reason, /availability is "sold"/);
});

test("a non-Shopify response is an error, never an empty success", async () => {
  const html = async () => ({ ok: true, text: async () => "<html>not a shop</html>" });
  const wrongShape = async () => ({ ok: true, text: async () => JSON.stringify({ items: [] }) });
  const refused = async () => ({ ok: false, status: 403, text: async () => "" });
  assert.match((await importShopifyInventory({ shopifyDomain: DOMAIN, sourceName: "atelier-example", fetchImpl: html })).error, /could not read|not a Shopify/);
  assert.match((await importShopifyInventory({ shopifyDomain: DOMAIN, sourceName: "atelier-example", fetchImpl: wrongShape })).error, /not a Shopify/);
  assert.match((await importShopifyInventory({ shopifyDomain: DOMAIN, sourceName: "atelier-example", fetchImpl: refused })).error, /answered 403/);
});

test("a bad domain never reaches fetch", async () => {
  let called = false;
  const result = await importShopifyInventory({
    shopifyDomain: "evil.example.com", sourceName: "atelier-example",
    fetchImpl: async () => { called = true; return { ok: true, text: async () => "{}" }; },
  });
  assert.match(result.error, /not importable/);
  assert.equal(called, false);
});
