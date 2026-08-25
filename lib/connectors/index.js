// lib/connectors/index.js
// External account connector registry. RULES (constitution + user spec):
// opt-in and permission-based only, real OAuth only, env vars only, no
// scraping, no secrets in code, nothing pretends to be connected.
// The LIVE pattern to copy is lib/ingest/ebay.js (official API, inert until
// its env vars exist); /api/connect already answers every connect attempt
// with an honest 501 + per-platform message.

import { notImplemented } from "../ai/contract.js";

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
    id: "shopify", kind: "storefront", envVars: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_STOREFRONT_TOKEN"],
    configured: () => envReady(["SHOPIFY_STORE_DOMAIN", "SHOPIFY_STOREFRONT_TOKEN"]),
    note: "independent designer stores → Product Brain ingest",
    ...stub("shopify"),
  },
};

/** Honest per-connector status for the admin desk: configured or not, and
 *  why not. Nothing here reports "connected" on the strength of a key alone. */
export function connectorStatus() {
  return Object.values(CONNECTORS).map((c) => ({
    id: c.id, kind: c.kind, configured: c.configured(), note: c.note,
  }));
}
