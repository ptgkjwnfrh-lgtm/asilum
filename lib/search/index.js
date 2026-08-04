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
import { deduceProduct } from "../brain/index.js";
import { embeddingsConfigured, embedText, cosine, TEXT_SPACE } from "../embeddings/index.js";
import { listEmbeddings } from "../db/index.js";
import { orchestrateInterpretation } from "../asterisk/orchestrator.js";
import { scoreByInterpretationTags } from "../discover/tagRank.js";
import { buildStemIndex, lookupToken } from "./vocab.js";
import { buildTypoVocab, correctTokens } from "./typo.js";
import { ONTOLOGY_GARMENT_NOUNS } from "./ontology.js";

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

export function expandQueryToTags(query, mappings, qTokensOverride = null) {
  const q = norm(query);
  const qTokens = qTokensOverride || tokens(query);
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
  // Typo bridge (r12): correct unknown tokens BEFORE any table or tag lookup
  // so every downstream tier (category evidence, title match, tag layer,
  // mapping single-word hits) sees the corrected token. Known tokens are
  // never touched; corrections ride the result as typoCorrections.
  const rawTokens = tokens(query);
  const { tokens: fixedTokens, corrections: typoCorrections } = correctTokens(
    rawTokens,
    buildTypoVocab({
      garmentKeys: [...Object.keys(GARMENT_CATEGORY), ...Object.keys(GENERIC_GARMENT_NOUNS)],
      mappings,
    }),
    (t) => garmentCategoryOf(t) !== undefined || genericNounCategoryOf(t) !== undefined
  );
  const expansion = expandQueryToTags(query, mappings, fixedTokens);
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
  return { query: norm(query), tokens: fixedTokens, typoCorrections, ...intent, ...expansion };
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
export const GARMENT_CATEGORY = {
  jeans: "bottoms", denim: "bottoms", pants: "bottoms", trousers: "bottoms",
  cargos: "bottoms", shorts: "bottoms", skirt: "bottoms",
  tee: "tops", tees: "tops", shirt: "tops", blouse: "tops", polo: "tops",
  // hoodie/fleece follow the CATALOG, not garment taxonomy: every hoodie is a
  // top and every fleece an outerwear jacket. Mapping them to knitwear made
  // the category bonus point at a category with zero of either — plain-noun
  // queries survived (product-name match +6 dwarfs the −2), but modifier
  // queries ranked the first real hoodie 47th (measured Aug 4, r8).
  hoodie: "tops", sweater: "knitwear", knit: "knitwear", cardigan: "knitwear", fleece: "outerwear",
  jacket: "outerwear", coat: "outerwear", parka: "outerwear", puffer: "outerwear",
  bomber: "outerwear", anorak: "outerwear", vest: "outerwear",
  blazer: "tailoring", suit: "tailoring",
  dress: "dresses", gown: "dresses",
  boots: "footwear", sneakers: "footwear", shoes: "footwear", loafers: "footwear", derby: "footwear",
  bag: "accessories", belt: "accessories", hat: "accessories", beanie: "accessories",
  scarf: "accessories", necklace: "accessories",
  // (r13) Fashionpedia-informed single-word garment nouns — curated
  // crosswalk in lib/search/ontology.js, evidence base vendored in
  // fashionpedia-ontology.json (CC BY 4.0, see NOTICE).
  ...ONTOLOGY_GARMENT_NOUNS,
};

// Generic garment nouns name the CATEGORY, not a subtype: a hardshell parka
// IS a jacket that doesn't spell the word. For these nouns (and only these),
// the title-token hit extends to every item of the category, so "jacket that
// survives a storm" starts shells level with varsity jackets and the
// semantic re-rank (r5) decides. Subtype nouns (jeans, parka, bomber,
// hoodie…) keep literal title matching — "trashed jeans" must still rank
// jeans above trousers WITHIN bottoms.
export const GENERIC_GARMENT_NOUNS = {
  jacket: "outerwear", coat: "outerwear",
  shoes: "footwear",
  dress: "dresses",
  // (r8) every knitwear item IS a knit — turtlenecks, cardigans, crewnecks,
  // mohair sweaters. "sweater" was first REJECTED by the declared beanie
  // guard (balaclava beanies, then miscategorized as knitwear, topped the
  // sweater probes); the r8 catalog cleanup moved beanies to accessories,
  // and (r9) the retest re-admitted it under the same guard. "boots" stays
  // out (subtype of footwear); "top" stays out (the tokenizer splits
  // "high-top" into [high, top] and would penalize actual high-tops on
  // their own query).
  knit: "knitwear", sweater: "knitwear",
};

// (r11) stem-indexed lookups replace the strip-trailing-s heuristic: exact
// key first, Porter stem second ("trouser"→trousers, "sneaker"→sneakers,
// "cargo"→cargos now resolve). Tables above stay the single source of truth.
const GARMENT_IDX = buildStemIndex(GARMENT_CATEGORY);
const GENERIC_IDX = buildStemIndex(GENERIC_GARMENT_NOUNS);
export const garmentCategoryOf = (t) => lookupToken(GARMENT_IDX, t);
export const genericNounCategoryOf = (t) => lookupToken(GENERIC_IDX, t);

export function rankSearchResults(products, interpreted, { tagLayerScores = {}, personal = null, garmentTitleEquiv = true } = {}) {
  const wantCategories = new Set(
    interpreted.tokens.map((t) => garmentCategoryOf(t)).filter(Boolean)
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
    const equivHit = (t) => {
      if (!garmentTitleEquiv) return false;
      const c = genericNounCategoryOf(t);
      return !!c && it.category === c;
    };
    const hitsTitle = (t) => title.includes(t) || (t.endsWith("s") && title.includes(t.slice(0, -1))) || equivHit(t);
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

export async function searchProducts(query, {
  userId = null, brain = false, limit = 48, offset = 0,
  // (r5) bounded semantic re-ranking of literal results. Defaults on when a
  // provider is keyed; SEARCH_SEMANTIC_RERANK=0 kills it without a deploy.
  semanticRerank = process.env.SEARCH_SEMANTIC_RERANK !== "0",
  // (r6) generic garment nouns extend their title hit to the whole category;
  // SEARCH_GARMENT_TITLE_EQUIV=0 kills it without a deploy.
  garmentTitleEquiv = process.env.SEARCH_GARMENT_TITLE_EQUIV !== "0",
  // (r7) equal literal scores order by semantic sim instead of pool order;
  // SEARCH_SEMANTIC_TIEBREAK=0 kills it without a deploy.
  semanticTiebreak = process.env.SEARCH_SEMANTIC_TIEBREAK !== "0",
} = {}) {
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
  // No silent caps: candidate retrieval reports when either channel hit its
  // bound, and the flag rides through the result and the search log.
  let candidatesTruncated = false;
  let pool = [];
  try {
    const retrieved = await searchItemCandidates(initial.brand || q, initial.mappedTags);
    pool = retrieved.rows;
    candidatesTruncated = retrieved.truncated;
  } catch { pool = []; }
  if (!pool.length) pool = await getProductPool();
  const interpreted = await interpretSearchQuery(q, { pool, brands, mappings });
  if (interpreted.mappedTags.some((tag) => !initial.mappedTags.includes(tag))) {
    try {
      const expanded = await searchItemCandidates(q, interpreted.mappedTags);
      if (expanded.rows.length) {
        pool = expanded.rows;
        candidatesTruncated = expanded.truncated;
      }
    } catch {}
  }
  // Dense layer (Day 26): constraint tokens narrow the pool against real item
  // fields; remaining tokens hit the typed tag layer with per-type weights.
  const dense = parseDenseConstraints(interpreted.tokens);
  pool = applyDenseConstraints(pool, dense.constraints);
  // (r6) generic garment nouns are category evidence — 5b already scores
  // that in full. Letting them ALSO hit the typed tag layer hands
  // jacket-tagged items up to +4 over parkas/shells that ARE jackets under
  // another name. Subtype nouns (jeans, parka, bomber…) stay: they
  // discriminate within a category.
  const tagQueryTokens = garmentTitleEquiv
    ? dense.tokens.filter((t) => !(genericNounCategoryOf(t)))
    : dense.tokens;
  let tagLayerScores = {};
  try {
    const typed = await productsByTagsTyped([...interpreted.mappedTags, ...tagQueryTokens, q]);
    tagLayerScores = weighTypedTagScores(typed);
  } catch { tagLayerScores = {}; }
  const personal = brain ? await getPersonalizedSearchContext(userId) : null;
  // Gender/budget constraints have already narrowed the pool. Do not let
  // those control words dilute title/category relevance a second time.
  const rankedInterpreted = { ...interpreted, tokens: dense.tokens };
  let ranked = rankSearchResults(pool, rankedInterpreted, { tagLayerScores, personal, garmentTitleEquiv });

  let note = null;

  // Compositional fallback (asterisk-boost r2): when the literal engine finds
  // nothing — or only trivially weak matches — read the query the way the
  // brain reads a moodboard caption (bigrams + tokens through KB/lexicon/
  // typo-bridge) and rank the pool by tag-space affinity. Garment-category
  // alignment stays decisive: "leather jacket…" composes over outerwear, not
  // rugby shirts. Deterministic, explainable, deliberately low confidence:
  // a read, not a match. Literal matches keep their place after the read.
  const literalWeak = ranked.length > 0 && ranked[0]._score < 1.2;
  if ((!ranked.length || literalWeak) && dense.tokens.length && pool.length) {
    const readVec = deduceProduct(dense.tokens);
    const readTags = Object.entries(readVec).filter(([, v]) => v > 0.05);
    if (readTags.length) {
      const wantCats = new Set(
        dense.tokens
          .map((t) => garmentCategoryOf(t))
          .filter(Boolean)
      );
      const composed = [];
      for (const it of pool) {
        if (wantCats.size && !wantCats.has(it.category)) continue;
        let s = 0;
        const matched = [];
        for (const [t, v] of readTags) {
          const iv = (it.tags || {})[t];
          if (iv) { s += iv * v; matched.push(t.toLowerCase()); }
        }
        if (s > 0.08) {
          composed.push({
            ...it,
            confidenceScore: Math.round(Math.min(0.35, s / 3) * 100) / 100,
            matchReason: "compositional read",
            matchedTags: matched.slice(0, 8),
            _score: s,
          });
        }
      }
      if (composed.length) {
        composed.sort((a, b) => b._score - a._score);
        const seenIds = new Set(composed.map((c) => c.id));
        ranked = [...composed, ...ranked.filter((r) => !seenIds.has(r.id))];
      }
    }
  }

  // Cultural fallback (r10): a query the literal engine AND the compositional
  // read both come up empty on may still be a reference Asterisk knows
  // ("marilyn manson", "oasis winter outfit"). Measured 8/4: bare-name
  // cultural queries returned an EMPTY rack for every known artist — the
  // culture catalog only reached results through a manually clicked
  // interpretation pill. This tier ranks the pool by the reading's tag slate
  // (tagRank: inclusion needs an exact tag hit, bleed only orders) — the
  // guided user's taste-favored reading when guidance is on (influenced
  // understanding), the top-confidence reading otherwise (broad
  // understanding). Labeled "cultural read", conf ≤ 0.45 — a read, not a
  // match. SEARCH_CULTURE_FALLBACK=0 kills it without a deploy.
  const cultural = { engaged: false, entity: null, interpretationId: null, label: null, personalized: false };
  // Query-groundedness (r10, measured 8/4): with the Mood Board Brain on, the
  // personal nudge alone admits items (reason "moodboard brain"), so an
  // unmatched query returned the user's OWN taste echoed back with the query
  // text ignored. A rack whose every reason is personal carries zero query
  // evidence — the cultural read (itself taste-ordered for guided users)
  // must outrank query-independent noise.
  const queryGrounded = ranked.some((r) => r.matchReason !== "moodboard brain");
  if ((!ranked.length || !queryGrounded) && pool.length && process.env.SEARCH_CULTURE_FALLBACK !== "0") {
    try {
      const interp = await orchestrateInterpretation(q, brain ? userId : null);
      const top = interp?.interpretations?.[0] || null;
      const readTags = top?.tags?.length
        ? top.tags.map((t) => t.toUpperCase())
        : Object.keys(interp?.attributes?.tags || {}).map((t) => t.toUpperCase());
      if ((interp?.entity || interp?.method === "composed") && readTags.length) {
        const read = [];
        for (const it of pool) {
          const { exact, score } = scoreByInterpretationTags(it.tags, readTags);
          if (exact > 0) {
            read.push({
              ...it,
              confidenceScore: Math.round(Math.min(0.45, score / 4) * 100) / 100,
              matchReason: "cultural read",
              matchedTags: Object.keys(it.tags || {}).filter((t) => readTags.includes(t.toUpperCase())).map((t) => t.toLowerCase()).slice(0, 8),
              _score: score,
            });
          }
        }
        if (read.length) {
          // Deterministic tie-break (measured 8/4): cultural-read scores tie
          // in wide clusters and the pool arrives in DB row order — without a
          // stable key the rack reshuffles between requests.
          read.sort((a, b) => b._score - a._score || String(a.id).localeCompare(String(b.id)));
          ranked = read;
          cultural.engaged = true;
          cultural.entity = interp.entity?.name || null;
          cultural.interpretationId = top?.id || null;
          cultural.label = top?.label || (interp.method === "composed" ? "composed reading" : null);
          cultural.personalized = !!interp.personalized;
          note = interp.entity
            ? `read as ${interp.entity.name}${top?.label ? " — " + top.label : ""}`
            : note;
        }
      }
    } catch {}
  }

  // Dense recall (embeddings v1, asterisk-boost r4) + bounded semantic
  // re-ranking (r5): when a provider is keyed AND the catalog has been
  // backfilled (scripts/embed-catalog.mjs), the query embeds once and its
  // similarity to every stored item vector serves two bounded jobs:
  //   (a) re-rank — ONLY for garment-noun queries with ≥2 modifier tokens
  //       ("jacket that survives a storm"). The garment noun is stripped
  //       from the embedded text — measured 8/3: the noun's lexical pull
  //       ranks varsity jackets above GORE-TEX shells, while the modifiers
  //       alone rank shells first; category alignment (5b) already enforces
  //       the noun literally. Ranked items gain min(2, max(0, sim − 0.3) ×
  //       10) on _score. Order-only: confidenceScore and matchReason stay
  //       what the literal engine said, and the cap can reorder a category
  //       cluster but never beat an exact name match. Every other query
  //       class re-ranks nothing and behaves exactly as r4.
  //   (b) append — neighbors the literal engine missed join below with
  //       matchReason "semantic match", sim floor 0.45, cap 12, conf ≤ 0.5.
  // Zero effect while unkeyed — the paths above are untouched.
  const semantic = { engaged: false, reranked: 0, appended: 0, strippedQuery: null };
  if (embeddingsConfigured()) {
    try {
      const isGarment = (t) => !!(garmentCategoryOf(t));
      const garmentToks = rankedInterpreted.tokens.filter(isGarment);
      const modifierToks = rankedInterpreted.tokens.filter((t) => !isGarment(t));
      if (semanticRerank && garmentToks.length && modifierToks.length >= 2) {
        let stripped = q;
        for (const t of garmentToks) stripped = stripped.replace(new RegExp(`\\b${t}\\b`, "g"), " ");
        stripped = stripped.replace(/\s+/g, " ").trim();
        if (stripped) semantic.strippedQuery = stripped;
      }
      const [qe, stored] = await Promise.all([
        embedText(semantic.strippedQuery || q),
        listEmbeddings(TEXT_SPACE, "product"),
      ]);
      if (qe.ok && stored.length) {
        semantic.engaged = true;
        const simById = new Map();
        for (const row of stored) simById.set(row.owner_id, cosine(qe.data.vector, row.vector));

        if (semantic.strippedQuery) {
          for (const r of ranked) {
            const sim = simById.get(r.id) || 0;
            const nudge = Math.min(2, Math.max(0, sim - 0.3) * 10);
            if (nudge > 0) { r._score += nudge; semantic.reranked++; }
          }
        }
        // (r7) semantic tie-breaking: equal literal scores order by sim to
        // the query instead of arbitrary pool order ("slip dress" ties, the
        // r6-levelled category clusters). The sort key (_score, sim) cannot
        // move an item across score clusters — scores are never touched.
        if (semantic.reranked || semanticTiebreak) {
          semantic.tiebreak = !!semanticTiebreak;
          const cmp = semanticTiebreak
            ? (a, b) => (b._score - a._score) || ((simById.get(b.id) || 0) - (simById.get(a.id) || 0))
            : (a, b) => b._score - a._score;
          ranked.sort(cmp);
        }

        const have = new Set(ranked.map((r) => r.id));
        const byId = new Map(pool.map((it) => [it.id, it]));
        const hits = [];
        for (const [ownerId, sim] of simById) {
          if (sim <= 0.45 || have.has(ownerId)) continue;
          const it = byId.get(ownerId);
          if (it) hits.push({ it, sim });
        }
        hits.sort((a, b) => b.sim - a.sim);
        for (const { it, sim } of hits.slice(0, 12)) {
          semantic.appended++;
          ranked.push({
            ...it,
            confidenceScore: Math.round(Math.min(0.5, sim) * 100) / 100,
            matchReason: "semantic match",
            matchedTags: [],
            _score: sim,
          });
        }
      }
    } catch {}
  }

  // Honest empty: a budget ceiling that nothing in the wanted category can
  // meet gets said out loud instead of a bare zero.
  if (!ranked.length && dense.constraints.maxPrice != null) {
    const all = await getProductPool();
    const cats = new Set(
      dense.tokens
        .map((t) => garmentCategoryOf(t))
        .filter(Boolean)
    );
    const scope = cats.size ? all.filter((it) => cats.has(it.category)) : all;
    const priced = scope.filter((it) => typeof it.price === "number");
    if (priced.length) {
      const lowest = Math.min(...priced.map((it) => it.price));
      if (lowest > dense.constraints.maxPrice) {
        note = `nothing${cats.size ? " in " + [...cats].join("/") : ""} under $${dense.constraints.maxPrice} — the closest starts at $${lowest}`;
      }
    }
  }

  if (!note && interpreted.typoCorrections?.length) {
    note = interpreted.typoCorrections.map((c) => `reading "${c.from}" as "${c.to}"`).join("; ");
  }
  logSearch(q, ranked, userId, interpreted, { candidatesTruncated }); // fire-and-forget
  return {
    query: q,
    interpreted: {
      intent: interpreted.intent, brand: interpreted.brand || null,
      mappedTags: interpreted.mappedTags, relatedTerms: interpreted.relatedTerms,
      mappingHits: interpreted.mappingHits, personalized: !!personal,
      typoCorrections: interpreted.typoCorrections || [],
    },
    total: ranked.length,
    candidatesTruncated,
    note,
    semantic,
    cultural,
    results: ranked.slice(offset, offset + limit).map(({ _score, _textRank, ...it }) => it),
  };
}

export function logSearch(query, results, userId, interpreted, { candidatesTruncated = false } = {}) {
  dbLogSearch({
    userId: userId || null,
    query,
    interpreted: interpreted
      ? {
          intent: interpreted.intent, mappedTags: interpreted.mappedTags,
          mappingHits: interpreted.mappingHits, candidatesTruncated,
        }
      : {},
    resultCount: results.length,
  }).catch(() => {});
}
