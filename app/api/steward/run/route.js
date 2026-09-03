// app/api/steward/run/route.js — the steward, fired by the clock.
//
// vercel.json schedules this daily. Vercel sends `Authorization: Bearer
// $CRON_SECRET`; lib/steward/cronGate.js answers 503 until that secret is set
// on the deployment and 401 to anyone else. GET because that is what Vercel
// Cron sends; POST for a person with the secret.
//
// What one firing does: read the board, plan the repairs, make the DELEGATED
// ones (lib/steward/decisions.js — reversible, capped, ledgered), and return
// the whole thing as JSON so the invocation log is the report. Confirm-tier
// repairs are planned and named, never made here — nobody is present to say
// yes. The seven instruments do not run here either: ~20s of CPU does not fit
// a serverless budget, and a permanently unmeasurable section is how a board
// gets ignored; the GitHub Actions run carries them.
//
// `supabase/` is not in this bundle, so the ledger check runs in holes-only
// mode and says so in its own evidence.

import { NextResponse } from "next/server";
import { cronGate } from "../../../../lib/steward/cronGate.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fire(req) {
  const gate = cronGate(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const [{ actSteward, exitCodeFor, transactorFor }, { getPool }] = await Promise.all([
    import("../../../../lib/steward/index.js"),
    import("../../../../lib/db/index.js"),
  ]);
  const pool = await getPool();
  const out = await actSteward({
    query: pool ? (sql, params) => pool.query(sql, params) : null,
    transact: transactorFor(pool),
    now: new Date().toISOString(),
  }, { actor: "steward:cron", firedBy: "cron" });
  return NextResponse.json({
    ranAt: out.report.ranAt,
    exitCode: exitCodeFor(out.report),
    summary: out.report.summary,
    attention: out.report.attention.map((f) => ({ id: f.id, state: f.state, evidence: f.evidence })),
    hands: out.hands,
    runId: out.runId,
    plans: out.plans.map((p) => ({ actionId: p.actionId, tier: p.tier, count: p.count, evidence: p.evidence })),
    acts: out.acts,
  });
}

export async function GET(req) { return fire(req); }
export async function POST(req) { return fire(req); }
