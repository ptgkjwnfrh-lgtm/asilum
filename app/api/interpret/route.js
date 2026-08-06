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
import {
  getMemoryPreferences, listInterpretationFeedback, recordInterpretationFeedback,
} from "../../../lib/db/production.js";
import { consumeRateLimit, consumeGlobalBudget, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../lib/security/request.js";
import { learn } from "../../../lib/brain/index.js";
import { mutateProfile, recordEvent } from "../../../lib/db/index.js";
import { buildEvent, EVENTS } from "../../../lib/events/index.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

async function inventoryConfidence(contract) {
  // Inventory representation from live, DISCOVERABLE inventory only: the
  // count query mirrors isDiscoverableProduct, so hidden, sold, removed, or
  // unavailable rows cannot inflate the claim, and no row scan crosses into
  // application memory. Never fabricated — 0 when nothing matches, null when
  // inventory is unreadable (an outage must not report as confidence).
  try {
    const tags = contract.attributes?.tags
      || Object.fromEntries((contract.interpretations[0]?.tags || []).map((t) => [t.toUpperCase(), 1]));
    const keys = Object.keys(tags);
    if (!keys.length) return null;
    const { countDiscoverableProductsByTags } = await import("../../../lib/products.js");
    const matched = await countDiscoverableProductsByTags(keys);
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
  const globalQuota = await consumeGlobalBudget("interpret");
  if (!globalQuota.allowed) {
    return NextResponse.json(rateLimitResponse(globalQuota), {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(globalQuota.retryAfterMs / 1000))) },
    });
  }
  const q = (searchParams.get("q") || "").trim();
  if (!q || q.length > 200) {
    return NextResponse.json({ error: "q required (≤200 chars)" }, { status: 400 });
  }
  const user = await resolveRequestUser(req, searchParams.get("user") || "").catch(() => null);
  const guidanceEnabled = !!user &&
    (await getMemoryPreferences(user).catch(() => ({ guidanceEnabled: false }))).guidanceEnabled !== false;
  const feedback = guidanceEnabled
    ? await listInterpretationFeedback(user, normalizeQuery(q)).catch(() => []) : [];

  const contract = await orchestrateInterpretation(q, guidanceEnabled ? user : null, feedback);
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
    guidanceEnabled,
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
  // (audit #20) aggregate write breaker — feedback POST records a verdict row
  // and may mutate the profile (an applied reading trains taste).
  const globalQuota = await consumeGlobalBudget("interpret-feedback");
  if (!globalQuota.allowed) {
    return NextResponse.json(rateLimitResponse(globalQuota), {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(globalQuota.retryAfterMs / 1000))) },
    });
  }

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

  // (r17) the search→brain loop: an APPLIED reading is the user saying
  // "this is what I meant" — the one moment a search becomes a taste
  // signal. Law, all enforced here: tags resolve SERVER-SIDE from the
  // culture catalog (the client's tags are never trusted); only catalog
  // readings train (composed/lexical ids resolve to nothing); guidance off
  // = no training; the canonical event persists BEFORE the derived profile
  // mutation (day-8 retry-safe law); training is one bounded "save"-weight
  // learn() — decay, halo and clamps included. Ignored readings train
  // nothing because this endpoint only hears about applied ones, and GET
  // stays side-effect-free (day-5 law). SEARCH_BRAIN_LOOP=0 kills it.
  let trained = null;
  if (verdict === "meant" && process.env.SEARCH_BRAIN_LOOP !== "0") {
    try {
      const interp = await orchestrateInterpretation(nq, null);
      const reading = (interp?.interpretations || []).find((i) => i.id === interpretationId);
      const guidanceEnabled =
        (await getMemoryPreferences(user).catch(() => ({ guidanceEnabled: false }))).guidanceEnabled !== false;
      if (reading?.tags?.length && guidanceEnabled) {
        // One applied reading carries ONE item's worth of signal, spread
        // across its tags — measured 8/5: un-normalized multi-tag training
        // collapsed a standing dominant taste from 23 to 7 of the top 24
        // in a single click. A reading is a signal, not a takeover.
        const conf = Math.max(0.3, Math.min(1, Number(reading.confidence) || 0.7)) / reading.tags.length;
        const tags = Object.fromEntries(reading.tags.map((t) => [String(t).toUpperCase(), conf]));
        await recordEvent(buildEvent(user, EVENTS.USER_SEARCHED_QUERY, {
          query: nq, interpretationId, tags: reading.tags,
        }));
        await mutateProfile(user, (current) => learn(current || {}, { id: "reading:" + interpretationId, tags }, "save"));
        trained = { interpretationId, tags: reading.tags };
      }
    } catch { trained = null; }
  }
  return NextResponse.json({ ok: true, feedback: saved, trained });
}
