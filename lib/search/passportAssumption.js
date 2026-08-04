// lib/search/passportAssumption.js — the influenced-assumption clause (r10).
//
// A broad cultural query ("oasis", "marilyn manson style") resolves to a
// culture entity whose interpretations the queryRouter already orders by the
// user's Passport (taste orders readings, never erases them). Until now that
// influence stopped at the reads panel — results only narrowed when the user
// clicked an interpretation pill. This clause carries the influence into the
// slate itself: when guidance is on and the user's taste genuinely overlaps
// the top reading, the rack narrows from the broad literal slate to the
// taste-favored reading's tag slate (rankByInterpretationTags — inclusion
// still requires an exact tag hit; bleed only orders).
//
// Deliberate guards, all declared:
//   - fires ONLY for guidance-enabled users with a real taste overlap
//     (tasteAffinity > 0) — anonymous and flat-profile users keep the broad
//     slate; the assumption is influence, never a default.
//   - fires ONLY on garment-noun-free queries. "oasis parka" already has
//     literal category evidence; the assumption must never fight catalog
//     truth, only refine breadth.
//   - never empties the rack: if the narrowed slate has fewer than MIN_KEEP
//     items the broad slate stands and the assumption reports why.
//   - explicit ?tags= pills override it entirely (the user's click is louder
//     than any assumption).
//   - SEARCH_PASSPORT_ASSUMPTION=0 kills it without a deploy.
//
// Every application is visible: the discover response carries an `assumption`
// object naming the entity, the reading, the affinity, and whether it was
// applied — honest influence, never silent.

import { orchestrateInterpretation } from "../asterisk/orchestrator.js";
import { GARMENT_CATEGORY } from "./index.js";
import { rankByInterpretationTags } from "../discover/tagRank.js";

const MIN_KEEP = 6;

export function assumptionEnabled() {
  return process.env.SEARCH_PASSPORT_ASSUMPTION !== "0";
}

const hasGarmentNoun = (q) => String(q).toLowerCase().split(/[^a-z]+/).some(
  (t) => GARMENT_CATEGORY[t] || GARMENT_CATEGORY[t.replace(/s$/, "")]
);

/**
 * Resolve whether the influenced-assumption clause applies to this query for
 * this user. Pure read — ranking happens in applyPassportAssumption so the
 * caller can report the resolution even when it declines to fire.
 */
export async function resolveSearchAssumption(query, userId) {
  const out = {
    applied: false, reason: null, entity: null, interpretationId: null,
    label: null, tags: [], tasteAffinity: 0,
  };
  if (!assumptionEnabled()) return { ...out, reason: "disabled" };
  if (!userId) return { ...out, reason: "anonymous" };
  if (hasGarmentNoun(query)) return { ...out, reason: "garment-noun query" };
  let interp = null;
  try { interp = await orchestrateInterpretation(query, userId); } catch { return { ...out, reason: "interpretation-error" }; }
  const entity = interp?.entity || null;
  const top = interp?.interpretations?.[0] || null;
  if (!entity || !top) return { ...out, reason: "no cultural entity" };
  out.entity = entity.name;
  out.interpretationId = top.id;
  out.label = top.label || null;
  out.tags = (top.tags || []).map((t) => t.toUpperCase());
  out.tasteAffinity = Number(top.tasteAffinity) || 0;
  if (!interp.personalized || out.tasteAffinity <= 0) return { ...out, reason: "no taste overlap" };
  if (!out.tags.length) return { ...out, reason: "reading carries no tags" };
  return { ...out, applied: true, reason: "taste-favored reading" };
}

/**
 * Apply a resolved assumption to a result slate. Returns the (possibly)
 * narrowed items plus the final assumption record for the response.
 */
export function applyPassportAssumption(items, assumption) {
  if (!assumption?.applied) return { items, assumption };
  const narrowed = rankByInterpretationTags(items, assumption.tags);
  if (narrowed.length < MIN_KEEP) {
    return { items, assumption: { ...assumption, applied: false, reason: "narrowed slate too thin" } };
  }
  return { items: narrowed, assumption };
}
