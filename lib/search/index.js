// lib/search/index.js
// ASILUM Search Engine v1 — real, database-backed, tag-expanded, ranked.
// SERVER-ONLY (imports lib/db). No AI calls: rule/tag-based logic today, with
// the AI seam living in lib/ai/search-adapter.js (env-gated, off by default).
//
// Flow: query → interpretSearchQuery (intent + mappings expansion) →
// candidate scoring over the product pool + product_tags layer →
// rankSearchResults (confidenceScore / matchReason / matchedTags) →
// logSearch. Personalization (Mood Board Brain) is a small additive term,
// only when the caller says the toggle is on.

import { getProfile, listItemBrands, searchItemCandidates } from "../db/index.js";
import { listSearchMappings, productsByTags, productsByTagsTyped, logSearch as dbLogSearch } from "../db/production.js";
import { parseDenseConstraints, applyDenseConstraints, weighTypedTagScores } from "./denseQuery.js";
import { CATALOG } from "../ingest/catalog.js";
import { DEFAULT_MAPPINGS } from "./mappings-seed.js";
import { getDiscoverablePool } from "../products.js";

const norm = (s) => String(s || "").toLowerCase().trim();
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);

async function activeMappings() {
  let rows = [];
  try { rows = await listSearchMappings(); } catch { rows = []; }
  if (!rows.length) return DEFAULT_MAPPINGS;
  // DB rows win on phrase collisions; defaults still backfill.
  const have = new Set(rows.map((r) => r.searchPhrase));
  return [...rows, ...DEFAULT_MAPPINGS.filter((d) => !have.has(d.searchPhrase))];
}

export async function getProductPool(limit = 5000) {
  return getDiscoverablePool({ limit });
}

// ---- interpretation -----------------------------------------------------------

export function getSearchIntent(query, brands = []) {
  const q = norm(query);
  const like = q.match(/^(?:like|similar to)\s+(.{2,60})$/);
  if (like) {
    const target = brandMatch(like[1], brands);
    if (target) return { intent: "designer-similar", brand: target };
  }
  const exact = brandMatch(q, brands);
  if (exact) return { intent: "brand", brand: exact };
  return { intent: "text" };
}

function brandMatch(q, brands) {
  const n = norm(q);
  return (
    brands.find((b) => norm(b) === n) ||
    brands.find((b) => norm(b).includes(n) && n.length >= 4) ||
    null
  );
}

export function expandQueryToTags(query, mappings) {
  const q = norm(query);
  const qTokens = tokens(query);
  const mappedTags = new Set();
  const relatedTerms = new Set();
  const hits = [];
  for (const m of mappings) {
    const phrase = m.searchPhrase;
    const match =
      q === phrase ||
      q.includes(phrase) ||
      (tokens(phrase).length === 1 && qTokens.includes(phrase));
    if (!match) continue;
    hits.push(phrase);
    for (const t of m.mappedTags || []) mappedTags.add(norm(t));
    for (const t of m.relatedTerms || []) relatedTerms.add(norm(t));
  }
  return { mappedTags: [...mappedTags], relatedTerms: [...relatedTerms], mappingHits: hits };
}

export async function interpretSearchQuery(query, context = {}) {
  const pool = context.pool || (await getProductPool());
  const brands = context.brands || [...new Set(pool.map((it) => it.brand).filter(Boolean))];
  const mappings = context.mappings || (await activeMappings());
  const intent = getSearchIntent(query, brands);
  const expansion = expandQueryToTags(query, mappings);
  // designer-similar: the target designer's dominant brain tags become mapped tags.
  if (intent.intent === "designer-similar") {
    const w = {};
    for (const it of pool) {
      if (it.brand !== intent.brand) continue;
      for (const [t, v] of Object.entries(it.tags || {})) w[t] = (w[t] || 0) + v;
    }
    for (const [t] of Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
      expansion.mappedTags.push(norm(t));
    }
  }
  return { query: norm(query), tokens: tokens(query), ...intent, ...expansion };
}

// ---- personalization ------------------------------------------------------------

export async function getPersonalizedSearchContext(userId) {
  if (!userId) return null;
  try {
    const profile = await getProfile(userId);
    const vec = { ...(profile.long || {}) };
    for (const [t, v] of Object.entries(profile.session || {})) vec[t] = (vec[t] || 0) + v;
    return Object.keys(vec).length ? { vec } : null;
  } catch {
    return null;
  }
}

