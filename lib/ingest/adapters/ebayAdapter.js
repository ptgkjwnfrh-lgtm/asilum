// lib/ingest/adapters/ebayAdapter.js
// The one adapter with a real implementation today: eBay's OFFICIAL Browse API
// (lib/ingest/ebay.js). Enabled only when EBAY_CLIENT_ID/SECRET are set.
//
// ⚖ BEFORE SETTING THOSE KEYS, READ docs/epn-terms-check-2026-08-22.md.
// EPN's Network Agreement carries a Prohibited AI Uses section that bars
// using eBay Data to improve a system generating recommendations, and bars
// exposing it to a third-party AI service without eBay's prior written
// approval. Ingested eBay items take the SAME path as seed items —
// inferTags() into the brain vector (lib/ingest/ebay.js:8) — so turning this
// adapter on routes eBay Data into a recommender by design. Dormant only
// because the keys are unset. The question is counsel's and unresolved.

import { searchEbay, normalizeEbayItem, getAppToken, ebayAccessState } from "../ebay.js";
import { normalizeSourceProduct } from "./normalize.js";
import { readJsonResponse } from "../../security/http.js";

const FETCH_TIMEOUT_MS = 10_000;

const SOURCE = "ebay";

function approved() {
  return process.env.EBAY_PARTNERSHIP_APPROVED === "1";
}

function ready() {
  return ebayAccessState().enabled;
}

export const ebayAdapter = {
  getSourceName: () => SOURCE,
  enabled: () =>
    ready()
      ? { enabled: true, status: "enabled", needs: null }
      : { enabled: false, status: approved() ? "awaiting_keys" : "awaiting_approval", needs: "EBAY_PARTNERSHIP_APPROVED=1 + EBAY_CLIENT_ID + EBAY_CLIENT_SECRET" },

  async searchProducts(query, filters = {}) {
    if (!ready()) return [];
    // syncProducts performs the single trusted color-verification pass.
    const raw = await searchEbay(query, {
      limit: filters.pageSize || filters.limit || 24,
      maxItems: filters.limit || 24,
      maxPages: filters.maxPages || 1,
      marketplaceId: filters.marketplaceId,
      categoryId: filters.categoryId,
      deliveryCountry: filters.deliveryCountry,
      deliveryPostalCode: filters.deliveryPostalCode,
      verifyColors: false,
    });
    return raw.map((r) => this.normalizeSourceProduct(r));
  },

  async fetchProductById(sourceProductId) {
    if (!ready()) return null;
    const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
    const host = env === "PRODUCTION" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
    const token = await getAppToken();
    const res = await fetch(`${host}/buy/browse/v1/item/${encodeURIComponent(sourceProductId)}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return this.normalizeSourceProduct(normalizeEbayItem(await readJsonResponse(res)));
  },

  async checkAvailability(sourceProductId) {
    if (!ready()) return { availability_status: "source_unavailable" };
    const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
    const host = env === "PRODUCTION" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
    try {
      const token = await getAppToken();
      const res = await fetch(`${host}/buy/browse/v1/item/${encodeURIComponent(sourceProductId)}`, {
        headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 404 || res.status === 410) return { availability_status: "removed", source_response_status: res.status };
      if (!res.ok) return { availability_status: "unknown", source_response_status: res.status };
      const item = await readJsonResponse(res);
      const sold = item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus === "OUT_OF_STOCK";
      return {
        availability_status: sold ? "sold" : "available",
        price: item.price ? Number(item.price.value) : null,
        source_response_status: res.status,
      };
    } catch {
      return { availability_status: "source_unavailable" };
    }
  },

  normalizeSourceProduct(raw) {
    // raw is already catalog-shaped from normalizeEbayItem; funnel through the
    // shared normalizer to pick up the production fields.
    return normalizeSourceProduct(
      {
        ...raw,
        connection_id: `ebay:${process.env.EBAY_ENV === "PRODUCTION" ? "production" : "sandbox"}:${process.env.EBAY_MARKETPLACE_ID || "EBAY_US"}`,
        source_product_id: raw.source_product_id || raw.id,
        source_product_url: raw.url,
        allow_inferred_tags: false,
        policy_id: "ebay-browse",
        policy_version: 1,
        environment: process.env.EBAY_ENV === "PRODUCTION" ? "production" : "sandbox",
      },
      SOURCE
    );
  },

  async syncProducts(opts = {}) {
    if (!ready()) return { sourceName: SOURCE, enabled: false, itemsSeen: 0, itemsUpserted: 0, status: "disabled" };
    const products = await this.searchProducts(opts.query || "designer archive fashion", { limit: opts.limit || 48 });
    return { sourceName: SOURCE, enabled: true, itemsSeen: products.length, itemsUpserted: 0, status: "fetched", products };
  },
};
