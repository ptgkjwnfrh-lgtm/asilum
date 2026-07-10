// lib/search/mappings-seed.js
// Curated search mappings — the cultural lexicon that turns human phrases into
// tags and related terms. Seeded into the search_mappings table (idempotent
// upsert via scripts/seed-mappings.mjs) and used as the in-code fallback when
// the database is unreachable, so search always understands these.
//
// mappedTags speak the brain's aesthetic vocabulary (matched case-insensitively
// against items.tags and the product_tags layer); relatedTerms are matched
// against product titles/brands as text. Admin can add more via /api/admin.

export const DEFAULT_MAPPINGS = [
  { searchPhrase: "2012 chief keef", referenceType: "influencer", confidence: 0.8,
    mappedTags: ["streetwear", "statement"],
    relatedTerms: ["true religion", "ralph lauren", "polo", "designer sneaker", "varsity", "chicago drill", "early 2010s"] },
  { searchPhrase: "good blanks", referenceType: "aesthetic", confidence: 0.8,
    mappedTags: ["minimal"],
    relatedTerms: ["premium basics", "blank tee", "heavyweight tee", "hoodie", "helmut lang", "yeezy", "yeezy gap"] },
  { searchPhrase: "boxy", referenceType: "fit", confidence: 0.9,
    mappedTags: ["minimal", "streetwear"],
    relatedTerms: ["boxy fit", "boxy hoodie", "boxy tee", "cropped fit", "oversized"] },
  { searchPhrase: "grungy", referenceType: "aesthetic", confidence: 0.8,
    mappedTags: ["archival", "independent"],
    relatedTerms: ["dark", "distressed", "faded", "worn", "damaged", "grunge"] },
  { searchPhrase: "banana", referenceType: "mood", confidence: 0.6,
    mappedTags: [],
    relatedTerms: ["yellow", "brown", "leather", "warm tone"] },
  { searchPhrase: "trashed jeans", referenceType: "search_reference", confidence: 0.9,
    mappedTags: ["streetwear", "independent"],
    relatedTerms: ["distressed denim", "destroyed denim", "ripped denim", "distressed jeans"] },
  { searchPhrase: "slub", referenceType: "fabric", confidence: 0.8,
    mappedTags: ["independent", "minimal"],
    relatedTerms: ["slub cotton", "textured tee", "slubby"] },
  { searchPhrase: "repaired jeans", referenceType: "search_reference", confidence: 0.9,
    mappedTags: ["archival", "independent"],
    relatedTerms: ["repaired", "patchwork", "mending", "reconstruction", "boro"] },
  // Silhouette-specific phrases: exact text matching outranks the expansion, so
  // "bootcut" returns bootcut jeans specifically, not every flare (ranking rule).
  { searchPhrase: "bootcut", referenceType: "silhouette", confidence: 0.9,
    mappedTags: [], relatedTerms: ["bootcut jeans"] },
  { searchPhrase: "bell bottom jeans", referenceType: "silhouette", confidence: 0.9,
    mappedTags: [], relatedTerms: ["bell bottom", "bell bottoms"] },
  // Base vocabulary → the brain's aesthetic axes (the seed catalog speaks these).
  { searchPhrase: "gorpcore", referenceType: "subculture", confidence: 0.9,
    mappedTags: ["gorp", "utilitarian"], relatedTerms: ["shell", "fleece", "trail"] },
  { searchPhrase: "workwear", referenceType: "aesthetic", confidence: 0.9,
    mappedTags: ["utilitarian"], relatedTerms: ["chore coat", "carpenter", "canvas", "double knee"] },
  { searchPhrase: "archive", referenceType: "aesthetic", confidence: 0.8,
    mappedTags: ["archival"], relatedTerms: ["runway", "mainline", "vintage"] },
  { searchPhrase: "minimalist", referenceType: "aesthetic", confidence: 0.9,
    mappedTags: ["minimal", "tailored"], relatedTerms: ["clean", "column", "unstructured"] },
  { searchPhrase: "avant garde", referenceType: "aesthetic", confidence: 0.9,
    mappedTags: ["avant-garde"], relatedTerms: ["deconstructed", "asymmetric", "draped"] },
  { searchPhrase: "y2k", referenceType: "era", confidence: 0.8,
    mappedTags: ["statement", "streetwear"], relatedTerms: ["2000s", "low rise", "baby tee"] },
];
