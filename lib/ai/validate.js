// lib/ai/validate.js
// Model output is UNTRUSTED input — same posture as client payloads.
// Validators check shape, normalize and dedupe tags, strip anything the
// model invented (unknown product ids, unavailable products), and degrade
// to null instead of throwing so callers can fall back to local rules.

const TAG_RE = /^[a-z0-9][a-z0-9 -]{0,29}$/;

export function sanitizeModelText(text, max = 400) {
  if (typeof text !== "string") return "";
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Lowercase, trim, drop non-conforming, dedupe, cap.
export function normalizeAiTags(tags, cap = 12) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const t of tags) {
    const v = String(t || "").toLowerCase().trim().replace(/_/g, "-");
    if (!TAG_RE.test(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

// A MODEL'S SELF-SCORED CONFIDENCE IS THE LEAST RELIABLE NUMBER IN THE SYSTEM,
// and until now it was the only one with no ceiling. lib/asterisk/tagAudit.js
// caps every LOCALLY derived value at 0.6 ("local rules cap 0.6") while a
// model could return 1.000 and have it stored verbatim — verified by running
// validateTagAuditOutput with confidence:1 and evidence:"none", which came
// back 1.000 unchanged. That asymmetry is load-bearing: tagAudit escalates a
// conflict to a human only when the model's own number is >= 0.5, and the
// mood-board analyser stamps its number onto every tag row, where it flows
// into the style profile that orders which cultural reading of a query leads.
//
// The same 0.6 the deterministic path already lives under. The prompt already
// tells the model "an honest gap beats a confident guess"; this is the line
// that enforces it when the model does not listen.
export const MODEL_CONFIDENCE_CEILING = 0.6;
const conf = (v) => {
  if (typeof v !== "number" || !(v >= 0) || !(v <= 1)) return 0;
  return +Math.min(MODEL_CONFIDENCE_CEILING, v).toFixed(3);
};

// → normalized MoodBoardAnalysisOutput, or null if the shape is hopeless.
export function validateMoodBoardAnalysisOutput(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const lists = ["aestheticTags", "moodTags", "colorTags", "silhouetteTags",
                 "fabricTags", "designerReferences", "eraTags"];
  const normalized = {};
  let any = false;
  for (const k of lists) {
    normalized[k] = normalizeAiTags(output[k]);
    if (normalized[k].length) any = true;
  }
  normalized.summary = sanitizeModelText(output.summary);
  normalized.confidenceScore = conf(output.confidenceScore);
  return any || normalized.summary ? normalized : null;
}

// The full certainty vocabulary (Asterisk AI). Statuses a MODEL may claim for
// itself are a strict subset — confirmed/verified require sources or humans.
export const CERTAINTY_STATUSES = [
  "confirmed", "verified", "strongly_supported", "probable", "estimated",
  "visually_inferred", "user_supplied", "seller_supplied", "ai_generated",
  "disputed", "unverified", "unknown",
];
const MODEL_CLAIMABLE = new Set(["probable", "estimated", "visually_inferred", "unknown"]);
const AUDIT_FIELDS = new Set(["category", "subcategory", "color", "material",
  "silhouette", "aesthetic", "mood", "era"]);

// → normalized TagAuditOutput {fields:[{field,value,confidence,status,evidence}]}
// or null. A model can never claim "confirmed"/"verified" — those statuses are
// reserved for sourced or human-reviewed data; out-of-vocab statuses become
// "ai_generated". Valueless or unknown-status entries are dropped, not stored.
export function validateTagAuditOutput(output) {
  if (!output || !Array.isArray(output.fields)) return null;
  const fields = [];
  for (const f of output.fields.slice(0, 16)) {
    if (!f || typeof f !== "object") continue;
    const field = String(f.field || "").toLowerCase().trim();
    const [value] = normalizeAiTags([f.value], 1);
    if (!AUDIT_FIELDS.has(field) || !value) continue;
    const status = MODEL_CLAIMABLE.has(String(f.status)) ? String(f.status) : "ai_generated";
    if (status === "unknown") continue;
    fields.push({
      field, value, status,
      confidence: conf(f.confidence),
      evidence: sanitizeModelText(f.evidence, 200),
    });
  }
  return fields.length ? { fields } : null;
}

// → normalized StylistOutput. `availableIds` is the ONLY id universe the
// model may recommend from; anything else is stripped. Outfits that end up
// with no valid products are dropped.
export function validateStylistOutput(output, availableIds = new Set()) {
  if (!output || !Array.isArray(output.outfits)) return null;
  const outfits = [];
  for (const o of output.outfits.slice(0, 6)) {
    if (!o || typeof o !== "object") continue;
    const productIds = (Array.isArray(o.productIds) ? o.productIds : [])
      .map((id) => String(id))
      .filter((id) => availableIds.has(id))
      .slice(0, 8);
    if (!productIds.length) continue;
    outfits.push({
      name: sanitizeModelText(o.name, 80) || "untitled look",
      summary: sanitizeModelText(o.summary),
      productIds,
      matchedTags: normalizeAiTags(o.matchedTags),
      colorLogic: sanitizeModelText(o.colorLogic, 200),
      silhouetteLogic: sanitizeModelText(o.silhouetteLogic, 200),
      aestheticLogic: sanitizeModelText(o.aestheticLogic, 200),
      confidenceScore: conf(o.confidenceScore),
    });
  }
  return outfits.length ? { outfits } : null;
}

// → normalized SearchInterpretation, or null. THE CLOSED-VOCABULARY RULE:
// every list the model may draw from is handed in, and anything outside it is
// DROPPED and recorded. That is what makes a model-assisted read safe to serve
// at all — the worst a mis-parse can produce is a constraint the
// deterministic engine could have produced itself, never a fact about a
// garment and never a product it invented.
//
// The model is not asked for, and cannot supply, a confidence in its own
// work: an assisted rack's confidence is computed by the engine from the
// constraints that actually applied, exactly like every other rack.
export function validateSearchInterpretationOutput(output, vocab = {}) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const dropped = [];
  const pick = (values, allowed, cap = 4) => {
    const out = [];
    for (const v of Array.isArray(values) ? values.slice(0, 12) : []) {
      const s = String(v ?? "").toLowerCase().trim();
      if (!s) continue;
      if (allowed && !allowed.has(s)) { dropped.push(s); continue; }
      if (!out.includes(s)) out.push(s);
      if (out.length >= cap) break;
    }
    return out;
  };

  const garments = pick(output.garments, vocab.garments);
  const aesthetics = pick(output.aesthetics, vocab.aesthetics);
  const origins = pick(output.origins, vocab.origins, 3);

  let size = null;
  if (output.size != null) {
    const s = String(output.size).toUpperCase().trim();
    if (vocab.sizes && vocab.sizes.has(s)) size = s;
    else dropped.push(String(output.size));
  }

  const year = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1900 && n <= 2100 ? Math.trunc(n) : null;
  };
  let era = null;
  const minYear = year(output?.era?.minYear);
  const maxYear = year(output?.era?.maxYear);
  if (minYear != null || maxYear != null) {
    era = { minYear: minYear ?? 1900, maxYear: maxYear ?? 2100 };
    if (era.minYear > era.maxYear) era = { minYear: era.maxYear, maxYear: era.minYear };
  }

  const money = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n) : null;
  };
  const minPrice = money(output.minPrice);
  const maxPrice = money(output.maxPrice);

  // Exclusions only ever REMOVE, so free words are safe here — but they are
  // still bounded and stripped like any other model text.
  const exclusions = (Array.isArray(output.exclusions) ? output.exclusions : [])
    .map((w) => String(w ?? "").toLowerCase().trim().replace(/[^a-z0-9 -]/g, ""))
    .filter((w) => w.length >= 3 && w.length <= 30)
    .slice(0, 3);

  const reading = sanitizeModelText(output.reading, 140);

  const any = garments.length || aesthetics.length || origins.length || size ||
    era || minPrice != null || maxPrice != null || exclusions.length;
  if (!any) return null;
  return { garments, aesthetics, origins, size, era, minPrice, maxPrice, exclusions, reading, dropped };
}
