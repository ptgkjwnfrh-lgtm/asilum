// app/api/interpret/route.js
// GET  /api/interpret?q=&user= — Asterisk AI's reading of a search query.
//   Legacy fields (entity/interpretations/personalized) are preserved; the
//   response ADDITIVELY carries `interpretation` — the versioned contract
//   (lib/asterisk/interpretationSchema.js) with method, alternatives,
//   SEPARATED confidence, assumptions, and a research flag. The
//   deterministic router remains layer 1; the orchestrator adds ambiguity,
//   composition, misspelling recovery, and lexicon best-effort — all
//   deterministic, no model calls.
// POST /api/interpret — "is this what you meant?" feedback. Identity
//   REQUIRED (a verdict is a personal fact). Influences only THIS user's
//   future orderings; global knowledge changes only via reviewed research.
// Identity on GET stays OPTIONAL — public knowledge never gets a 401 wall.

import { NextResponse } from "next/server";
import { resolveRequestUser } from "../../../lib/identity.js";
import { orchestrateInterpretation, normalizeQuery } from "../../../lib/asterisk/orchestrator.js";
import { INTERPRETATION_CONTRACT_VERSION } from "../../../lib/asterisk/interpretationSchema.js";
import { inventoryRepresentationConfidence } from "../../../lib/asterisk/confidence.js";
import { noteUnknownQuery } from "../../../lib/asterisk/unknownQueries.js";
import { listInterpretationFeedback, recordInterpretationFeedback } from "../../../lib/db/production.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

async function inventoryConfidence(contract) {
  // Best-effort inventory representation: count live items matching the
  // reading's tag signals. Never fabricated — 0 when nothing matches.
  try {
    const tags = contract.attributes?.tags
      || Object.fromEntries((contract.interpretations[0]?.tags || []).map((t) => [t.toUpperCase(), 1]));
    const keys = Object.keys(tags);
    if (!keys.length) return null;
    const { listItems } = await import("../../../lib/db/index.js");
    const pool = await listItems(1000).catch(() => []);
    const matched = pool.filter((it) => keys.some((t) => (it.tags || {})[t])).length;
    return inventoryRepresentationConfidence({ matchedItems: matched, requested: 24 });
  } catch {
    return null;
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const quota = await consumeRateLimit({
    scope: "interpret", subject: requestSubject(req), limit: 180, windowMs: 60_000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const q = (searchParams.get("q") || "").trim();
  if (!q || q.length > 200) {
    return NextResponse.json({ error: "q required (≤200 chars)" }, { status: 400 });
  }
  const user = await resolveRequestUser(req, searchParams.get("user") || "").catch(() => null);
  const feedback = user ? await listInterpretationFeedback(user, normalizeQuery(q)).catch(() => []) : [];

  const contract = await orchestrateInterpretation(q, user || null, feedback);
  const inventory = await inventoryConfidence(contract);
  const interpretation = { ...contract, confidence: { ...contract.confidence, inventoryRepresentation: inventory } };

  // Unresolved/flagged queries feed demand aggregation (flag-gated,
  // hashed identity, abuse-screened) — never automatic learning.
  if (interpretation.flaggedForResearch) {
    // Await the write: an unobserved promise can be frozen when a serverless
    // request returns, silently losing the demand signal.
    await noteUnknownQuery(interpretation.normalizedQuery, user || requestSubject(req), interpretation.method);
  }

  // Legacy shape preserved for existing consumers (discover strip et al).
  return NextResponse.json({
    queryType: contract.entity ? "culture:" + contract.entity.kind : "standard",
    entity: contract.entity,
    interpretations: contract.interpretations,
    personalized: contract.personalized,
    interpretation,
  });
}

export async function POST(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "interpret-feedback", subject: user, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  const nq = normalizeQuery(body.query);
  const interpretationId = String(body.interpretationId || "").slice(0, 120);
  const verdict = body.verdict === "meant" ? "meant" : body.verdict === "not-meant" ? "not-meant" : null;
  if (!nq || !interpretationId || !verdict) {
    return NextResponse.json({ error: "query, interpretationId, verdict (meant|not-meant) required" }, { status: 400 });
  }
  const saved = await recordInterpretationFeedback({
    userId: user, normalizedQuery: nq, interpretationId,
    contractVersion: INTERPRETATION_CONTRACT_VERSION, verdict,
  });
  return NextResponse.json({ ok: true, feedback: saved });
}
