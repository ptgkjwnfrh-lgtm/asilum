// app/api/connect/route.js
// POST /api/connect  { user, platform }
// "Buyer history scan": connecting an associated marketplace account imports
// the user's purchase history and trains the brain from it — the strongest
// possible cold-start. Real platform OAuth adapters plug in here; until those
// credentials exist this generates a deterministic simulated history per
// (user, platform) from the catalog so the flow, learning, and graph writes
// are all real.

import { NextResponse } from "next/server";
import { learn } from "../../../lib/brain/index.js";
import { noteActivity } from "../../../lib/brain/memory.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";
import {
  getProfile, saveProfile, recordInteraction,
  bumpEdges, bumpPopularity, withUserLock,
} from "../../../lib/db/index.js";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set(["grailed", "depop", "ssense", "ebay", "pinterest"]);
const IMPORT_COUNT = 8;

// Deterministic per-account sampling so reconnecting gives the same history.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = body.user || "guest";
  const platform = String(body.platform || "").toLowerCase();
  if (!PLATFORMS.has(platform)) {
    return NextResponse.json({ error: "unknown platform" }, { status: 400 });
  }

  // TODO(real integration): exchange OAuth token, fetch order history via the
  // platform's official API, normalize to catalog item shape.
  const seed = hashStr(userId + ":" + platform);
  const purchases = [];
  const used = new Set();
  for (let i = 0; purchases.length < IMPORT_COUNT && i < 64; i++) {
    const idx = hashStr(seed + ":" + i) % CATALOG.length;
    if (used.has(idx)) continue;
    used.add(idx);
    purchases.push(CATALOG[idx]);
  }

  const edgePairs = [];
  await withUserLock(userId, async () => {
    let profile = (await getProfile(userId)) || {};
    let prevId = null;
    for (const it of purchases) {
      profile = learn(profile, it, "bag");
      profile = noteActivity(profile, it, "purchase");
      if (prevId) edgePairs.push({ a: prevId, b: it.id, w: 2 });
      prevId = it.id;
    }
    await saveProfile(userId, profile);
  });
  await Promise.all([
    bumpEdges(edgePairs),
    bumpPopularity(purchases.map((it) => ({ id: it.id, eng: 1 }))),
    ...purchases.map((it) => recordInteraction(userId, it.id, "bag")),
  ]);

  return NextResponse.json({
    userId,
    platform,
    imported: purchases.length,
    items: purchases.map((it) => ({ id: it.id, title: it.title, brand: it.brand })),
  });
}
