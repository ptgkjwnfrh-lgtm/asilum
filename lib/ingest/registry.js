// lib/ingest/registry.js — acquisition and use are decided BEFORE fetching.
//
// This is the executable policy boundary, not a marketing list. A source that
// is researching has no allowed operations, even if its public site is easy to
// reach. The database registry mirrors these keys for operations/reporting.

export const GRANT_STATES = Object.freeze(["allowed", "denied", "unknown"]);
export const ACCESS_STAGES = Object.freeze([
  "researching", "application_prepared", "submitted", "provider_approved",
  "credentials_configured", "sandbox_verified", "production_canary_verified", "live",
]);

const unknownGrant = (evidenceRef = null) => ({
  state: "unknown", evidenceRef, reviewedAt: "2026-09-19", expiresAt: null,
});
const deniedGrant = (evidenceRef = null) => ({
  state: "denied", evidenceRef, reviewedAt: "2026-09-19", expiresAt: null,
});
const allowedGrant = (evidenceRef, expiresAt = null) => ({
  state: "allowed", evidenceRef, reviewedAt: "2026-09-19", expiresAt,
});

const policy = ({ policyId, acquisition, mode, display, storage, images, lexical, ranking, model, training, retentionSeconds }) => Object.freeze({
  policyId, version: 1, acquisition, mode,
  display, storeMetadata: storage, cacheImages: images,
  lexicalIndex: lexical, personalizedRanking: ranking,
  embeddings: model, externalModelProcessing: model, training,
  retentionSeconds,
});

export const SOURCE_POLICIES = Object.freeze({
  "shopify-merchant": policy({
    policyId: "shopify-merchant", acquisition: "merchant_install", mode: "durable",
    display: allowedGrant("merchant OAuth installation"), storage: allowedGrant("merchant OAuth installation"),
    images: allowedGrant("merchant OAuth installation"), lexical: allowedGrant("merchant OAuth installation"),
    ranking: allowedGrant("merchant install disclosure: catalog discovery"), model: deniedGrant("no merchant grant for model processing"),
    training: deniedGrant("no merchant grant for training"), retentionSeconds: 30 * 24 * 60 * 60,
  }),
  "shopify-merchant-public-export": policy({
    policyId: "shopify-merchant-public-export", acquisition: "merchant_export", mode: "durable",
    display: allowedGrant("verified merchant consent"), storage: allowedGrant("verified merchant consent"),
    images: allowedGrant("verified merchant consent"), lexical: allowedGrant("verified merchant consent"),
    ranking: allowedGrant("verified merchant consent: catalog discovery"), model: deniedGrant("no merchant grant for model processing"),
    training: deniedGrant("no training grant"), retentionSeconds: 30 * 24 * 60 * 60,
  }),
  "woocommerce-merchant-store-api": policy({
    policyId: "woocommerce-merchant-store-api", acquisition: "merchant_install", mode: "durable",
    display: allowedGrant("merchant approval gate"), storage: allowedGrant("merchant approval gate"),
    images: allowedGrant("merchant approval gate"), lexical: allowedGrant("merchant approval gate"),
    ranking: allowedGrant("merchant approval: catalog discovery"), model: deniedGrant("no merchant grant for model processing"),
    training: deniedGrant("no training grant"), retentionSeconds: 30 * 24 * 60 * 60,
  }),
  "ebay-browse": policy({
    policyId: "ebay-browse", acquisition: "api", mode: "live_only",
    display: unknownGrant("eBay production approval not installed"), storage: deniedGrant("keep Browse live-only until written grant"),
    images: deniedGrant("no server image cache"), lexical: unknownGrant("terms review required"),
    ranking: deniedGrant("eBay API agreement model-use restriction"), model: deniedGrant("eBay API agreement model-use restriction"),
    training: deniedGrant("eBay API agreement model-use restriction"), retentionSeconds: 0,
  }),
  "yahoo-shopping-jp": policy({
    policyId: "yahoo-shopping-jp", acquisition: "api", mode: "live_only",
    display: unknownGrant("app registration and source-policy review pending"), storage: deniedGrant("no storage grant recorded"),
    images: deniedGrant("no image caching grant recorded"), lexical: deniedGrant("live display only until reviewed"),
    ranking: deniedGrant("no model-use grant recorded"), model: deniedGrant("no model-use grant recorded"),
    training: deniedGrant("no training grant recorded"), retentionSeconds: 0,
  }),
  "rakuten-ichiba": policy({
    policyId: "rakuten-ichiba", acquisition: "api", mode: "live_only",
    display: unknownGrant("app approval and used-merchant qualification pending"), storage: deniedGrant("no durable grant recorded"),
    images: deniedGrant("no image caching grant recorded"), lexical: deniedGrant("live display only until reviewed"),
    ranking: deniedGrant("no model-use grant recorded"), model: deniedGrant("no model-use grant recorded"),
    training: deniedGrant("no training grant recorded"), retentionSeconds: 0,
  }),
});

export function sourcePolicy(policyId) {
  return SOURCE_POLICIES[String(policyId || "")] || null;
}

export function requireGrant(policyId, operation) {
  const found = sourcePolicy(policyId);
  if (!found) throw new Error(`source policy "${policyId}" is not registered`);
  const grant = found[operation];
  if (!grant || grant.state !== "allowed") {
    throw new Error(`${policyId} does not allow ${operation} (${grant?.state || "unknown"})`);
  }
  return found;
}

export function retentionDeadline(policyId, fetchedAt = new Date()) {
  const found = sourcePolicy(policyId);
  if (!found || found.retentionSeconds === null || found.retentionSeconds < 0) return null;
  return new Date(new Date(fetchedAt).getTime() + found.retentionSeconds * 1000).toISOString();
}

/** A live-only fetch still needs an explicit, source-specific approval. This
 * does not upgrade storage/model grants and therefore cannot be used by the
 * persistence path. */
export function liveAccessState(policyId, { approved = false, credentials = false } = {}) {
  const found = sourcePolicy(policyId);
  if (!found) return { enabled: false, status: "unregistered_policy" };
  if (!approved) return { enabled: false, status: "awaiting_approval" };
  if (!credentials) return { enabled: false, status: "awaiting_credentials" };
  return { enabled: true, status: "live_only", policy: found };
}
