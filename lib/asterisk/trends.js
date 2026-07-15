// lib/asterisk/trends.js
// Asterisk AI — trend lifecycle intelligence (docs/ASTERISK-AI.md §4, P4 v1).
// THE single source of truth for trend claims, reconciling the two layers
// that previously lived apart (flagged on PR #17):
//
//   • AESTHETIC lifecycle calls — named aesthetics (mob wife, boho revival…)
//     with an honest phase + editorial note. Extracted from
//     lib/asterisk/culture.js (Day 12); culture records now carry no trend
//     data of their own and resolve it here at read time.
//   • GARMENT-level dated snapshot — cited, expiring records powering stylist
//     scoring (lib/ai/trendKnowledge.js, PR #18). Re-exported here so every
//     trend read has one import surface.
//
// One review clock: AESTHETIC_TREND_META.reviewBy is deliberately the SAME
// date as the garment snapshot's reviewBy, and scripts/check-trend-freshness
// fails CI when either layer goes stale — dated claims can't quietly drift.
// Cross-granularity links (`garmentTrends`) are conservative and validated:
// a dated aesthetic may never link to an accelerating garment record.

export {
  FASHION_TREND_SNAPSHOT,
  FASHION_TREND_SNAPSHOT_META,
  getCurrentFashionTrends,
  scoreProductTrendRelevance,
  getFashionTrendContext,
} from "../ai/trendKnowledge.js";

// Aesthetic lifecycle vocabulary — distinct on purpose from the garment
// snapshot's momentum vocabulary (acceleration/established/monitoring/
// seasonal): aesthetics have cultural arcs, garments have market momentum.
export const AESTHETIC_PHASES = Object.freeze([
  "rising", "peaking", "declining", "dated", "classic",
]);

const REV = "2026-07"; // last human review of the aesthetic calls below

export const AESTHETIC_TREND_META = Object.freeze({
  lastReviewed: REV,
  // Same clock as FASHION_TREND_SNAPSHOT_META.reviewBy — one review sweep
  // covers every dated trend claim in the codebase.
  reviewBy: "2026-08-15",
  provenance: "curated-web-informed-2026-07",
});

// Keyed by the canonical culture entity name (lib/asterisk/culture.js).
// `garmentTrends` links to FASHION_TREND_SNAPSHOT ids where the two layers
// describe the same movement — used for consistency checks and future
// surfacing, never to blend interpretations.
export const AESTHETIC_TRENDS = Object.freeze({
  "old money": { phase: "classic", note: "still dominant in 2026, though press declares the strict quiet-luxury era maturing toward color", lastReviewed: REV },
  "gorpcore": { phase: "classic", note: "unavoidable through 2026 — evolving via technical Asian labels", lastReviewed: REV },
  "mob wife": { phase: "dated", note: "viral in 2024-25; fashion press calls it dated for 2026", lastReviewed: REV },
  "opium": { phase: "peaking", note: "spread from the Atlanta rage scene to mainstream street style", lastReviewed: REV },
  "office siren": { phase: "declining", note: "peaked 2024-25; fashion press is moving on for 2026 workwear", lastReviewed: REV },
  "clean girl": { phase: "peaking", note: "still dominant in 2026 — absorbed quiet-luxury polish into an elevated version", lastReviewed: REV },
  "pilates princess": { phase: "declining", note: "the curated-wellness ideal is losing ground to gym goblin nonchalance in 2026", lastReviewed: REV },
  "gym goblin": { phase: "rising", note: "2026 counter-trend — comfort over curation, mismatched on purpose", lastReviewed: REV },
  "boho revival": { phase: "rising", note: "searches up ~30% into 2026 — craft-led, brighter and bolder than the 2010s wave", lastReviewed: REV, garmentTrends: ["indie-grunge-boho"] },
  "acubi": { phase: "peaking", note: "Korean minimal wave, early-2020s origin, still strong", lastReviewed: REV },
  "downtown girl": { phase: "peaking", note: "romanticized city living — steady on TikTok and Pinterest", lastReviewed: REV },
  "tomato girl": { phase: "declining", note: "2023-24 Mediterranean wave — mellowing into general resort dressing", lastReviewed: REV },
  "eclectic grandpa": { phase: "peaking", note: "menswear press favorite — idiosyncratic septuagenarian ease", lastReviewed: REV },
  "whimsigoth": { phase: "peaking", note: "whimsical-mystical-gothic-celestial — steady revival", lastReviewed: REV },
  "coquette": { phase: "peaking", note: "hyperfeminine wave, sibling of balletcore", lastReviewed: REV, garmentTrends: ["micro-oversized-proportions"] },
  "avant basic": { phase: "dated", note: "2021-22 Instagram wave — checkerboard-swirl maximalism reads as its era now", lastReviewed: REV },
  "archive fashion": { phase: "classic", note: "collector culture — the archive-designer canon and the Antwerp lineage", lastReviewed: REV },
  "blokecore": { phase: "peaking", note: "matured from thrifted jerseys into collab territory by 2026", lastReviewed: REV, garmentTrends: ["athletic-shorts-contrast"] },
  "blokette": { phase: "rising", note: "the feminine remix of blokecore — sporty meets coquette", lastReviewed: REV, garmentTrends: ["athletic-shorts-contrast"] },
  "coastal cowgirl": { phase: "declining", note: "recurring summer micro-trend", lastReviewed: REV },
  "goblincore": { phase: "peaking", note: "the feral sibling of cottagecore — moss, mud, decay honored", lastReviewed: REV },
  "castlecore": { phase: "rising", note: "emerging romantic-medieval thread", lastReviewed: REV },
  "soft girl": { phase: "rising", note: "the 2026 grown-up rework of the original bubblegum version", lastReviewed: REV },
  "dark feminine": { phase: "peaking", note: "the counter-pole to clean girl — noir seduction", lastReviewed: REV },
  "brat": { phase: "dated", note: "the 2024-25 lime moment — its color already shifted to chartreuse for 2026", lastReviewed: REV },
  "demure": { phase: "dated", note: "a 2024 micro-moment — kept for search coverage, honestly labeled", lastReviewed: REV },
  "cyber y2k": { phase: "peaking", note: "the chromed-out futurist branch of the y2k revival", lastReviewed: REV, garmentTrends: ["wedge-revival"] },
  "that girl": { phase: "declining", note: "wellness-routine polish — bleeding into clean girl", lastReviewed: REV },
  "vsco girl": { phase: "dated", note: "2019 wave — nostalgia territory now", lastReviewed: REV },
  "hypebeast": { phase: "declining", note: "logo-drop mania cooled as 2010s streetwear matured", lastReviewed: REV },
  "normcore": { phase: "classic", note: "the 2014 anti-trend that became a permanent register", lastReviewed: REV },
});

// The trend read for a culture entity — null is an honest "no lifecycle call
// on record", never a guess. Callers pass the CANONICAL entity name
// (lookupCulture already resolves aliases before asking).
export function aestheticTrend(name) {
  const rec = AESTHETIC_TRENDS[String(name || "").toLowerCase()];
  if (!rec) return null;
  return { phase: rec.phase, note: rec.note, lastReviewed: rec.lastReviewed };
}
