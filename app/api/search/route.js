// app/api/search/route.js
// GET /api/search?q=<text>&user=<id>&brain=<0|1>
// ASILUM Search Engine v1 (lib/search): database-backed, mapping-expanded,
// ranked, logged. Response keeps the original multi-search shape the shell
// consumes — { q, brands, items, aesthetics } — and adds `results` (ranked,
// with confidenceScore / matchReason / matchedTags) and `interpreted`.
// GET stays side-effect-free for derived state; the search log is an
// append-only analytics write, capped and non-blocking.

import { NextResponse } from "next/server";
import { TAGS } from "../../../lib/brain/tags.js";
import { searchProducts } from "../../../lib/search/index.js";
import { sourceFor } from "../../../lib/social.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase().slice(0, 200);
  const userId = searchParams.get("user") || null;
  const brain = searchParams.get("brain") === "1";
  if (!q) return NextResponse.json({ q, brands: [], items: [], aesthetics: [], results: [], total: 0 });

  let out = { query: q, results: [], total: 0, interpreted: null };
  try {
    out = await searchProducts(q, { userId, brain, limit: 48 });
  } catch {
    // engine failure degrades to an empty (not fake) result set
  }

  // Legacy multi-search facets, now derived from the ranked results.
  const brands = [];
  const seenBrands = new Set();
  const items = [];
  for (const it of out.results) {
    if (it.brand && !seenBrands.has(it.brand) &&
        (it.brand.toLowerCase().includes(q) || it.matchReason === "designer match")) {
      seenBrands.add(it.brand);
      if (brands.length < 6) brands.push(it.brand);
    }
    if (items.length < 6) {
      items.push({
        id: it.id, title: it.title, brand: it.brand, price: it.price,
        currency: it.currency, img: it.img, tags: it.tags, src: sourceFor(it),
        matchReason: it.matchReason, confidenceScore: it.confidenceScore,
      });
    }
  }
  const aesthetics = TAGS.filter((t) => t.toLowerCase().includes(q));

  return NextResponse.json({
    q, brands, items, aesthetics,
    total: out.total,
    interpreted: out.interpreted,
    results: out.results.map((it) => ({
      id: it.id, title: it.title, brand: it.brand, price: it.price,
      currency: it.currency, img: it.img, tags: it.tags, category: it.category,
      src: sourceFor(it), url: it.url || it.source_product_url || null,
      confidenceScore: it.confidenceScore, matchReason: it.matchReason,
      matchedTags: it.matchedTags, availability: it.availability_status || "unknown",
    })),
  });
}
