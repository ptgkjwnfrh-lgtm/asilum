// app/api/stats/route.js
// GET /api/stats — aggregate health metrics for the brain: interaction volume
// by action, user/board/graph sizes, and the most-engaged items. Read by the
// /stats dashboard so algorithm changes can be judged against real behavior.

import { NextResponse } from "next/server";
import { getStats } from "../../../lib/db/index.js";
import { CATALOG } from "../../../lib/ingest/catalog.js";

export const dynamic = "force-dynamic";

const BY_ID = new Map(CATALOG.map((it) => [it.id, it]));

export async function GET() {
  const stats = await getStats();
  stats.topItems = stats.topItems.map((t) => {
    const it = BY_ID.get(t.id);
    return {
      ...t,
      title: it ? it.title : t.id,
      brand: it ? it.brand : "",
      rate: t.imp > 0 ? +(t.eng / t.imp).toFixed(3) : null,
    };
  });
  return NextResponse.json(stats);
}
