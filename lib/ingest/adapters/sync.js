// lib/ingest/adapters/sync.js
// syncProducts(): run every ENABLED adapter, normalize, upsert into the
// products table (items), write product_images + typed product_tags, and log
// the run in source_sync_logs. Disabled adapters are skipped and logged as
// such — never faked. SERVER-ONLY (imports lib/db).

import { ADAPTERS } from "./index.js";
import { typedTagsFrom } from "./normalize.js";
import { upsertItems } from "../../db/index.js";
import { addProductTags, addProductImages, recordSyncLog } from "../../db/production.js";
import { verifyProductColors } from "../colorEvidence.js";

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
      let upserted = 0;
      if (products.length) {
        upserted = await upsertItems(products.map((p) => ({ ...p, source: p.source_name })));
        for (let i = 0; i < products.length; i += 25) {
          await Promise.all(products.slice(i, i + 25).map((p) => Promise.all([
            addProductTags(p.id, typedTagsFrom(p)),
            p.images?.length > 1
              ? addProductImages(p.id, p.images.map((u) => ({ imageUrl: u })))
              : Promise.resolve(0),
          ])));
        }
      }
      const row = { sourceName: name, enabled: true, itemsSeen: products.length, itemsUpserted: upserted, status: "ok" };
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
