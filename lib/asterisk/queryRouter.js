// lib/asterisk/queryRouter.js
// Asterisk AI — query classification + entity resolution v1.
// A search box entry may be a brand, a garment, an aesthetic, a film, a
// sound, a city, a decade… This router decides WHAT was asked before anything
// decides what to show. v1 resolves against the curated culture records and
// returns clearly labeled interpretations; anything unresolved falls through
// to the standard search engine (lib/search) — honestly, with entity: null.
//
// Ambiguity is handled without interrupting the user: ALL interpretations are
// returned, ordered by the user's taste profile (the brief: taste decides
// which reading appears first, never which readings exist).

import { lookupCulture } from "./culture.js";
import { aestheticTrend } from "./trends.js";
import { getUserStyleProfile } from "../ai/styleProfile.js";

// Overlap between an interpretation's tags and the profile's dominant
// aesthetics — used ONLY for ordering, never for filtering readings out.
function tasteAffinity(interp, profile) {
  if (!profile?.dominantAesthetics?.length) return 0;
  const weights = Object.fromEntries(
    profile.dominantAesthetics.map((d) => [d.tag.toLowerCase(), d.weight]));
  let s = 0;
  for (const t of interp.tags || []) s += weights[t.toLowerCase()] || 0;
  return +s.toFixed(3);
}

/**
 * Classify a query and resolve its cultural entity, if any.
 * @returns {{ queryType, entity: {name, kind, note, knowledge}|null,
 *             interpretations: [], personalized: boolean }}
 * Never throws. entity: null = "not a known cultural reference — standard
 * search applies" (an honest miss, not a guess).
 */
export async function interpretQuery(query, userId = null) {
  const rec = lookupCulture(query);
  if (!rec) return { queryType: "standard", entity: null, interpretations: [], personalized: false };

  let profile = null;
  if (userId) profile = await getUserStyleProfile(userId).catch(() => null);

  const interpretations = rec.interpretations
    .map((i) => ({ ...i, tasteAffinity: tasteAffinity(i, profile) }))
    .sort((a, b) => b.tasteAffinity - a.tasteAffinity || b.confidence - a.confidence);

  return {
    queryType: "culture:" + rec.kind,
    entity: { name: rec.name, kind: rec.kind, note: rec.note || null,
              knowledge: {
                provenance: rec.provenance || rec.interpretations[0]?.provenance || null,
                sourceUrls: rec.sourceUrls || [],
                approvedAt: rec.approvedAt || null,
              },
              // Lifecycle calls live in ONE place (lib/asterisk/trends.js),
              // resolved at read time — culture records carry no trend data.
              trend: aestheticTrend(rec.name) },
    interpretations,
    personalized: !!(profile && profile.dominantAesthetics?.length),
  };
}
