// lib/ai/adapter.js
// THE seam where a real model plugs in. Server-only (logs to the database).
//
// runModel() is the single entry point every AI-capable feature calls.
// Today every provider adapter is an honest notImplemented() — no external
// calls, no keys required, nothing pretends. When a provider ships, it slots
// into PROVIDERS below and every caller lights up unchanged.
// Every real attempt (and failure) is logged to ai_model_events for audit.

import { aiEnabled, aiConfig } from "./config.js";
import { notImplemented } from "./contract.js";
import { PROMPTS } from "./promptVersions.js";
import { logAiModelEvent } from "../db/production.js";

// Provider registry — each entry: async ({prompt, modelName, apiKey}) → raw text.
// Deliberately unimplemented until a real integration is reviewed in.
const PROVIDERS = {
  openai:    async () => { throw new Error("openai adapter not implemented"); },
  anthropic: async () => { throw new Error("anthropic adapter not implemented"); },
  gemini:    async () => { throw new Error("gemini adapter not implemented"); },
  local:     async () => { throw new Error("local-model adapter not implemented"); },
};

function fillTemplate(template, context = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    JSON.stringify(context[k] ?? null));
}

/**
 * @param {{ feature: "mood-board"|"stylist"|"style-profile",
 *           promptVersionId: string, context: object, userId?: string,
 *           validate: (parsed: any) => any }} req
 * → { ok:true, data, provider, modelName, promptVersion } on success;
 *   honest refusal/failure objects otherwise. NEVER throws.
 */
export async function runModel(req) {
  const { feature, promptVersionId, context = {}, userId = null, validate } = req;
  const prompt = PROMPTS[promptVersionId];
  if (!prompt) return notImplemented("runModel", "unknown prompt version: " + promptVersionId);
  if (!aiEnabled(feature)) {
    // Disabled is the NORMAL state — refuse honestly, no event spam.
    return { ok: false, implemented: false, disabled: true, feature,
             hint: "AI disabled — set AI_FEATURES_ENABLED, AI_PROVIDER, AI_API_KEY and the per-feature flag" };
  }
  const c = aiConfig();
  const call = PROVIDERS[c.provider];
  const base = { userId, feature, modelProvider: c.provider, modelName: c.modelName,
                 promptVersion: prompt.id };
  try {
    if (!call) throw new Error("unknown provider: " + c.provider);
    const { aiApiKey } = await import("./config.js");
    const raw = await call({
      prompt: fillTemplate(prompt.template, context),
      modelName: c.modelName,
      apiKey: aiApiKey(),
    });
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    const valid = parsed && validate ? validate(parsed) : parsed;
    if (!valid) {
      await logAiModelEvent({ ...base, status: "invalid-output",
        inputSummary: summarize(context), outputSummary: String(raw).slice(0, 200) }).catch(() => {});
      return { ok: false, implemented: true, feature, error: "model output failed validation" };
    }
    await logAiModelEvent({ ...base, status: "ok",
      inputSummary: summarize(context), outputSummary: JSON.stringify(valid).slice(0, 200) }).catch(() => {});
    return { ok: true, data: valid, provider: c.provider, modelName: c.modelName, promptVersion: prompt.id };
  } catch (e) {
    await logAiModelEvent({ ...base, status: "error",
      inputSummary: summarize(context), errorMessage: String(e.message).slice(0, 300) }).catch(() => {});
    return { ok: false, implemented: true, feature, error: String(e.message) };
  }
}

const summarize = (ctx) => JSON.stringify(Object.keys(ctx)).slice(0, 200);
