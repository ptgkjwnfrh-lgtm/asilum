// lib/people/resolve.js — the overview and related edges a query earns
// (V.2 SearchPage: `overview`, `related`, `query.designerId/houseId`).
//
// A name earns its registry entity; a DESIGNER: HOUSE pair earns BOTH
// canonical ids so quick selections and headings cannot disagree; anything
// else earns nothing. The legacy person panel (lib/people/overviews.js) is
// untouched — Codex's client still calls findOverview for it.

import { parseDesignerHousePair } from "../search/pair.js";
import {
  findCareerEntity, entityDto, edgeDto, careerOf, designersOf, catalogBrandsOf, getCareerEntity,
} from "./careers.js";
import { itemCreditsDesigner } from "../search/designers.js";

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function countCredits(pool, edge) {
  if (!pool) return null;
  const designer = getCareerEntity(edge.designerId);
  const brands = new Set(catalogBrandsOf(edge.houseId).map(fold));
  if (!designer || !brands.size) return 0;
  let n = 0;
  for (const it of pool) if (brands.has(fold(it.brand)) && itemCreditsDesigner(it, designer.name)) n++;
  return n;
}

/**
 * @param {string} query
 * @param {{ pool?: Array }} opts  a catalog pool to count credits against; omit to leave counts null
 * @returns {{ overview, related, entities, query: { text, designerId, houseId } }}
 */
export function resolveOverviewForQuery(query, { pool = null } = {}) {
  const text = String(query || "").trim();
  const out = { overview: null, related: [], entities: { designer: null, house: null }, query: { text, designerId: null, houseId: null } };
  if (!text) return out;
  const pair = parseDesignerHousePair(text);
  if (pair) {
    const d = findCareerEntity(pair.left, "designer") || findCareerEntity(pair.right, "designer");
    const h = findCareerEntity(pair.right, "house") || findCareerEntity(pair.left, "house");
    if (d) { out.entities.designer = entityDto(d.id); out.query.designerId = d.id; }
    if (h) { out.entities.house = entityDto(h.id); out.query.houseId = h.id; }
    out.overview = out.entities.designer || out.entities.house;
    const edges = d ? careerOf(d.id) : h ? designersOf(h.id) : [];
    out.related = edges.map((e) => edgeDto(e, { matchingItemCount: countCredits(pool, e) }));
    return out;
  }
  const entity = findCareerEntity(text);
  if (!entity) return out;
  out.overview = entityDto(entity.id);
  if (entity.kind === "designer") {
    out.entities.designer = out.overview; out.query.designerId = entity.id;
    out.related = careerOf(entity.id).map((e) => edgeDto(e, { matchingItemCount: countCredits(pool, e) }));
  } else {
    out.entities.house = out.overview; out.query.houseId = entity.id;
    out.related = designersOf(entity.id).map((e) => edgeDto(e, { matchingItemCount: countCredits(pool, e) }));
  }
  return out;
}
