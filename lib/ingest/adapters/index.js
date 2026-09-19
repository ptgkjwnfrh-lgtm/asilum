// lib/ingest/adapters/index.js
// The adapter registry. One import site for every marketplace source.
//
// eBay, Yahoo Shopping and Rakuten have official, env-gated live search.
// Durable Shopify merchant sync has its own owner-scoped connection queue;
// this generic adapter slot stays disabled so it can never bypass ownership.

import { disabledAdapter } from "./types.js";
import { ebayAdapter } from "./ebayAdapter.js";
import { woocommerceAdapter } from "./woocommerceAdapter.js";
import { yahooShoppingAdapter } from "./yahooShoppingAdapter.js";
import { rakutenAdapter } from "./rakutenAdapter.js";

export const shopifyAdapter = disabledAdapter(
  "shopify",
  "Use the owner-scoped Admin OAuth flow in /api/connections and the v51 queue"
);

// The Japanese marketplaces, reached through a PROXY PARTNER rather than
// scraped. Buyee and ZenMarket already aggregate Yahoo! JAPAN Auctions,
// Mercari and Rakuma, already handle purchase, customs and shipping, and
// already run affiliate programmes — so one licensed integration solves
// ingestion, the proxy problem and monetization together. See
// docs/JAPAN-INGESTION.md and ROADMAP §4.4.
//
// Blocked on an AGREEMENT, not on code. Mercari and Rakuma have no public API
// and Yahoo's is restricted, so there is no honest way to reach them directly;
// declaring the adapter disabled with what it needs is the truthful state.
// The READING half is built and tested (lib/ingest/japan/), so the day a feed
// exists this becomes a fetch and a map.
export const buyeeAdapter = disabledAdapter(
  "buyee",
  "A Buyee affiliate agreement covering display, caching and aggregation, "
  + "plus BUYEE_AFFILIATE_ID + BUYEE_AFFILIATE_APPROVED=1"
);

export const zenmarketAdapter = disabledAdapter(
  "zenmarket",
  "A ZenMarket affiliate agreement on the same terms, plus "
  + "ZENMARKET_AFFILIATE_ID + ZENMARKET_AFFILIATE_APPROVED=1"
);

export const ADAPTERS = [
  ebayAdapter,
  woocommerceAdapter,
  yahooShoppingAdapter,
  rakutenAdapter,
  shopifyAdapter,
  buyeeAdapter,
  zenmarketAdapter,
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
