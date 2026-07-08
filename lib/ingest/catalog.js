// lib/ingest/catalog.js
// Asilum seed catalog — 1,000 listings, stored as JSON (catalog.json) so the
// server parses data instead of executing a half-megabyte JS literal.
//
// Provenance:
//   * "The Met (CC0 / open-access metadata)" — factual metadata (designer,
//     date, category) from the Metropolitan Museum of Art open-access API.
//     Facts are not copyrightable; images are included ONLY where the object
//     is flagged public-domain (isPublicDomain) by the Met.
//   * "Asilum synthetic seed" — generated listings built to the SAME schema so
//     the brain has a dense, modern catalog to score. No retailer (SSENSE,
//     Grailed, Depop, The RealReal, Vestiaire, Lowheads) data was scraped.
//
// Item shape:
//   { id, title, brand, price, currency,
//     tags,       // weighted vector over the 10 canonical brain tags (style)
//     designers,  // 1-2 tags: person and/or house (split per attribution)
//     category,   // tops|bottoms|outerwear|tailoring|dresses|knitwear|footwear|accessories
//     era,        // { year, season, decade, raw }  (decade always present)
//     size,       // { label, system, gender, fitsLikeUS, runsBias, measurements }
//     img, alt, source }

import CATALOG from "./catalog.json";

export { CATALOG };

// Given a target tag vector, return catalog items that overlap it,
// so the brain can seed a feed before live ingestion is wired up.
export function catalogByAffinity(vec, limit = 8) {
  const scored = CATALOG.map((item) => {
    let s = 0;
    for (const k in item.tags) {
      if (vec && vec[k]) s += item.tags[k] * vec[k];
    }
    return { item, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.item);
}
