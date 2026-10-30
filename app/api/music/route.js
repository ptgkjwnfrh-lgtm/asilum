// app/api/music/route.js — songs for the Feed's SONG cards (lib/music/itunes.js).
//
// GET ?model=1      → the model's songs, each the catalog's real record when
//                     the iTunes Search API holds a preview for it, else the
//                     SAMPLE it was. Always 200: with the seam off, `live` is
//                     false and the rows are the samples — the Feed never
//                     loses its cards because a key is unset.
// GET ?q=<term>     → a catalog search; 503 with the reason while the seam
//                     is off (ITUNES_SEARCH_ENABLED=1 turns it on).
//
// No identity is needed to read a public catalog; the per-caller quota and
// the global budget bound what one reader can cost upstream.

import { NextResponse } from "next/server";
import { itunesEnabled, searchSongs, resolveSongs, ITUNES_SOURCE } from "../../../lib/music/itunes.js";
import { SAMPLE_SONGS } from "../../../lib/model/songs.js";
import { consumeRateLimit, rateLimitResponse, consumeGlobalBudget } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";

export const dynamic = "force-dynamic";

const OFF = "song previews are off — set ITUNES_SEARCH_ENABLED=1 to read the iTunes Search API";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const quota = await consumeRateLimit({ scope: "music", subject: requestSubject(req), limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) } });
  const global = await consumeGlobalBudget("music");
  if (!global.allowed) return NextResponse.json(rateLimitResponse(global), { status: 429 });

  if (searchParams.get("model") === "1") {
    const enabled = itunesEnabled();
    const songs = enabled ? await resolveSongs(SAMPLE_SONGS) : SAMPLE_SONGS.map((s) => ({ ...s }));
    const live = songs.filter((s) => !s.sample).length;
    return NextResponse.json(
      { enabled, live, source: enabled ? ITUNES_SOURCE : null, reason: enabled ? null : OFF, songs },
      { headers: { "cache-control": "public, max-age=300" } }
    );
  }

  const q = (searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return NextResponse.json({ error: "q or model=1 required" }, { status: 400 });
  if (!itunesEnabled()) return NextResponse.json({ error: OFF, enabled: false }, { status: 503 });
  try {
    const limit = Math.max(1, Math.min(25, parseInt(searchParams.get("limit"), 10) || 10));
    const songs = await searchSongs(q, { limit });
    return NextResponse.json({ q, source: ITUNES_SOURCE, count: songs.length, songs });
  } catch {
    return NextResponse.json({ error: "the song catalog is temporarily unavailable" }, { status: 502 });
  }
}
