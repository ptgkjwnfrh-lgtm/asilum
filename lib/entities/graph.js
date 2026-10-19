// lib/entities/graph.js — THE ENTITY GRAPH (V.2 brief §9, owner, 1 Oct
// 2026). Five types — :Designer :House :Artist :Spot :Passenger — as one
// canonical register with aliases, dates and TYPED relationships, so the
// same designer is never two records in two searches and a house and the
// people who worked there link both ways.
//
// What a record may say is bounded by what it can cite (lib/entities/
// sources.js). A designer's tenure carries a source. A house's origin
// carries the `basis` line of the curated register it came from
// (lib/asterisk/houses.js) and is labelled editorial knowledge, not sourced
// fact. A spot comes from the places record (lib/places/registry.js) with
// its official link. A record with no approved introduction text has NONE
// — the overview then shows a factual metadata card with its links and an
// honest "no approved overview text yet", never prose written here to fill
// the space (the brief: "The brief does not require new AI-authored
// overview prose").
//
// The brief's open eligibility rule for passengers (1,000,000 valid view
// impressions in each of six consecutive calendar months, configurable) is
// recorded here as the rule; no passenger qualifies yet because nothing
// measures it yet, and "not yet verified" is the only honest state.
//
// Isomorphic, pure data + pure functions. The overview finder's scoring is
// the one lib/people/overviews.js used (typo-tolerant the way search is).

import { distance } from "fastest-levenshtein";
import { OVERVIEWS } from "../people/overviews.js";
import { HOUSES, HOUSE_ORIGIN_PROVENANCE } from "../asterisk/houses.js";
import { PLACES } from "../places/registry.js";
import { SOURCES } from "./sources.js";

export const ENTITY_TYPES = Object.freeze(["designer", "house", "artist", "spot", "passenger"]);

export const PASSENGER_ELIGIBILITY = Object.freeze({
  impressionsPerMonth: 1_000_000,
  consecutiveMonths: 6,
  rule: "at least 1,000,000 valid view impressions in each of six consecutive calendar months, bot-filtered and deduplicated, from auditable monthly rollups",
  configurable: true,
  separately: "likes, shares and comments are shown separately — never added into impressions",
  state: "nothing measures monthly impressions yet — every passenger reads 'not yet verified'",
});

const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---- the register -----------------------------------------------------------------

/** Designers: every sourced overview record is a :Designer. */
const DESIGNERS = OVERVIEWS.map((o) => ({
  id: o.id, type: "designer", name: o.name, aliases: o.aliases || [],
  role: o.role, basis: o.basis, image: o.image || null, imageCredit: o.imageCredit || null,
  // the introduction is the overview's own sourced summary; its first fact's source is the summary's
  intro: o.summary ? { text: o.summary, source: (o.facts && o.facts[0] && o.facts[0].source) || null } : null,
  quote: null,                                   // no verified attributed quotation on record
  facts: (o.facts || []).map((f) => ({ claim: f.claim, source: f.source })),
  tags: o.tags || [], lastUpdated: o.lastUpdated, notAffiliated: o.notAffiliated,
}));

/** Houses: the two that sourced tenures name, then every curated-origin row. */
const SOURCED_HOUSES = [
  { id: "balmain", type: "house", name: "Balmain", aliases: ["balmain paris"], country: "France", city: "Paris", basis: "a Paris house", basisSource: "houses-curated", lastUpdated: "2026-09-17" },
  { id: "rabanne", type: "house", name: "Rabanne", aliases: ["paco rabanne"], country: "France", city: "Paris", basis: "a Paris house owned by Puig", basisSource: "puig", lastUpdated: "2026-09-17" },
];
// a curated row that a sourced house already names (by name or alias) is the
// same house — one record, never two that tie in a search
const CURATED_HOUSES = Object.entries(HOUSES)
  .filter(([name]) => !SOURCED_HOUSES.some((h) => [h.name, ...h.aliases].some((n) => n.toLowerCase() === name.toLowerCase())))
  .map(([name, h]) => ({
    id: "house-" + slug(name), type: "house", name, aliases: [], country: h.country, foundedIn: h.foundedIn || null, city: h.city || null,
    basis: h.basis, basisSource: "houses-curated", lastUpdated: HOUSE_ORIGIN_PROVENANCE.curatedAt,
  }));

