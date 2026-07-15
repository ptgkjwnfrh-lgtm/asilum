// app/api/outfits/route.js
// POST /api/outfits { kind:"generate",user,anchor?,full?,fit?,aiConsent? }
// Legacy GET supports non-sensitive deep links but intentionally ignores fit.
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
import { getProfile, mutateProfile } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { getDiscoverablePool, publicProduct, resolveProducts } from "../../../lib/products.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { scoreProductTrendRelevance } from "../../../lib/ai/trendKnowledge.js";
import { generateStylistOutfits } from "../../../lib/ai/stylistReasoningEngine.js";

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

const ALLOWED_SIZES = new Set(["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"]);

function safeMeasurement(value, min, max) {
  const measurement = Number(value);
  return Number.isFinite(measurement) && measurement >= min && measurement <= max
    ? measurement : null;
}

function fitProfileFromBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usualSize = String(value.usualSize || "").toUpperCase();
  const chest = safeMeasurement(value.chest, 20, 80);
  const waist = safeMeasurement(value.waist, 15, 80);
  if (!ALLOWED_SIZES.has(usualSize) && chest == null && waist == null) return null;
  return {
    usualSize: ALLOWED_SIZES.has(usualSize) ? usualSize : "",
    measurements: { ...(chest == null ? {} : { chest }), ...(waist == null ? {} : { waist }) },
  };
}

function trendAwareLook(look) {
  const matches = (look.items || [])
    .map((item) => scoreProductTrendRelevance(item))
    .filter((match) => match.trend && match.score >= 0.2)
    .sort((a, b) => b.score - a.score);
  const top = matches[0] || null;
  return {
    ...look,
    trendScore: top?.score || 0,
    trend: top ? { id: top.trend.id, name: top.trend.name, score: top.score } : null,
    why: [look.why, top ? `current styling context: ${top.trend.name}` : null].filter(Boolean).join(" · "),
  };
}

function rankTrendAware(looks) {
  return looks.map(trendAwareLook)
    .sort((a, b) => (b.conf + b.trendScore * 6) - (a.conf + a.trendScore * 6));
}

function modelLook(outfit) {
  const raw = Number(outfit.matchScore);
  const conf = Number.isFinite(raw)
    ? Math.max(75, Math.min(99, Math.round(raw <= 1 ? raw * 100 : raw)))
    : 85;
  return {
    items: outfit.items || [], conf,
    curated: conf, tasteStat: conf,
    total: (outfit.items || []).reduce((sum, item) => sum + (Number(item.price) || 0), 0),
    dominantTag: (outfit.matchedTags?.[0] || "AI EDIT").toUpperCase(),
    fitNotes: outfit.warnings || [],
    why: [outfit.aestheticLogic, outfit.outfitSummary, outfit.summary].filter(Boolean)[0] ||
      "model-ranked from available products and current fashion context",
  };
}

function publicLook(look) {
  return { ...look, items: (look.items || []).map(publicProduct).filter(Boolean) };
}

async function generate(req, input, { persistSeen = true } = {}) {
  const userId = await resolveRequestUser(req, String(input.user || "guest"));
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const quota = await consumeRateLimit({ scope: "outfits", subject: userId, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) {
    return NextResponse.json(rateLimitResponse(quota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) },
    });
  }
  const anchorId = String(input.anchor || "").slice(0, 80);
  const full = input.full === true;

  const pool = await getDiscoverablePool();

  const profile = migrateProfile(await getProfile(userId).catch(() => ({})));
  const taste = tasteVector(profile);

  const anchor = anchorId
    ? pool.find((it) => it.id === anchorId) || null
    : null;

  // Measurements are accepted only from a JSON request body, used transiently
  // by the local fit engine, and never persisted or sent to an external model.
  const fitProfile = fitProfileFromBody(input.fit);

  const events =
    ((profile._meta && profile._meta.seen) || []).length +
    ((profile._meta && profile._meta.activity) || []).length;

  // ---- quick mode (anchored slate) ----
  if (!full) {
    const n = Math.min(5, Math.max(1, Number.parseInt(input.n, 10) || 3));
    const outfits = rankTrendAware(buildSlate(pool, taste, n + 3, { anchor, fitProfile, events }))
      .filter((look) => look.conf >= MATCH_FLOOR).slice(0, n);
    return NextResponse.json({
      userId, anchor: anchor ? anchor.id : null,
      count: outfits.length, outfits: outfits.map(publicLook),
    });
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
    const built = rankTrendAware(buildSlate(pool, biased, LOOKS_PER_GENRE + 5, { fitProfile, events }));
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
  if (persistSeen) {
    try {
      await mutateProfile(userId, (current) => {
        const cur = migrateProfile(current);
        cur._meta.looksSeen = [...newSigs, ...(cur._meta.looksSeen || [])]
          .filter((s) => now - s.t < REPEAT_WINDOW_MS)
          .slice(0, SEEN_LOOKS_CAP);
        return cur;
      });
    } catch {}
  }

  let ai = { requested: input.aiConsent === true, source: "not-requested" };
  if (input.aiConsent === true) {
    const model = await generateStylistOutfits(userId, {
      requestText: "Create a current, wearable fashion edit from available inventory.",
      sizePreferences: fitProfile?.usualSize ? [fitProfile.usualSize] : [],
      useMoodBoardBrain: true,
      aiConsent: true,
    });
    ai = { requested: true, source: model.source || "unavailable" };
    if (model.ok && model.source === "model") {
      const looks = model.outfits.map(modelLook).filter((look) => look.items.length >= 3);
      if (looks.length) groups.unshift({ genre: "AI TREND EDIT", looks });
    }
  }

  const count = groups.reduce((s, g) => s + g.looks.length, 0);
  return NextResponse.json({
    userId, full: true, genres: groups.map((g) => g.genre), count,
    groups: groups.map((group) => ({ ...group, looks: group.looks.map(publicLook) })), ai,
  });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  // Legacy/deep-link generation deliberately ignores fit measurements in the
  // URL. The first-party UI uses POST so private measurements stay out of logs.
  return generate(req, {
    user: searchParams.get("user") || "guest",
    anchor: searchParams.get("anchor") || "",
    full: searchParams.get("full") === "1",
    n: searchParams.get("n"),
  }, { persistSeen: false });
}

// POST /api/outfits — persist a saved look (SAVE OUTFIT on /stylist) into
// stylist_outfits: real records of what the stylist got right.
export async function POST(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  if (body.kind === "generate") return generate(req, body);
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "outfit-save", subject: user, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const look = body.look || {};
  if (!Array.isArray(look.items) || !look.items.length || look.items.length > 10 ||
      look.items.some((item) => !item || typeof item.id !== "string" || item.id.length > 80)) {
    return NextResponse.json({ error: "look.items required" }, { status: 400 });
  }
  try {
    const products = await resolveProducts(look.items.map((item) => item.id));
    if (products.size !== new Set(look.items.map((item) => item.id)).size) {
      return NextResponse.json({ error: "look contains an unknown product" }, { status: 400 });
    }
    const { saveStylistOutfit } = await import("../../../lib/db/production.js");
    const saved = await saveStylistOutfit({
      userId: user,
      signature: look.sig || look.signature || null,
      genre: look.genre || null,
      items: look.items.map((it) => products.get(it.id)),
      matchScore: look.conf ?? look.match ?? null,
      reasons: look.reasons || [],
    });
    return NextResponse.json({ saved: { id: saved.id, persistent: saved.persistent } });
  } catch {
    return NextResponse.json({ error: "outfit save failed" }, { status: 500 });
  }
}
