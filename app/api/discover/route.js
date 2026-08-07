// app/api/discover/route.js
// GET /api/discover?q=&source=&tag=&category=&sort=new&offset=&limit=&user=&brain=
// The full site inventory — ranked through the user's Passport only when
// Asterisk guidance is requested and the saved server preference is on.
// products first; the seed catalog only backfills a keyless dev run.
// ?q= runs through the real search engine (lib/search): mappings expansion,
// product_tags layer, ranked results with matchReason.

import { NextResponse } from "next/server";
import { sourceFor } from "../../../lib/social.js";
import {
  searchProducts,
} from "../../../lib/search/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, consumeGlobalBudget, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { getDiscoverablePool, publicProduct } from "../../../lib/products.js";
import { rankByInterpretationTags } from "../../../lib/discover/tagRank.js";
import { resolveSearchAssumption, applyPassportAssumption } from "../../../lib/search/passportAssumption.js";
import { createdAtOf, sortNewestFirst, stripRecencyKey } from "../../../lib/discover/recency.js";
import { getMemoryPreferences, listInterpretationFeedback } from "../../../lib/db/production.js";
import { normalizeQuery } from "../../../lib/asterisk/orchestrator.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const quota = await consumeRateLimit({ scope: "discover", subject: requestSubject(req), limit: 180, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const globalQuota = await consumeGlobalBudget("discover");
  if (!globalQuota.allowed) {
    return NextResponse.json(rateLimitResponse(globalQuota), {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(globalQuota.retryAfterMs / 1000))) },
    });
  }
  const q = (searchParams.get("q") || "").trim().toLowerCase().slice(0, 200);
  const source = (searchParams.get("source") || "").slice(0, 80);
  const tag = (searchParams.get("tag") || "").slice(0, 40).toUpperCase();
  const category = (searchParams.get("category") || "").slice(0, 80);
  const sort = searchParams.get("sort") || "";
  const offset = Math.min(10_000, Math.max(0, parseInt(searchParams.get("offset"), 10) || 0));
  const limit = Math.max(1, Math.min(96, parseInt(searchParams.get("limit"), 10) || 48));

  let pool = [];
  let items = [];
  let demo = false;
  let guidanceEnabled = false;
  let assumption = null;
  if (q) {
    const requestedGuidance = searchParams.get("brain") === "1";
    const userId = requestedGuidance
      ? await resolveRequestUser(req, searchParams.get("user") || "") : null;
    guidanceEnabled = !!userId &&
      (await getMemoryPreferences(userId).catch(() => ({ guidanceEnabled: false }))).guidanceEnabled !== false;
    const result = await searchProducts(q, {
      userId, brain: guidanceEnabled, limit: 2000,
    });
    items = result.results.map((item) => ({ ...publicProduct(item), src: sourceFor(item), _createdAt: createdAtOf(item) }));
    demo = items.length > 0 && items.every((item) => String(item.source_name || item.source || "").includes("seed"));
  } else {
    pool = await getDiscoverablePool({ fallback: false });
    demo = pool.length === 0;
    if (demo) pool = await getDiscoverablePool();
    items = pool.map((item) => ({ ...publicProduct(item), src: sourceFor(item), _createdAt: createdAtOf(item) }));
  }
  const sources = [...new Set(items.map((item) => item.src).filter(Boolean))].sort();
  // Asterisk interpretation pills (Day 12): ?tags=a|b|c ranks the rack by an
  // interpretation's tag signals — real products only, no costume replicas.
  // Ordering is affinity-aware (lib/discover/tagRank.js); inclusion still
  // requires an exact queried-tag hit.
  const interpTags = (searchParams.get("tags") || "")
    .split("|").filter(Boolean).map((t) => t.toUpperCase()).slice(0, 8);
  if (interpTags.length) {
    items = rankByInterpretationTags(items, interpTags);
  } else if (q && guidanceEnabled) {
    // Influenced-assumption clause (r10): a broad cultural query narrows to
    // the user's taste-favored reading — visible in `assumption`, overridden
    // by any explicit pill, killed by SEARCH_PASSPORT_ASSUMPTION=0.
    const userId = await resolveRequestUser(req, searchParams.get("user") || "");
    // Honor this user's prior rejections so a reading they dismissed in the
    // pills is not silently re-applied to search (audit #6). Best-effort:
    // a feedback read failure must not fail the search.
    const feedback = await listInterpretationFeedback(userId, normalizeQuery(q)).catch(() => []);
    const resolved = await resolveSearchAssumption(q, userId, feedback);
    const applied = applyPassportAssumption(items, resolved);
    items = applied.items;
    assumption = applied.assumption;
  }
  if (source) items = items.filter((it) => it.src === source);
  const brands = (searchParams.get("brands") || "").split("|").filter(Boolean)
    .slice(0, 20).map((brand) => brand.slice(0, 160).toLowerCase());
  if (brands.length) {
    const set = new Set(brands);
    items = items.filter((it) => set.has((it.brand || "").toLowerCase()));
  }
  if (tag) items = items.filter((it) => (it.tags || {})[tag]);
  if (category) items = items.filter((it) => it.category === category);
  if (sort === "new") items = sortNewestFirst(items);
  if (sort === "price-asc") items = items.slice().sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
  if (sort === "price-desc") items = items.slice().sort((a, b) => (b.price || 0) - (a.price || 0));

  return NextResponse.json({
    total: items.length,
    offset,
    demo,
    sources,
    guidanceEnabled,
    assumption,
    items: stripRecencyKey(items.slice(offset, offset + limit)),
  });
}