function cosineish(vec, tags) {
  // Small bounded affinity term, not a true cosine — enough to nudge, not rule.
  let s = 0;
  for (const [t, v] of Object.entries(tags || {})) s += (vec[t] || 0) * v;
  return Math.max(0, Math.min(2, s));
}

// ---- ranking --------------------------------------------------------------------

// Garment nouns → catalog categories. When a query names a garment, category
// alignment is decisive: "trashed jeans" must surface bottoms, not slip
// dresses that happen to share an aesthetic tag.
const GARMENT_CATEGORY = {
  jeans: "bottoms", denim: "bottoms", pants: "bottoms", trousers: "bottoms",
  cargos: "bottoms", shorts: "bottoms", skirt: "bottoms",
  tee: "tops", tees: "tops", shirt: "tops", blouse: "tops", polo: "tops",
  hoodie: "knitwear", sweater: "knitwear", knit: "knitwear", cardigan: "knitwear", fleece: "knitwear",
  jacket: "outerwear", coat: "outerwear", parka: "outerwear", puffer: "outerwear",
  bomber: "outerwear", anorak: "outerwear", vest: "outerwear",
  blazer: "tailoring", suit: "tailoring",
  dress: "dresses", gown: "dresses",
  boots: "footwear", sneakers: "footwear", shoes: "footwear", loafers: "footwear", derby: "footwear",
  bag: "accessories", belt: "accessories", hat: "accessories", beanie: "accessories",
  scarf: "accessories", necklace: "accessories",
};

export function rankSearchResults(products, interpreted, { tagLayerScores = {}, personal = null } = {}) {
  const wantCategories = new Set(
    interpreted.tokens.map((t) => GARMENT_CATEGORY[t] || GARMENT_CATEGORY[t.replace(/s$/, "")]).filter(Boolean)
  );
  const q = interpreted.query;
  const qTokens = interpreted.tokens;
  const mappedUpper = interpreted.mappedTags.map((t) => t.toUpperCase());
  const scored = [];
  for (const it of products) {
    if (it.moderation_status && it.moderation_status !== "visible") continue;
    const title = norm(it.title);
    const brand = norm(it.brand);
    let score = 0;
    const reasons = [];
    const matchedTags = [];

    // 1) exact product name / token title matches — the strongest text signal
    // (this is why "bootcut" ranks bootcut jeans above expanded flares).
    // Plural-insensitive: "tees" still hits "tee".
    const hitsTitle = (t) => title.includes(t) || (t.endsWith("s") && title.includes(t.slice(0, -1)));
    const tokenHits = qTokens.filter(hitsTitle).length;
    if (q && title.includes(q)) { score += 6; reasons.push(["product name match", 6]); }
    else if (qTokens.length && tokenHits === qTokens.length) { score += 4; reasons.push(["title match", 4]); }
    else if (tokenHits > 0) { score += 2.5 * (tokenHits / qTokens.length); reasons.push(["partial title match", 2.5 * (tokenHits / qTokens.length)]); }
    if (it._textRank > 0) {
      const textRank = Math.min(2, it._textRank * 4);
      score += textRank;
      reasons.push(["indexed text match", textRank]);
    }

    // 2) brand / designer — "like X" means X's aesthetic on OTHER racks
    if (interpreted.intent === "designer-similar" && it.brand === interpreted.brand) { score -= 2.5; }
    else if (interpreted.intent === "brand" && it.brand === interpreted.brand) { score += 8; reasons.push(["designer match", 8]); }
    else if (q && brand && (brand === q || (q.length >= 4 && brand.includes(q)))) { score += 5; reasons.push(["brand match", 5]); }

    // 3) moderated product_tags layer
    const layer = tagLayerScores[it.id] || 0;
    if (layer > 0) { score += Math.min(4, layer * 2); reasons.push(["tag match", Math.min(4, layer * 2)]); }

    // 4) brain aesthetic vector vs mapped tags
    for (const t of mappedUpper) {
      const v = (it.tags || {})[t];
      if (v) { score += v * 3; matchedTags.push(t.toLowerCase()); }
    }
    if (matchedTags.length) reasons.push(["aesthetic match", Math.round(matchedTags.length * 10) / 10]);

    // 5) related terms hitting the text (capped)
    let rel = 0;
    for (const term of interpreted.relatedTerms) {
      if (rel >= 3) break;
      if (title.includes(term) || brand.includes(term)) { rel++; matchedTags.push(term); }
    }
    if (rel) { score += rel; reasons.push(["related term", rel]); }

    // 5b) garment-category alignment — decisive for garment-noun queries
    if (wantCategories.size) {
      if (wantCategories.has(it.category)) { score += 2.5; reasons.push(["garment match", 2.5]); }
      else if (it.category) { score -= 2; }
    }

    // 6) era / decade references
    const decade = norm(it.decade || it.era?.decade);
    if (decade && (q.includes(decade) || interpreted.relatedTerms.some((t) => t.includes(decade)))) {
      score += 1.5; reasons.push(["era match", 1.5]);
    }

    // 7) availability — sold/removed sinks hard, never silently hidden
    if (it.is_available === false || ["sold", "removed"].includes(it.availability_status)) {
      score -= 5; reasons.push(["unavailable", -5]);
    }

    // 8) Mood Board Brain (only when the toggle is on) — a nudge, not a takeover
    if (personal) {
      const a = cosineish(personal.vec, it.tags);
      if (a > 0.05) { score += a; reasons.push(["moodboard brain", Math.round(a * 100) / 100]); }
    }

    // 9) future AI confidence placeholder (lib/ai/search-adapter.js) — 0 today.

    if (score <= 0) continue;
    const top = reasons.sort((a, b) => b[1] - a[1])[0];
    scored.push({
      ...it,
      confidenceScore: Math.round(Math.min(1, score / 12) * 100) / 100,
      matchReason: top ? top[0] : "match",
      matchedTags: [...new Set(matchedTags)].slice(0, 8),
      _score: score,
    });
  }
  return scored.sort((a, b) => b._score - a._score);
}

