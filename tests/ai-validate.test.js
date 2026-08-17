// tests/ai-validate.test.js — model output is untrusted input.
//
// `lib/ai/validate.js` is the boundary every model response crosses before it
// can become stored data. The coverage audit put it third of three and said the
// quiet part out loud: this "should be the least trusting code in the repo and
// is currently the least checked". Zero tests until now.
//
// The rule it exists to enforce is a single sentence — **a model may not certify
// its own output**. `confirmed` and `verified` mean sourced or human-reviewed;
// a model claiming either is not a stronger claim, it is a false one. Everything
// else here is the same posture applied to shape: strip invented product ids,
// drop unknown fields, clamp confidence, and degrade to `null` rather than throw
// so callers fall back to local rules instead of crashing.
//
// The status test is driven off the exported `CERTAINTY_STATUSES` vocabulary
// rather than a hand-copied list, so widening what a model may claim for itself
// fails here rather than passing quietly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CERTAINTY_STATUSES, normalizeAiTags, sanitizeModelText,
  validateMoodBoardAnalysisOutput, validateStylistOutput, validateTagAuditOutput,
} from "../lib/ai/validate.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// A single well-formed audit field, so each test varies exactly one thing.
const auditField = (over = {}) => ({
  fields: [{ field: "material", value: "silk", status: "probable", confidence: 0.9, ...over }],
});

// ------------------------------------------- the rule the module exists for

test("a model may not certify its own output", () => {
  // The three statuses a model is allowed to claim about itself. Everything
  // else in the vocabulary is either a human/sourced judgement or a non-claim.
  const CLAIMABLE = ["probable", "estimated", "visually_inferred"];

  for (const status of CLAIMABLE) {
    const out = validateTagAuditOutput(auditField({ status }));
    assert.equal(out.fields[0].status, status, `${status} survives`);
  }

  // "unknown" is a non-claim: the entry is dropped rather than stored.
  assert.equal(validateTagAuditOutput(auditField({ status: "unknown" })), null);

  // Every other status in the vocabulary — including the two that matter,
  // `confirmed` and `verified` — is downgraded to `ai_generated`.
  const reserved = CERTAINTY_STATUSES.filter((s) => !CLAIMABLE.includes(s) && s !== "unknown");
  assert.ok(reserved.includes("confirmed") && reserved.includes("verified"),
    "the two statuses this rule exists for are in the reserved set");

  for (const status of reserved) {
    const out = validateTagAuditOutput(auditField({ status }));
    assert.equal(out.fields[0].status, "ai_generated",
      `a model claiming "${status}" is recorded as ai_generated`);
  }

  // And anything outside the vocabulary entirely lands in the same place.
  for (const status of ["CONFIRMED", "trust me", "", null, undefined, 7, {}]) {
    assert.equal(validateTagAuditOutput(auditField({ status })).fields[0].status, "ai_generated");
  }
});

test("downgrading a status does not quietly discard the rest of the field", () => {
  // A model claiming `confirmed` still had something to say. The claim is
  // demoted; the observation is kept, so the audit trail shows what was said.
  const out = validateTagAuditOutput(auditField({ status: "confirmed", confidence: 1, evidence: "the label says silk" }));
  assert.deepEqual(out.fields[0], {
    field: "material", value: "silk", status: "ai_generated",
    confidence: 1, evidence: "the label says silk",
  });
});

test("only the known audit fields are storable", () => {
  for (const field of ["category", "subcategory", "color", "material",
                       "silhouette", "aesthetic", "mood", "era"]) {
    assert.equal(validateTagAuditOutput(auditField({ field })).fields[0].field, field);
  }
  // A field the model invented is dropped, not stored under a new column.
  for (const field of ["vibe", "price", "__proto__", "", null]) {
    assert.equal(validateTagAuditOutput(auditField({ field })), null, `${field} is not storable`);
  }
});

test("a field with no usable value is dropped rather than stored empty", () => {
  for (const value of ["", null, undefined, "100% silk", "  ", "-leading"]) {
    assert.equal(validateTagAuditOutput(auditField({ value })), null, `value ${JSON.stringify(value)}`);
  }
  // Positive counterpart: a value that normalizes cleanly is kept, normalized.
  assert.equal(validateTagAuditOutput(auditField({ value: "  SILK  " })).fields[0].value, "silk");
});

