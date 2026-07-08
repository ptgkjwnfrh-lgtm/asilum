// app/api/outfits/route.js
// GET /api/outfits?user=<id>&anchor=<itemId>&full=1&fit=<size>&chest=&waist=
// THE STYLIST.
//   default    — a quick slate of 3 looks (used by "style it ✂" anchoring)
//   full=1     — a full generation: 5 base genres × 5 looks = 25 LOOKs,
//                match floor 75, and a 30-day repeat memory: a look the user
//                has already been shown has only a 10% chance of reappearing.
// Fit profile arrives from the client; measurements never persist server-side.

import { NextResponse } from "next/server";
import { migrateProfile, tasteVector } from "../../../lib/brain/index.js";
import { buildSlate } from "../../../lib/brain/stylist.js";
import { TAGS } from "../../../lib/brain/tags.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import { listItems, getProfile, saveProfile, withUserLock } from "../../../lib/db/index.js";

export const dynamic = "force-dynamic";

const GENRES_PER_GEN = 5;
const LOOKS_PER_GENRE = 5;
const MATCH_FLOOR = 75;
const REPEAT_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;
const REPEAT_CHANCE = 0.1;
const SEEN_LOOKS_CAP = 300;

const DEFAULT_GENRES = ["ARCHIVAL", "MINIMAL", "STREETWEAR", "UTILITARIAN", "SEDUCTIVE"];

function lookSignature(look) {
  return look.items.map((it) => it.id).sort().join("|");
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user") || "guest";
  const anchorId = searchParams.get("anchor") || "";
  const full = searchParams.get("full") === "1";

  let pool = [];
  try { pool = await listItems(200); } catch { pool = []; }
  if (!pool || pool.length === 0) pool = CATALOG;

  const profile = migrateProfile(await getProfile(userId).catch(() => ({})));
  const taste = tasteVector(profile);

  const anchor = anchorId
    ? pool.find((it) => it.id === anchorId) || CATALOG.find((it) => it.id === anchorId) || null
    : null;

  const fit = (searchParams.get("fit") || "").toUpperCase();
  const chest = parseFloat(searchParams.get("chest")) || 0;
  const waist = parseFloat(searchParams.get("waist")) || 0;
  const fitProfile = fit
    ? { usualSize: fit, measurements: { ...(chest ? { chest } : {}), ...(waist ? { waist } : {}) } }
    : null;

  const events =
    ((profile._meta && profile._meta.seen) || []).length +
    ((profile._meta && profile._meta.activity) || []).length;

  // ---- quick mode (anchored slate) ----
  if (!full) {
    const n = Math.min(5, parseInt(searchParams.get("n"), 10) || 3);
    const outfits = buildSlate(pool, taste, n, { anchor, fitProfile, events })
      .filter((o) => o.conf >= MATCH_FLOOR);
    return NextResponse.json({ userId, anchor: anchor ? anchor.id : null, count: outfits.length, outfits });
  }

  // ---- full generation: 5 genres × 5 looks ----
  // Base genres: the user's strongest aesthetics, padded with editorial defaults.
  const ranked = Object.entries(taste).filter(([, v]) => v > 0.1).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const genres = [...new Set([...ranked, ...DEFAULT_GENRES, ...TAGS])].slice(0, GENRES_PER_GEN);

  const now = Date.now();
  const seenLooks = (profile._meta && profile._meta.looksSeen) || [];
  const recentSigs = new Set(seenLooks.filter((s) => now - s.t < REPEAT_WINDOW_MS).map((s) => s.s));

  const groups = [];
  const newSigs = [];
  for (const genre of genres) {
    // Lean the taste vector into this genre, with a light jitter so every
    // generation cuts different looks (this is what makes the repeat rule real).
    const biased = { ...taste, [genre]: Math.min(1, (taste[genre] || 0) + 0.6) };
    for (let j = 0; j < 3; j++) {
      const t = TAGS[Math.floor(Math.random() * TAGS.length)];
      biased[t] = Math.max(-1, Math.min(1, (biased[t] || 0) + (Math.random() - 0.5) * 0.16));
    }
    const built = buildSlate(pool, biased, LOOKS_PER_GENRE + 2, { fitProfile, events });
    const looks = [];
    for (const look of built) {
      if (look.conf < MATCH_FLOOR) continue;
      const sig = lookSignature(look);
      if (recentSigs.has(sig) && Math.random() >= REPEAT_CHANCE) continue; // 30-day rule
      looks.push(look);
      newSigs.push({ s: sig, t: now });
      if (looks.length >= LOOKS_PER_GENRE) break;
    }
    groups.push({ genre, looks });
  }

  // Remember what was shown so the 30-day rule holds next time.
  try {
    await withUserLock(userId, async () => {
      const cur = migrateProfile(await getProfile(userId));
      cur._meta.looksSeen = [...newSigs, ...(cur._meta.looksSeen || [])]
        .filter((s) => now - s.t < REPEAT_WINDOW_MS)
        .slice(0, SEEN_LOOKS_CAP);
      await saveProfile(userId, cur);
    });
  } catch {}

  const count = groups.reduce((s, g) => s + g.looks.length, 0);
  return NextResponse.json({ userId, full: true, genres: groups.map((g) => g.genre), count, groups });
}
