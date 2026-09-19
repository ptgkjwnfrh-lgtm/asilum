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
import { safeExternalUrl } from "../../../lib/url.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consumeRateLimit, consumeGlobalBudget, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { getMemoryPreferences } from "../../../lib/db/production.js";
import { envelope, failure, newRequestId } from "../../../lib/api/outcome.js";
import { resolveOverviewForQuery } from "../../../lib/people/resolve.js";
import { getDiscoverablePool } from "../../../lib/products.js";
import { bindingOf, snapshotOf, encodeCursor, decodeCursor } from "../../../lib/search/cursor.js";
import { POLICY_VERSION } from "../../../lib/brain/policy.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase().slice(0, 200);
  const requestId = newRequestId();
  if (!q) return NextResponse.json({
    ...envelope({ count: 0, requestId }),
    q, brands: [], items: [], aesthetics: [], results: [], total: 0, guidanceEnabled: false,
  });
  const quota = await consumeRateLimit({ scope: "search", subject: requestSubject(req), limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const globalQuota = await consumeGlobalBudget("search");
  if (!globalQuota.allowed) {
    return NextResponse.json(rateLimitResponse(globalQuota), {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(globalQuota.retryAfterMs / 1000))) },
    });
  }
  const requestedGuidance = searchParams.get("brain") === "1";
  const userId = requestedGuidance
    ? await resolveRequestUser(req, searchParams.get("user") || "") : null;
  const guidanceEnabled = !!userId &&
    (await getMemoryPreferences(userId).catch(() => ({ guidanceEnabled: false }))).guidanceEnabled !== false;

  // STABLE PAGES on search too (synergy round): the same signed cursor
  // /api/discover uses, bound to the query, the eligibility context and a
  // snapshot of the ordered ids. `limit` 1..96 (default 48); a cursor from
  // another query or a changed list answers 409 stale_cursor.
  const limit = Math.max(1, Math.min(96, parseInt(searchParams.get("limit"), 10) || 48));
  const cursor = (searchParams.get("cursor") || "").slice(0, 512);
  let out;
  try {
    out = await searchProducts(q, { userId, brain: guidanceEnabled, limit: 2000 });
  } catch (error) {
    // UNAVAILABLE IS NOT EMPTY (19 Sep 2026). This used to answer an engine
    // throw with `{ results: [], total: 0 }` and HTTP 200 — a reader could not
    // tell "nothing matches" from "the engine is down". Now it is a typed,
    // retryable 503 (docs/v2/CONTRACTS.md § Common behavior).
    console.error("[search] engine failure", requestId, error?.message || error);
    const failed = failure("unavailable", "search_engine_failed", "the search engine could not answer — retry", { requestId });
    return NextResponse.json({ ...failed.body, q, results: [], total: null }, { status: failed.status });
  }

  const resolvedEntities = resolveOverviewForQuery(q, { pool: await getDiscoverablePool().catch(() => null) });
  const binding = bindingOf({ q, guidanceEnabled, subject: guidanceEnabled ? requestSubject(req) : null });
  const snapshotId = snapshotOf(out.results.map((it) => it.id));
  let offset = 0;
  if (cursor) {
    const decoded = decodeCursor(cursor, { binding, snapshotId });
    if (!decoded.ok) {
      const stale = decoded.reason === "snapshot" || decoded.reason === "context";
      const failed = stale
        ? failure("stale_cursor", "cursor_" + decoded.reason, "this page no longer exists — restart from the first page", { requestId })
        : failure("invalid", "cursor_" + decoded.reason, "the cursor could not be read", { requestId });
      return NextResponse.json(failed.body, { status: failed.status });
    }
    offset = decoded.offset;
  }
  const page = out.results.slice(offset, offset + limit);
  const nextCursor = offset + limit < out.results.length ? encodeCursor({ offset: offset + limit, snapshotId, binding }) : null;

  // Legacy multi-search facets, now derived from the ranked results.
  const brands = [];
  const seenBrands = new Set();
  const items = [];
  for (const it of page) {
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
    ...envelope({ count: page.length, requestId }),
    policyVersion: POLICY_VERSION,
    q, brands, items, aesthetics,
    total: out.total,
    totalIsExact: true,
    offset,
    limit,
    nextCursor,
    snapshotId,
    candidatesTruncated: !!out.candidatesTruncated,
    overview: resolvedEntities.overview,
    related: resolvedEntities.related,
    entities: resolvedEntities.entities,
    query: resolvedEntities.query,
    guidanceEnabled,
    interpreted: out.interpreted,
    // Honest disclosure of words the catalog could not match (Aug 5). The
    // engine used to drop them silently and return the whole garment
    // category as though it had understood.
    note: out.note || null,
    unmatchedTokens: out.unmatchedTokens || [],
    // The cultural and semantic tiers describe THEMSELVES — which entity was
    // read, which interpretation, whether the reading was personalised,
    // whether embeddings re-ranked or appended. All computed, all dropped
    // here until now.
    cultural: out.cultural || null,
    semantic: out.semantic || null,
    results: page.map((it) => ({
      id: it.id, title: it.title, brand: it.brand, price: it.price,
      currency: it.currency, img: it.img, tags: it.tags, category: it.category,
      src: sourceFor(it), url: safeExternalUrl(it.url || it.source_product_url),
      confidenceScore: it.confidenceScore, matchReason: it.matchReason,
      matchedTags: it.matchedTags, availability: it.availability_status || "unknown",
    })),
  });
}
