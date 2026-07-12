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

const conf = (v) => (typeof v === "number" && v >= 0 && v <= 1 ? +v.toFixed(3) : 0);

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
