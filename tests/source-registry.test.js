import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { requireGrant, retentionDeadline, sourcePolicy } from "../lib/ingest/registry.js";

test("unknown and denied use grants fail before a fetch can occur", () => {
  assert.throws(() => requireGrant("ebay-browse", "training"), /does not allow training/);
  assert.throws(() => requireGrant("missing", "display"), /not registered/);
  assert.equal(requireGrant("shopify-merchant", "display").mode, "durable");
});
test("live-only policies expire immediately and Shopify merchant rows have a finite deadline", () => {
  assert.equal(sourcePolicy("yahoo-shopping-jp").mode, "live_only");
  assert.equal(retentionDeadline("yahoo-shopping-jp", "2026-09-19T00:00:00.000Z"), "2026-09-19T00:00:00.000Z");
  assert.equal(retentionDeadline("shopify-merchant", "2026-09-19T00:00:00.000Z"), "2026-10-19T00:00:00.000Z");
});

test("the migration registers every named regional/source lead as blocked qualification work", () => {
  const sql = readFileSync(new URL("../supabase/schema-v51-catalog-connections.sql", import.meta.url), "utf8");
  for (const key of [
    "ebay", "therealreal", "vestiaire", "vinted", "poshmark", "mercari-us",
    "yahoo-shopping-jp", "rakuten-ichiba", "shopify-merchant", "woocommerce-merchant",
    "xianyu", "bunjang", "kleinanzeigen", "shafa", "avito", "bland", "yaga-za", "jiji-ng",
  ]) assert.match(sql, new RegExp(`'${key}'`), key);
});
