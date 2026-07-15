// app/api/asterisk/memory/route.js
// GET  ?user=<uid> → the versioned Asterisk memory contract (ADR-001 v1):
//      what you told us / what we inferred / what Asterisk learned /
//      uncertainty + controls. Identity-gated; aggregates existing stores.
// POST { hiddenSections: [...] } → section visibility preferences — the only
//      write path this surface owns. All other mutations use their existing
//      endpoints (listed in the payload's controls.forget).

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../../lib/identity.js";
import { asteriskMemory, MEMORY_SECTIONS } from "../../../../lib/asterisk/memory.js";
import { saveMemoryPreferences } from "../../../../lib/db/production.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../../lib/security/json.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = await resolveRequestUser(req, searchParams.get("user") || "");
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "asterisk-memory-read", subject: user, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const r = await asteriskMemory(user);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ memory: r.memory });
}

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 4 * 1024 });
  if (parsed.response) return parsed.response;
  const user = await resolveRequestUser(req, String(parsed.body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "asterisk-memory-write", subject: user, limit: 30, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const hidden = parsed.body.hiddenSections;
  if (!Array.isArray(hidden) || hidden.length > MEMORY_SECTIONS.length ||
      !hidden.every((s) => MEMORY_SECTIONS.includes(s)) ||
      new Set(hidden).size !== hidden.length) {
    return NextResponse.json(
      { error: `hiddenSections must be unique values from: ${MEMORY_SECTIONS.join(", ")}` },
      { status: 400 });
  }
  const preferences = await saveMemoryPreferences(user, hidden);
  return NextResponse.json({ preferences });
}
