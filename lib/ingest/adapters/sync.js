// lib/ingest/adapters/sync.js
// syncProducts(): run every ENABLED adapter, normalize, upsert into the
// products table (items), write product_images + typed product_tags, and log
// the run in source_sync_logs. Disabled adapters are skipped and logged as
// such — never faked. SERVER-ONLY (imports lib/db).
//
// persistProducts() is that write, on its own, because a second caller needed
// it: scripts/ebay-ingest.mjs fills the catalog from the command line over many
// queries with its own refusal gate. ONE WRITER for both — a catalog with two
// ingest paths acquires two dialects of product_tags within a week, which has
// already happened once in this repo (see addProductTags' header).

import { ADAPTERS } from "./index.js";
import { typedTagsFrom } from "./normalize.js";
import { upsertItems } from "../../db/index.js";
import { addProductTags, addProductImages, recordSyncLog, saveIdentification } from "../../db/production.js";
import { verifyProductColors } from "../colorEvidence.js";

/**
 * Write normalized products into the catalog: the items row, the typed
 * product_tags, the extra product_images, and — when the stream identified a
 * piece — the identification beside it.
 *
 * `results` are THE STREAM's per-listing results (lib/asterisk/stream), used
 * only for the identification rows; pass none and nothing is written there.
 * Returns the number of rows upserted.
 */
export async function persistProducts(products = [], { sourceName = "source", results = [] } = {}) {
  if (!products.length) return 0;
  const upserted = await upsertItems(products.map((p) => ({ ...p, source: p.source_name || sourceName })));
  for (let i = 0; i < products.length; i += 25) {
    await Promise.all(products.slice(i, i + 25).map((p) => Promise.all([
      addProductTags(p.id, typedTagsFrom(p)),
      p.images?.length > 1
        ? addProductImages(p.id, p.images.map((u) => ({ imageUrl: u })))
        : Promise.resolve(0),
    ])));
  }
  // what Asterisk read, kept beside the item (schema v51)
  for (const r of results) {
    if (!r?.identification || !r.product?.id) continue;
    const stored = products.find((p) => p.id === r.product.id || p.id.endsWith(r.product.id));
    if (!stored) continue;
    await saveIdentification(stored.id, {
      source: sourceName, record: r.identification.record, status: r.identification.status,
      model: r.identification.model, promptVersion: r.identification.promptVersion, usage: r.identification.usage,
      costUsd: r.identification.costUsd, searched: r.identification.searched, decoded: r.decoded, readings: r.readings,
    }).catch(() => {});
  }
  return upserted;
}

/**
 * Run every enabled adapter and fold what they return into the catalog.
 *
 * REPORTS PER ADAPTER RATHER THAN THROWING: a disabled or failing source is a
 * row in the result saying so, with what it `needs`, so one bad integration
 * cannot stop the others importing.
 *
 * Colour evidence is recomputed HERE from fetched images rather than trusted
 * from the feed — an adapter's colour claim is a merchant statement, not
 * evidence. See verifyProductColors.
 */
export async function syncProducts({ query, limit } = {}) {
  const results = [];
  for (const adapter of ADAPTERS) {
    const name = adapter.getSourceName();
    const gate = adapter.enabled();
    if (!gate.enabled) {
      results.push({ sourceName: name, enabled: false, itemsSeen: 0, itemsUpserted: 0, status: "disabled", needs: gate.needs });
      continue;
    }
    try {
      const run = await adapter.syncProducts({ query, limit });
      const products = await verifyProductColors(run.products || []);
      const upserted = await persistProducts(products, { sourceName: name, results: run.results || [] });
      const row = { sourceName: name, enabled: true, itemsSeen: products.length, itemsUpserted: upserted, status: "ok",
        ...(run.identified != null ? { identified: run.identified, costUsd: run.costUsd } : {}) };
      await recordSyncLog(row).catch(() => {});
      results.push(row);
    } catch (e) {
      const row = { sourceName: name, enabled: true, itemsSeen: 0, itemsUpserted: 0, status: "failed", error: String(e.message).slice(0, 400) };
      await recordSyncLog(row).catch(() => {});
      results.push(row);
    }
  }
  return results;
}
