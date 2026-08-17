// tests/asterisk-tag-audit.test.js — dual tagging, and the rule under it.
//
// `auditProductTags` is Asterisk's secondary read of a product. ASTERISK-AI §7
// states the rule it exists to honour: **base tags are never overwritten, and a
// conflict is never silently resolved in either direction.** Asterisk writes its
// own interpretation to `product_ai_tags`, a reconciliation records how much the
// two layers agree, and a high-impact disagreement opens a moderation task for a
// human instead of picking a winner.
//
// That rule is the whole design. Until now nothing checked it.
//
// These tests run entirely on the in-memory store — no `DATABASE_URL`, no
// network, no model. That is not a limitation here but the honest default path:
// with AI disabled (the normal state, see `tests/ai-adapter.test.js`)
// `auditProductTags` falls back to local rules, and the local-rules branch is
// exactly what production runs today.
//
// Products are seeded with ids unique to each test, because the memory store
// persists for the lifetime of the process.

import { test } from "node:test";
import assert from "node:assert/strict";

import { upsertItems } from "../lib/db/index.js";
import { addProductTags, getProductTags } from "../lib/db/production.js";
import { auditProductTags } from "../lib/asterisk/tagAudit.js";

let n = 0;
const id = (label) => `tagaudit-${label}-${++n}`;

async function seed(productId, item = {}, tags = []) {
  await upsertItems([{ id: productId, title: "", brand: "", category: "", tags: {}, ...item }]);
  if (tags.length) await addProductTags(productId, tags);
  return productId;
}

const fieldsOf = (result, field) => result.fields.filter((f) => f.field === field);

// ------------------------------------------------- the rule the module exists for

test("a conflict never overwrites the base tag — both values are kept", async () => {
  // The seller says denim. The listing text says silk. Asterisk must record the
  // disagreement, not resolve it.
  const productId = await seed(id("conflict"),
    { title: "black silk slip dress", brand: "Acme", category: "dress" },
    [{ tag: "denim", tagType: "material", source: "seller" }]);

  const before = await getProductTags(productId);
  const result = await auditProductTags(productId);
  const after = await getProductTags(productId);

  assert.equal(result.ok, true);
  assert.deepEqual(after, before, "the base layer is byte-identical after an audit");

  const [conflict] = result.reconciliation.conflicts.filter((c) => c.field === "material");
  assert.ok(conflict, "the disagreement is recorded");
  assert.deepEqual(conflict.base, ["denim"], "the seller's value survives, as an array");
  assert.equal(conflict.ai, "silk", "alongside Asterisk's, not instead of it");
  assert.equal(conflict.aiStatus, "estimated");
  assert.equal(conflict.aiConfidence, 0.5);
});

test("a high-impact conflict asks a human; a cosmetic one does not", async () => {
  // brand / category / material at confidence >= 0.5 route to moderation.
  const material = await seed(id("high"),
    { title: "black silk slip dress", brand: "Acme", category: "dress" },
    [{ tag: "denim", tagType: "material", source: "seller" }]);
  const high = await auditProductTags(material);
  assert.equal(high.reconciliation.reviewRequired, true, "material is high-impact");

  // Colour disagreements are common and cheap — they do not open a task.
  const colour = await seed(id("low"),
    { title: "black dress", brand: "Acme", category: "dress" },
    [{ tag: "white", tagType: "color", source: "seller" }]);
  const low = await auditProductTags(colour);
  assert.equal(low.reconciliation.conflicts.length, 1, "the conflict is still recorded");
  assert.equal(low.reconciliation.conflicts[0].field, "color");
  assert.equal(low.reconciliation.reviewRequired, false, "but nobody is paged for a colour");
});

test("agreement is scored over what could actually be compared", async () => {
  // Two comparisons — category agrees, material does not.
  const productId = await seed(id("score"),
    { title: "black silk slip dress", brand: "Acme", category: "dress" },
    [{ tag: "denim", tagType: "material", source: "seller" }]);
  const result = await auditProductTags(productId);
  assert.equal(result.reconciliation.agreementScore, 0.5);
});

test("an agreement score of 1 can mean nothing was comparable, not perfect agreement", async () => {
  // This is the reading that would mislead someone at the desk. With no base
  // value for any field Asterisk read, there are zero comparisons — and the
  // score defaults to 1. `missingBaseFields` is what tells the two apart.
  const productId = await seed(id("vacuous"), { title: "black thing", brand: "Acme" });
  const result = await auditProductTags(productId);

  assert.equal(result.reconciliation.agreementScore, 1, "scored 1...");
  assert.deepEqual(result.reconciliation.conflicts, []);
  assert.ok(result.reconciliation.missingBaseFields.includes("color"),
    "...but only because colour had nothing to compare against");

  // A genuine full agreement looks the same in the score and different here.
  const agreeing = await seed(id("agree"),
    { title: "silk dress", brand: "Acme", category: "dress" },
    [{ tag: "silk", tagType: "material", source: "seller" }]);
  const real = await auditProductTags(agreeing);
  assert.equal(real.reconciliation.agreementScore, 1);
  assert.equal(real.reconciliation.missingBaseFields.includes("material"), false,
    "material WAS compared, and agreed");
});

