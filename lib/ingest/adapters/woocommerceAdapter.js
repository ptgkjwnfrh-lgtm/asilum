// WooCommerce Store API adapter. The Store API is officially documented and
// unauthenticated, but ASILUM still requires explicit merchant approval before
// pulling a store. Public reachability alone is not consent to aggregate.

import { normalizeSourceProduct } from "./normalize.js";
import { readJsonResponse, UPSTREAM_TIMEOUT_MS } from "../../security/http.js";
import { isPublicHostname } from "../../url.js";
import { createHash } from "node:crypto";

const SOURCE = "woocommerce";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function configuredOrigin() {
  if (process.env.WOOCOMMERCE_STORE_APPROVED !== "1") return null;
  try {
    const url = new URL(process.env.WOOCOMMERCE_STORE_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" ||
        (url.port && url.port !== "443") || !isPublicHostname(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function minorPrice(prices = {}) {
  const raw = Number(prices.price);
  const minor = Number.isInteger(Number(prices.currency_minor_unit))
    ? Math.max(0, Math.min(6, Number(prices.currency_minor_unit))) : 2;
  return Number.isFinite(raw) ? raw / (10 ** minor) : null;
}

function measurementAttributes(attributes = []) {
  const measurements = {};
  for (const attribute of attributes) {
    const key = /^(?:chest|chest size)$/i.test(attribute?.name || "") ? "chest"
      : /^(?:waist|waist size)$/i.test(attribute?.name || "") ? "waist"
      : /^(?:hips?|hip size)$/i.test(attribute?.name || "") ? "hips"
      : /^inseam$/i.test(attribute?.name || "") ? "inseam" : null;
    if (!key) continue;
    const value = (attribute.terms || []).map((term) => term?.name).find(Boolean);
    const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*(cm|in|inch|inches|\")?/i);
    if (!match) continue;
    const number = Number(match[1]);
    const inches = String(match[2] || "in").toLowerCase() === "cm" ? number / 2.54 : number;
    if (inches > 0 && inches <= 100) measurements[key] = +inches.toFixed(2);
  }
  return measurements;
}

/** One WooCommerce product in the house shape. Reads only what the merchant
 *  actually supplied — colour, size and measurement attributes are lifted when
 *  present and left absent otherwise, never inferred from the title. */
export function normalizeWooProduct(raw = {}, connectionId = null) {
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const images = Array.isArray(raw.images) ? raw.images.map((image) => image?.src).filter(Boolean) : [];
  const colorAttribute = raw.attributes?.find((attribute) => /^(?:color|colour)$/i.test(attribute?.name || ""));
  const merchantColor = (colorAttribute?.terms || []).map((term) => term?.name).filter(Boolean).join(" / ");
  const measurements = measurementAttributes(raw.attributes);
  const sizeAttribute = raw.attributes?.find((attribute) => /^size$/i.test(attribute?.name || ""));
  const sizeLabel = (sizeAttribute?.terms || []).map((term) => term?.name).find(Boolean) || null;
  return normalizeSourceProduct({
    id: String(raw.id || ""),
    title: raw.name,
    brand: raw.brand || raw.attributes?.find((attribute) => /^brand$/i.test(attribute?.name || ""))?.terms?.[0]?.name || null,
    price: minorPrice(raw.prices),
    currency: raw.prices?.currency_code || null,
    url: raw.permalink,
    image: images[0] || null,
    images,
    merchantColor,
    size: sizeLabel || Object.keys(measurements).length ? {
      label: sizeLabel, measurements: Object.keys(measurements).length ? measurements : undefined,
      measurementSource: Object.keys(measurements).length ? "merchant" : undefined,
    } : null,
    category: categories[0]?.name || null,
    description: raw.short_description || raw.description || null,
    availability_status: raw.is_in_stock === false ? "sold" : "available",
    is_available: raw.is_in_stock !== false,
    connection_id: connectionId,
    policy_id: "woocommerce-merchant-store-api",
    policy_version: 1,
    environment: "production",
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
  }, SOURCE);
}

function connectionIdFor(origin) {
  return origin ? `woocommerce:${createHash("sha256").update(origin).digest("hex").slice(0, 24)}` : null;
}

async function request(path, params = {}) {
  const origin = configuredOrigin();
  if (!origin) return { ok: false, kind: "disabled", status: null, data: null };
  const url = new URL(`/wp-json/wc/store/v1/${path}`, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ASILUM/1.0 merchant-approved-catalog" },
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 410) return { ok: false, kind: "gone", status: response.status, data: null };
    if (response.status === 401 || response.status === 403) return { ok: false, kind: "auth", status: response.status, data: null };
    if (response.status === 429) return { ok: false, kind: "rate_limited", status: response.status, data: null };
    if (!response.ok) return { ok: false, kind: "provider_error", status: response.status, data: null };
    return { ok: true, kind: "success", status: response.status, data: await readJsonResponse(response, { maxBytes: MAX_RESPONSE_BYTES }) };
  } catch (error) {
    return { ok: false, kind: "unavailable", status: null, data: null, error: String(error?.message || error) };
  }
}

export const woocommerceAdapter = {
  getSourceName: () => SOURCE,
  enabled() {
    const origin = configuredOrigin();
    return origin
      ? { enabled: true, status: "merchant_approved", needs: null }
      : { enabled: false, status: "awaiting_merchant_approval", needs: "WOOCOMMERCE_STORE_URL + WOOCOMMERCE_STORE_APPROVED=1" };
  },
  async searchProducts(query, filters = {}) {
    const result = await request("products", { search: query || "", per_page: Math.min(100, filters.limit || 48) });
    const origin = configuredOrigin();
    return result.ok && Array.isArray(result.data)
      ? result.data.map((raw) => normalizeWooProduct(raw, connectionIdFor(origin))).filter((item) => item.source_product_id)
      : [];
  },
  async fetchProductById(sourceProductId) {
    const result = await request(`products/${encodeURIComponent(sourceProductId)}`);
    return result.ok ? normalizeWooProduct(result.data, connectionIdFor(configuredOrigin())) : null;
  },
  async checkAvailability(sourceProductId) {
    const result = await request(`products/${encodeURIComponent(sourceProductId)}`);
    if (result.kind === "gone") return { availability_status: "removed", source_response_status: result.status };
    if (!result.ok) return {
      availability_status: result.kind === "unavailable" ? "source_unavailable" : "unknown",
      source_response_status: result.status,
      provider_error: result.kind,
    };
    const item = normalizeWooProduct(result.data, connectionIdFor(configuredOrigin()));
    return { availability_status: item.availability_status, price: item.price, source_response_status: result.status };
  },
  normalizeSourceProduct: normalizeWooProduct,
  async syncProducts(opts = {}) {
    if (!configuredOrigin()) return { sourceName: SOURCE, enabled: false, itemsSeen: 0, itemsUpserted: 0, status: "disabled" };
    const products = await this.searchProducts(opts.query || "", { limit: opts.limit || 100 });
    return { sourceName: SOURCE, enabled: true, itemsSeen: products.length, itemsUpserted: 0, status: "fetched", products };
  },
};
