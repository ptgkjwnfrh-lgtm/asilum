// app/api/taste/route.js — THE TASTE NETWORK's door (V.2).
//
// GET  /api/taste?user=      the ten tags with weight, evidence kind and the
//                            evidence itself; the curated affinity edges;
//                            whether an undo is waiting; whether guidance is on.
// POST /api/taste            { user, op: keep|reduce|remove|explore|undo, tag }
//
// Evidence kinds, per the brief — and per the stored profile's honesty: the
// brain's vector carries NO provenance (audited 17 Sep), so this route
// derives it from what it can prove:
//   manual    the person pressed KEEP or EXPLORE here (recorded in
//             _meta.manual with a timestamp) — a deliberate choice;
//   inferred  the brain's weight is above the floor and the person's own
//             saves carry the tag — the reason names the count;
//   curated   an editorial neighbour: the tag sits one affinity hop from a
//             manual or inferred one (lib/brain/tags.js TAG_AFFINITY);
//   none      nothing yet.
// A halo is an inference and an inference is not evidence (margin.js): a
// weight with no saves and no choice behind it is shown as "read by the
// brain", never as a fact about the person.
//
// Every op snapshots long/session/manual first, so ONE undo is always
// waiting. Ops are explicit acts (D4: allowed under GENERAL consent).

import { NextResponse } from "next/server";
import { TAGS } from "../../../lib/brain/tags.js";
import { migrateProfile } from "../../../lib/brain/index.js";
import { buildNetwork, KEEP_FLOOR, EXPLORE_FLOOR } from "../../../lib/taste/network.js";
import { getProfile, mutateProfile, getBoards } from "../../../lib/db/index.js";
import { getMemoryPreferences, getUserRecommendationExclusions } from "../../../lib/db/production.js";
import { POLICY_VERSION } from "../../../lib/brain/policy.js";
import { creditedDesigners } from "../../../lib/asterisk/memory.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consentState, observationAllowed } from "../../../lib/consent.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

const OPS = new Set(["keep", "reduce", "remove", "explore", "undo"]);

export async function GET(req) {
  const url = new URL(req.url);
  const userId = await resolveRequestUser(req, url.searchParams.get("user") || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const [profile, boards, prefs, exclusions] = await Promise.all([
    getProfile(userId).catch(() => null),
    getBoards(userId).catch(() => []),
    getMemoryPreferences(userId).catch(() => ({ guidanceEnabled: true })),
    getUserRecommendationExclusions(userId).catch(() => null),
  ]);
  const net = buildNetwork(profile, boards);
  const designers = await creditedDesigners(boards).catch(() => []);
  // THE OPEN LANES ride with the network (synergy round): the price ceiling
  // and fit hints a reader's corrections hold open, so the FULL READ can show
  // them beside the tags without a second request. Same source as the feed.
  const lanes = exclusions
    ? { priceCeilingCents: exclusions.priceCeilingCents ?? null, fitHints: exclusions.fitHints || [],
        excludedBrands: exclusions.brands || [], excludedProducts: (exclusions.productIds || []).length }
    : null;
  return NextResponse.json({ userId, policyVersion: POLICY_VERSION, guidanceEnabled: prefs.guidanceEnabled !== false, lanes, designers, ...net });
}

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body || {};
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!observationAllowed(consentState(req), "explicit")) {
    return NextResponse.json({ observed: false, reason: "the first-visit question is unanswered — the terminal does not learn yet" });
  }
  const op = String(body.op || "");
  const tag = String(body.tag || "").toUpperCase();
  if (!OPS.has(op)) return NextResponse.json({ error: "unknown op" }, { status: 400 });
  if (op !== "undo" && !TAGS.includes(tag)) return NextResponse.json({ error: "unknown tag" }, { status: 400 });
  const quota = await consumeRateLimit({ scope: "taste", subject: userId, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return rateLimitResponse(quota);

  const now = new Date().toISOString();
  const profile = await mutateProfile(userId, (current) => {
    const p = migrateProfile(current || {});
    p.long = p.long || {}; p.session = p.session || {}; p._meta = p._meta || {};
    p._meta.manual = p._meta.manual || {};
    if (op === "undo") {
      const snap = p._meta.tasteUndo;
      if (!snap) return p;
      p.long = snap.long || {}; p.session = snap.session || {}; p._meta.manual = snap.manual || {};
      delete p._meta.tasteUndo;
      return p;
    }
    // one level of undo: the state before THIS act
    p._meta.tasteUndo = { long: { ...p.long }, session: { ...p.session }, manual: { ...p._meta.manual }, at: now, op, tag };
    if (op === "keep") {
      p.long[tag] = Math.max(p.long[tag] || 0, KEEP_FLOOR);
      p._meta.manual[tag] = now; p._meta.manual[tag + ":via"] = "keep";
    } else if (op === "reduce") {
      p.long[tag] = (p.long[tag] || 0) * 0.5;
      p.session[tag] = (p.session[tag] || 0) * 0.5;
      if (Math.abs(p.long[tag]) < 0.02) delete p.long[tag];
      if (Math.abs(p.session[tag]) < 0.02) delete p.session[tag];
      // a reduce is a choice the reader made: it is recorded like keep and
      // explore, so the network can show it, undo can name it, and decay by
      // class leaves the reduced weight where the reader put it
      if (p.long[tag] != null || p.session[tag] != null) {
        p._meta.manual[tag] = now; p._meta.manual[tag + ":via"] = "reduce";
      } else {
        delete p._meta.manual[tag]; delete p._meta.manual[tag + ":via"];
      }
    } else if (op === "remove") {
      delete p.long[tag]; delete p.session[tag];
      delete p._meta.manual[tag]; delete p._meta.manual[tag + ":via"];
    } else if (op === "explore") {
      // in-the-moment interest: learns fast, fades fast (the session vector)
      p.session[tag] = Math.max(p.session[tag] || 0, EXPLORE_FLOOR);
      p._meta.manual[tag] = now; p._meta.manual[tag + ":via"] = "explore";
    }
    return p;
  });
  const boards = await getBoards(userId).catch(() => []);
  const net = buildNetwork(profile, boards);
  return NextResponse.json({ ok: true, op, tag: op === "undo" ? null : tag, ...net });
}
