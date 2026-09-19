// lib/asterisk/stream/index.js — THE STREAM: one listing in, one fully read
// product out. The five steps the owner set (10 Sep 2026), in order:
//   1. get the listing from the parent site — the search summary, then the
//      item detail with the seller's own tags (lib/ingest/ebay.js);
//   2. look at the piece and say what it is, when it is from, what the house
//      made (identify.js — vision + a few web searches, schema-capped);
//   3. read the parent's tags and decode them (decode.js);
//   4. compose the deeper tag array — ten aesthetics + descriptors — so the
//      piece can go down a stream to the people whose profiles carry those
//      words (tags.js; the brain already matches whatever keys item.tags
//      holds);
//   5. the answer comes back through /api/interaction → lib/brain/reflect.js
//      and the shared stream map (lib/db/production/stream.js).
//
// processListing never throws on a model failure: the deterministic read is
// the floor and the identification is the ceiling. The returned `summary`
// says which of the two the product got.

import { searchEbayRaw, fetchItemDetail, normalizeEbayItem } from "../../ingest/ebay.js";
import { decodeAspects, parentTagReadings } from "./decode.js";
import { identifyListing, identifyEnabled, identifyConfig } from "./identify.js";
import { composeTags } from "./tags.js";

export { decodeAspects, parentTagReadings } from "./decode.js";
export { composeTags, splitTags } from "./tags.js";
export { identifyConfig, identifyEnabled } from "./identify.js";

function decadeOf(year) { return `${Math.floor(year / 10) * 10}s`; }
export const HOUSE_OVERRIDES_SELLER = 0.75;

export async function processListing(raw, { detail = fetchItemDetail, identify = identifyListing, deep = null, source = "ebay" } = {}) {
  const wantDeep = deep == null ? identifyEnabled() : !!deep;
  let full = raw || {};
  let detailError = null;
  if (!Array.isArray(full.localizedAspects) && full.itemId && detail) {
    try {
      const d = await detail(full.itemId);
      if (d) full = { ...full, ...d };
    } catch (e) {
      detailError = String(e?.message || e).slice(0, 200);
    }
  }
  const decoded = decodeAspects(full.localizedAspects || []);
  const readings = parentTagReadings(decoded);
  const base = normalizeEbayItem(full);
  let ident = null;
  if (wantDeep && identify) {
    try {
      ident = await identify({
        title: base.title, brand: base.brand, price: base.price, currency: base.currency,
        condition: base.condition, categoryPath: full.categoryPath || null,
        decoded, description: base.description, images: base.images,
      });
    } catch (e) {
      ident = { record: null, status: "error", error: String(e?.message || e).slice(0, 300) };
    }
  }
  const record = ident?.record || null;
  const composed = composeTags({ title: base.title, brand: base.brand, description: base.description, decoded, identification: record });
  const product = { ...base, tags: composed.tags, descriptors: composed.descriptors, typedTags: composed.typed, source_name: source };
  if (record) {
    const id = record.identification;
    // The house, from looking. A seller's Brand tag is a claim like any other:
    // a confident identification (≥ HOUSE_OVERRIDES_SELLER) that names a
    // different house replaces it and the seller's word is kept beside it —
    // first light's Italian listing carried "Marca=M & M" on a Helmut Lang
    // Classic Denim trucker the model read at 0.8.
    const same = (a, b) => String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "") === String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (id.house && !same(id.house, base.brand)) {
      if (base.brandSource !== "aspect" && record.confidence >= 0.6) { product.sellerBrand = base.brand; product.brand = id.house; product.brandSource = "asterisk"; }
      else if (base.brandSource === "aspect" && record.confidence >= HOUSE_OVERRIDES_SELLER) { product.sellerBrand = base.brand; product.brand = id.house; product.brandSource = "asterisk"; }
    }
    if (id.year.value && id.year.confidence >= 0.5) {
      product.era = { year: id.year.value, decade: decadeOf(id.year.value), raw: `asterisk ${id.year.confidence}`, ...(id.season ? { season: id.season } : {}) };
    } else if (!base.era?.year && (id.year.low || id.year.high)) {
      const mid = Math.round(((id.year.low || id.year.high) + (id.year.high || id.year.low)) / 2);
      product.era = { decade: decadeOf(mid), raw: `asterisk ${id.year.low || "?"}-${id.year.high || "?"}` };
    }
    product.material = product.material || record.materials[0] || null;
    product.fit = product.fit || record.fit[0] || null;
    product.silhouette = product.silhouette || record.descriptors.find((d) => d.kind === "silhouette")?.tag || null;
    product.identification = record;
  }
  return {
    product,
    decoded,
    readings: record?.parent_tag_readings?.length ? record.parent_tag_readings : readings,
    identification: ident,
    summary: {
      detail: Array.isArray(full.localizedAspects) ? "read" : detailError ? `failed: ${detailError}` : "absent",
      aspects: Object.keys(decoded.raw).length,
      identified: !!record,
      identifyStatus: ident?.status || (wantDeep ? "skipped" : "off"),
      descriptors: composed.descriptors.length,
      costUsd: ident?.costUsd || 0,
    },
  };
}

// Search, then process each summary with bounded concurrency.
export async function processQuery(q, { limit = 24, concurrency = 3, ...opts } = {}) {
  const raws = await searchEbayRaw(q, { limit });
  const out = new Array(raws.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, raws.length || 1)) }, async () => {
    while (next < raws.length) {
      const i = next++;
      out[i] = await processListing(raws[i], opts);
    }
  });
  await Promise.all(workers);
  return out;
}

export function streamStatus() {
  const c = identifyConfig();
  return { identify: { enabled: c.enabled, hasKey: c.hasKey, model: c.model, effort: c.effort, search: c.search, images: c.images } };
}
