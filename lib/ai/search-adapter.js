// lib/ai/search-adapter.js
// The AI seam for search. LOCAL RULE/TAG LOGIC BY DEFAULT — no paid AI calls,
// no keys, nothing pretending to be a model (lib/ai/contract.js honesty rule).
//
// AI_SEARCH_ENABLED=false (or unset): interpretation comes from lib/search
//   (mappings + tags + intent rules). This is the production path today.
// AI_SEARCH_ENABLED=true (future): plug a provider call into aiInterpret()
//   below. The AI will be able to read product tags, search mappings, mood
//   board tags, saved products, designer aesthetics, metadata, search logs,
//   and stylist outcomes — all already persisted in the schema for it.

import { notImplemented, real } from "./contract.js";
import { interpretSearchQuery } from "../search/index.js";

export function aiSearchEnabled() {
  return process.env.AI_SEARCH_ENABLED === "true";
}

export async function interpretQuery(query, context = {}) {
  if (aiSearchEnabled()) {
    // TODO(ai): call the configured provider here (EMBEDDINGS_/VISION_ style
    // env gating; see lib/embeddings for the pattern). Until a real provider
    // is wired, an enabled flag without an implementation reports honestly:
    return notImplemented(
      "ai-search-interpretation",
      "AI_SEARCH_ENABLED=true but no provider implementation is wired yet — using local logic"
    );
  }
  return real(await interpretSearchQuery(query, context), "local-rules-v1");
}
