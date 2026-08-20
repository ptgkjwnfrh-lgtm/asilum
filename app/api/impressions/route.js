// app/api/impressions/route.js
// POST /api/impressions — the examined-slot beacon (r19).
// Body: { user, serveId, examined: [itemId, ...] }
//
// r16's tuning denominator used to be every slot the server SENT, which bakes
// position bias into the training signal: nobody scrolls 60 slots, so bridges
// filling deep slots banked impressions no eye reached. This endpoint reports
// the slots the client's IntersectionObserver actually saw.
//
// The client reports WHICH slots, never what they were: the bridge for each id
// comes from the server's own record of that serve (profile._meta.lastServe),
// so a client cannot attribute engagement to a bridge of its choosing. One
// report per serve, ids capped, unknown ids dropped.

import { NextResponse } from "next/server";
import { applyExaminationReport } from "../../../lib/brain/index.js";
import { examinedBridgeCounts, examinedImpressionsEnabled, MAX_EXAMINED_PER_SERVE } from "../../../lib/brain/attribution.js";
import { mutateProfile, getProfile, bumpPopularity } from "../../../lib/db/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { consentState, observationAllowed } from "../../../lib/consent.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  // D4: examined-slot reporting is passive observation — it needs OBSERVE.
  if (!observationAllowed(consentState(req), "passive")) {
    return NextResponse.json({ observed: false });
  }
  if (!examinedImpressionsEnabled()) {
    return NextResponse.json({ userId, applied: 0, disabled: true });
  }

  const serveId = String(body.serveId || "");
  const examined = Array.isArray(body.examined) ? body.examined : null;
  if (!serveId || serveId.length > 80 || !examined) {
    return NextResponse.json({ error: "serveId and examined[] are required" }, { status: 400 });
  }
  if (examined.length > MAX_EXAMINED_PER_SERVE) {
    return NextResponse.json({ error: `examined exceeds ${MAX_EXAMINED_PER_SERVE}` }, { status: 413 });
  }

  const quota = await consumeRateLimit({
    scope: "impressions", subject: userId, limit: 60, windowMs: 60_000,
  });
  if (!quota.allowed) {
    return NextResponse.json(rateLimitResponse(quota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) },
    });
  }

  let applied = 0, dropped = 0;
  try {
    const before = await getProfile(userId);
    const last = before?._meta?.lastServe;
    const known = last && last.id === serveId;
    // Say what actually happened: a replay of an already-reported serve
    // applies nothing, and reporting "applied: 12" for it would be the same
    // species of lie this round exists to remove.
    if (known && last.reported) {
      return NextResponse.json({ userId, applied: 0, dropped: 0, duplicate: true });
    }
    const servedBridges = known ? (last.bridges || {}) : {};
    const { counts, examined: n, dropped: d } = examinedBridgeCounts(examined, servedBridges);
    applied = n; dropped = d;
    if (n > 0) {
      await mutateProfile(userId, (current) => applyExaminationReport(current, serveId, counts));
      // (Aug 6) Global exposure is counted HERE, from slots this identity
      // actually examined and was actually served — one person counts once
      // per item, enforced by the ledger's primary key. The old rule counted
      // every served slot on a GET, which let one identity aim ~3600
      // impressions a minute at a chosen item and bury it for everyone.
      const seenIds = [...new Set(examined.map(String))].filter((id) => servedBridges[id]);
      if (seenIds.length) {
        await bumpPopularity(seenIds.map((id) => ({ id, imp: 1 })), userId).catch(() => {});
      }
    }
  } catch {
    // A lost beacon must never fail the page — the fallback denominator holds.
    return NextResponse.json({ userId, applied: 0, dropped: 0 });
  }
  return NextResponse.json({ userId, applied, dropped });
}