// ---- the engine entry point -------------------------------------------------------

export async function searchProducts(query, { userId = null, brain = false, limit = 48, offset = 0 } = {}) {
  const q = norm(query);
  if (!q) return { query: q, results: [], total: 0, interpreted: null };
  const mappings = await activeMappings();
  let brands = [];
  try { brands = await listItemBrands(); } catch { brands = []; }
  if (!brands.length) brands = [...new Set(CATALOG.map((item) => item.brand).filter(Boolean))];

  // First interpret without a catalog scan, retrieve indexed candidates, then
  // interpret once more so "similar to <designer>" can learn that designer's
  // dominant tags from the small candidate set.
  const initial = await interpretSearchQuery(q, { pool: [], brands, mappings });
  let pool = [];
  try { pool = await searchItemCandidates(initial.brand || q, initial.mappedTags); } catch { pool = []; }
  if (!pool.length) pool = await getProductPool();
  const interpreted = await interpretSearchQuery(q, { pool, brands, mappings });
  if (interpreted.mappedTags.some((tag) => !initial.mappedTags.includes(tag))) {
    try {
      const expanded = await searchItemCandidates(q, interpreted.mappedTags);
      if (expanded.length) pool = expanded;
    } catch {}
  }
  // Dense layer (Day 26): constraint tokens narrow the pool against real item
  // fields; remaining tokens hit the typed tag layer with per-type weights.
  const dense = parseDenseConstraints(interpreted.tokens);
  pool = applyDenseConstraints(pool, dense.constraints);
  let tagLayerScores = {};
  try {
    const typed = await productsByTagsTyped([...interpreted.mappedTags, ...dense.tokens, q]);
    tagLayerScores = weighTypedTagScores(typed);
  } catch { tagLayerScores = {}; }
  const personal = brain ? await getPersonalizedSearchContext(userId) : null;
  // Gender/budget constraints have already narrowed the pool. Do not let
  // those control words dilute title/category relevance a second time.
  const rankedInterpreted = { ...interpreted, tokens: dense.tokens };
  const ranked = rankSearchResults(pool, rankedInterpreted, { tagLayerScores, personal });
  logSearch(q, ranked, userId, interpreted); // fire-and-forget
  return {
    query: q,
    interpreted: {
      intent: interpreted.intent, brand: interpreted.brand || null,
      mappedTags: interpreted.mappedTags, relatedTerms: interpreted.relatedTerms,
      mappingHits: interpreted.mappingHits, personalized: !!personal,
    },
    total: ranked.length,
    results: ranked.slice(offset, offset + limit).map(({ _score, _textRank, ...it }) => it),
  };
}

export function logSearch(query, results, userId, interpreted) {
  dbLogSearch({
    userId: userId || null,
    query,
    interpreted: interpreted
      ? { intent: interpreted.intent, mappedTags: interpreted.mappedTags, mappingHits: interpreted.mappingHits }
      : {},
    resultCount: results.length,
  }).catch(() => {});
}
