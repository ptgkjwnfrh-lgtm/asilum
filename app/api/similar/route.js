// app/api/similar/route.js
// GET /api/similar?user=<id>&limit=<n>
// TikTok-inspired cross-user layer, live: taste neighbors (profile cosine)
// and collaborative candidates scored from the canonical event history.
// Results carry their `via` provenance and honest scan-cap notes from
// lib/taste-graph — nothing here pretends to be a trained model.

import { NextResponse } from "next/server";
import { similarUsers, crossUserCandidates } from "../../../lib/taste-graph/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const claimedUser = (searchParams.get("user") || "").slice(0, 80);
  if (!claimedUser) return NextResponse.json({ error: "user required" }, { status: 400 });
  const user = await resolveRequestUser(req, claimedUser);
  if (!user) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const limit = Math.min(48, parseInt(searchParams.get("limit"), 10) || 10);

  const [neighbors, candidates] = await Promise.all([
    similarUsers(user, limit),
    crossUserCandidates(user, limit),
  ]);
  return NextResponse.json({ user, neighbors: neighbors.data, candidates: candidates.data });
}
