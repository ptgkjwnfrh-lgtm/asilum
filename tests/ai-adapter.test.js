// tests/ai-adapter.test.js — the single seam every model call goes through.
//
// `runModel()` is the one entry point for every AI-capable feature: tag audit,
// mood-board analysis, and the stylist all call it and nothing else. Its
// contract is that it **never throws** — every provider failure, quota refusal
// and disabled flag comes back as an honest object so callers fall through to
// local rules instead of erroring. 137 lines, 1 importer chain, zero tests.
//
// Everything here runs with **no network and no database**. Three of the four
// registered providers throw before any fetch, and the anthropic adapter checks
// its model name before opening a socket, so the whole refusal surface is
// reachable in about a millisecond. `logAiModelEvent` failures are swallowed by
// design, so the absence of a database changes nothing.
//
// WHAT THIS FILE DOES NOT COVER, and why: the success path and the
// `invalid-output` path both require a provider that RETURNS text, and
// `PROVIDERS` is a module-private const with no injection seam. Reaching them
// means a real network call or module mocking. That is a testability gap in the
// design of the seam, recorded here rather than faked — the parse/validate/log
// branches of the most important function in `lib/ai` remain unverified.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runModel } from "../lib/ai/adapter.js";

const AI_KEYS = [
  "AI_FEATURES_ENABLED", "AI_PROVIDER", "AI_MODEL_NAME", "AI_API_KEY",
  "AI_MOOD_BOARD_ENABLED", "AI_STYLIST_ENABLED", "AI_TAG_AUDIT_ENABLED",
  "AI_RESEARCH_ENABLED", "AI_USER_HOURLY_LIMIT", "AI_GLOBAL_HOURLY_LIMIT",
];

