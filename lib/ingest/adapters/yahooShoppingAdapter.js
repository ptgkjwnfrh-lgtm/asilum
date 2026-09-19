// Yahoo! Shopping Japan Web API v3. Official API only; results are live-only
// and constrained to used, in-stock, cross-border-agency eligible inventory.

import { normalizeSourceProduct } from "./normalize.js";
import { liveAccessState } from "../registry.js";
import { readJsonResponse, readResponseSnippet, UPSTREAM_TIMEOUT_MS } from "../../security/http.js";

const YAHOO_SOURCE = "yahoo-shopping-jp";

function access() {
  return liveAccessState(YAHOO_SOURCE, {
    approved: process.env.YAHOO_SHOPPING_APPROVED === "1",
    credentials: Boolean(process.env.YAHOO_SHOPPING_APP_ID),
  });
}

export function normalizeYahooShoppingItem(raw = {}) {
  const item = raw.Item || raw.item || raw;
  return normalizeSourceProduct({
    title: item.name || item.title,
    brand: item.brand?.name || item.brandName || null,
    source_product_id: String(item.code || item.id || ""),
    source_product_url: item.url || null,
    clickout_url: item.url || null,
    price: item.price ?? null,
    currency: "JPY",
    images: [item.image?.medium, item.image?.small].filter(Boolean),
    condition: item.condition === "used" ? "used" : item.condition || null,
    availability_status: "available",
    is_available: true,
    connection_id: "yahoo-shopping-jp:live",
    resale_status: item.condition === "used" ? "resale" : "unknown",
    policy_id: YAHOO_SOURCE,
    policy_version: 1,
    environment: "production",
    delivery_eligibility: "proxy_required",
    checkout_mode: "external",
    expires_at: new Date().toISOString(),
    allow_inferred_tags: false,
  }, YAHOO_SOURCE);
}

export const yahooShoppingAdapter = {
  getSourceName: () => YAHOO_SOURCE,
  enabled: () => ({ ...access(), needs: "YAHOO_SHOPPING_APPROVED=1 + YAHOO_SHOPPING_APP_ID" }),
  async searchProducts(query, filters = {}) {
    if (!access().enabled) return [];
    const results = Math.max(1, Math.min(50, Number(filters.limit) || 24));
    const start = Math.max(1, Math.min(1000 - results + 1, Number(filters.start) || 1));
    const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
    for (const [key, value] of Object.entries({
      appid: process.env.YAHOO_SHOPPING_APP_ID, query: String(query || "").slice(0, 200),
      results, start, condition: "used", in_stock: "true", is_cross_border_agency: "true",
    })) url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Yahoo Shopping ${response.status}: ${await readResponseSnippet(response)}`);
    const data = await readJsonResponse(response, { maxBytes: 5 * 1024 * 1024 });
    return (Array.isArray(data.hits) ? data.hits : []).map(normalizeYahooShoppingItem)
      .filter((item) => item.resale_status === "resale" && item.source_product_id);
  },
  async fetchProductById() { return null; },
  async checkAvailability() { return { availability_status: "unknown" }; },
  normalizeSourceProduct: normalizeYahooShoppingItem,
  async syncProducts() { return { sourceName: YAHOO_SOURCE, enabled: false, itemsSeen: 0, itemsUpserted: 0, status: "live_only" }; },
};
