// lib/connectors/index.js
// External account connector registry. RULES (constitution + user spec):
// opt-in and permission-based only, real OAuth only, env vars only, no
// scraping, no secrets in code, nothing pretends to be connected.
// The LIVE patterns are eBay's official API and Shopify's dedicated
// /api/connections OAuth routes. Legacy /api/connect points Shopify to Studio.

import { notImplemented } from "../ai/contract.js";
import { shopifyConfig } from "../connections/shopify.js";

function envReady(vars) {
  return vars.every((v) => !!process.env[v]);
}

const stub = (id) => ({
  connect: async () => notImplemented(id + ".connect", "real OAuth flow not written; UI shows coming-soon"),
  sync:    async () => notImplemented(id + ".sync", "nothing to sync until connect exists"),
});

export const CONNECTORS = {
  ebay: {
    id: "ebay", kind: "marketplace", envVars: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
    configured: () => envReady(["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]),
    note: "LIVE adapter at lib/ingest/ebay.js (Browse API) — inert until env set",
    ...stub("ebay"),
  },
  pinterest: {
    id: "pinterest", kind: "visual", envVars: ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"],
    configured: () => envReady(["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"]),
    note: "feeds lib/visual-personalization.ingestPins once real OAuth ships",
    ...stub("pinterest"),
  },
  shopify: {
    id: "shopify", kind: "storefront", envVars: ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "CATALOG_TOKEN_KEY"],
    configured: () => shopifyConfig().configured,
    note: "real merchant OAuth in Studio; owner-scoped leased catalog sync",
    connect: async () => notImplemented("shopify.connect", "use /api/connections/shopify/start with an authenticated owner and store domain"),
    sync: async () => notImplemented("shopify.sync", "the durable catalog queue runs through /api/catalog/run"),
  },
};

/** Honest per-connector status for the admin desk: configured or not, and
 *  why not. Nothing here reports "connected" on the strength of a key alone. */
export function connectorStatus() {
  return Object.values(CONNECTORS).map((c) => ({
    id: c.id, kind: c.kind, configured: c.configured(), note: c.note,
  }));
}
