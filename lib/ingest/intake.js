// lib/ingest/intake.js
// Validation for OPERATOR-SUPPLIED real inventory (risk campaign phase L1).
// The checkout engine's own honesty gate (refusalReason) is the validator —
// one rule, shared, so nothing can enter the catalog as "real" that checkout
// would then refuse, and nothing purchasable can enter that the gate would
// not defend. SERVER-ONLY (imports the normalizer and the orders engine).
//
// The batch is atomic by contract: one bad item refuses the whole batch with
// per-index reasons and NOTHING is written. Partial intake is how a catalog
// drifts into half-real.

import { normalizeSourceProduct } from "./adapters/normalize.js";
import { refusalReason } from "../orders.js";

export const INTAKE_MAX_ITEMS = 50;

// Source names that may never be presented as real inventory.
const FORBIDDEN_SOURCES = /seed|e2e|test|demo|sample/;

// One validator for every surface that names a real-inventory source
// (operator intake, business linking, Shopify import).
export function validSourceName(input) {
  const source = String(input || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(source)) {
    return { ok: false, reason: "sourceName must be 2-40 chars of a-z, 0-9, hyphen" };
  }
  if (FORBIDDEN_SOURCES.test(source)) {
    return { ok: false, reason: `sourceName "${source}" reads as demo/test — real inventory only` };
  }
  return { ok: true, source };
}

/**
 * The gate every incoming product batch passes. Returns
 * `{ ok, problems, normalized }` — it REPORTS rather than throws, so one bad
 * row can be named to the operator instead of failing the whole import
 * silently.
 *
 * Rejects demo- and test-looking source names outright: the constitution's
 * no-faking rule enforced at the door, where seed data would otherwise enter
 * the real catalog and become indistinguishable from it.
 */
export function validateIntakeBatch(rawItems, sourceName) {
  const problems = [];
  const named = validSourceName(sourceName);
  if (!named.ok) {
    return { ok: false, problems: [{ index: null, reason: named.reason }], normalized: [] };
  }
  const source = named.source;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > INTAKE_MAX_ITEMS) {
    return { ok: false, problems: [{ index: null, reason: `items must be an array of 1-${INTAKE_MAX_ITEMS}` }], normalized: [] };
  }

  const normalized = rawItems.map((raw) => normalizeSourceProduct(raw, source));
  const seen = new Set();
  normalized.forEach((item, index) => {
    const key = `${item.source_name}:${item.source_product_id}`;
    if (seen.has(key)) {
      problems.push({ index, reason: `duplicate source_product_id "${item.source_product_id}" in batch` });
      return;
    }
    seen.add(key);
    // The checkout gate is the law. If it would refuse this item, intake
    // refuses it first, with the same words.
    const refusal = refusalReason(item);
    if (refusal) problems.push({ index, id: item.id, reason: refusal });
  });

  return { ok: problems.length === 0, problems, normalized };
}