test("the audit output is capped at sixteen fields", () => {
  const many = { fields: Array.from({ length: 40 }, () => ({ field: "material", value: "silk", status: "probable" })) };
  assert.equal(validateTagAuditOutput(many).fields.length, 16);
});

// ------------------------------------- a model may not invent a product id

test("`availableIds` is the only universe a stylist may recommend from", () => {
  const available = new Set(["p1", "p2"]);

  const out = validateStylistOutput(
    { outfits: [{ name: "Look", productIds: ["p1", "ghost-sku", "p2", "also-invented"] }] },
    available,
  );
  assert.deepEqual(out.outfits[0].productIds, ["p1", "p2"], "invented ids are stripped");

  // An outfit made entirely of invented products is not an outfit.
  assert.equal(
    validateStylistOutput({ outfits: [{ name: "Look", productIds: ["ghost-sku"] }] }, available),
    null,
  );
});

test("a stylist call with no id universe fails closed", () => {
  // `availableIds` defaults to an empty Set, so forgetting to pass it strips
  // everything rather than trusting whatever the model returned. Failing open
  // here would mean recommending products that may not exist.
  assert.equal(validateStylistOutput({ outfits: [{ name: "Look", productIds: ["p1"] }] }), null);
});

test("an unnamed outfit is labelled rather than left blank", () => {
  const out = validateStylistOutput(
    { outfits: [{ name: "", productIds: ["p1"] }] }, new Set(["p1"]),
  );
  assert.equal(out.outfits[0].name, "untitled look");
});

// ------------------------------------------------------------ normalization

test("tags are lowercased, hyphenated, deduped and capped", () => {
  assert.deepEqual(
    normalizeAiTags(["Silk", "SILK", "  wool ", "bad_tag", "ok-tag"]),
    ["silk", "wool", "bad-tag", "ok-tag"],
  );
  assert.equal(normalizeAiTags(Array.from({ length: 40 }, (_, i) => "t" + i)).length, 12);
  assert.equal(normalizeAiTags("silk").length, 0, "a bare string is not a tag list");
  assert.equal(normalizeAiTags(null).length, 0);
});

test("a tag that is not a tag is dropped, not coerced", () => {
  // Leading punctuation, punctuation anywhere, and over-long strings all fail
  // the vocabulary shape — a model cannot smuggle a sentence in as a tag.
  const rejected = ["-leading", "100% silk", "tag!", "a".repeat(31), "", "<b>bold</b>"];
  assert.deepEqual(normalizeAiTags(rejected), []);

  // Surrounding whitespace is TRIMMED, not grounds for rejection — the trim
  // happens before the vocabulary check, so " leading" is a valid tag and
  // "-leading" is not. That distinction is easy to get backwards.
  assert.deepEqual(normalizeAiTags([" leading "]), ["leading"]);
  // Exactly at the length limit is accepted, one past it is not.
  assert.deepEqual(normalizeAiTags(["a".repeat(30)]), ["a".repeat(30)]);
  assert.deepEqual(normalizeAiTags(["a".repeat(31)]), []);
});

test("confidence outside 0..1 is not trusted, it is zeroed", () => {
  const c = (confidence) => validateTagAuditOutput(auditField({ confidence })).fields[0].confidence;
  assert.equal(c(0.9), 0.9);
  assert.equal(c(0), 0);
  assert.equal(c(1), 1);
  assert.equal(c(0.123456), 0.123, "rounded to three places");
  for (const bad of [5, -1, NaN, Infinity, "0.5", null, undefined, {}]) {
    assert.equal(c(bad), 0, `${JSON.stringify(bad)} is not a confidence`);
  }
});

