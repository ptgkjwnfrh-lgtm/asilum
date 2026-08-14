// app/api/editorial/route.js
// Editorial as hyperlinked articles + user/ASILUM posts (editorial_posts).
// Not a heavy magazine backend: title/excerpt/image/link/tags/author, able to
// reference designers and products so editorial can feed discovery.
//
// GET    ?kind=user|asilum|article&limit= → visible posts, newest first
//        (?id= is the permalink read — a miss answers 404, honestly)
// POST   { user, handle, text, title?, imageUrl?, externalUrl?, tags?, designerRefs?, productRefs? }
// PATCH  { user, id, text, title? } — author-verified edit, stamps edited_at
// DELETE ?id=&user= — author-verified soft delete (the permalink dies with it)

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  createEditorialPost, createModerationTask, deleteEditorialPost, getProfileRoom,
  listEditorialPosts, updateEditorialPost,
} from "../../../lib/db/production.js";
import { accountIdFromIdentity, resolveRequestUser } from "../../../lib/identity.js";
import { sanitizeStatement, screenStatement } from "../../../lib/profile/rooms.js";
import { safeExternalUrl, safeImageUrl } from "../../../lib/url.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { requestSubject } from "../../../lib/security/request.js";

// The wire's transmission law (owner order, Aug 13): text posts cap at
// 5000 characters; the caption (title) acts as the transmission's header
// and keeps its 200-char cap. Video (≤3:00) and image carousels (≤6)
// arrive with the media pipeline — this route stays text-only until
// storage exists, honestly.
const POST_MAX = 5000;

