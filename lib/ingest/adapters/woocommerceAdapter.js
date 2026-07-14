// WooCommerce Store API adapter. The Store API is officially documented and
// unauthenticated, but ASILUM still requires explicit merchant approval before
// pulling a store. Public reachability alone is not consent to aggregate.

import { normalizeSourceProduct } from "./normalize.js";

const SOURCE = "woocommerce";
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function configuredOrigin() {
  if (process.env.WOOCOMMERCE_STORE_APPROVED !== "1") return null;
  try {
    const url = new URL(process.env.WOOCOMMERCE_STORE_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || /^127\./.test(host) || host === "::1") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function minorPrice(prices = {}) {
  const raw = Number(prices.price);
  const minor = Number.isInteger(Number(prices.currency_minor_unit))
    ? Number(prices.currency_minor_unit) : 2;
  return Number.isFinite(raw) ? raw / (10 ** minor) : null;
}

export function normalizeWooProduct(raw = {}) {
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const images = Array.isArray(raw.images) ? raw.images.map((image) => image?.src).filter(Boolean) : [];
  return normalizeSourceProduct({
    id: String(raw.id || ""),
    title: raw.name,
    brand: raw.brand || raw.attributes?.find((attribute) => /brand|designer/i.test(attribute?.name || ""))?.terms?.[0]?.name || "Independent",
    price: minorPrice(raw.prices),
    currency: raw.prices?.currency_code || "USD",
    url: raw.permalink,
    image: images[0] || null,
    images,
    category: categories[0]?.name || null,
    description: raw.short_description || raw.description || null,
    availability_status: raw.is_in_stock === false ? "sold" : "available",
    is_available: raw.is_in_stock !== false,
  }, SOURCE);
}

async function request(path, params = {}) {
  const origin = configuredOrigin();
  if (!origin) return null;
  const url = new URL(`/wp-json/wc/store/v1/${path}`, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ASILUM/1.0 merchant-approved-catalog" },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  if (!/^application\/json\b/i.test(response.headers.get("content-type") || "")) return null;
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_RESPONSE_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    try { await reader.cancel(); } catch {}
    return null;
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
    const rows = await request("products", { search: query || "", per_page: Math.min(100, filters.limit || 48) });
    return Array.isArray(rows) ? rows.map(normalizeWooProduct).filter((item) => item.source_product_id) : [];
  },
  async fetchProductById(sourceProductId) {
    const raw = await request(`products/${encodeURIComponent(sourceProductId)}`);
    return raw ? normalizeWooProduct(raw) : null;
  },
  async checkAvailability(sourceProductId) {
    try {
      const item = await this.fetchProductById(sourceProductId);
      if (!item) return { availability_status: "removed", source_response_status: 404 };
      return { availability_status: item.availability_status, price: item.price, source_response_status: 200 };
    } catch {
      return { availability_status: "source_unavailable" };
    }
  },
  normalizeSourceProduct: normalizeWooProduct,
  async syncProducts(opts = {}) {
    if (!configuredOrigin()) return { sourceName: SOURCE, enabled: false, itemsSeen: 0, itemsUpserted: 0, status: "disabled" };
    const products = await this.searchProducts(opts.query || "", { limit: opts.limit || 100 });
    return { sourceName: SOURCE, enabled: true, itemsSeen: products.length, itemsUpserted: 0, status: "fetched", products };
  },
};
