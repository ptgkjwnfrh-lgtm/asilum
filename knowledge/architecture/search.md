# Search

Engine v1 (lib/search/): deterministic, explainable.
1. Intent: brand | designer-similar ("like X" penalizes X's own brand) |
   text.
2. Expansion through curated search_mappings.
3. GARMENT_CATEGORY alignment is decisive for garment nouns
   ("trashed jeans" → bottoms only).
4. product_tags layer + availability sink, then confidenceScore /
   matchReason / matchedTags on every hit.
5. Optional brain nudge — asilum-brain-off localStorage pauses
   personalization (searchguide shows GUIDING / PAUSED).
6. /api/suggest: levenshtein autocomplete incl. "like <designer>".
GET search is side-effect-free; query logging only via explicit POST.

Embeddings: v0 = tag-space cosine (live, lib/embeddings). v1 real vectors
are LIVE (Voyage via EMBEDDINGS_PROVIDER/EMBEDDINGS_API_KEY; provider
adapter also speaks openai / EMBEDDINGS_URL self-hosted). Catalog vectors
(text-v1, 1024-dim voyage-3.5-lite) live in the Supabase embeddings table;
backfill = scripts/embed-catalog.mjs (idempotent, 429-backoff). Recall
channel "semantic match" is APPEND-ONLY: sim floor 0.45, cap 12, conf
≤ 0.5 — inert without the env key. Measured (Aug 3, 6-probe paraphrase
battery, PR #101): bridges vocabulary the literal engine cannot
("something slinky for a night out" → slip dress), contributes 0 on
garment-noun queries because literal ranking already covers the category.

Semantic re-ranking (r5): fires ONLY on garment-noun queries with ≥2
modifier tokens. The garment noun is stripped from the embedded query —
measured Aug 3: the noun's lexical pull ranks varsity jackets above
GORE-TEX shells, the modifiers alone rank shells first. Nudge =
min(2, max(0, sim − 0.30) × 10) on _score, order-only (confidence and
matchReason untouched); every other query class is byte-identical to the
append-only design, and unkeyed stays inert. Measured (scripts/
measure-rerank.mjs, criteria declared pre-run): mountain-pants probe
swept climbing pants into all of top 3; storm/hike probes needed r6.

Generic garment nouns (r6): GENERIC_GARMENT_NOUNS (jacket/coat →
outerwear, shoes → footwear, dress → dresses) name the CATEGORY, not a
subtype — for these nouns only, (a) the title-token hit extends to every
item of the category and (b) the noun is EXCLUDED from the typed
product_tags query. Measured root cause: the noun triple-counted —
title-token bonus (+0.625) AND typed tag layer (up to +4, the dominant
term in the DB-backed path) AND category bonus — so "hardshell parka"
started ~5 points behind any "* jacket" title on "jacket that survives
a storm". Subtype nouns (jeans, parka, bomber, hoodie…) keep literal
matching and tag credit: "trashed jeans" must rank jeans above trousers
WITHIN bottoms. Kill-switch SEARCH_GARMENT_TITLE_EQUIV=0. Measured
(same declared-criteria battery, r5+r6): 3/3 improve probes — storm and
hike put GORE-TEX shells/hardshells at rank 1 (from rank 98), climbing
pants sweep holds; 0 hold regressions, canonical probes byte-identical,
163/163 tests.

Semantic tie-breaking (r7): equal literal scores order by sim to the
query instead of arbitrary pool order — sort key (_score, sim), scores
never mutated, so items CANNOT cross score clusters by construction.
Fires whenever embeddings are engaged ("slip dress" 11-way conf-1 tie,
the r6-levelled "jacket" 112-way tie); inert unkeyed; kill-switch
SEARCH_SEMANTIC_TIEBREAK=0. Measured (scripts/measure-tiebreak.mjs,
criteria declared pre-run): 0 invariance breaks / 0 assert fails / 0
determinism breaks over 7 probes at FULL-list resolution. HARNESS LAW
learned here: measure order-invariance on the full result list — a
windowed check fakes breaks when a tie cluster straddles the limit.
Users/boards embeddings + pgvector migration are deliberate later steps.