test("model text is stripped of markup, collapsed and capped", () => {
  assert.equal(sanitizeModelText("<script>alert(1)</script>hello"), "alert(1)hello");
  assert.equal(sanitizeModelText("<b>seen</b> on the label"), "seen on the label");
  assert.equal(sanitizeModelText("  a\n\n  b\t c  "), "a b c");
  assert.equal(sanitizeModelText(42), "", "a non-string carries no text");
  assert.equal(sanitizeModelText(null), "");
  assert.equal(sanitizeModelText("x".repeat(500)).length, 400);
  assert.equal(sanitizeModelText("x".repeat(500), 50).length, 50);
  // Evidence has its own tighter cap at the call site.
  assert.equal(
    validateTagAuditOutput(auditField({ evidence: "e".repeat(500) })).fields[0].evidence.length,
    200,
  );
});

test("sanitizeModelText is a tag stripper, NOT an HTML sanitizer", () => {
  // A documented limit, pinned so nobody mistakes it for safety it does not
  // provide. The regex removes well-formed `<...>` spans only, so unterminated
  // or malformed markup survives with its angle brackets intact.
  assert.equal(sanitizeModelText("<img src=x onerror=alert(1)"), "<img src=x onerror=alert(1)");
  assert.equal(sanitizeModelText("<<b>>bold"), ">bold");

  // That is safe TODAY only because every consumer renders this as text, where
  // React escapes it. The guarantee is the absence of raw-HTML injection at the
  // call sites, so that is what is actually asserted.
  const consumers = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const p = dir + "/" + entry;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(entry)) consumers.push(p);
    }
  })(ROOT + "lib");

  const importers = consumers.filter((f) => readFileSync(f, "utf8").includes("ai/validate"));
  assert.ok(importers.length >= 2, `found ${importers.length} importers of ai/validate`);
  for (const f of importers) {
    assert.equal(readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"), false,
      `${f.slice(ROOT.length)} must not render validated model text as raw HTML`);
  }
});

// ------------------------------------------------- degrade, never explode

test("a hopeless shape degrades to null instead of throwing", () => {
  const garbage = [null, undefined, 42, "text", true, [], [1, 2], { fields: "no" },
                   { fields: {} }, { outfits: "no" }, { nope: 1 }];
  for (const g of garbage) {
    assert.doesNotThrow(() => validateTagAuditOutput(g), `tagAudit(${JSON.stringify(g)})`);
    assert.doesNotThrow(() => validateStylistOutput(g, new Set(["p1"])));
    assert.doesNotThrow(() => validateMoodBoardAnalysisOutput(g));
    assert.equal(validateTagAuditOutput(g), null);
    assert.equal(validateStylistOutput(g, new Set(["p1"])), null);
  }
  // Entries that are themselves junk are skipped without taking the batch down.
  const mixed = { fields: [null, "x", 7, { field: "material", value: "silk", status: "probable" }] };
  assert.equal(validateTagAuditOutput(mixed).fields.length, 1);
});

test("a moodboard reading needs something real in it to be worth storing", () => {
  assert.equal(validateMoodBoardAnalysisOutput({}), null, "nothing at all");
  assert.equal(validateMoodBoardAnalysisOutput({ aestheticTags: ["!!!"] }), null,
    "tags that all fail normalization leave nothing behind");
  assert.equal(validateMoodBoardAnalysisOutput([]), null, "an array is not an output object");

  // Either a surviving tag or a summary is enough on its own.
  const summaryOnly = validateMoodBoardAnalysisOutput({ summary: "a soft, tonal board" });
  assert.equal(summaryOnly.summary, "a soft, tonal board");
  assert.deepEqual(summaryOnly.aestheticTags, []);

  const tagsOnly = validateMoodBoardAnalysisOutput({ aestheticTags: ["Minimal"] });
  assert.deepEqual(tagsOnly.aestheticTags, ["minimal"]);
  assert.equal(tagsOnly.summary, "");

  // Every declared list is always present, so consumers never guard for absence.
  for (const k of ["aestheticTags", "moodTags", "colorTags", "silhouetteTags",
                   "fabricTags", "designerReferences", "eraTags"]) {
    assert.ok(Array.isArray(summaryOnly[k]), `${k} is always an array`);
  }
  assert.equal(summaryOnly.confidenceScore, 0);
});
