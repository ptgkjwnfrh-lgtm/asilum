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

const REV = "2026-07"; // last human review of the aesthetic calls below (2026-07-17 sweep)

export const AESTHETIC_TREND_META = Object.freeze({
  lastReviewed: REV,
  // Same clock as FASHION_TREND_SNAPSHOT_META.reviewBy — one review sweep
  // covers every dated trend claim in the codebase.
  reviewBy: "2026-09-15",
  provenance: "curated-web-informed-2026-07",
});

// Keyed by the canonical culture entity name (lib/asterisk/culture.js).
// `garmentTrends` links to FASHION_TREND_SNAPSHOT ids where the two layers
// describe the same movement — used for consistency checks and future
// surfacing, never to blend interpretations.
export const AESTHETIC_TRENDS = Object.freeze({
  "old money": { phase: "classic", note: "a permanent register by 2026 — press tracks the strict quiet-luxury era evolving toward personality, construction, and color", lastReviewed: REV },
  "gorpcore": { phase: "classic", note: "a permanent style category by 2026 — evolving quieter, into refined 'quiet gorpcore' fusions", lastReviewed: REV },
  "mob wife": { phase: "dated", note: "viral in 2024-25; fashion press calls it dated for 2026", lastReviewed: REV },
  "opium": { phase: "peaking", note: "no longer emerging — 2026 press calls the look a benchmark for where hip-hop style is headed", lastReviewed: REV },
  "office siren": { phase: "declining", note: "peaked 2024-25; fashion press is moving on for 2026 workwear", lastReviewed: REV },
  "clean girl": { phase: "declining", note: "the polished ideal lost its hold in 2026 — search interest down sharply as the 'messy girl' counter-wave took the runways; its elevated register survives inside quiet luxury", lastReviewed: REV },
  "pilates princess": { phase: "dated", note: "press declared the curated-wellness ideal dead in 2026 — overtaken by gym goblin nonchalance", lastReviewed: REV },
  "gym goblin": { phase: "peaking", note: "took over fitness culture by summer 2026 — comfort over curation, vintage sportswear, mismatched on purpose", lastReviewed: REV },
  "boho revival": { phase: "peaking", note: "one of the defining aesthetics of 2026 — matured into craft-led sophistication with suede as the signature fabric", lastReviewed: REV, garmentTrends: ["indie-grunge-boho"] },
  "acubi": { phase: "peaking", note: "Korean minimal wave, early-2020s origin, still strong", lastReviewed: REV },
  "downtown girl": { phase: "peaking", note: "romanticized city living — steady on TikTok and Pinterest", lastReviewed: REV },
  "tomato girl": { phase: "declining", note: "2023-24 Mediterranean wave — mellowing into general resort dressing", lastReviewed: REV },
  "eclectic grandpa": { phase: "peaking", note: "menswear press favorite — idiosyncratic septuagenarian ease", lastReviewed: REV },
  "whimsigoth": { phase: "peaking", note: "whimsical-mystical-gothic-celestial — steady revival", lastReviewed: REV },
  "coquette": { phase: "peaking", note: "hyperfeminine wave holding through 2026 — corsetry and lace back on the couture runways, a darker balletcore branch emerging", lastReviewed: REV, garmentTrends: ["micro-oversized-proportions"] },
  "avant basic": { phase: "dated", note: "2021-22 Instagram wave — checkerboard-swirl maximalism reads as its era now", lastReviewed: REV },
  "archive fashion": { phase: "classic", note: "collector culture — the archive-designer canon and the Antwerp lineage", lastReviewed: REV },
  "blokecore": { phase: "peaking", note: "the 2026 World Cup made it fashion's biggest runway — vintage kits fully mainstream, collab territory", lastReviewed: REV, garmentTrends: ["athletic-shorts-contrast"] },
  "blokette": { phase: "rising", note: "the feminine remix of blokecore — riding the World Cup summer alongside it", lastReviewed: REV, garmentTrends: ["athletic-shorts-contrast"] },
  "coastal cowgirl": { phase: "declining", note: "recurring summer micro-trend", lastReviewed: REV },
  "goblincore": { phase: "peaking", note: "the feral sibling of cottagecore — moss, mud, decay honored", lastReviewed: REV },
  "castlecore": { phase: "peaking", note: "the romantic-medieval thread reached the fall 2026 runways — fantasy-driven, tactile, lace-up and hardware details", lastReviewed: REV },
  "soft girl": { phase: "rising", note: "the 2026 grown-up rework of the original bubblegum version", lastReviewed: REV },
  "dark feminine": { phase: "peaking", note: "the counter-pole to clean girl — noir seduction", lastReviewed: REV },
  "brat": { phase: "dated", note: "the 2024-25 lime moment — the color conversation moved on to chartreuse and richer tones for 2026", lastReviewed: REV },
  "demure": { phase: "dated", note: "a 2024 micro-moment — kept for search coverage, honestly labeled", lastReviewed: REV },
  "cyber y2k": { phase: "peaking", note: "the chromed-out futurist branch of the y2k revival — a dominant streetwear force in Seoul, Berlin, and New York in 2026", lastReviewed: REV, garmentTrends: ["wedge-revival"] },
  "that girl": { phase: "declining", note: "wellness-routine polish — fading alongside the wider clean-girl decline", lastReviewed: REV },
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
