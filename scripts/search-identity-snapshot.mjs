#!/usr/bin/env node
// scripts/search-identity-snapshot.mjs — WHAT SEARCH ANSWERS, serialized.
//
// A refactor of lib/search is only safe if it changed nothing, and "the tests
// still pass" is a weaker claim than it sounds: the suite asserts properties,
// not the full shape of every answer. This dumps the ACTUAL output for a
// corpus of queries — interpretation, ranking, racks, notes — so before and
// after can be compared byte for byte.
//
//   node scripts/search-identity-snapshot.mjs before.json
//   ...refactor...
//   node scripts/search-identity-snapshot.mjs after.json
//   cmp before.json after.json
//
// Runs in memory mode (no DATABASE_URL) against the seed catalog, which is
// deterministic and needs no database.
//
// THIS IS A SUPPLEMENT TO `npm test`, NEVER A SUBSTITUTE, and it earned that
// warning the hard way. Extracting the intent layer left `brandMatch`
// unimported inside searchProducts — a ReferenceError on a real code path.
// This snapshot reported IDENTICAL, because none of its queries reached that
// branch; five tests in the suite caught it immediately.
//
// A corpus proves the paths it walks and says nothing about the rest. Run both.
import { writeFileSync } from "node:fs";
import {
  searchProducts, interpretSearchQuery, getSearchIntent, expandQueryToTags,
  rankSearchResults, garmentCategoryOf, genericNounCategoryOf, searchTierOf,
  getProductPool,
} from "../lib/search/index.js";
import { DEFAULT_MAPPINGS } from "../lib/search/mappings-seed.js";

const out = process.argv[2];
if (!out) { console.error("usage: search-identity-snapshot.mjs <out.json>"); process.exit(2); }

// A corpus chosen to exercise every seam the engine has: plain nouns, brands,
// eras, origins, sizes, negation, designer credit, culture, typos, and the
// compositional reads that produce tier-0 results.
const QUERIES = [
  "black wool coat", "helmut lang", "1997 archive", "japanese denim",
  "something for a wedding", "gorpcore jacket", "no leather boots",
  "margiela tabi", "90s minimalism", "oversized knit size L",
  "blade runner coat", "disco", "tailored trouser under 400",
  "leather jacket not black", "clothes from paris", "raf simons era dior",
  "chunky sweater", "sweaters", "helmut lang trousers", "avant-garde",
  "nothing here is both", "banana", "constructor", "toString",
  "cargo pants", "silk slip dress", "y2k", "quiet luxury",
  // Brand-phrase paths inside searchProducts — the branch the first version of
  // this corpus missed entirely. See the note above.
  "comme des garcons", "cdg shirt", "like margiela", "acne studios knit",
  "yohji", "the row coat", "similar to rick owens",
];

const compact = (item) => ({
  id: item.id, score: item._score, reason: item.matchReason, tier: searchTierOf(item),
});

const snapshot = { queries: {}, tables: {}, };

const pool = await getProductPool();
snapshot.poolSize = pool.length;

for (const q of QUERIES) {
  const interpreted = await interpretSearchQuery(q, { pool, mappings: DEFAULT_MAPPINGS });
  const ranked = rankSearchResults(pool, interpreted);
  const served = await searchProducts(q, { limit: 24 });
  snapshot.queries[q] = {
    intent: getSearchIntent(q, [...new Set(pool.map((p) => p.brand).filter(Boolean))]),
    expanded: expandQueryToTags(q, DEFAULT_MAPPINGS),
    interpreted: {
      tokens: interpreted.tokens, mappedTags: interpreted.mappedTags,
      relatedTerms: interpreted.relatedTerms, mappingHits: interpreted.mappingHits,
      typoCorrections: interpreted.typoCorrections || [],
      era: interpreted.era || null, origin: interpreted.origin || null,
      size: interpreted.size || null, exclusions: interpreted.exclusions || [],
      designerCredit: interpreted.designerCredit || null,
    },
    rankedTop: ranked.slice(0, 12).map(compact),
    rankedCount: ranked.length,
    served: {
      count: served.items?.length ?? null,
      ids: (served.items || []).map((i) => i.id),
      interpreted: served.interpreted ?? null,
      notes: served.notes ?? null,
      racks: served.racks ? Object.keys(served.racks) : null,
    },
  };
}

// The lookup tables, so a move between modules cannot silently drop an entry.
const PROBE_TOKENS = [
  "coat", "trouser", "jacket", "knit", "boot", "shoe", "bag", "dress",
  "sweater", "sweaters", "tee", "shirt", "constructor", "__proto__", "banana",
];
for (const t of PROBE_TOKENS) {
  snapshot.tables[t] = { garment: garmentCategoryOf(t) ?? null, generic: genericNounCategoryOf(t) ?? null };
}

writeFileSync(out, JSON.stringify(snapshot, null, 1));
console.log(`snapshot written: ${Object.keys(snapshot.queries).length} queries, pool ${snapshot.poolSize}`);
