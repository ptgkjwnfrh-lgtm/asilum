// lib/people/resolve.js — the overview and related edges a query earns
// (V.2 SearchPage: `overview`, `related`, `query.designerId/houseId`).
//
// A name earns its registry entity; a DESIGNER: HOUSE pair earns BOTH
// canonical ids so quick selections and headings cannot disagree; anything
// else earns nothing. Public prose comes only from a published, revision-pinned
// Wikipedia record; career sources remain structured relationship evidence.

import { parseDesignerHousePair } from "../search/pair.js";
import {
  findCareerEntity, entityDto, edgeDto, careerOf, designersOf, catalogBrandsOf, getCareerEntity,
} from "./careers.js";
import { itemCreditsDesigner } from "../search/designers.js";
import { findFashionEntityByName, getFashionEntity, getWikipediaOverview } from "../db/production.js";
import { wikipediaEntityDto } from "./wikipedia/contract.js";

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
async function publicEntity(careerEntity = null, knowledgeEntity = null) {
  const stored = knowledgeEntity || (careerEntity ? await getFashionEntity(careerEntity.id) : null);
  const entity = stored || (careerEntity ? await findFashionEntityByName(careerEntity.name, careerEntity.kind) : null);
  if (!entity) return careerEntity ? entityDto(careerEntity.id) : null;
  const overview = await getWikipediaOverview(entity.id, entity.preferredLanguage);
  const dto = wikipediaEntityDto(entity, overview);
  if (!careerEntity) return dto;
  const career = entityDto(careerEntity.id);
  return {
    ...career,
    ...dto,
    aliases: [...new Set([...(career.aliases || []), ...(dto.aliases || [])])],
    facts: career.facts,
    sources: [...(dto.sources || []), ...(career.sources || [])],
    reference: career.reference,
  };
}

export async function resolveOverviewForQuery(query, { pool = null } = {}) {
  const text = String(query || "").trim();
  const out = { overview: null, related: [], entities: { designer: null, house: null }, query: { text, designerId: null, houseId: null } };
  if (!text) return out;
  const pair = parseDesignerHousePair(text);
  if (pair) {
    const d = findCareerEntity(pair.left, "designer") || findCareerEntity(pair.right, "designer");
    const h = findCareerEntity(pair.right, "house") || findCareerEntity(pair.left, "house");
    if (d) { out.entities.designer = await publicEntity(d); out.query.designerId = d.id; }
    if (h) { out.entities.house = await publicEntity(h); out.query.houseId = h.id; }
    out.overview = out.entities.designer || out.entities.house;
    const edges = d ? careerOf(d.id) : h ? designersOf(h.id) : [];
    out.related = edges.map((e) => edgeDto(e, { matchingItemCount: countCredits(pool, e) }));
    return out;
  }
  const entity = findCareerEntity(text);
  const knowledge = entity ? null : await findFashionEntityByName(text);
  if (!entity && !knowledge) return out;
  out.overview = await publicEntity(entity, knowledge);
  const kind = entity?.kind || knowledge.kind;
  const id = entity?.id || knowledge.id;
  if (kind === "designer") {
    out.entities.designer = out.overview;
    out.query.designerId = id;
    out.related = entity ? careerOf(id).map((e) => edgeDto(e, { matchingItemCount: countCredits(pool, e) })) : [];
  } else {
    out.entities.house = out.overview; out.query.houseId = id;
    out.related = entity ? designersOf(id).map((e) => edgeDto(e, { matchingItemCount: countCredits(pool, e) })) : [];
  }
  return out;
}
