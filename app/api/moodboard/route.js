// app/api/moodboard/route.js
// The Mood Board as a database feeder. Every training action becomes a real
// mood_board_uploads record the future vision/AI layer can re-analyze.
//
// POST { user, kind: "upload"|"text", filenames?, prompt?, caption? }
//   upload → tags inferred from the words the FILENAMES carry (honest:
//            analyzed_by "filename" — there is no image vision yet)
//   text   → manual tag entry (analyzed_by "manual")
// GET ?user= → the user's upload/training records.

import { NextResponse } from "next/server";
import { inferTags } from "../../../lib/ingest/sources.js";
import { createMoodBoardUpload, listMoodBoardUploads } from "../../../lib/db/production.js";

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
  const user = String(body.user || "").slice(0, 80);
  const kind = body.kind === "upload" ? "upload" : "text";
  if (!user) return NextResponse.json({ error: "user required" }, { status: 400 });

  let text = "";
  if (kind === "upload") {
    const names = (body.filenames || []).slice(0, 24).map((n) =>
      String(n).replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " ")
    );
    if (!names.length) return NextResponse.json({ error: "filenames required for uploads" }, { status: 400 });
    text = names.join(" ");
  } else {
    text = String(body.prompt || "").slice(0, 400);
    if (!text.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  try {
    const vec = inferTags(text);
    const rec = await createMoodBoardUpload({
      userId: user,
      caption: body.caption || (kind === "text" ? text : null),
      source: kind === "upload" ? "image-upload" : "train-text",
      tags: tagRows(vec, kind === "text" ? "personalization" : "aesthetic"),
      styleNotes: kind === "upload" ? `filename words: ${text.slice(0, 200)}` : null,
      analyzedBy: kind === "upload" ? "filename" : "manual",
    });
    return NextResponse.json({ id: rec.id, persistent: rec.persistent, tags: rec.tags });
  } catch {
    return NextResponse.json({ error: "moodboard record failed" }, { status: 500 });
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user") || "";
  if (!user) return NextResponse.json({ uploads: [] });
  try {
    return NextResponse.json({ uploads: await listMoodBoardUploads(user) });
  } catch {
    return NextResponse.json({ uploads: [] });
  }
}
