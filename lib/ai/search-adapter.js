// lib/ai/search-adapter.js — the AI seam for search.
//
// WHAT THIS FILE USED TO BE: a pass-through wrapper around
// interpretSearchQuery that NOTHING imported. `grep -rn "search-adapter"`
// found three hits and none was an import — its own header, and two comments
// in lib/search/index.js describing a capability that did not exist even in
// disconnected form. AI_SEARCH_ENABLED was declared in .env.example and read
// only here, so flipping it changed nothing anywhere in the app.
//
// WHAT IT IS NOW: a PARSER, never an oracle. The model is handed the engine's
// own closed vocabularies and asked to turn a sentence into constraints drawn
// only from them. lib/ai/validate.js drops everything else and records what it
// dropped. So the worst a mis-parse can produce is a constraint the
// deterministic engine could have produced itself — never a product, never a
// house that is not stocked, never a claim about a garment.
//
// THE MODEL DOES NOT SCORE ITSELF HERE. It is not asked for a confidence and
// none is accepted; an assisted rack's confidence is computed by the engine
// from the constraints that actually applied, like every other rack.
//
// OFF BY DEFAULT AND NOT WIRED TO A ROUTE. Sending a shopper's words to a
// third party is an owner decision, not an engineering one — RIGHTS-REGISTER
// still lists "approve provider + retention terms" as open — so /api/search
// passes nothing to this path. The engine takes an explicit per-call opt-in,
// the feature needs AI_SEARCH_ENABLED plus the master switch, a provider and a
// key, and turning it on is one deliberate step for a person who has decided
// to take it.

import { aiEnabled } from "./config.js";
import { notImplemented } from "./contract.js";
import { runModel } from "./adapter.js";
import { validateSearchInterpretationOutput } from "./validate.js";

export function aiSearchEnabled() {
  return aiEnabled("search");
}

/**
 * Ask the model to parse one query into the engine's constraint language.
 *
 * @param {string} query
 * @param {{ garments:Set, aesthetics:Set, origins:Set, sizes:Set }} vocab
 *        The closed lists. Anything the model returns outside them is dropped.
 * @param {{ userId?: string|null }} opts
 * @returns honest refusal object, or
 *          { ok:true, data, provider, modelName, promptVersion }
 */
export async function interpretQueryWithModel(query, vocab = {}, { userId = null } = {}) {
  const q = String(query ?? "").trim();
  if (!q) return notImplemented("ai-search-interpretation", "empty query");
  if (!aiSearchEnabled()) {
    return notImplemented(
      "ai-search-interpretation",
      "AI search assistance is off — set AI_FEATURES_ENABLED, AI_PROVIDER, AI_API_KEY and AI_SEARCH_ENABLED"
    );
  }
  const list = (s) => [...(s || [])].sort();
  return runModel({
    feature: "search",
    promptVersionId: "search-interpretation-v1",
    userId,
    context: {
      query: q.slice(0, 200),
      garments: list(vocab.garments),
      aesthetics: list(vocab.aesthetics),
      origins: list(vocab.origins),
      sizes: list(vocab.sizes),
    },
    validate: (parsed) => validateSearchInterpretationOutput(parsed, vocab),
  });
}
