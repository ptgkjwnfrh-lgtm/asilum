// One schema boundary for both staged proposals and checked-in research.
// Keeping normalization here prevents the database gate and module loader
// from accepting subtly different culture records.

import { TAGS } from "../brain/tags.js";
import { safeExternalUrl } from "../url.js";

export const RESEARCH_CONFIDENCE_CAP = 0.8;
const NAME = /^[a-z0-9][a-z0-9 '&.-]{1,59}$/;
const ID_SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

const clean = (value, max) => String(value ?? "").trim().slice(0, max);
const cleanName = (value) => clean(value, 60).toLowerCase().replace(/\s+/g, " ");

function normalizeTerms(value, { field, maxItems, maxLength }) {
  if (value !== undefined && !Array.isArray(value)) return { error: `${field} must be an array` };
  const raw = value || [];
  if (raw.length > maxItems) return { error: `${field} allows at most ${maxItems} values` };
  const terms = raw.map((item) => clean(item, maxLength).toLowerCase()).filter(Boolean);
  if (terms.length !== raw.length) return { error: `${field} may not contain empty values` };
  if (new Set(terms).size !== terms.length) return { error: `${field} must be unique` };
  return { terms };
}

/**
 * Validate and normalise a proposed culture record before it may be reviewed.
 *
 * Returns `{ ok, value }` or `{ ok: false, error }` with a SENTENCE a reviewer
 * can act on, never a thrown exception — a bad proposal is ordinary input
 * here, not an exceptional condition.
 *
 * Rejects a name already taken: two records under one name would make lookup
 * order decide which reading a query gets.
 */
export function normalizeCultureProposal(input = {}, { allowedKinds, takenNames }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "proposal must be an object" };
  }
  const kinds = allowedKinds instanceof Set ? allowedKinds : new Set(allowedKinds || []);
  const kind = clean(input.kind, 40).toLowerCase();
  if (!kinds.has(kind)) return { ok: false, error: `kind must be one of: ${[...kinds].sort().join(", ")}` };

  const name = cleanName(input.name);
  if (!NAME.test(name)) return { ok: false, error: "name must be 2-60 chars, lowercase [a-z0-9 '&.-]" };
  if (takenNames?.has(name)) return { ok: false, error: `"${name}" already exists in the culture catalog` };

  const normalizedAliases = normalizeTerms(input.aliases, { field: "aliases", maxItems: 8, maxLength: 60 });
  if (normalizedAliases.error) return { ok: false, error: normalizedAliases.error };
  const aliases = normalizedAliases.terms.map((alias) => alias.replace(/\s+/g, " "));
  const seenNames = new Set([name]);
  for (const alias of aliases) {
    if (!NAME.test(alias)) return { ok: false, error: `alias "${alias}" is malformed` };
    if (seenNames.has(alias)) return { ok: false, error: `duplicate name or alias "${alias}"` };
    seenNames.add(alias);
    if (takenNames?.has(alias)) return { ok: false, error: `alias "${alias}" collides with the culture catalog` };
  }

  if (input.trend !== undefined) {
    return { ok: false, error: "proposals may not carry trend lifecycle calls — those live in lib/asterisk/trends.js behind their own review" };
  }
  if (!Array.isArray(input.interpretations) || input.interpretations.length < 1 || input.interpretations.length > 6) {
    return { ok: false, error: "1-6 interpretations required" };
  }

  const interpretations = [];
  const seenIds = new Set();
  for (const raw of input.interpretations) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "interpretation must be an object" };
    const id = clean(raw.id, 101).toLowerCase();
    if (!id.startsWith(name + "/") || !ID_SLUG.test(id.slice(name.length + 1))) {
      return { ok: false, error: `interpretation id "${id}" must be "${name}/<slug>"` };
    }
    if (seenIds.has(id)) return { ok: false, error: `duplicate interpretation id "${id}"` };
    seenIds.add(id);

    const label = clean(raw.label, 60);
    const summary = clean(raw.summary, 200);
    if (!label || !summary) return { ok: false, error: `${id}: label and summary required` };

    const normalizedTags = normalizeTerms(raw.tags, { field: `${id}: tags`, maxItems: 5, maxLength: 20 });
    if (normalizedTags.error || normalizedTags.terms.length < 1) {
      return { ok: false, error: normalizedTags.error || `${id}: 1-5 tags required` };
    }
    if (normalizedTags.terms.some((tag) => !TAGS.includes(tag.toUpperCase()))) {
      const tag = normalizedTags.terms.find((value) => !TAGS.includes(value.toUpperCase()));
      return { ok: false, error: `${id}: tag "${tag}" is not in the live brain tag space` };
    }

    const colors = normalizeTerms(raw.colors, { field: `${id}: colors`, maxItems: 6, maxLength: 20 });
    if (colors.error) return { ok: false, error: colors.error };
    const moods = normalizeTerms(raw.moods, { field: `${id}: moods`, maxItems: 6, maxLength: 20 });
    if (moods.error) return { ok: false, error: moods.error };

    const confidence = Number(raw.confidence);
    if (!(confidence > 0 && confidence <= RESEARCH_CONFIDENCE_CAP)) {
      return { ok: false, error: `${id}: confidence must be in (0, ${RESEARCH_CONFIDENCE_CAP}] for research proposals` };
    }
    interpretations.push({
      id, label, type: clean(raw.type, 30) || kind, summary,
      tags: normalizedTags.terms, colors: colors.terms, moods: moods.terms,
      confidence: +confidence.toFixed(2),
    });
  }

  return { ok: true, proposal: {
    kind, name, aliases, note: clean(input.note, 160) || null, interpretations,
  } };
}

/**
 * Re-validate an APPROVED record against the CURRENT catalog, at compile time.
 *
 * The second gate, and it exists because approval and compilation are separated
 * in time: a name that was free when a proposal was approved may have been
 * taken since. Returns an error string, or nothing when the record still holds.
 */
export function validateCompiledResearchRecord(record, { allowedKinds, takenNames }) {
  const normalized = normalizeCultureProposal(record, { allowedKinds, takenNames });
  if (!normalized.ok) return normalized.error;
  const core = {
    kind: record.kind, name: record.name, aliases: record.aliases,
    note: record.note ?? null, interpretations: record.interpretations,
  };
  if (JSON.stringify(core) !== JSON.stringify(normalized.proposal)) return "record is not in canonical normalized form";
  if (typeof record.factId !== "string" || !/^fact-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(record.factId)) {
    return "missing fact provenance";
  }
  if (typeof record.provenance !== "string" || !/^research-approved-[a-z0-9._-]{1,120}$/i.test(record.provenance)) {
    return "missing review provenance";
  }
  if (!Array.isArray(record.sourceUrls) || !record.sourceUrls.length || record.sourceUrls.length > 10 ||
      new Set(record.sourceUrls).size !== record.sourceUrls.length || record.sourceUrls.some((url) => !safeExternalUrl(url))) {
    return "invalid source provenance";
  }
  if (!Number.isFinite(record.approvedAt) || record.approvedAt <= 0) return "invalid approval timestamp";
  return null;
}
