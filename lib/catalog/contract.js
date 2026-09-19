// lib/catalog/contract.js — the provider-neutral inventory contract.
//
// This module is deliberately pure. Adapters may speak wildly different
// dialects, but unsupported facts must disappear here instead of acquiring a
// convenient default on the way to the catalog.

export const LISTING_SCHEMA_VERSION = 1;

export const AVAILABILITY = new Set([
  "available", "sold", "reserved", "removed", "unknown",
]);

export const RESALE_STATUS = new Set(["resale", "retail", "unknown"]);
export const DELIVERY_ELIGIBILITY = new Set(["direct", "proxy_required", "unavailable", "unknown"]);
export const CHECKOUT_MODE = new Set(["external", "approved_provider", "proxy_quote", "none"]);
export const ENVIRONMENTS = new Set(["production", "sandbox", "fixture"]);

// ISO 4217 exponents used by the catalog. Unknown currencies are not guessed.
// Most currencies use two decimal places; the exceptional zero/three-decimal
// currencies are named so JPY/KRW can never silently become cents.
const ZERO_EXPONENT = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_EXPONENT = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function currencyExponent(currency) {
  const code = String(currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (ZERO_EXPONENT.has(code)) return 0;
  if (THREE_EXPONENT.has(code)) return 3;
  return 2;
}

/** Convert a provider decimal into an integer minor-unit string without
 * floating-point arithmetic. Returns null when the value/currency is not an
 * exact amount in that currency's exponent. */
export function amountToMinor(amount, currency) {
  const exponent = currencyExponent(currency);
  if (exponent === null || amount === null || amount === undefined) return null;
  const raw = String(amount).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const fraction = match[2] || "";
  if (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent))) return null;
  const padded = fraction.slice(0, exponent).padEnd(exponent, "0");
  return (BigInt(match[1]) * (10n ** BigInt(exponent)) + BigInt(padded || "0")).toString();
}

export function resolveAvailability(status, availableFlag) {
  const incoming = AVAILABILITY.has(String(status)) ? String(status) : "unknown";
  if (availableFlag === false && incoming === "available") {
    return { availability: "unknown", isAvailable: false, conflict: true };
  }
  if (incoming === "available") return { availability: incoming, isAvailable: true, conflict: false };
  return { availability: incoming, isAvailable: false, conflict: false };
}

export function listingIdentity(source, connectionId, listingId, variantId = null) {
  const parts = [source, connectionId, listingId, variantId].map((value) => String(value || "").trim());
  return parts.join(":");
}

/** Structural publication gate. It does not decide checkout eligibility. */
export function validateListingContract(listing) {
  const reasons = [];
  if (!listing || typeof listing !== "object") return { ok: false, reasons: ["listing is not an object"] };
  if (listing.schema_version !== LISTING_SCHEMA_VERSION) reasons.push("unsupported schema version");
  if (!listing.source_name) reasons.push("source is required");
  if (!listing.connection_id) reasons.push("connection identity is required");
  if (!listing.source_product_id) reasons.push("source listing id is required");
  if (!listing.title_original && !listing.title) reasons.push("original title is required");
  if (!listing.source_product_url) reasons.push("canonical source URL is required");
  if (!listing.currency || listing.money_amount_minor === null || listing.money_amount_minor === undefined) {
    reasons.push("original price and currency are required");
  }
  if (!AVAILABILITY.has(String(listing.availability_status))) reasons.push("availability is invalid");
  if (!listing.policy_id || !Number.isInteger(listing.policy_version)) reasons.push("source policy is required");
  if (!ENVIRONMENTS.has(String(listing.environment))) reasons.push("environment is invalid");
  if (!listing.fetched_at || !Number.isFinite(new Date(listing.fetched_at).getTime())) reasons.push("fetch timestamp is required");
  if (!listing.expires_at || !Number.isFinite(new Date(listing.expires_at).getTime())) reasons.push("retention expiry is required");
  return { ok: reasons.length === 0, reasons };
}