/** Spots: the places record's SOURCED permanent rows (a fixture is never a spot). */
const SPOTS = PLACES.filter((p) => !p.sample && !p.dated).map((p) => ({
  id: "spot-" + p.id, type: "spot", placeId: p.id, name: p.name, aliases: [], kind: p.kind, city: p.city, country: p.country || null,
  address: p.address || null, note: p.note || null, sourceUrl: p.sourceUrl || null, lastChecked: p.lastChecked || null, lastUpdated: p.lastChecked || null,
  tags: p.tags || [],
}));

export const ENTITIES = Object.freeze([...DESIGNERS, ...SOURCED_HOUSES, ...CURATED_HOUSES, ...SPOTS]);

/** Typed relationships. `worked_at`: designer → house with role and dates,
 *  each with its source; not every collaborator was creative director. */
export const RELATIONS = Object.freeze([
  { type: "worked_at", from: "olivier-rousteing", to: "balmain", role: "Creative Director", start: "2011", end: "2025", source: "ap" },
  { type: "worked_at", from: "olivier-rousteing", to: "rabanne", role: "Creative Director", start: "2026-07", end: null, source: "puig" },
]);

const byId = new Map(ENTITIES.map((e) => [e.id, e]));

export function entityById(id) { return byId.get(String(id || "")) || null; }

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

/**
 * The entity a query names, or null. Whole-phrase first; then tokens, a
 * token of five letters or more allowed one edit (two at nine); a tie
 * between two entities names neither. A designer beats a house on a tie
 * of score only when the phrase is the designer's whole name.
 */
export function findEntity(query) {
  const q = fold(query);
  if (!q) return null;
  const qTokens = q.split(" ").filter(Boolean);
  let best = null, bestScore = 0, tie = false;
  for (const e of ENTITIES) {
    const names = [e.name, ...(e.aliases || [])].map(fold);
    let score = 0;
    if (names.some((n) => n === q)) score = 4;
    else if (names.some((n) => n.length >= 4 && q.includes(n))) score = 3;
    else {
      // a token in the entity's own NAME outweighs one in an alias: the
      // designer's alias "rabanne creative director" must not tie the house
      // Rabanne for the word "rabanne"
      const nameTokens = new Set(fold(e.name).split(" "));
      const aliasTokens = new Set((e.aliases || []).flatMap((n) => fold(n).split(" ")).filter((t) => !nameTokens.has(t)));
      for (const t of qTokens) {
        if (nameTokens.has(t)) { score += 1; continue; }
        if (aliasTokens.has(t)) { score += 0.6; continue; }
        if (t.length >= 5) {
          const budget = t.length >= 9 ? 2 : 1;
          if ([...nameTokens].some((n) => n.length >= 5 && distance(t, n) <= budget)) score += 0.9;
          else if ([...aliasTokens].some((n) => n.length >= 5 && distance(t, n) <= budget)) score += 0.5;
        }
      }
    }
    if (score > bestScore) { best = e; bestScore = score; tie = false; }
    else if (score === bestScore && score > 0) tie = true;
  }
  if (!best || tie) return null;
  if (bestScore >= 3) return best;
  if (bestScore >= 1.8) return best;
  // one token, one or two edits off, six letters or more, naming an entity of
  // at most two words ("rousting", "rabane"): the brief's typo tolerance
  return bestScore >= 0.9 && qTokens.length === 1 && qTokens[0].length >= 6 && best.name.split(" ").length <= 2 ? best : null;
}

// ---- overviews --------------------------------------------------------------------

const cmpStart = (a, b) => String(a.start || "").localeCompare(String(b.start || ""));

