// app/api/moodboard/route.js
// The Mood Board as a database feeder. Every training action becomes a real
// mood_board_uploads record the future vision/AI layer can re-analyze.
//
// POST { user, kind: "upload"|"text", filenames?, prompt?, caption?, palette?, uploadId? }
//   upload → filename words + optional palette v0 swatches. The client sends
//            RAW {hex, weight} swatches only — canonical color names and
//            shared-TAGS weights are derived server-side (lib/vision/palette
//            paletteFromSwatches); client-supplied labels are never trusted.
//            Malformed palettes reject the whole request (400, atomic).
//            Record + USER_UPLOADED_IMAGE event persist in one transaction.
//   text   → manual tag entry (analyzed_by "manual")
// GET ?user= → the user's upload/training records.
// Identity: resolveRequestUser proof (device cookie / bearer), per PR #12.

import { NextResponse } from "next/server";
import { inferTags } from "../../../lib/ingest/sources.js";
import {
  createMoodBoardUpload, createMoodBoardUploadWithEvent, listMoodBoardUploads,
} from "../../../lib/db/production.js";
import { paletteFromSwatches } from "../../../lib/vision/palette.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { EVENTS, buildEvent } from "../../../lib/events/index.js";
import { analyzeMoodBoardItem } from "../../../lib/ai/moodBoardAnalyzer.js";
import { rebuildUserStyleProfile } from "../../../lib/ai/styleProfile.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";

export const dynamic = "force-dynamic";

function tagRows(vec, tagType) {
  return Object.entries(vec.long || vec)
    .filter(([, v]) => typeof v === "number" && v > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, v]) => ({ tag: tag.toLowerCase(), tag_type: tagType, confidence: Math.min(1, Math.round(v * 100) / 100) }));
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "moodboard", subject: user, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const kind = body.kind === "upload" ? "upload" : "text";

  let text = "";
  let idemKey = null;
  if (kind === "upload") {
    // filenames: must be a real array of bounded strings — malformed shapes
    // are a 400, never a throw (Codex re-review of #13).
    if (!Array.isArray(body.filenames) || body.filenames.length < 1 || body.filenames.length > 24) {
      return NextResponse.json({ error: "filenames must be an array of 1-24 strings" }, { status: 400 });
    }
    const names = [];
    for (const n of body.filenames) {
      if (typeof n !== "string" || !n.trim() || n.length > 200) {
        return NextResponse.json({ error: "each filename must be a non-empty string ≤ 200 chars" }, { status: 400 });
      }
      names.push(n.replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " "));
    }
    text = names.join(" ");
    // Client-generated idempotency key: a retry after a lost response returns
    // the ORIGINAL record instead of writing a duplicate upload + event.
    if (body.uploadId !== undefined) {
      if (typeof body.uploadId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(body.uploadId)) {
        return NextResponse.json({ error: "invalid uploadId" }, { status: 400 });
      }
      idemKey = body.uploadId;
    }
  } else {
    text = String(body.prompt || "").slice(0, 400);
    if (!text.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  // Server-side palette derivation from untrusted {hex, weight} swatches.
  // A supplied-but-invalid palette is an atomic reject — no silent salvage.
  // An EMPTY array is legitimate (client read no pixels) → filename fallback.
  let derived = null;
  if (kind === "upload" && body.palette !== undefined) {
    if (!Array.isArray(body.palette)) {
      return NextResponse.json({ error: "invalid palette payload" }, { status: 400 });
    }
    if (body.palette.length) {
      derived = paletteFromSwatches(body.palette);
      if (!derived) return NextResponse.json({ error: "invalid palette payload" }, { status: 400 });
    }
  }
  const palette = derived ? derived.palette : [];
  const paletteTags = derived
    ? Object.entries(derived.tags).map(([t, w]) => ({ tag: t.toLowerCase(), tag_type: "palette", confidence: w }))
    : [];

  try {
    const vec = inferTags(text);
    const row = {
      userId: user,
      caption: body.caption || (kind === "text" ? text : null),
      source: kind === "upload" ? "image-upload" : "train-text",
      colors: palette,
      tags: [...tagRows(vec, kind === "text" ? "personalization" : "aesthetic"), ...paletteTags],
      styleNotes: kind === "upload"
        ? (palette.length
            ? `palette v0: ${palette.map((s) => `${s.name}(${s.weight})`).join(" ")}; filename words: ${text.slice(0, 160)}`
            : `filename words: ${text.slice(0, 200)}`)
        : null,
      analyzedBy: kind === "upload" ? (palette.length ? "palette-v0" : "filename") : "manual",
    };
    // Uploads persist the record and its canonical event in one transaction —
    // a failed write leaves neither behind, so client retries can't
    // double-count USER_UPLOADED_IMAGE.
    const rec = kind === "upload"
      ? await createMoodBoardUploadWithEvent(row, buildEvent(user, EVENTS.USER_UPLOADED_IMAGE, {
          files: body.filenames.length,
          analyzedBy: row.analyzedBy,
          palette: palette.map((s) => s.name),
          uploadId: idemKey,
        }), idemKey)
      : await createMoodBoardUpload(row);

    // Feed the intelligence layer: analyze (local rules today, model when
    // enabled) and refresh the style profile. Derived data — a failure here
    // must never fail the upload, and duplicates are not re-analyzed.
    let analysis = null;
    if (kind === "upload" && rec.duplicate !== true) {
      const a = await analyzeMoodBoardItem(rec, { userId: user, allowExternalAi: body.aiConsent === true });
      if (a.ok) analysis = { source: a.source, summary: a.analysis.summary, confidence: a.analysis.confidenceScore };
      rebuildUserStyleProfile(user).catch(() => {});
    }
    return NextResponse.json({
      id: rec.id, persistent: rec.persistent, tags: rec.tags, palette,
      duplicate: rec.duplicate === true, analysis,
    });
  } catch {
    return NextResponse.json({ error: "moodboard record failed" }, { status: 500 });
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  try {
    return NextResponse.json({ uploads: await listMoodBoardUploads(user) });
  } catch {
    return NextResponse.json({ uploads: [] });
  }
}
