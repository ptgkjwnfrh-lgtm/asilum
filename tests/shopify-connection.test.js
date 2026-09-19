import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  canonicalShopifyQuery, tokenTimes, verifyShopifyQueryHmac, verifyShopifyWebhookHmac,
} from "../lib/connections/shopify.js";
import { mapShopifyProduct } from "../lib/connections/shopifyCatalog.js";

test("Shopify callback and webhook signatures bind the exact provider input", () => {
  const params = new URLSearchParams({ shop: "archive.myshopify.com", timestamp: "1", code: "abc" });
  const secret = "test-secret";
  params.set("hmac", createHmac("sha256", secret).update(canonicalShopifyQuery(params)).digest("hex"));
  assert.equal(verifyShopifyQueryHmac(params, secret), true);
  params.set("code", "tampered");
  assert.equal(verifyShopifyQueryHmac(params, secret), false);

  const raw = Buffer.from('{"id":1}');
  const signature = createHmac("sha256", secret).update(raw).digest("base64");
  assert.equal(verifyShopifyWebhookHmac(raw, signature, secret), true);
  assert.equal(verifyShopifyWebhookHmac(Buffer.from('{"id":2}'), signature, secret), false);
});

test("Shopify token expiry is read from the provider response", () => {
  const times = tokenTimes({ expires_in: 3600, refresh_token_expires_in: 7200 }, 0);
  assert.equal(times.tokenExpiresAt, new Date(3_600_000).toISOString());
  assert.equal(times.refreshTokenExpiresAt, new Date(7_200_000).toISOString());
});

test("Shopify imports only explicit resale and preserves variant pages", async () => {
  const connection = {
    id: "00000000-0000-4000-8000-000000000051",
    policyId: "shopify-merchant", policyVersion: 1,
    publicationSelection: { currency: "JPY" },
  };
  const product = {
    id: "gid://shopify/Product/1", title: "Archive coat", description: "", vendor: "House",
    productType: "Coat", tags: ["asilum:resale"], status: "ACTIVE",
    onlineStoreUrl: "https://archive.example/products/coat", updatedAt: "2026-09-19T00:00:00Z",
    media: { nodes: [] },
    variants: {
      nodes: [{ id: "gid://shopify/ProductVariant/1", title: "M", price: "1200", availableForSale: true, selectedOptions: [{ name: "Size", value: "M" }] }],
      pageInfo: { hasNextPage: true, endCursor: "v1" },
    },
  };
  const request = async () => ({ product: { variants: {
    nodes: [{ id: "gid://shopify/ProductVariant/2", title: "L", price: "1300", availableForSale: false, selectedOptions: [] }],
    pageInfo: { hasNextPage: false, endCursor: null },
  } } });
  const mapped = await mapShopifyProduct(product, connection, request);
  assert.equal(mapped.item.money_amount_minor, "1200", "JPY is not multiplied into cents");
  assert.equal(mapped.item.variants.length, 2, "variant pagination is not truncated at the first page");
  assert.equal(mapped.item.brand, "House");
  assert.deepEqual(mapped.item.designers, [], "a vendor is not promoted into a designer claim");

  const retail = await mapShopifyProduct({ ...product, tags: [] }, connection, request);
  assert.equal(retail.item, null);
  assert.equal(retail.reason, "not_explicitly_resale");
});
