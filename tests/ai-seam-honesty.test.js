// tests/ai-seam-honesty.test.js — the trust boundary around the model.
//
// Three asymmetries lived at this seam, all of them in the direction of
// trusting the model more than the code:
//
//   1. A MODEL'S SELF-SCORED CONFIDENCE HAD NO CEILING while every locally
//      derived value was capped at 0.6 (lib/asterisk/tagAudit.js "local rules
//      cap 0.6"). Verified before the fix by running validateTagAuditOutput
//      with confidence:1 and evidence:"none" — it came back 1.000 unchanged.
//      That number decides whether a person ever sees a conflict.
//   2. A RATE-LIMITED REFUSAL WROTE NO AUDIT ROW, so ai_model_events showed a
//      quiet hour and a throttled one identically.
//   3. THE QUOTA WAS CHARGED BEFORE THE PROVIDER WAS CHECKED, so a
//      misconfigured AI_PROVIDER burned the hourly allowance of the user and
//      of the whole install before failing on a name that was never going to
//      work.
//
// And the seam's own success path had never been tested at all — the file
// tests/ai-adapter.test.js says so in its header. PROVIDERS is exported now
// for exactly that, so parse / validate / log are reachable without a socket.
//
// HONEST LIMIT: the ai_model_events WRITE is unobservable here. logAiModelEvent
// is swallowed by design when there is no database, and this suite runs
// without one. What is asserted is the branch and its returned shape; the row
// itself is covered by the database-backed suite.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { runModel, PROVIDERS } from "../lib/ai/adapter.js";
import { MODEL_CONFIDENCE_CEILING, validateTagAuditOutput } from "../lib/ai/validate.js";

const AI_KEYS = [
  "AI_FEATURES_ENABLED", "AI_PROVIDER", "AI_MODEL_NAME", "AI_API_KEY",
  "AI_TAG_AUDIT_ENABLED", "AI_USER_HOURLY_LIMIT", "AI_GLOBAL_HOURLY_LIMIT",
];

async function withAi(patch, fn) {
  const saved = Object.fromEntries(AI_KEYS.map((k) => [k, process.env[k]]));
  for (const k of AI_KEYS) delete process.env[k];
  Object.assign(process.env, patch);
  try { return await fn(); } finally {
    for (const k of AI_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
}

/** Swap one provider for the duration of a call, then put it back. */
async function withProvider(name, impl, fn) {
  const had = Object.prototype.hasOwnProperty.call(PROVIDERS, name);
  const saved = PROVIDERS[name];
  PROVIDERS[name] = impl;
  try { return await fn(); } finally {
    if (had) PROVIDERS[name] = saved; else delete PROVIDERS[name];
  }
}

const ENABLED = {
  AI_FEATURES_ENABLED: "true", AI_PROVIDER: "openai", AI_API_KEY: "test-key",
  AI_MODEL_NAME: "test-model", AI_TAG_AUDIT_ENABLED: "true",
};

const call = (over = {}) => runModel({
  feature: "tag-audit", promptVersionId: "tag-audit-v1", context: { title: "x" },
  validate: validateTagAuditOutput, ...over,
});

test("the ceiling holds wherever a model scores itself", () => {
  const field = (confidence) => validateTagAuditOutput({
    fields: [{ field: "material", value: "silk", confidence, status: "probable", evidence: "e" }],
  }).fields[0].confidence;
  assert.equal(field(1), MODEL_CONFIDENCE_CEILING);
  assert.equal(field(0.95), MODEL_CONFIDENCE_CEILING);
  // It clamps rather than rescales: an honest 0.5 must stay above tagAudit's
  // escalation threshold, or conflicts quietly stop reaching a person.
  assert.equal(field(0.5), 0.5);
});

test("the seam's success path — parse, validate, return provenance", async () => {
  await withAi(ENABLED, () => withProvider("openai", async ({ prompt, modelName, apiKey }) => {
    assert.ok(prompt.includes("title"), "the template was filled with the context");
    assert.equal(modelName, "test-model");
    assert.equal(apiKey, "test-key");
    return JSON.stringify({
      fields: [{ field: "material", value: "silk", confidence: 1, status: "confirmed", evidence: "label" }],
    });
  }, async () => {
    const out = await call();
    assert.equal(out.ok, true);
    assert.equal(out.provider, "openai");
    assert.equal(out.modelName, "test-model");
    assert.equal(out.promptVersion, "tag-audit-v1");
    // The two claims the model was not allowed to make, both corrected.
    assert.equal(out.data.fields[0].status, "ai_generated");
    assert.equal(out.data.fields[0].confidence, MODEL_CONFIDENCE_CEILING);
  }));
});

test("output that fails validation is refused, not returned", async () => {
  await withAi(ENABLED, () => withProvider("openai", async () => JSON.stringify({ fields: [] }), async () => {
    const out = await call();
    assert.equal(out.ok, false);
    assert.equal(out.implemented, true);
    assert.match(out.error, /failed validation/);
  }));
});

test("unparseable output is refused, not thrown", async () => {
  await withAi(ENABLED, () => withProvider("openai", async () => "not json at all", async () => {
    const out = await call();
    assert.equal(out.ok, false);
    assert.match(out.error, /failed validation/);
  }));
});

test("a provider that throws comes back as an honest object", async () => {
  await withAi(ENABLED, () => withProvider("openai", async () => { throw new Error("boom"); }, async () => {
    const out = await call();
    assert.equal(out.ok, false);
    assert.equal(out.implemented, true);
    assert.match(out.error, /boom/);
  }));
});

test("the provider is checked BEFORE the budget is spent", async () => {
  // A misconfigured provider used to burn the whole hourly allowance before
  // failing on a name that was never going to work. With a per-user limit of
  // 1, a second call must still reach the provider error — not a quota
  // refusal. A fresh subject per test keeps the buckets independent.
  const who = "seam-test-provider-order";
  await withAi({ ...ENABLED, AI_PROVIDER: "nonexistent-provider", AI_USER_HOURLY_LIMIT: "1" }, async () => {
    const first = await call({ userId: who });
    const second = await call({ userId: who });
    for (const out of [first, second]) {
      assert.equal(out.ok, false);
      assert.equal(out.rateLimited, undefined, "the quota was never charged");
      assert.match(out.error, /unknown provider/);
    }
  });
});

test("a rate-limited refusal is still a refusal, and says which quota", async () => {
  const who = "seam-test-quota";
  await withAi({ ...ENABLED, AI_USER_HOURLY_LIMIT: "1" }, () =>
    withProvider("openai", async () => JSON.stringify({
      fields: [{ field: "material", value: "silk", confidence: 0.4, status: "probable", evidence: "e" }],
    }), async () => {
      const first = await call({ userId: who });
      const second = await call({ userId: who });
      assert.equal(first.ok, true);
      assert.equal(second.ok, false);
      assert.equal(second.rateLimited, true);
      assert.match(second.error, /quota exceeded/);
    }));
});

test("disabled stays the normal state, and says how to turn it on", async () => {
  await withAi({}, async () => {
    const out = await call();
    assert.equal(out.ok, false);
    assert.equal(out.implemented, false);
    assert.equal(out.disabled, true);
    assert.match(out.hint, /AI_FEATURES_ENABLED/);
  });
});
