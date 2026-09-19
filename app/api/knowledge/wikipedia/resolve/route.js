import { NextResponse } from "next/server";
import { verifiedRequestSubject } from "../../../../../lib/security/request.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../../lib/security/rateLimit.js";
import { queueWikipediaResolution } from "../../../../../lib/people/wikipedia/jobs.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const subject = verifiedRequestSubject(req);
  if (!subject) return NextResponse.json({ error: "signed device identity required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "wikipedia-resolve", subject, limit: 12, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  const kind = body?.kind == null ? null : body.kind;
  if (!name || (kind !== null && !["designer", "house"].includes(kind))) {
    return NextResponse.json({ error: "valid name and optional kind required" }, { status: 400 });
  }
  try {
    const job = await queueWikipediaResolution({ name, kind, requestedBy: "committed-search" });
    return NextResponse.json({ queued: true, jobKey: job.jobKey, status: job.status }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 400 });
  }
}
