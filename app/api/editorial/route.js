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
import { extractRefs } from "../../../lib/wire/refs.js";
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

// Caller-supplied tags + hashtags parsed out of the transmission, deduped
// and capped. Both are lowercased so "#Archival" and "#archival" are the
// same tag on the row and hand off to the same search.
function mergeTags(supplied, extracted) {
  const out = [];
  const push = (raw) => {
    const tag = String(raw ?? "").trim().toLowerCase().slice(0, 60);
    if (tag && !out.includes(tag) && out.length < 12) out.push(tag);
  };
  if (Array.isArray(supplied)) supplied.slice(0, 12).forEach(push);
  extracted.forEach(push);
  return out;
}

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
  // POSTING REQUIRES A SIGNED-IN ACCOUNT (launch-readiness audit, Aug 16).
  // A device cookie proves a browser, not a person, and browsers are free:
  // before this, any signed-out visitor could publish to the wire and a
  // disposable identity could do it repeatedly. That is an anonymous abuse
  // surface with no moderation, reporting, or takedown behind it.
  //
  // Deliberately checked BEFORE the body is sanitized or any quota is spent,
  // so a caller who cannot post learns that first and cannot use the endpoint
  // to probe the sanitizer. 403, not 401 — the caller's identity is real and
  // proven; it is simply not the KIND of identity that may publish.
  //
  // Reading, engaging and editing are untouched. This is not the pending
  // "designers only vs everyone posts" ruling — that decides WHICH accounts
  // may post. This only establishes that an account is required at all.
  if (!accountIdFromIdentity(user)) {
    return NextResponse.json({
      error: "posting to the wire requires a signed-in account",
      note: "sign in on PROFILE — a device on its own cannot publish",
    }, { status: 403 });
  }
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
      // Hashtags are extracted from the SANITIZED text (owner directive,
      // Aug 14: parse after the sanitizer, never before) and stored on the
      // row. A caller-supplied tags array still rides along — the two are
      // merged, deduped, and capped. Mentions are not stored: they render
      // as links from the text itself, and no consumer (notifications)
      // exists yet, so keeping a list of who someone talked about would be
      // collecting data nothing reads.
      tags: mergeTags(body.tags, extractRefs(text).hashtags),
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
      // Re-extracted from the edited text: a tag the author removed must
      // stop being on the row, or the transmission would keep answering a
      // search for words it no longer contains.
      tags: mergeTags(body.tags, extractRefs(text).hashtags),
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
