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
import { consumeRateLimit } from "../security/rateLimit.js";

// Provider registry — each entry: async ({prompt, modelName, apiKey}) → raw text.
// anthropic (Day 10) is the first REAL provider — Asterisk AI's model calls
// run through it. Others stay honest notImplemented throws until reviewed in.
const PROVIDERS = {
  openai:    async () => { throw new Error("openai adapter not implemented"); },
  anthropic: callAnthropic,
  gemini:    async () => { throw new Error("gemini adapter not implemented"); },
  local:     async () => { throw new Error("local-model adapter not implemented"); },
};

// Anthropic Messages API over plain fetch (Node 20 global) — zero new
// dependencies, server-only, key never leaves this process. Model comes from
// AI_MODEL_NAME (e.g. claude-haiku-4-5); prompts already demand strict JSON.
async function callAnthropic({ prompt, modelName, apiKey }) {
  if (!apiKey) throw new Error("anthropic: missing API key");
  if (!modelName) throw new Error("anthropic: AI_MODEL_NAME not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`anthropic: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    if (json.stop_reason === "refusal") throw new Error("anthropic: model refused the request");
    const text = (json.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text) throw new Error("anthropic: empty response (stop_reason=" + json.stop_reason + ")");
    // Models sometimes fence JSON despite instructions — unwrap, don't fail.
    return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  } finally {
    clearTimeout(timer);
  }
}

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
    const userQuota = userId ? await consumeRateLimit({
      scope: `ai-user:${feature}`,
      subject: userId,
      limit: process.env.AI_USER_HOURLY_LIMIT || 12,
      windowMs: 60 * 60 * 1000,
    }) : { allowed: true };
    if (!userQuota.allowed) {
      return { ok: false, implemented: true, rateLimited: true, feature, error: "AI request quota exceeded" };
    }
    const globalQuota = await consumeRateLimit({
      scope: `ai-global:${feature}`,
      subject: "all-users",
      limit: process.env.AI_GLOBAL_HOURLY_LIMIT || 200,
      windowMs: 60 * 60 * 1000,
    });
    if (!globalQuota.allowed) {
      return { ok: false, implemented: true, rateLimited: true, feature, error: "AI request quota exceeded" };
    }
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
