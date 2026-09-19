// lib/ingest/persistence.js — the one catalog write path for durable sources.

import { createHash } from "node:crypto";
import { upsertItems } from "../db/index.js";
import {
  addProductImages, addProductTags, quarantineListing, recordCatalogSyncSeen,
  saveCatalogVariants,
} from "../db/production.js";
import { typedTagsFrom } from "./adapters/normalize.js";
import { requireGrant } from "./registry.js";
import { validateListingContract } from "../catalog/contract.js";

export async function persistListings({ connectionId, policyId, syncRunId = null, products = [] }) {
  requireGrant(policyId, "storeMetadata");
  const accepted = [], rejected = [];
  for (const product of products) {
    const check = validateListingContract(product);
    if (!check.ok) {
      rejected.push({ sourceListingId:product?.source_product_id || null,reasons:check.reasons });
      await quarantineListing({
        connectionId,sourceKey:product?.source_name || policyId,
        sourceListingId:product?.source_product_id || null,reasonCodes:check.reasons,
        payloadDigest:createHash("sha256").update(JSON.stringify(product || {})).digest("hex"),
        expiresAt:new Date(Date.now()+24*60*60_000).toISOString(),
      });
    } else accepted.push(product);
  }
  if (!accepted.length) return { upserted:0,rejected };
  const upserted = await upsertItems(accepted);
  const policy = requireGrant(policyId, "storeMetadata");
  for (const product of accepted) {
    if (policy.lexicalIndex.state === "allowed") await addProductTags(product.id, typedTagsFrom(product));
    if (policy.cacheImages.state === "allowed" && product.images?.length) {
      await addProductImages(product.id, product.images.map((imageUrl) => ({ imageUrl })));
    }
    if (Array.isArray(product.variants)) await saveCatalogVariants(connectionId, product.id, product.variants);
  }
  if (syncRunId) await recordCatalogSyncSeen(syncRunId, connectionId, accepted.map((item) => item.id));
  return { upserted,rejected };
}
