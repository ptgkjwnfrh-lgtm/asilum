// app/api/editorial/route.js
// Editorial as hyperlinked articles + user/ASILUM posts (editorial_posts).
// Not a heavy magazine backend: title/excerpt/image/link/tags/author, able to
// reference designers and products so editorial can feed discovery.
//
// GET  ?kind=user|asilum|article&limit= → visible posts, newest first
// POST { user, handle, text, title?, imageUrl?, externalUrl?, tags?, designerRefs?, productRefs? }

import { NextResponse } from "next/server";
import { createEditorialPost, listEditorialPosts } from "../../../lib/db/production.js";

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
  const user = String(body.user || "").slice(0, 80);
  const text = String(body.text || "").trim();
  if (!user || !text) return NextResponse.json({ error: "user and text required" }, { status: 400 });
  try {
    const post = await createEditorialPost({
      authorId: user,
      authorHandle: body.handle || "anonymous",
      kind: "user",
      title: body.title || null,
      body: text,
      excerpt: text.slice(0, 200),
      imageUrl: body.imageUrl || null,
      externalUrl: body.externalUrl || null,
      tags: body.tags || [],
      designerRefs: body.designerRefs || [],
      productRefs: body.productRefs || [],
    });
    return NextResponse.json({ id: post.id, persistent: post.persistent });
  } catch {
    return NextResponse.json({ error: "post failed" }, { status: 500 });
  }
}
