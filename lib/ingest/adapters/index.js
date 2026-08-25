// lib/ingest/adapters/index.js
// The adapter registry. One import site for every marketplace source.
//
// eBay is the only live implementation (official Browse API, env-gated).
// Shopify remains an honest disabled placeholder until per-store grants exist.

import { disabledAdapter } from "./types.js";
import { ebayAdapter } from "./ebayAdapter.js";
import { woocommerceAdapter } from "./woocommerceAdapter.js";

// TODO(shopify): per-store Storefront API tokens (each independent designer
// store grants its own). SHOPIFY_STOREFRONT_TOKEN exists in .env.example;
// a real implementation needs a store registry (source_connections table).
export const shopifyAdapter = disabledAdapter(
  "shopify",
  "Per-store SHOPIFY_STORE_DOMAIN + SHOPIFY_STOREFRONT_TOKEN grants (Storefront API)"
);

export const ADAPTERS = [
  ebayAdapter,
  woocommerceAdapter,
  shopifyAdapter,
];

/** The adapter for a source name, or null. Case-insensitive; null means the
 *  source is unknown, NOT that it is disabled — adapterStatuses answers that. */
export function getAdapter(sourceName) {
  return ADAPTERS.find((a) => a.getSourceName() === String(sourceName || "").toLowerCase()) || null;
}

// Honest status board for /api/stats, settings, and the admin surface.
export function adapterStatuses() {
  return ADAPTERS.map((a) => ({ source: a.getSourceName(), ...a.enabled() }));
}
