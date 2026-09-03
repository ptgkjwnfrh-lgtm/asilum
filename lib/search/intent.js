// lib/search/intent.js — WHAT KIND OF QUESTION IS THIS?
//
// The first read of a query, before any constraint is parsed and before a
// single product is touched: is the reader naming a house, asking for
// something LIKE a house, reaching for a cultural reference, or simply
// describing a garment?
//
// Lifted out of lib/search/index.js so the answer to "where does it decide
// this is a brand query?" is a filename rather than a scroll position.
//
// BRAND SPELLING IS CORRECTED HERE AND NOWHERE ELSE. `resolveBrandSpelling`
// is why "balenciaga" reaches Balenciaga and "garcons" reaches Garçons — both
// sides of every comparison fold accents, and the skeleton match catches the
// rest. A correction made further down the pipeline would be invisible to the
// tiers above it.
//
// Imported and re-exported by lib/search/index.js, which stays the front door.

import { distance } from "fastest-levenshtein";
import { skeleton } from "./text.js";
import { houseForShortForm } from "../asterisk/houses.js";
import { lookupCulture } from "../asterisk/culture.js";
import { norm, tokens } from "./tokens.js";

export function getSearchIntent(query, brands = [], { brandSpelling = true } = {}) {
  const q = norm(query);
  const like = q.match(/^(?:like|similar to)\s+(.{2,60})$/);
  if (like) {
    const target = brandMatch(like[1], brands) ||
      houseForShortForm(like[1], brands) ||
      (brandSpelling ? resolveBrandSpelling(like[1], brands)?.brand : null);
    if (target) {
      const spelled = norm(target) !== norm(like[1]) ? { typed: like[1].trim(), resolved: target } : null;
      return { intent: "designer-similar", brand: target, brandSpelling: spelled };
    }
  }
  const exact = brandMatch(q, brands);
  if (exact) return { intent: "brand", brand: exact, brandSpelling: null };
  // A SHORT FORM IS A NAME. "cdg", "ysl" and "raf" routed to the cultural
  // tier and passed straight over the house that is in stock; a curated
  // short form (lib/asterisk/houses.js) is a lookup, not a guess, and it is
  // disclosed like every other reading.
  const shortForm = houseForShortForm(q, brands);
  if (shortForm) {
    return { intent: "brand", brand: shortForm, brandSpelling: { typed: q, resolved: shortForm } };
  }
  // A KNOWN REFERENCE IS NOT A MISSPELLED HOUSE. MEASURED: "the crow" has a
  // skeleton one edit from "the row", so the spelling resolver quietly served
  // The Row's rack for a film the culture catalog knows by name. A curated
  // entity beats a fuzzy guess, always.
  const spelled = brandSpelling && !lookupCulture(q) ? resolveBrandSpelling(q, brands) : null;
  if (spelled) {
    return { intent: "brand", brand: spelled.brand, brandSpelling: { typed: q, resolved: spelled.brand } };
  }
  return { intent: "text" };
}

// A HOUSE NAME TYPED THE WAY PEOPLE TYPE IT (Aug 21). MEASURED: "rickowens"
// returned 621 items, "junyawatanabe" 529, "commedesgarcons" 474,
// "balenciga" 784 — each a compositional dump under a note saying the word
// matched nothing, when the word was a house this catalog stocks. This is a
// LOOKUP against the real 64-name brand list, not a guess: the query and the
// name are compared as skeletons (accent-folded, de-spaced), and a near miss
// is accepted only when exactly ONE name is closest. Ambiguity falls through
// rather than picking, and every resolution is disclosed.
//
// Whole query only. "commedesgarcons jacket" still goes the ordinary route —
// finding a house name inside a longer query is a different, riskier problem
// and this round does not claim it.
export function resolveBrandSpelling(q, brands = []) {
  const qs = skeleton(q);
  if (qs.length < 6) return null;
  for (const b of brands) if (skeleton(b) === qs) return { brand: b, distance: 0 };
  const budget = qs.length >= 15 ? 3 : qs.length >= 9 ? 2 : 1;
  let best = null, bestD = budget + 1, tied = false;
  for (const b of brands) {
    const bs = skeleton(b);
    if (!bs || Math.abs(bs.length - qs.length) > budget) continue;
    const d = distance(qs, bs);
    if (d < bestD) { best = b; bestD = d; tied = false; }
    else if (d === bestD && b !== best) tied = true;
  }
  if (!best || bestD > budget || tied) return null;
  return { brand: best, distance: bestD };
}

/**
 * The brand a query names, matched exactly then by accent-fold and skeleton.
 *
 * Exported because searchProducts needs it too — it was module-private in
 * index.js, and moving it here without exporting broke five tests that the
 * 28-query identity snapshot never reached. Private-by-default is right for a
 * helper; this one has two callers.
 */
export function brandMatch(q, brands) {
  const n = norm(q);
  if (!n) return null;
  // The partial rule is WORD-BOUNDARY, not substring. MEASURED: a bare
  // `includes` let "sand" capture Jil Sander and "tan" capture a brand it
  // shares four letters with, turning "sand trousers" into a designer query
  // and silently deleting the disclosure that "sand" matched nothing. A whole
  // word inside a house name is a real, if partial, reading — "green" IS the
  // Green in Craig Green — and the engine now says so out loud instead of
  // pretending the word was content. Half a word never was one.
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const whole = new RegExp("\\b" + esc(n) + "\\b");
  return (
    brands.find((b) => norm(b) === n) ||
    brands.find((b) => n.length >= 4 && whole.test(norm(b))) ||
    null
  );
}

/**
 * Widen a query through the search-mapping table: "gorpcore" -> the tags a
 * gorpcore piece actually carries.
 *
 * A curated phrase table, not inference. Returns `{ mappedTags, relatedTerms,
 * mappingHits }`; `mappingHits` names which phrases fired, so a reading can be
 * explained to a reader rather than asserted.
 *
 * Single-word phrases match a query TOKEN; longer phrases must appear in the
 * query text — otherwise a one-word mapping would fire on any substring and
 * every query would drag in tags nobody asked for.
 */
export function expandQueryToTags(query, mappings, qTokensOverride = null) {
  const q = norm(query);
  const qTokens = qTokensOverride || tokens(query);
  const mappedTags = new Set();
  const relatedTerms = new Set();
  const hits = [];
  for (const m of mappings) {
    const phrase = m.searchPhrase;
    const match =
      q === phrase ||
      q.includes(phrase) ||
      (tokens(phrase).length === 1 && qTokens.includes(phrase));
    if (!match) continue;
    hits.push(phrase);
    for (const t of m.mappedTags || []) mappedTags.add(norm(t));
    for (const t of m.relatedTerms || []) relatedTerms.add(norm(t));
  }
  return { mappedTags: [...mappedTags], relatedTerms: [...relatedTerms], mappingHits: hits };
}
