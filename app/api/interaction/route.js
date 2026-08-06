// app/api/interaction/route.js
// POST /api/interaction
// Body: { user, item: {id, tags}, action, dwellMs }
//   or  { user, events: [{ item, action, dwellMs }, ...] }  (batched dwell)
// action in share|save|favorite|dwell|skip|hide.
// Updates + persists the learned profile, logs the events, feeds the
// co-engagement graph (positive actions link the item to the user's recent
// engagements) and the popularity counters.

import { NextResponse } from "next/server";
import { learn } from "../../../lib/brain/index.js";
import { applyTimeDecay, noteActivity } from "../../../lib/brain/memory.js";
import {
  commitInteractionBatch, getProfile,
} from "../../../lib/db/index.js";
import { eventFromInteraction } from "../../../lib/events/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { resolveProducts, withReportedBridge } from "../../../lib/products.js";
import { consumeRateLimit, consumeGlobalBudget, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

const VALID = new Set(["bag", "share", "save", "favorite", "dwell", "skip", "hide"]);
const POSITIVE = new Set(["bag", "share", "save", "favorite"]);
const CO_ENGAGE_SPAN = 5; // link a new positive to this many recent engagements
const MAX_EVENTS = 20;

export async function POST(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const events = Array.isArray(body.events)
    ? body.events
    : [{ item: body.item, action: body.action, dwellMs: body.dwellMs }];
  if (!events.length || events.length > MAX_EVENTS) {
    return NextResponse.json({ error: `events must contain 1-${MAX_EVENTS} entries` }, { status: 413 });
  }
  if (events.some((e) => !e || !e.item || typeof e.item.id !== "string" ||
      !e.item.id || e.item.id.length > 80 || !VALID.has(e.action))) {
    return NextResponse.json(
      { error: "every event requires a known item id and valid action" },
      { status: 400 }
    );
  }
  const products = await resolveProducts(events.map((e) => e.item.id));
  if (products.size !== new Set(events.map((e) => e.item.id)).size) {
    return NextResponse.json({ error: "unknown product" }, { status: 400 });
  }
  const valid = events.map((event) => ({
    // Server inventory decides every product field; withReportedBridge only
    // re-attaches the client's whitelisted attribution so r16 tuning can see
    // which bridge earned the interaction (see lib/products.js).
    item: withReportedBridge(products.get(event.item.id), event.item._bridge),
    action: event.action,
    dwellMs: event.action === "dwell" && Number.isFinite(Number(event.dwellMs))
      ? Math.max(0, Math.min(600_000, Math.round(Number(event.dwellMs)))) : null,
  }));
  const quota = await consumeRateLimit({
    scope: "interaction", subject: userId, limit: 120, windowMs: 60_000, cost: valid.length,
  });
  if (!quota.allowed) {
    return NextResponse.json(rateLimitResponse(quota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) },
    });
  }
  // (audit #20) aggregate write breaker: a per-identity limit bounds one
  // caller, but accumulated device identities share no subject. Cost = batch
  // size so a 20-event batch draws 20 from the budget, matching the load it
  // puts on the profile/edge/popularity writes below.
  const globalQuota = await consumeGlobalBudget("interaction", valid.length);
  if (!globalQuota.allowed) {
    return NextResponse.json(rateLimitResponse(globalQuota), {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(globalQuota.retryAfterMs / 1000))) },
    });
  }
  const canonicalEvents = valid.map((e) =>
    eventFromInteraction(userId, e.action, e.item, e.dwellMs ?? null));
  if (canonicalEvents.some((event) => !event)) {
    return NextResponse.json({ error: "unsupported interaction action" }, { status: 400 });
  }
  // Anchors the reduce() may link FROM: the stored recent ring (which can
  // hold r17 pseudo-items), resolved against the catalog once, before the
  // transaction. Items resolved for THIS batch are already server-verified,
  // so they join the set directly — they enter the ring as the batch is
  // learned and would otherwise be filtered out of their own edges.
  const storedRecent = ((await getProfile(userId).catch(() => null))?._meta?.recent || [])
    .map(String).slice(0, 40);
  const anchors = new Set(valid.map((e) => e.item.id));
  if (storedRecent.length) {
    const resolved = await resolveProducts(storedRecent).catch(() => new Map());
    for (const id of resolved.keys()) anchors.add(id);
  }

  const commit = await commitInteractionBatch({
    userId,
    operationId: body.operationId,
    events: valid.map((e, i) => ({
      itemId: e.item.id, action: e.action, dwellMs: e.dwellMs, canonicalEvent: canonicalEvents[i],
    })),
    reduce(current) {
      let prof = applyTimeDecay(current || {}).profile;
      const edgePairs = [];
      const popularity = [];
      for (const { item, action, dwellMs } of valid) {
        const recentBefore = prof?._meta?.recent || [];
        prof = noteActivity(learn(prof, item, action, { dwellMs }), item, action);
        if (POSITIVE.has(action)) {
          const w = action === "bag" ? 2 : action === "share" ? 1.5 : 1;
          // BOTH endpoints must be real catalog products. `b` was already
          // server-resolved, but `a` came straight out of stored _meta.recent
          // and was never re-checked — and r17 pushes a pseudo-item
          // ("reading:<interpretationId>") into that ring. Those ids are
          // DETERMINISTIC AND GLOBAL, so the same phantom anchor is shared by
          // every user who applied the reading: corroborating one edge from it
          // would steer everyone who later applies that reading, bypassing the
          // catalog entirely. Anchors are filtered here, at the write.
          for (const rid of recentBefore.slice(0, CO_ENGAGE_SPAN)) {
            if (!anchors.has(rid)) continue;
            edgePairs.push({ a: rid, b: item.id, w });
          }
          popularity.push({ id: item.id, eng: 1 });
        } else if (action === "dwell" && dwellMs >= 4000) {
          popularity.push({ id: item.id, eng: 0.3 });
        }
      }
      return { profile: prof, edgePairs, popularity };
    },
  });

  return NextResponse.json({
    userId, applied: commit.duplicate ? 0 : valid.length, duplicate: commit.duplicate, profile: commit.profile,
  });
}
