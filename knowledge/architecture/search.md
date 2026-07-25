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
are env-gated (EMBEDDINGS_*). Trigger to revisit: catalog growth makes
tag-space recall insufficient — that is the moment to evaluate a vector
store (Qdrant-class), not before.