// --------------------------------------------------------- the local-rules path

test("with no model configured the audit still runs, and says it used local rules", async () => {
  const productId = await seed(id("local"), { title: "black silk dress", category: "dress" });
  const result = await auditProductTags(productId);

  assert.equal(result.analysisSource, "local-rules");
  assert.match(result.auditId, /^aud-[0-9a-f-]{36}$/);
  assert.ok(result.fields.length > 0, "an honest reading, not an empty one");
});

test("local-rules confidence is capped at 0.6 — it is inference, not knowledge", async () => {
  const productId = await seed(id("cap"),
    { title: "black silk dress", category: "dress", tags: { MINIMAL: 1 } });
  const result = await auditProductTags(productId);

  for (const f of result.fields) {
    assert.ok(f.confidence <= 0.6, `${f.field}=${f.value} at ${f.confidence} stays under the cap`);
  }
  // Even a brain weight of 1.0 is clamped rather than passed through.
  const [aesthetic] = fieldsOf(result, "aesthetic");
  assert.equal(aesthetic.confidence, 0.6);
});

test("only confident brain tags become an aesthetic reading", async () => {
  const productId = await seed(id("vector"),
    { title: "plain tee", category: "top", tags: { MINIMAL: 0.8, GORP: 0.1, TAILORED: 0.35 } });
  const result = await auditProductTags(productId);
  const values = fieldsOf(result, "aesthetic").map((f) => f.value).sort();

  assert.deepEqual(values, ["minimal", "tailored"], "0.35 is the threshold, and it is inclusive");
  assert.equal(values.includes("gorp"), false, "a 0.1 weight is not a reading");
});

test("every local-rules field says where it came from", async () => {
  const productId = await seed(id("evidence"),
    { title: "black silk dress", category: "dress", era: "1990s", tags: { MINIMAL: 0.8 } });
  const result = await auditProductTags(productId);

  for (const f of result.fields) {
    assert.ok(f.evidence && f.evidence.length > 0, `${f.field} carries evidence`);
  }
  assert.match(fieldsOf(result, "material")[0].evidence, /word "silk" in listing text/);
  assert.equal(fieldsOf(result, "category")[0].evidence, "listing category field");
  assert.equal(fieldsOf(result, "era")[0].evidence, "listing era field");
  assert.match(fieldsOf(result, "aesthetic")[0].evidence, /^brain tag vector weight /);
});

// -------------------------------------------------------------- shape handling

test("era is comparable whether it is a string or the JSONB shape", async () => {
  // Synced rows store era as {raw, year, decade, season}; older rows store a
  // plain string. Both must reduce to the same comparable value.
  const asString = await seed(id("era-str"), { title: "tee", category: "top", era: "1980s" });
  assert.equal(fieldsOf(await auditProductTags(asString), "era")[0].value, "1980s");

  const asObject = await seed(id("era-obj"), { title: "tee", category: "top", era: { decade: "1980s", raw: "80s" } });
  assert.equal(fieldsOf(await auditProductTags(asObject), "era")[0].value, "1980s", "decade wins");

  const rawOnly = await seed(id("era-raw"), { title: "tee", category: "top", era: { raw: "80s" } });
  assert.equal(fieldsOf(await auditProductTags(rawOnly), "era")[0].value, "80s", "raw is the fallback");

  const noEra = await seed(id("era-none"), { title: "tee", category: "top" });
  assert.equal(fieldsOf(await auditProductTags(noEra), "era").length, 0, "no era, no claim");
});

test("canonical tags are resolved where the ontology knows them and null where it does not", async () => {
  const productId = await seed(id("canon"), { title: "black silk dress", category: "dress", era: "1990s" });
  const result = await auditProductTags(productId);

  assert.equal(fieldsOf(result, "color")[0].canonicalTag, "color.black");
  assert.equal(fieldsOf(result, "material")[0].canonicalTag, "material.silk");
  assert.equal(fieldsOf(result, "era")[0].canonicalTag, "era.90s");

  // An unresolved value keeps its raw form with a null canonical — the value is
  // never invented to make the row look tidy.
  const category = fieldsOf(result, "category")[0];
  assert.equal(category.value, "dress");
  assert.equal(category.canonicalTag, null);
});

test("auditing a product that does not exist is an honest refusal, not a crash", async () => {
  const result = await auditProductTags("no-such-product-anywhere");
  assert.deepEqual(result, { ok: false, error: "product not found" });

  for (const bad of [null, undefined, "", 0]) {
    const out = await auditProductTags(bad);
    assert.equal(out.ok, false, `${JSON.stringify(bad)} refuses`);
  }
});

test("every audit gets its own id, and the reconciliation is reported with it", async () => {
  const productId = await seed(id("ids"), { title: "silk dress", category: "dress" });
  const first = await auditProductTags(productId);
  const second = await auditProductTags(productId);

  assert.notEqual(first.auditId, second.auditId, "a re-audit is a new record, not an edit");
  assert.match(second.auditId, /^aud-/);
  for (const key of ["agreementScore", "conflicts", "missingBaseFields", "reviewRequired"]) {
    assert.ok(key in second.reconciliation, `reconciliation carries ${key}`);
  }
});
