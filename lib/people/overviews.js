// lib/people/overviews.js — SOURCED OVERVIEWS of eligible designers and
// creators (V.2). The compact panel that answers a search for a person the
// way a knowledge panel does — image, a short sourced description, why the
// overview exists, its sources, when it was last updated, and a correction
// path — in ASILUM's own voice.
//
// A curated table in the class of lib/asterisk/houses.js: every claim names
// its source, every row carries `lastUpdated`, and a person who is not here
// is simply not here (search still finds their pieces and posts). Nothing is
// inferred about a person; the row says only what its sources support.
//
// ELIGIBILITY is the owner's rule, recorded here so the panel can print why
// it exists. Popularity is not merit, identity verification or endorsement;
// smaller creators remain searchable without an overview; designers and
// historical figures qualify through a sourced body of work, not views.

import { distance } from "fastest-levenshtein";

export const OVERVIEW_ELIGIBILITY = Object.freeze({
  creators: {
    rule: "an average of at least 250,000 views per post, sustained for five consecutive months",
    viewsPerPost: 250000,
    consecutiveMonths: 5,
    open: [
      "platform scope", "eligible post types", "month boundaries", "observation window",
      "minimum sample size", "fraud and paid-traffic handling", "renewal cadence", "appeals",
    ],
    missingHistory: "not yet verified — never a failure",
  },
  designers: {
    rule: "a sourced body of work: a house appointment, a collection record or a museum holding, each with a citable source",
  },
  compiledOn: "2026-09-17",
});

export const OVERVIEWS = Object.freeze([
  {
    id: "olivier-rousteing",
    name: "Olivier Rousteing",
    aliases: ["rousteing", "olivier", "olivier rousteing", "rabanne creative director"],
    role: "Creative Director, Rabanne",
    basis: "designer — sourced body of work",
    image: "/model/olivier-rousteing-2016.jpg",
    imageCredit: { credit: "My Wall Art / Wikimedia Commons", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Olivier_Rousteing.jpg", alt: "Olivier Rousteing seated in a black suit in 2016" },
    summary: "French fashion designer. Led Balmain as creative director from 2011 through 2025. Named creative director of Rabanne in July 2026; his first collection for the house is scheduled for March 2027.",
    facts: [
      { claim: "Creative director of Rabanne, appointed July 2026", source: "puig" },
      { claim: "First Rabanne collection scheduled for March 2027", source: "puig" },
      { claim: "Creative director of Balmain, 2011–2025", source: "ap" },
    ],
    sources: {
      puig: { publisher: "Puig (official announcement)", type: "primary", url: "https://www.puig.com/en/newsroom/Rabanne-appoints-Olivier-Rousteing-as-Creative%20Director/" },
      ap: { publisher: "Associated Press", type: "news", url: "https://apnews.com/" },
    },
    tags: ["TAILORED", "STATEMENT", "SEDUCTIVE"],
    lastUpdated: "2026-09-17",
    notAffiliated: "A sourced editorial overview — not a claimed or affiliated account, not an endorsement.",
  },
]);

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Find the overview a query is asking for. Typo-tolerant the way the search
 * engine is (lib/search/typo.js): a token of five letters or more may sit one
 * edit away (two at nine letters); shorter tokens must match exactly; a tie
 * between two people corrects nothing.
 */
export function findOverview(query) {
  const q = fold(query);
  if (!q) return null;
  const qTokens = q.split(" ").filter(Boolean);
  let best = null, bestScore = 0, tie = false;
  for (const o of OVERVIEWS) {
    const names = [o.name, ...(o.aliases || [])].map(fold);
    let score = 0;
    // whole-phrase hit first
    if (names.some((n) => n === q || q.includes(n))) score = 3;
    else {
      const nameTokens = new Set(names.flatMap((n) => n.split(" ")));
      for (const t of qTokens) {
        if (nameTokens.has(t)) { score += 1; continue; }
        if (t.length >= 5) {
          const budget = t.length >= 9 ? 2 : 1;
          if ([...nameTokens].some((n) => n.length >= 5 && distance(t, n) <= budget)) score += 0.9;
        }
      }
    }
    if (score > bestScore) { best = o; bestScore = score; tie = false; }
    else if (score === bestScore && score > 0) tie = true;
  }
  if (!best || tie) return null;
  // a single fuzzy token is not enough to name a person; two tokens or the
  // full phrase are
  return bestScore >= 1.8 || bestScore >= 3 ? best : (bestScore >= 1 && qTokens.length === 1 ? best : null);
}

export function overviewById(id) {
  return OVERVIEWS.find((o) => o.id === id) || null;
}