/** A designer's houses in order, each with role, dates and source. */
export function chronologyFor(designerId) {
  return RELATIONS.filter((r) => r.type === "worked_at" && r.from === designerId).sort(cmpStart)
    .map((r) => ({ house: entityById(r.to), role: r.role, start: r.start, end: r.end, source: SOURCES[r.source] || null }));
}

/** A house's designers in order, each with role, dates and source. */
export function designersAt(houseId) {
  return RELATIONS.filter((r) => r.type === "worked_at" && r.to === houseId).sort(cmpStart)
    .map((r) => ({ designer: entityById(r.from), role: r.role, start: r.start, end: r.end, source: SOURCES[r.source] || null }));
}

/**
 * The overview model for an entity — what the card may print, and the
 * list of what it may NOT (`missing`), so the card can say so instead of
 * filling the space. Pure.
 */
export function overviewFor(entityOrId) {
  const e = typeof entityOrId === "string" ? entityById(entityOrId) : entityOrId;
  if (!e) return null;
  const missing = [];
  const base = { id: e.id, type: e.type, name: e.name, lastUpdated: e.lastUpdated || null };
  if (e.type === "designer") {
    const chronology = chronologyFor(e.id);
    if (!e.intro) missing.push("introduction");
    if (!e.quote) missing.push("attributed quotation");
    return { ...base, role: e.role, image: e.image, imageCredit: e.imageCredit, intro: e.intro, quote: e.quote,
      facts: e.facts.map((f) => ({ ...f, sourceRow: SOURCES[f.source] || null })), chronology, tags: e.tags,
      basis: e.basis, notAffiliated: e.notAffiliated, sources: sourcesOf([...e.facts, ...chronology.map((c) => ({ source: c.source && c.source.id }))]), missing };
  }
  if (e.type === "house") {
    const designers = designersAt(e.id);
    missing.push("authorized introduction", "founder card");
    const origin = [e.city, e.country].filter(Boolean).join(", ") + (e.foundedIn ? ` · founded in ${e.foundedIn}` : "");
    return { ...base, origin, foundedIn: e.foundedIn || null, basis: e.basis, basisSource: SOURCES[e.basisSource] || null,
      editorialNote: e.basisSource === "houses-curated" ? "where the house is based is ASILUM editorial knowledge, not a sourced fact" : null,
      designers, sources: sourcesOf([{ source: e.basisSource }, ...designers.map((d) => ({ source: d.source && d.source.id }))]), missing };
  }
  if (e.type === "spot") {
    return { ...base, kind: e.kind, locality: [e.city, e.country].filter(Boolean).join(", "), address: e.address, description: e.note,
      sourceUrl: e.sourceUrl, placeId: e.placeId, lastChecked: e.lastChecked, tags: e.tags, sources: e.sourceUrl ? [{ id: "spot-" + e.placeId, publisher: "official page", url: e.sourceUrl, rightsBasis: "link-only" }] : [], missing: e.note ? [] : ["description"] };
  }
  if (e.type === "artist") return { ...base, missing: ["authorized biography", "works", "worn pieces"] , sources: [] };
  if (e.type === "passenger") return { ...base, eligibility: PASSENGER_ELIGIBILITY, verified: false, missing: ["self-authored overview"], sources: [] };
  return { ...base, missing: ["everything"], sources: [] };
}

function sourcesOf(claims) {
  const seen = new Set(); const out = [];
  for (const c of claims) { const id = c && c.source; if (!id || seen.has(id) || !SOURCES[id]) continue; seen.add(id); out.push(SOURCES[id]); }
  return out;
}

/** Counts the steward and the tests read: how much of the register can cite. */
export function graphCoverage() {
  const byType = {};
  for (const t of ENTITY_TYPES) byType[t] = ENTITIES.filter((e) => e.type === t).length;
  const sourcedHouses = ENTITIES.filter((e) => e.type === "house" && e.basisSource !== "houses-curated").length;
  return { entities: ENTITIES.length, byType, relations: RELATIONS.length, sourcedHouses, curatedHouses: byType.house - sourcedHouses };
}
