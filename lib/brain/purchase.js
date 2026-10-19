// lib/brain/purchase.js — A PURCHASE TEACHES THE BRAIN (interconnections round,
// 19 Sep 2026).
//
// Until now the brain learned from bag, share, save, favourite, open, dwell,
// skip and hide — and never from the one act that costs money. A paid sale
// order and a self-reported "bought" / "kept" outcome are the strongest taste
// evidence the product has, and they were written to the ledger and the
// event log and then ignored by every ranking surface.
//
// LAWS.
//   * The signal comes from the SERVER'S OWN RECORDS — the order ledger's
//     paid transition or the ticket store's outcome — never from a client
//     claim. /api/interaction still refuses a "purchase" action.
//   * Idempotent per record: the operation id is the order or ticket id, so
//     a redelivered webhook or a repeated outcome report learns once.
//   * Consent is respected. The outcome path passes the request's consent
//     state; the webhook path has no request and learns only for a reader
//     who already has a profile — someone the terminal has learned from
//     before under their consent — and whose guidance is not switched off.
//   * The ad firewall holds: a sponsored piece may teach the reader's own
//     profile but never enters the organic edge graph or the popularity
//     counters (same rule as app/api/interaction/route.js).
//   * Never blocks settlement: callers fire and forget; a failure here is
//     logged, and the payment, the ticket and the event stay exactly as they
//     were.

import { resolveProducts, isSponsoredContent } from "../products.js";
import { commitInteractionBatch } from "../db/core/interactions.js";
import { getProfile } from "../db/index.js";
import { getMemoryPreferences } from "../db/production.js";
import { buildEvent, EVENTS } from "../events/index.js";
import { learn } from "./index.js";
import { applyTimeDecay, noteActivity } from "./memory.js";
import { observationAllowed } from "../consent.js";
import { POLICY_VERSION } from "./policy.js";

export const PURCHASE_ACTION = "purchase";
const PURCHASE_CO_ENGAGE_SPAN = 5;   // as the interaction route links a positive act (its CO_ENGAGE_SPAN)
const EDGE_WEIGHT = 2.5;    // above bag (2): the reader paid for it
const POPULARITY_ENG = 1.5;

/**
 * @param {{ userId: string, itemId: string, kind: "paid"|"reported", ref: string, consent?: string|null }} input
 *   kind "paid" = a sale order the processor settled; "reported" = the reader said bought/kept.
 *   ref = the order id or `ticket-<id>`; it is the idempotency key.
 * @returns {{ learned: boolean, reason?: string, duplicate?: boolean }}
 */
export async function learnFromPurchase({ userId, itemId, kind, ref, consent = null }) {
  if (!userId || !itemId || !ref) return { learned: false, reason: "incomplete" };
  if (kind !== "paid" && kind !== "reported") return { learned: false, reason: "unknown kind" };
  if (consent != null && !observationAllowed(consent, "explicit")) {
    return { learned: false, reason: "consent: the terminal does not learn for this reader" };
  }
  if (consent == null) {
    // no request to read consent from (a webhook): learn only for a reader
    // the terminal already knows under their standing choices
    const [profile, prefs] = await Promise.all([
      getProfile(userId).catch(() => null),
      getMemoryPreferences(userId).catch(() => null),
    ]);
    const known = profile && Object.keys(profile.long || profile).some((k) => k !== "_meta");
    if (!known) return { learned: false, reason: "no profile: the reader has not consented to learning yet" };
    if (prefs && prefs.guidanceEnabled === false) return { learned: false, reason: "guidance is switched off" };
  }
  const products = await resolveProducts([itemId]).catch(() => new Map());
  const item = products.get(itemId);
  if (!item) return { learned: false, reason: "the piece is not in the catalog" };
  const storedProfile = await getProfile(userId).catch(() => null);
  const anchors = new Set([item.id]);
  const recent = (storedProfile?._meta?.recent || []).map(String).slice(0, 40);
  if (recent.length) {
    const resolved = await resolveProducts(recent).catch(() => new Map());
    for (const id of resolved.keys()) anchors.add(id);
  }
  const canonicalEvent = buildEvent(userId,
    kind === "paid" ? EVENTS.USER_COMPLETED_PURCHASE : EVENTS.USER_REPORTED_PURCHASE,
    { itemId: item.id, brand: item.brand || null, ref, learned: true, policyVersion: POLICY_VERSION });
  const commit = await commitInteractionBatch({
    userId,
    operationId: `purchase-${kind}-${String(ref).replace(/[^A-Za-z0-9_-]/g, "-")}`.slice(0, 80),
    events: [{ itemId: item.id, action: PURCHASE_ACTION, dwellMs: null, canonicalEvent }],
    reduce(current) {
      let prof = applyTimeDecay(current || {}).profile;
      const recentBefore = prof?._meta?.recent || [];
      prof = noteActivity(learn(prof, item, PURCHASE_ACTION), item, PURCHASE_ACTION);
      const edgePairs = [];
      const popularity = [];
      if (!isSponsoredContent(item)) {
        for (const rid of recentBefore.slice(0, PURCHASE_CO_ENGAGE_SPAN)) {
          if (!anchors.has(rid) || rid === item.id) continue;
          edgePairs.push({ a: rid, b: item.id, w: EDGE_WEIGHT });
        }
        popularity.push({ id: item.id, eng: POPULARITY_ENG });
      }
      return { profile: prof, edgePairs, popularity };
    },
  });
  return { learned: !commit.duplicate, duplicate: !!commit.duplicate };
}

/** Fire-and-forget wrapper for settlement paths: never throws, never blocks. */
export function learnFromPurchaseQuietly(input) {
  return learnFromPurchase(input).catch((error) => {
    console.error("[purchase-learning] failed", input?.ref, error?.message || error);
    return { learned: false, reason: "failed" };
  });
}
