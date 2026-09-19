// lib/ingest/adapters/sync.js
// syncProducts(): run every ENABLED adapter, normalize, upsert into the
// products table (items), write product_images + typed product_tags, and log
// the run in source_sync_logs. Disabled adapters are skipped and logged as
// such — never faked. SERVER-ONLY (imports lib/db).

import { ADAPTERS } from "./index.js";
import { recordSyncLog } from "../../db/production.js";
import { verifyProductColors } from "../colorEvidence.js";
import { persistListings } from "../persistence.js";
import { sourcePolicy } from "../registry.js";

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
      const rawProducts = run.products || [];
      const imageEligible = rawProducts.filter((product) =>
        sourcePolicy(product.policy_id)?.cacheImages?.state === "allowed");
      const verified = await verifyProductColors(imageEligible);
      let verifiedIndex = 0;
      const products = rawProducts.map((product) =>
        sourcePolicy(product.policy_id)?.cacheImages?.state === "allowed"
          ? verified[verifiedIndex++] : product);
      let upserted = 0;
      if (products.length) {
        const durable = products.filter((product) => product.connection_id && product.policy_id);
        if (durable.length) {
          const persisted = await persistListings({
            connectionId: durable[0].connection_id,
            policyId: durable[0].policy_id,
            products: durable.map((p) => ({ ...p, source: p.source_name })),
          });
          upserted = persisted.upserted;
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
