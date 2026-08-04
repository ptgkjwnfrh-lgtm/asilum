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
Next lever (unshipped, measure first): bounded semantic RE-RANKING of
already-ranked results. Users/boards embeddings + pgvector migration are
deliberate later steps.
