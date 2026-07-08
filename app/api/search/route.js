// app/api/search/route.js
// GET /api/search?q=<text>
// Multi-search across the marketplace: brands, pieces, and aesthetics.
// (User search is client-side over the social layer.) Pinterest discovery
// mixed with Grailed product search.

import { NextResponse } from "next/server";
import { TAGS } from "../../../lib/brain/tags.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { listItems } from "../../../lib/db/index.js";
import { sourceFor } from "../../../lib/social.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  if (!q) return NextResponse.json({ q, brands: [], items: [], aesthetics: [] });

  let pool = [];
  try { pool = await listItems(300); } catch { pool = []; }
  const ids = new Set(pool.map((it) => it.id));
  pool = [...pool, ...CATALOG.filter((it) => !ids.has(it.id))];

  const brands = [];
  const seenBrands = new Set();
  const items = [];
  for (const it of pool) {
    const brand = it.brand || "";
    if (brand.toLowerCase().includes(q) && !seenBrands.has(brand)) {
      seenBrands.add(brand);
      if (brands.length < 6) brands.push(brand);
    }
    if (items.length < 6 && (it.title || "").toLowerCase().includes(q)) {
      items.push({ id: it.id, title: it.title, brand, price: it.price, currency: it.currency, img: it.img, tags: it.tags, src: sourceFor(it) });
    }
  }
  const aesthetics = TAGS.filter((t) => t.toLowerCase().includes(q));

  return NextResponse.json({ q, brands, items, aesthetics });
}
