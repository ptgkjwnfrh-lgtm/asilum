// lib/ai/config.js
// AI feature gating. DISABLED BY DEFAULT — the app must run fully, and
// honestly, with none of these set. Server-only values (AI_API_KEY) are read
// from process.env at request time and never reach the client bundle (no
// NEXT_PUBLIC_ prefix, and no client module imports this file's key getter).

const truthy = (v) => v === "true" || v === "1";

export function aiConfig() {
  return {
    enabled: truthy(process.env.AI_FEATURES_ENABLED),
    provider: process.env.AI_PROVIDER || "none",   // none|openai|anthropic|gemini|local
    modelName: process.env.AI_MODEL_NAME || "",
    hasKey: !!process.env.AI_API_KEY,              // presence only — value never leaves the server
    features: {
      "mood-board": truthy(process.env.AI_MOOD_BOARD_ENABLED),
      stylist: truthy(process.env.AI_STYLIST_ENABLED),
    },
  };
}

// A feature runs a real model only when the master switch, the per-feature
// switch, a provider, and a key are ALL present.
export function aiEnabled(feature) {
  const c = aiConfig();
  return c.enabled && c.provider !== "none" && c.hasKey && !!c.features[feature];
}

// Safe-to-log/admin view (no key material).
export function describeAiConfig() {
  const c = aiConfig();
  return { ...c, hasKey: c.hasKey ? "set" : "missing" };
}

// Server-only. Callers must never forward this to a response body.
export function aiApiKey() {
  return process.env.AI_API_KEY || null;
}
