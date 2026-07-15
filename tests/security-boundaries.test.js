import test from "node:test";
import assert from "node:assert/strict";

import { readJsonRequest } from "../lib/security/json.js";
import { readJsonResponse } from "../lib/security/http.js";
import { publicProduct } from "../lib/products.js";
import { safeExternalUrl } from "../lib/url.js";
import { normalizeEbayItem } from "../lib/ingest/ebay.js";
import { ebayAdapter } from "../lib/ingest/adapters/ebayAdapter.js";

test("JSON request reader rejects non-JSON and oversized bodies", async () => {
  const wrongType = await readJsonRequest(new Request("https://asilum.test/api", {
    method: "POST", headers: { "content-type": "text/plain" }, body: "{}",
  }));
  assert.equal(wrongType.response.status, 415);

  const oversized = await readJsonRequest(new Request("https://asilum.test/api", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(100) }),
  }), { maxBytes: 32 });
  assert.equal(oversized.response.status, 413);

  const accepted = await readJsonRequest(new Request("https://asilum.test/api", {
    method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true }),
  }));
  assert.deepEqual(accepted.body, { ok: true });
});

test("JSON request reader stops consuming chunked bodies at the byte limit", async () => {
  let pulls = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode("x".repeat(20)));
      if (pulls === 10) controller.close();
    },
  });
  const result = await readJsonRequest(new Request("https://asilum.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    duplex: "half",
  }), { maxBytes: 32 });

  assert.equal(result.response.status, 413);
  assert.ok(pulls < 10);
});

test("upstream JSON reader enforces content type and decompressed size", async () => {
  await assert.rejects(
    readJsonResponse(new Response("{}", { headers: { "content-type": "text/plain" } })),
    /did not return JSON/
  );
  await assert.rejects(
    readJsonResponse(new Response(JSON.stringify({ value: "x".repeat(100) }), {
      headers: { "content-type": "application/json" },
    }), { maxBytes: 32 }),
    /too large/
  );
});

test("external links cannot target local networks or nonstandard ports", () => {
  assert.equal(safeExternalUrl("https://127.0.0.1/admin"), null);
  assert.equal(safeExternalUrl("https://192.168.1.1/router"), null);
  assert.equal(safeExternalUrl("https://merchant.example:8443/item"), null);
  assert.equal(safeExternalUrl("https://merchant.example/item"), "https://merchant.example/item");
});

test("public product payloads allowlist fields and nested metadata", () => {
  const product = publicProduct({
    id: "p-1", title: "Piece", brand: "Studio", tags: { MINIMAL: 0.8 },
    source_product_id: "secret-source-id", moderation_status: "visible",
    search_document: "internal tsvector", created_at: "yesterday",
    era: { year: 2025, raw: "x".repeat(200), injected: { huge: true } },
    size: { label: "M", measurements: { chest: 40, impossible: 999 }, injected: true },
    _parts: { alpha: 0.8, privateSignal: 999 }, _zone: "core",
  });
  assert.equal(product.source_product_id, undefined);
  assert.equal(product.moderation_status, undefined);
  assert.equal(product.search_document, undefined);
  assert.equal(product.created_at, undefined);
  assert.deepEqual(product._parts, { alpha: 0.8 });
  assert.equal(product.era.raw.length, 80);
  assert.deepEqual(product.size.measurements, { chest: 40 });
});

test("eBay normalization preserves the full source listing id", () => {
  const sourceId = "v1|123456789012345678901234567890|0";
  const raw = normalizeEbayItem({ itemId: sourceId, title: "Designer wool coat" });
  const normalized = ebayAdapter.normalizeSourceProduct(raw);
  assert.equal(normalized.source_product_id, sourceId);
  assert.match(normalized.id, /^ebay-[a-f0-9]{32}$/);
});