// The byline is server truth, never caller input: a published room handle
// when the account has one, otherwise a stable per-identity reader tag.
// (Spoofing "ASILUM" or another member's handle is what this closes.)
async function deriveAuthorHandle(user) {
  const accountId = accountIdFromIdentity(user);
  if (accountId) {
    try {
      const room = await getProfileRoom(accountId);
      if (room?.published && room?.handle) return room.handle;
    } catch {}
  }
  return "reader-" + createHash("sha256").update(String(user)).digest("hex").slice(0, 6);
}

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const requestedKind = searchParams.get("kind") || null;
  if (requestedKind && !["user", "asilum", "article"].includes(requestedKind)) {
    return NextResponse.json({ error: "unknown editorial kind" }, { status: 400 });
  }
  const kind = requestedKind;
  const limit = Math.max(1, Math.min(120, parseInt(searchParams.get("limit"), 10) || 60));
  // The identity chain (owner order, Aug 13): ?handle= reads a poster's
  // visible posts, ?id= reads one post (the permalink), ?mine=1 reads the
  // verified caller's own visible posts — filtered by author_id on the
  // server, which the response still never exposes. Visibility rules are
  // the same on every path.
  const handle = (searchParams.get("handle") || "").trim().slice(0, 80) || null;
  const rawId = searchParams.get("id");
  let id = null;
  if (rawId != null && rawId !== "") {
    if (!/^\d{1,18}$/.test(rawId)) return NextResponse.json({ error: "bad post id" }, { status: 400 });
    id = rawId;
  }
  let authorId = null;
  if (searchParams.get("mine") === "1") {
    const user = await resolveRequestUser(req, String(searchParams.get("user") || "")).catch(() => null);
    if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
    authorId = user;
  }
  const quota = await consumeRateLimit({ scope: "editorial-read", subject: requestSubject(req), limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  try {
    const posts = (await listEditorialPosts({ kind, limit, handle, id, authorId })).map(({ authorId: _a, ...post }) => post);
    // The permalink read answers 404 when the transmission is not on the
    // wire — deleted, held for review, or never published. A dead link
    // that pretends to be a page would be a lie (owner directive, Aug 14).
    if (id != null && posts.length === 0) {
      return NextResponse.json({ posts: [] }, { status: 404 });
    }
    return NextResponse.json({ posts });
  } catch {
    return NextResponse.json({ posts: [] });
  }
}

export async function POST(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  let text;
  try {
    text = sanitizeStatement(String(body.text || "").trim().slice(0, POST_MAX), POST_MAX);
  } catch {
    return NextResponse.json({ error: "text could not be sanitized" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const quota = await consumeRateLimit({ scope: "editorial", subject: user, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  try {
    // Same deterministic screen as profile rooms: a flag never blocks the
    // author's post from being SAVED — it parks it out of public view and
    // files a moderation task for a human.
    const flagged = screenStatement(text);
    const post = await createEditorialPost({
      authorId: user,
      authorHandle: await deriveAuthorHandle(user),
      kind: "user",
      moderationStatus: flagged.length ? "under_review" : "visible",
      title: body.title ? String(body.title).slice(0, 200) : null,
      body: text,
      excerpt: text.slice(0, 200),
      imageUrl: safeImageUrl(body.imageUrl),
      externalUrl: safeExternalUrl(body.externalUrl),
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 12).map((v) => String(v).slice(0, 60)) : [],
      designerRefs: Array.isArray(body.designerRefs) ? body.designerRefs.slice(0, 12).map((v) => String(v).slice(0, 160)) : [],
      productRefs: Array.isArray(body.productRefs) ? body.productRefs.slice(0, 24).map((v) => String(v).slice(0, 80)) : [],
    });
    if (flagged.length) {
      await createModerationTask({
        kind: "editorial-content", subjectType: "editorial_post", subjectId: String(post.id),
        payload: { flags: flagged, excerpt: text.slice(0, 160) }, priority: "high",
      });
    }
    return NextResponse.json({
      id: post.id, persistent: post.persistent,
      ...(flagged.length
        ? { held: true, note: "your post is saved and paused for a human review" }
        : {}),
    });
  } catch {
    return NextResponse.json({ error: "post failed" }, { status: 500 });
  }
}

// The lifecycle verbs (owner directive, HANDOVER-2026-08-14 backlog 1).
// Both resolve the caller from proof, then let the database's WHERE
// author_id clause be the whole authorization story: a stranger's post and
// a missing post answer the same 404, so the API never confirms whose a
// transmission is. Edits pass the SAME sanitize + screen as a fresh post —
// a flagged edit parks the transmission under review instead of publishing
// it, and the author is told so in the same words POST uses.

export async function PATCH(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const rawId = String(body.id ?? "");
  if (!/^\d{1,18}$/.test(rawId)) return NextResponse.json({ error: "bad post id" }, { status: 400 });
  let text;
  try {
    text = sanitizeStatement(String(body.text || "").trim().slice(0, POST_MAX), POST_MAX);
  } catch {
    return NextResponse.json({ error: "text could not be sanitized" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  // Edits share the posting quota — rewriting the wire is writing to it.
  const quota = await consumeRateLimit({ scope: "editorial", subject: user, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  try {
    const flagged = screenStatement(text);
    const post = await updateEditorialPost({
      id: rawId, authorId: user,
      title: body.title ? String(body.title).slice(0, 200) : null,
      body: text, excerpt: text.slice(0, 200),
      moderationStatus: flagged.length ? "under_review" : "visible",
    });
    if (!post) return NextResponse.json({ error: "transmission not found" }, { status: 404 });
    if (flagged.length) {
      await createModerationTask({
        kind: "editorial-content", subjectType: "editorial_post", subjectId: String(post.id),
        payload: { flags: flagged, excerpt: text.slice(0, 160), edit: true }, priority: "high",
      });
    }
    return NextResponse.json({
      id: post.id, editedAt: post.editedAt ?? null,
      ...(flagged.length
        ? { held: true, note: "your edit is saved and paused for a human review" }
        : {}),
    });
  } catch {
    return NextResponse.json({ error: "edit failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, String(searchParams.get("user") || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const rawId = String(searchParams.get("id") || "");
  if (!/^\d{1,18}$/.test(rawId)) return NextResponse.json({ error: "bad post id" }, { status: 400 });
  const quota = await consumeRateLimit({ scope: "editorial", subject: user, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  try {
    const gone = await deleteEditorialPost({ id: rawId, authorId: user });
    if (!gone) return NextResponse.json({ error: "transmission not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: rawId });
  } catch {
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
