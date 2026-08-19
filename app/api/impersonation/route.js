// app/api/impersonation/route.js — the public door to Feature G's
// impersonation track (gap 1, 18 Aug).
//
// POST { user, brandName, realWorkUrl, fakeUrl?, note? }
//   → opens a REAL brand_cases impersonation case (open → under_review)
//     and files the moderation task a human works through. Signed-in
//     accounts only: a report is a named accusation, and the ledger
//     records who opened it. Nothing is auto-judged — upheld/dismissed/
//     enforced are human transitions with evidence (v18 law).
//
// The reporter gets the case id back — an acknowledgement, not a verdict.

import { NextResponse } from "next/server";
import { openImpersonationReport } from "../../../lib/db/production.js";
import { accountIdFromIdentity, resolveRequestUser } from "../../../lib/identity.js";
import { validBrandName } from "../../../lib/business.js";
import { safeExternalUrl } from "../../../lib/url.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const accountId = accountIdFromIdentity(user);
  if (!accountId) {
    return NextResponse.json({
      error: "impersonation reports ride on a signed-in account",
      note: "a report is a named accusation — sign in first",
    }, { status: 403 });
  }
  const quota = await consumeRateLimit({ scope: "impersonation-report", subject: user, limit: 3, windowMs: 24 * 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  const brandName = validBrandName(body.brandName);
  if (!brandName) return NextResponse.json({ error: "brand name must be 2-80 characters" }, { status: 400 });
  const realWorkUrl = safeExternalUrl(String(body.realWorkUrl || ""));
  if (!realWorkUrl) {
    return NextResponse.json({ error: "a public https link to the REAL work is required evidence" }, { status: 400 });
  }
  const evidenceUrls = [realWorkUrl];
  if (body.fakeUrl) {
    const fakeUrl = safeExternalUrl(String(body.fakeUrl));
    if (!fakeUrl) return NextResponse.json({ error: "the link to the fake must be a public https url" }, { status: 400 });
    evidenceUrls.push(fakeUrl);
  }
  const note = body.note ? String(body.note).slice(0, 500) : undefined;

  try {
    const { caseId } = await openImpersonationReport({
      reporterAccountId: accountId, brandName, evidenceUrls, note,
    });
    return NextResponse.json({
      received: true,
      case: caseId,
      note: "a named human adjudicates — the case ledger records every step",
    });
  } catch (err) {
    return NextResponse.json({ error: err && err.message ? err.message.slice(0, 200) : "report refused" }, { status: 400 });
  }
}
