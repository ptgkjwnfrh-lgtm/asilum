// lib/search/pair.js — DESIGNER: HOUSE (19 Sep 2026).
//
// The owner's navigation reads both ways: a designer overview lists every
// verified house, a house overview lists its designers in chronology, and
// either side opens `TOM FORD: GUCCI` — the pieces this catalog credits to
// that person at that house, and nothing else. The generic interpreter could
// not say this: house recognition wins first ("gucci" is a brand) and the
// designer credit only runs on a text intent, so the pair collapsed into a
// Gucci rack with Tom Ford dropped on the floor.
//
// LAWS.
//   * The pair is parsed from the raw query BEFORE generic interpretation,
//     on the colon the owner writes. "tom ford: gucci", "TOM FORD : GUCCI".
//   * Both sides resolve to canonical ids. The designer side reads the career
//     registry first, then the catalog's own credit vocabulary; the house
//     side reads the registry (with its catalog brand aliases), then the
//     stocked brand list and short forms. Either side failing is a MISS that
//     is disclosed — never a fallback to one half.
//   * The rack is the INTERSECTION: brand ∈ the house's catalog brands AND
//     the piece credits the designer. Matching Gucci alone is not proof a
//     garment was designed by Tom Ford; an empty intersection stays empty.
//   * A verified tenure with no stock is still a verified tenure, and the
//     note says so with the dated role. No sourced record is also said.

import { brandMatch, resolveBrandSpelling } from "./intent.js";
import { houseForShortForm } from "../asterisk/houses.js";
import { listDesigners, itemCreditsDesigner } from "./designers.js";
import { foldNorm } from "./text.js";
import {
  findCareerEntity, houseIdForBrand, catalogBrandsOf, careerEdges, tenurePhrase, getCareerEntity,
} from "../people/careers.js";

const clean = (s) => foldNorm(s).replace(/\s+/g, " ").trim();

/** `{ left, right }` when the raw query is exactly one "left: right", else null. */
export function parseDesignerHousePair(query) {
  const text = String(query || "");
  const parts = text.split(":");
  if (parts.length !== 2) return null;
  const left = clean(parts[0]), right = clean(parts[1]);
  if (left.length < 2 || right.length < 2 || left.length > 60 || right.length > 60) return null;
  return { left, right };
}

function resolveDesigner(text, pool, brands) {
  const entity = findCareerEntity(text, "designer");
  if (entity) return { id: entity.id, name: entity.name, source: "registry" };
  const want = clean(text);
  // The catalog writes the house into designers[] too ("Gucci" credits
  // Gucci) — a house is not a person, so the brand list is excluded exactly
  // as the credit tier excludes it.
  const credited = listDesigners(pool, { excludeBrands: brands }).find((d) => clean(d) === want);
  if (credited) return { id: null, name: credited, source: "credit" };
  return null;
}

function resolveHouse(text, brands) {
  const entity = findCareerEntity(text, "house");
  if (entity) {
    const catalog = catalogBrandsOf(entity.id).filter((b) => brands.some((x) => clean(x) === clean(b)));
    return { id: entity.id, name: entity.name, brands: catalog, source: "registry" };
  }
  const brand = brandMatch(text, brands) || houseForShortForm(text, brands) || resolveBrandSpelling(text, brands)?.brand || null;
  if (!brand) return null;
  const id = houseIdForBrand(brand);
  return { id, name: id ? getCareerEntity(id).name : brand, brands: [brand], source: "catalog" };
}

/**
 * Resolve one parsed pair against the registry and the catalog.
 *
 * @returns {{ text, designer, house, edges, verified } | { text, miss, left, right, designer, house }}
 */
export function resolveDesignerHousePair(pair, { brands = [], pool = [] } = {}) {
  const text = `${pair.left}: ${pair.right}`;
  const read = (l, r) => {
    const designer = resolveDesigner(l, pool, brands);
    const house = resolveHouse(r, brands);
    const edges = designer?.id && house?.id ? careerEdges(designer.id, house.id) : [];
    return { designer, house, edges };
  };
  // DESIGNER: HOUSE is the owner's order; the other way round is the same
  // question. A sourced tenure decides between the two readings; without one,
  // the owner's order stands.
  const forward = read(pair.left, pair.right);
  const reverse = read(pair.right, pair.left);
  const pick = forward.edges.length ? forward
    : reverse.edges.length ? reverse
    : (forward.designer && forward.house) ? forward
    : (reverse.designer && reverse.house) ? reverse : forward;
  let { designer, house } = pick;
  if (!designer || !house) {
    return { text, miss: !designer && !house ? "both" : !designer ? "designer" : "house", left: pair.left, right: pair.right,
             designer: designer || null, house: house || null };
  }
  const edges = pick.edges;
  return { text, designer, house, edges, verified: edges.length > 0 };
}

/** The intersection. A filter, never a score. */
export function applyDesignerHousePair(items = [], resolved) {
  if (!resolved?.designer || !resolved?.house) return [];
  const wantBrands = new Set(resolved.house.brands.map(clean));
  const names = [resolved.designer.name];
  return items.filter((it) => wantBrands.has(clean(it.brand)) && names.some((n) => itemCreditsDesigner(it, n)));
}

/** True for a piece inside the intersection (for constraint counting). */
export function pairPredicate(resolved) {
  const wantBrands = new Set((resolved?.house?.brands || []).map(clean));
  const name = resolved?.designer?.name;
  return (it) => !!name && wantBrands.has(clean(it.brand)) && itemCreditsDesigner(it, name);
}

/** The sentence — the count, the dated role when sourced, the gap when not. */
export function pairNote(resolved, count) {
  if (!resolved) return null;
  if (resolved.miss) {
    const which = resolved.miss === "both" ? `"${resolved.left}" or "${resolved.right}"`
      : resolved.miss === "designer" ? `"${resolved.left}" as a designer` : `"${resolved.right}" as a house`;
    return `could not read ${which} — no sourced record and no catalog credit`;
  }
  const who = `${resolved.designer.name} at ${resolved.house.name}`;
  const n = Number(count) || 0;
  const pieces = n ? `${n} piece${n === 1 ? "" : "s"} here ${n === 1 ? "carries" : "carry"} that credit` : "no piece here carries that credit";
  if (resolved.verified) {
    const tenures = resolved.edges.map(tenurePhrase).join("; ");
    return `${who}: ${tenures} (sourced) — ${pieces}`;
  }
  return `${who}: no sourced record of that appointment — ${pieces}`;
}
