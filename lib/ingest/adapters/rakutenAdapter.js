// Rakuten Ichiba Search API. Ichiba is not itself a resale marketplace, so
// only explicitly reviewed used-shop codes may be classified as resale.

import { normalizeSourceProduct } from "./normalize.js";
import { liveAccessState } from "../registry.js";
import { readJsonResponse, readResponseSnippet, UPSTREAM_TIMEOUT_MS } from "../../security/http.js";

const RAKUTEN_SOURCE = "rakuten-ichiba";
const ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

function access() {
  return liveAccessState(RAKUTEN_SOURCE, {
    approved: process.env.RAKUTEN_ICHIBA_APPROVED === "1",
    credentials: Boolean(process.env.RAKUTEN_APPLICATION_ID && process.env.RAKUTEN_ACCESS_KEY),
  });
}

function usedShopCodes() {
  return new Set(String(process.env.RAKUTEN_USED_SHOP_CODES || "").split(",").map((value) => value.trim()).filter(Boolean));
}

export function normalizeRakutenItem(wrapper = {}) {
  const item = wrapper.Item || wrapper.item || wrapper;
  const resale = usedShopCodes().has(String(item.shopCode || ""));
  return normalizeSourceProduct({
    title: item.itemName,
    brand: null,
    source_product_id: String(item.itemCode || ""),
    source_product_url: item.itemUrl || null,
    clickout_url: item.affiliateUrl || item.itemUrl || null,
    price: item.itemPrice ?? null,
    currency: "JPY",
    images: (item.mediumImageUrls || []).map((image) => image?.imageUrl || image).filter(Boolean),
    availability_status: Number(item.availability) === 1 ? "available" : "unknown",
    is_available: Number(item.availability) === 1,
    connection_id: "rakuten-ichiba:live",
    resale_status: resale ? "resale" : "unknown",
    policy_id: RAKUTEN_SOURCE,
    policy_version: 1,
    environment: "production",
    delivery_eligibility: "unknown",
    checkout_mode: "external",
    expires_at: new Date().toISOString(),
    allow_inferred_tags: false,
  }, RAKUTEN_SOURCE);
}

export const rakutenAdapter = {
  getSourceName: () => RAKUTEN_SOURCE,
  enabled: () => ({ ...access(), needs: "RAKUTEN_ICHIBA_APPROVED=1 + application credentials + reviewed RAKUTEN_USED_SHOP_CODES" }),
  async searchProducts(query, filters = {}) {
    if (!access().enabled || !usedShopCodes().size) return [];
    const url = new URL(ENDPOINT);
    for (const [key, value] of Object.entries({
      applicationId: process.env.RAKUTEN_APPLICATION_ID,
      accessKey: process.env.RAKUTEN_ACCESS_KEY,
      keyword: String(query || "").slice(0, 128), hits: Math.max(1, Math.min(30, Number(filters.limit) || 24)),
      page: Math.max(1, Math.min(100, Number(filters.page) || 1)), formatVersion: 2,
    })) url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Rakuten Ichiba ${response.status}: ${await readResponseSnippet(response)}`);
    const data = await readJsonResponse(response, { maxBytes: 5 * 1024 * 1024 });
    return (Array.isArray(data.Items) ? data.Items : []).map(normalizeRakutenItem)
      .filter((item) => item.resale_status === "resale" && item.source_product_id);
  },
  async fetchProductById() { return null; },
  async checkAvailability() { return { availability_status: "unknown" }; },
  normalizeSourceProduct: normalizeRakutenItem,
  async syncProducts() { return { sourceName: RAKUTEN_SOURCE, enabled: false, itemsSeen: 0, itemsUpserted: 0, status: "live_only" }; },
};
