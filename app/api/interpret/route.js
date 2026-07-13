// app/api/interpret/route.js
// GET /api/interpret?q=&user= — Asterisk AI's reading of a search query.
// Returns the resolved cultural entity + labeled interpretations (ordered by
// the caller's taste when identity proof is present), or entity: null when
// the query is not a known cultural reference. Identity is OPTIONAL here —
// interpretation is read-only over curated data; a missing/invalid proof just
// means unpersonalized ordering, never a 401 wall on public knowledge.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { interpretQuery } from "../../../lib/asterisk/queryRouter.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q || q.length > 120) {
    return NextResponse.json({ error: "q required (≤120 chars)" }, { status: 400 });
  }
  // Optional identity: personalizes interpretation ORDER only.
  const user = await resolveRequestUser(req, searchParams.get("user") || "").catch(() => null);
  const result = await interpretQuery(q, user || null);
  return NextResponse.json(result);
}
