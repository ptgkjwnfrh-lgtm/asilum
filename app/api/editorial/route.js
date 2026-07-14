// app/api/editorial/route.js
// Editorial as hyperlinked articles + user/ASILUM posts (editorial_posts).
// Not a heavy magazine backend: title/excerpt/image/link/tags/author, able to
// reference designers and products so editorial can feed discovery.
//
// GET  ?kind=user|asilum|article&limit= → visible posts, newest first
// POST { user, handle, text, title?, imageUrl?, externalUrl?, tags?, designerRefs?, productRefs? }

import { NextResponse } from "next/server";
import { createEditorialPost, listEditorialPosts } from "../../../lib/db/production.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { safeExternalUrl, safeImageUrl } from "../../../lib/url.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || null;
  const limit = Math.min(120, parseInt(searchParams.get("limit"), 10) || 60);
  try {
    return NextResponse.json({ posts: await listEditorialPosts({ kind, limit }) });
  } catch {
    return NextResponse.json({ posts: [] });
  }
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const text = String(body.text || "").trim().slice(0, 1000);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const quota = await consumeRateLimit({ scope: "editorial", subject: user, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  try {
    const post = await createEditorialPost({
      authorId: user,
      authorHandle: String(body.handle || "anonymous").slice(0, 80),
      kind: "user",
      title: body.title ? String(body.title).slice(0, 200) : null,
      body: text,
      excerpt: text.slice(0, 200),
      imageUrl: safeImageUrl(body.imageUrl),
      externalUrl: safeExternalUrl(body.externalUrl),
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 12).map((v) => String(v).slice(0, 60)) : [],
      designerRefs: Array.isArray(body.designerRefs) ? body.designerRefs.slice(0, 12).map((v) => String(v).slice(0, 160)) : [],
      productRefs: Array.isArray(body.productRefs) ? body.productRefs.slice(0, 24).map((v) => String(v).slice(0, 80)) : [],
    });
    return NextResponse.json({ id: post.id, persistent: post.persistent });
  } catch {
    return NextResponse.json({ error: "post failed" }, { status: 500 });
  }
}
