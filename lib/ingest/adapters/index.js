// lib/ingest/adapters/index.js
// The adapter registry. One import site for every marketplace source.
//
// eBay is the only live implementation (official Browse API, env-gated).
// The rest are honest disabled placeholders: real interface, zero fakery,
// zero scraping. Each notes exactly what official access is needed before
// it can go live. See docs/PRODUCTION.md.

import { disabledAdapter } from "./types.js";
import { ebayAdapter } from "./ebayAdapter.js";

// TODO(depop): official Depop partner/affiliate API access — no public product
// API exists today. Requires a signed partnership. Until then: disabled.
export const depopAdapter = disabledAdapter(
  "depop",
  "Depop partner API agreement + DEPOP_API_KEY (no public API; partnership required)"
);

// TODO(grailed): Grailed has no public API. Requires partnership/affiliate
// feed. ToS forbids scraping (also blocked in lib/ingest/sources.js).
export const grailedAdapter = disabledAdapter(
  "grailed",
  "Grailed partnership / affiliate feed + GRAILED_API_KEY (no public API)"
);

// TODO(ssense): SSENSE affiliate program (e.g. via an affiliate network product
// feed). Wire the feed URL + credentials, then map fields in normalize.js.
export const ssenseAdapter = disabledAdapter(
  "ssense",
  "SSENSE affiliate feed access + SSENSE_FEED_URL / SSENSE_API_KEY"
);

// TODO(therealreal): The RealReal affiliate/partner product feed.
export const theRealRealAdapter = disabledAdapter(
  "therealreal",
  "The RealReal affiliate feed + THEREALREAL_FEED_URL / THEREALREAL_API_KEY"
);

// TODO(shopify): per-store Storefront API tokens (each independent designer
// store grants its own). SHOPIFY_STOREFRONT_ACCESS_TOKEN exists in .env.example;
// a real implementation needs a store registry (source_connections table).
export const shopifyAdapter = disabledAdapter(
  "shopify",
  "Per-store SHOPIFY_STOREFRONT_ACCESS_TOKEN grants (Storefront API)"
);

export const ADAPTERS = [
  ebayAdapter,
  depopAdapter,
  grailedAdapter,
  ssenseAdapter,
  theRealRealAdapter,
  shopifyAdapter,
];

export function getAdapter(sourceName) {
  return ADAPTERS.find((a) => a.getSourceName() === String(sourceName || "").toLowerCase()) || null;
}

// Honest status board for /api/stats, settings, and the admin surface.
export function adapterStatuses() {
  return ADAPTERS.map((a) => ({ source: a.getSourceName(), ...a.enabled() }));
}
