// lib/ai/localFashionInterpreter.js
// The REAL rule-based fallback that runs while no model is connected.
// Interprets a mood-board item from what we can actually read today:
// caption/notes/filename words (through the live lexicon), manual tags,
// and palette-v0 swatches. Returns the SAME shape a future model must
// return (validate.js), so downstream code never knows the difference —
// except analysis_source says "local-rules", honestly.

import { inferTags } from "../ingest/sources.js";
import { paletteFromSwatches } from "../vision/palette.js";
import { SILHOUETTES, MATERIALS, ERAS, MOODS, COLORS } from "../fashion-taxonomy/index.js";
import { normalizeAiTags, sanitizeModelText } from "./validate.js";

// Scan free text for taxonomy words (silhouettes/fabrics/eras/moods/colors
// aren't in the brain lexicon — simple word matching is honest and useful).
function taxonomyHits(text, vocab) {
  const t = " " + text.toLowerCase() + " ";
  return vocab.filter((w) => t.includes(" " + w.toLowerCase() + " "));
}

/**
 * @param {{ caption?:string, userNotes?:string, manualTags?:string[],
 *           palette?:{hex:string,weight:number}[], sourceTags?:string[] }} input
 * → MoodBoardAnalysisOutput (same shape a model must return) — never null.
 */
export function interpretMoodBoardItem(input = {}) {
  const text = [input.caption, input.userNotes].filter(Boolean).join(" ").slice(0, 600);
  const manual = normalizeAiTags(input.manualTags || [], 16);
  const sourceTags = normalizeAiTags(input.sourceTags || [], 16);

  // Aesthetic weights from the live lexicon (same path /api/train uses).
  const vec = inferTags([text, manual.join(" ")].filter(Boolean).join(" "));
  const aesthetic = Object.entries(vec.long || vec)
    .filter(([, w]) => typeof w === "number" && w > 0.05)
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t.toLowerCase());

  // Palette → color names + palette-mapped aesthetic hints.
  let colorTags = taxonomyHits(text, COLORS);
  let paletteTags = [];
  if (Array.isArray(input.palette) && input.palette.length) {
    const derived = paletteFromSwatches(input.palette);
    if (derived) {
      colorTags = [...new Set([...colorTags, ...derived.palette.map((s) => s.name)])];
      paletteTags = Object.keys(derived.tags).map((t) => t.toLowerCase());
    }
  }

  const out = {
    aestheticTags: normalizeAiTags([...aesthetic, ...paletteTags, ...sourceTags]),
    moodTags: normalizeAiTags(taxonomyHits(text, MOODS)),
    colorTags: normalizeAiTags(colorTags),
    silhouetteTags: normalizeAiTags(taxonomyHits(text, SILHOUETTES)),
    fabricTags: normalizeAiTags(taxonomyHits(text, MATERIALS)),
    designerReferences: [],   // needs a knowledge source — never guessed locally
    eraTags: normalizeAiTags(taxonomyHits(text, ERAS)),
    summary: "",
    confidenceScore: 0,
  };

  const signal = out.aestheticTags.length + out.colorTags.length + out.moodTags.length
    + out.silhouetteTags.length + out.fabricTags.length + out.eraTags.length + manual.length;
  // Local rules are deliberately humble: word + color statistics, no vision.
  out.confidenceScore = Math.min(0.6, +(signal * 0.06).toFixed(2));
  out.summary = sanitizeModelText(
    signal === 0
      ? "no readable signal — awaiting manual tags or a vision model"
      : `local rules read ${[
          out.colorTags.length && `colors ${out.colorTags.slice(0, 3).join("/")}`,
          out.aestheticTags.length && `aesthetics ${out.aestheticTags.slice(0, 3).join("/")}`,
          out.moodTags.length && `mood ${out.moodTags.slice(0, 2).join("/")}`,
        ].filter(Boolean).join("; ")} — colors and words only, no image understanding yet`);
  return out;
}
