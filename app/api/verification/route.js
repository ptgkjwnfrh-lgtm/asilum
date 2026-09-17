// app/api/verification/route.js
// GET /api/verification?limit=&status=archivalist|flagged|agreed|pending
// The verification desk over the catalog: source claims beside a LOCAL-RULES
// reading of the listing text, field by field; a human sees only material
// conflicts. Mode is printed in the body — never a claim of AI research
// while the model is off (lib/verification/desk.js).

import { NextResponse } from "next/server";
import { buildDesk } from "../../../lib/verification/desk.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "60", 10) || 60, 1), 200);
  const status = url.searchParams.get("status") || null;
  const desk = buildDesk({ limit });
  const cases = status ? desk.cases.filter((c) => c.status === status) : desk.cases;
  // the human queue first, then flagged, then the rest — the desk reads top-down
  const order = { archivalist: 0, flagged: 1, pending: 2, agreed: 3 };
  cases.sort((a, b) => order[a.status] - order[b.status]);
  return NextResponse.json({ ...desk, cases: cases.slice(0, 60), shown: Math.min(cases.length, 60) });
}
