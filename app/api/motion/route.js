// app/api/motion/route.js — GET → the licensed MOTIONS (lib/media/pexels.js):
// vertical video under the Pexels License, credited, in the model's post
// shape for the Feed's stream and its VIDEOS YOU MAY LIKE row. Unkeyed, no
// posts and the reason, status 200 — the Feed keeps its generated test
// pattern and nothing pretends. Public, read-only; the per-caller quota and
// the global budget bound the route, the hour's cache bounds the provider.

import { NextResponse } from "next/server";
import { licensedMotions, pexelsEnabled, PEXELS_SOURCE, PEXELS_LICENSE } from "../../../lib/media/pexels.js";
import { consumeRateLimit, rateLimitResponse, consumeGlobalBudget } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const quota = await consumeRateLimit({ scope: "motion", subject: requestSubject(req), limit: 30, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) } });
  const global = await consumeGlobalBudget("motion");
  if (!global.allowed) return NextResponse.json(rateLimitResponse(global), { status: 429 });
  const r = await licensedMotions();
  return NextResponse.json(
    { enabled: pexelsEnabled(), source: r.enabled ? PEXELS_SOURCE : null, license: r.enabled ? PEXELS_LICENSE : null, count: r.posts.length, reason: r.reason || null, posts: r.posts },
    { headers: { "cache-control": "public, max-age=600" } }
  );
}
