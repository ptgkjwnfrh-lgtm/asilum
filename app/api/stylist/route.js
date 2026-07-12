// app/api/stylist/route.js
// The AI-ready stylist service endpoint (UI-independent; /stylist page and
// /api/outfits keep working unchanged).
// POST { user, kind:"request", requestText?, occasion?, mood?, budgetMin?,
//        budgetMax?, sizePreferences?, colorPreferences?, excludedTags?,
//        useMoodBoardBrain? }
//   → persists the request, generates outfits (local rules today, model seam
//     when enabled), persists each outfit with its reasoning, returns them.
// POST { user, kind:"feedback", outfitId, feedbackType, feedbackNotes?,
//        saved?, rejected?, purchased? }
//   → records feedback on an outfit the user owns (fuels avoided_tags).
// Identity: resolveRequestUser proof on every call.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import {
  generateStylistOutfits, recordStylistFeedback, getStylistOutfit,
} from "../../../lib/ai/stylistReasoningEngine.js";

export const dynamic = "force-dynamic";

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const strList = (v, cap) => (Array.isArray(v) ? v.slice(0, cap).map((x) => String(x).slice(0, 40)) : []);

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });

  if (body.kind === "feedback") {
    const outfit = await getStylistOutfit(body.outfitId).catch(() => null);
    if (!outfit || outfit.userId !== user) {
      return NextResponse.json({ error: "outfit not found" }, { status: 404 });
    }
    try {
      const rec = await recordStylistFeedback({
        userId: user, stylistOutfitId: outfit.id,
        feedbackType: String(body.feedbackType || "note"),
        feedbackNotes: body.feedbackNotes ? String(body.feedbackNotes) : null,
        saved: body.saved === true, rejected: body.rejected === true, purchased: body.purchased === true,
      });
      return NextResponse.json({ ok: true, id: rec.id, persistent: rec.persistent });
    } catch {
      return NextResponse.json({ error: "feedback write failed" }, { status: 500 });
    }
  }

  // Default: outfit request.
  const request = {
    requestText: body.requestText ? String(body.requestText).slice(0, 400) : null,
    occasion: body.occasion ? String(body.occasion).slice(0, 80) : null,
    mood: body.mood ? String(body.mood).slice(0, 80) : null,
    budgetMin: num(body.budgetMin),
    budgetMax: num(body.budgetMax),
    sizePreferences: strList(body.sizePreferences, 8),
    colorPreferences: strList(body.colorPreferences, 8),
    excludedTags: strList(body.excludedTags, 16),
    useMoodBoardBrain: body.useMoodBoardBrain !== false,
  };
  const result = await generateStylistOutfits(user, request);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, requestId: result.requestId || null },
      { status: /no available|no coherent/.test(result.error) ? 200 : 500 }
    );
  }
  return NextResponse.json({
    ok: true, requestId: result.requestId, source: result.source,
    outfits: result.outfits.map((o) => ({
      id: o.id, name: o.outfitName, summary: o.outfitSummary,
      productIds: (o.items || []).map((it) => it.id),
      items: o.items, matchedTags: o.matchedTags,
      colorLogic: o.colorLogic, silhouetteLogic: o.silhouetteLogic,
      aestheticLogic: o.aestheticLogic, matchScore: o.matchScore,
      warnings: o.warnings || [], persistent: o.persistent,
    })),
  });
}