// Every test runs against an explicit environment and restores whatever the
// process had before, so ordering between tests cannot change a result.
async function withAi(patch, fn) {
  const saved = Object.fromEntries(AI_KEYS.map((k) => [k, process.env[k]]));
  for (const k of AI_KEYS) delete process.env[k];
  Object.assign(process.env, patch);
  try {
    return await fn();
  } finally {
    for (const k of AI_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
}

// A fully switched-on configuration, pointed at a provider that refuses before
// it can reach the network.
const ENABLED = {
  AI_FEATURES_ENABLED: "true", AI_PROVIDER: "openai", AI_API_KEY: "test-key",
  AI_MODEL_NAME: "test-model", AI_TAG_AUDIT_ENABLED: "true",
  AI_MOOD_BOARD_ENABLED: "true", AI_STYLIST_ENABLED: "true",
};

const call = (over = {}) => runModel({
  feature: "tag-audit", promptVersionId: "tag-audit-v1", context: {}, ...over,
});

// ------------------------------------------------------------- refusing early

test("an unknown prompt version is refused before anything else happens", async () => {
  // This check runs ahead of the feature gate, so it answers identically
  // whether or not AI is configured — and it names the version it could not find.
  for (const env of [{}, ENABLED]) {
    const out = await withAi(env, () => call({ promptVersionId: "no-such-prompt-v9" }));
    assert.equal(out.ok, false);
    assert.equal(out.implemented, false);
    assert.equal(out.feature, "runModel");
    assert.match(out.hint, /unknown prompt version: no-such-prompt-v9/);
  }
});

test("AI disabled is the normal state and refuses honestly", async () => {
  const out = await withAi({}, () => call());
  assert.deepEqual(out, {
    ok: false, implemented: false, disabled: true, feature: "tag-audit",
    hint: "AI disabled — set AI_FEATURES_ENABLED, AI_PROVIDER, AI_API_KEY and the per-feature flag",
  });
});

test("every one of the four switches is required, independently", async () => {
  // The gate is master AND provider AND key AND per-feature. Drop any one and
  // the answer must be the same honest refusal — no partial enablement.
  const drops = {
    "master switch off": { AI_FEATURES_ENABLED: undefined },
    "no provider": { AI_PROVIDER: undefined },
    "provider explicitly none": { AI_PROVIDER: "none" },
    "no api key": { AI_API_KEY: undefined },
    "empty api key": { AI_API_KEY: "" },
    "per-feature switch off": { AI_TAG_AUDIT_ENABLED: undefined },
    "per-feature switch false": { AI_TAG_AUDIT_ENABLED: "false" },
  };
  for (const [why, drop] of Object.entries(drops)) {
    const env = { ...ENABLED };
    for (const [k, v] of Object.entries(drop)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    const out = await withAi(env, () => call());
    assert.equal(out.disabled, true, why);
  }

  // Positive counterpart: with all four present the call gets PAST the gate and
  // fails at the provider instead. Without this the loop above proves nothing.
  const enabled = await withAi(ENABLED, () => call());
  assert.equal(enabled.disabled, undefined, "the gate is open");
  assert.equal(enabled.implemented, true);
});

test("the master switch only accepts an explicit true or 1", async () => {
  for (const value of ["yes", "TRUE", "on", "0", "", "1 "]) {
    const out = await withAi({ ...ENABLED, AI_FEATURES_ENABLED: value }, () => call());
    assert.equal(out.disabled, true, `AI_FEATURES_ENABLED=${JSON.stringify(value)} is not enabled`);
  }
  for (const value of ["true", "1"]) {
    const out = await withAi({ ...ENABLED, AI_FEATURES_ENABLED: value }, () => call());
    assert.equal(out.disabled, undefined, `AI_FEATURES_ENABLED=${value} enables`);
  }
});

// --------------------------------------------------------- refusing at the provider

test("an unimplemented provider fails honestly rather than pretending", async () => {
  // Spelled out rather than templated off the registry key: `local` reports
  // itself as "local-model", and a template would have quietly agreed with
  // whatever the source said instead of checking it.
  const expected = {
    openai: "openai adapter not implemented",
    gemini: "gemini adapter not implemented",
    local: "local-model adapter not implemented",
  };
  for (const [provider, message] of Object.entries(expected)) {
    const out = await withAi({ ...ENABLED, AI_PROVIDER: provider }, () => call());
    assert.equal(out.ok, false);
    assert.equal(out.feature, "tag-audit");
    assert.equal(out.error, message);
    // `implemented: true` here means the SEAM is implemented — distinct from the
    // `implemented: false` of a missing prompt or a disabled feature. Callers
    // read the two differently, so the distinction is pinned.
    assert.equal(out.implemented, true);
  }
});

test("an unrecognised provider name is named in the refusal", async () => {
  const out = await withAi({ ...ENABLED, AI_PROVIDER: "definitely-not-a-provider" }, () => call());
  assert.equal(out.ok, false);
  assert.equal(out.error, "unknown provider: definitely-not-a-provider");
});

test("the anthropic adapter refuses a missing model name before opening a socket", async () => {
  // If this ever reached the network the test would take seconds and need a
  // key; it returns in about a millisecond because the check is pre-flight.
  const out = await withAi({ ...ENABLED, AI_PROVIDER: "anthropic", AI_MODEL_NAME: "" }, () => call());
  assert.equal(out.ok, false);
  assert.equal(out.error, "anthropic: AI_MODEL_NAME not set");

  // NOTE: `callAnthropic` also guards a missing API key, but that branch is
  // UNREACHABLE through `runModel` — an empty `AI_API_KEY` makes `hasKey` false,
  // so the feature gate refuses first and the adapter is never called. It is
  // defence in depth for a future direct caller. Recorded so nobody hunts for
  // the test that would cover it.
  const noKey = await withAi({ ...ENABLED, AI_PROVIDER: "anthropic", AI_API_KEY: "" }, () => call());
  assert.equal(noKey.disabled, true, "the gate refuses before the adapter can");
});

// ------------------------------------------------------------------- quotas

test("a per-user quota refuses without pretending the model ran", async () => {
  await withAi({ ...ENABLED, AI_USER_HOURLY_LIMIT: "2" }, async () => {
    const userId = "quota-user-" + Math.random().toString(36).slice(2);

    // Under the limit the call proceeds to the provider.
    for (let i = 0; i < 2; i++) {
      const out = await call({ userId });
      assert.equal(out.rateLimited, undefined, `call ${i + 1} is within quota`);
    }
    // Over it, the refusal is explicit and separable from a provider failure.
    const blocked = await call({ userId });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.rateLimited, true);
    assert.equal(blocked.error, "AI request quota exceeded");
    assert.equal(blocked.implemented, true);

    // The quota is PER USER — one caller cannot exhaust everyone's budget.
    const other = await call({ userId: "quota-other-" + Math.random().toString(36).slice(2) });
    assert.equal(other.rateLimited, undefined, "a different user is unaffected");
  });
});

test("an anonymous call skips the per-user quota but not the global one", async () => {
  // No userId means no per-user bucket to charge; the global ceiling still
  // applies, which is what stops an unauthenticated flood.
  await withAi({ ...ENABLED, AI_USER_HOURLY_LIMIT: "1" }, async () => {
    for (let i = 0; i < 3; i++) {
      const out = await call();
      assert.equal(out.rateLimited, undefined, "no user id, no per-user charge");
    }
  });

  // A separate feature keeps its own global bucket, so this cannot be polluted
  // by the calls above.
  await withAi({ ...ENABLED, AI_GLOBAL_HOURLY_LIMIT: "1" }, async () => {
    const first = await call({ feature: "stylist", promptVersionId: "stylist-outfit-v1" });
    assert.equal(first.rateLimited, undefined, "the first call is within the global quota");
    const second = await call({ feature: "stylist", promptVersionId: "stylist-outfit-v1" });
    assert.equal(second.rateLimited, true, "the second exceeds it");
  });
});

// ------------------------------------------------------ the never-throws rule

test("runModel answers with an object rather than throwing", async () => {
  const hostile = [
    {},
    { feature: "tag-audit" },
    { promptVersionId: "tag-audit-v1" },
    { feature: 42, promptVersionId: "tag-audit-v1", context: null },
    { feature: "tag-audit", promptVersionId: "tag-audit-v1", context: undefined, userId: 7 },
    { feature: "tag-audit", promptVersionId: "tag-audit-v1", validate: () => { throw new Error("validator exploded"); } },
  ];
  for (const req of hostile) {
    const out = await withAi(ENABLED, () => runModel(req));
    assert.equal(typeof out, "object", JSON.stringify(req));
    assert.equal(out.ok, false, "a failure is reported, not raised");
  }

  // The one shape that DOES throw: calling with no request object at all.
  // `runModel()` destructures its argument, so this is a caller bug rather than
  // a model failure — the "never throws" contract is about provider and
  // validation failures. Pinned so the boundary is explicit.
  await assert.rejects(() => runModel(), TypeError);
});

// -------------------------------------------------- a latent configuration gap

test("the style-profile prompt can never run — it has no feature flag", async () => {
  // `style-profile-rebuild-v1` exists in PROMPTS and names feature
  // "style-profile", but `aiConfig().features` has no such key, so `aiEnabled`
  // is permanently false for it. Nothing calls it today, which is why this is
  // latent rather than broken — but anyone wiring it up would get a silent
  // "disabled" with every switch correctly set, and no clue why.
  const out = await withAi(
    { ...ENABLED, AI_RESEARCH_ENABLED: "true" },
    () => call({ feature: "style-profile", promptVersionId: "style-profile-rebuild-v1" }),
  );
  assert.equal(out.disabled, true);
  assert.equal(out.feature, "style-profile");

  // The four features that DO have flags behave differently under the same env.
  for (const feature of ["tag-audit", "mood-board", "stylist"]) {
    const enabled = await withAi(ENABLED, () => call({ feature, promptVersionId: "tag-audit-v1" }));
    assert.equal(enabled.disabled, undefined, `${feature} is reachable`);
  }
});
