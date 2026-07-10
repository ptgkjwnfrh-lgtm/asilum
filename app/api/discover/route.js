// app/api/discover/route.js
// GET /api/discover?q=&source=&tag=&category=&sort=new&offset=&limit=&user=&brain=
// The full site inventory — deliberately NOT ranked by the taste profile
// unless the user's Mood Board Brain toggle is on (&brain=1). Database
// products first; the seed catalog only backfills a keyless dev run.
// ?q= runs through the real search engine (lib/search): mappings expansion,
// product_tags layer, ranked results with matchReason.

import { NextResponse } from "next/server";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { listItems } from "../../../lib/db/index.js";
import { sourceFor } from "../../../lib/social.js";
import {
  interpretSearchQuery, rankSearchResults, getPersonalizedSearchContext, logSearch,
} from "../../../lib/search/index.js";
import { productsByTags } from "../../../lib/db/production.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const source = searchParams.get("source") || "";
  const tag = (searchParams.get("tag") || "").toUpperCase();
  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "";
  const offset = Math.max(0, parseInt(searchParams.get("offset"), 10) || 0);
  const limit = Math.min(96, parseInt(searchParams.get("limit"), 10) || 48);

  let pool = [];
  try { pool = await listItems(1000); } catch { pool = []; }
  const ids = new Set(pool.map((it) => it.id));
  pool = [...pool, ...CATALOG.filter((it) => !ids.has(it.id))];

  let items = pool.map((it) => ({ ...it, src: sourceFor(it) }));
  if (q) {
    try {
      const interpreted = await interpretSearchQuery(q, { pool: items });
      let tagLayerScores = {};
      try { tagLayerScores = await productsByTags([...interpreted.mappedTags, ...interpreted.tokens, q]); } catch {}
      const brain = searchParams.get("brain") === "1";
      const personal = brain ? await getPersonalizedSearchContext(searchParams.get("user")) : null;
      items = rankSearchResults(items, interpreted, { tagLayerScores, personal });
      logSearch(q, items, searchParams.get("user") || null, interpreted);
    } catch {
      // engine failure degrades to the original substring filter — never a crash
      items = items.filter((it) =>
        (it.title || "").toLowerCase().includes(q) ||
        (it.brand || "").toLowerCase().includes(q) ||
        Object.keys(it.tags || {}).some((t) => t.toLowerCase().includes(q))
      );
    }
  }
  if (source) items = items.filter((it) => it.src === source);
  const brands = (searchParams.get("brands") || "").split("|").filter(Boolean).map((b) => b.toLowerCase());
  if (brands.length) {
    const set = new Set(brands);
    items = items.filter((it) => set.has((it.brand || "").toLowerCase()));
  }
  if (tag) items = items.filter((it) => (it.tags || {})[tag]);
  if (category) items = items.filter((it) => it.category === category);
  if (sort === "new") items = items.slice().reverse();
  if (sort === "price-asc") items = items.slice().sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
  if (sort === "price-desc") items = items.slice().sort((a, b) => (b.price || 0) - (a.price || 0));

  return NextResponse.json({
    total: items.length,
    offset,
    items: items.slice(offset, offset + limit),
  });
}
