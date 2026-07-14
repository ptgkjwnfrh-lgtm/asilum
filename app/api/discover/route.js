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
  searchProducts,
} from "../../../lib/search/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { isDiscoverableProduct } from "../../../lib/products.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase().slice(0, 200);
  const source = searchParams.get("source") || "";
  const tag = (searchParams.get("tag") || "").toUpperCase();
  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "";
  const offset = Math.max(0, parseInt(searchParams.get("offset"), 10) || 0);
  const limit = Math.min(96, parseInt(searchParams.get("limit"), 10) || 48);

  let pool = [];
  let items = [];
  let demo = false;
  if (q) {
    const quota = await consumeRateLimit({ scope: "discover-search", subject: requestSubject(req), limit: 120, windowMs: 60_000 });
    if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
    const brain = searchParams.get("brain") === "1";
    const userId = brain ? await resolveRequestUser(req, searchParams.get("user") || "") : null;
    const result = await searchProducts(q, { userId, brain: !!userId, limit: 2000 });
    items = result.results.map((item) => ({ ...item, src: sourceFor(item) }));
    demo = items.length > 0 && items.every((item) => String(item.source_name || item.source || "").includes("seed"));
  } else {
    try { pool = await listItems(5000); } catch { pool = []; }
    pool = pool.filter(isDiscoverableProduct);
    demo = pool.length === 0;
    if (demo) pool = CATALOG;
    items = pool.map((item) => ({ ...item, src: sourceFor(item) }));
  }
  const sources = [...new Set(items.map((item) => item.src).filter(Boolean))].sort();
  // Asterisk interpretation pills (Day 12): ?tags=a|b|c ranks the rack by an
  // interpretation's tag signals — real products only, no costume replicas.
  const interpTags = (searchParams.get("tags") || "")
    .split("|").filter(Boolean).map((t) => t.toUpperCase()).slice(0, 8);
  if (interpTags.length) {
    items = items
      .map((it) => {
        let score = 0;
        for (const t of interpTags) {
          const w = (it.tags || {})[t];
          if (typeof w === "number") score += w;
        }
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.it);
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
    demo,
    sources,
    items: items.slice(offset, offset + limit),
  });
}
