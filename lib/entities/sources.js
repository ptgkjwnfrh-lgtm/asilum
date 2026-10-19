// lib/entities/sources.js — THE SOURCE REGISTRY (V.2 brief §9, owner, 1 Oct
// 2026: "Store source URL, publisher, author, retrieved date, claim/quote
// context, rights basis, source excerpt, and reviewed status").
//
// One row per source a claim in the entity graph cites. A claim without a
// row here is not a sourced claim, and the test says so. Nothing in this
// file is a scraped biography: `excerpt` is at most a short quotation or
// empty, `rightsBasis` names why the text may be shown (a link is always
// permitted; a quotation rides on quotation right and says so; an
// authorized introduction would carry its permission), and `reviewed` is a
// person's word — the brief: "Search ranking is not quote verification."
//
// Isomorphic, pure data.

export const SOURCE_RIGHTS = Object.freeze(["link-only", "quotation", "authorized-text", "open-licence", "public-record"]);

export const SOURCES = Object.freeze({
  puig: {
    id: "puig", publisher: "Puig (official announcement)", author: null, type: "primary",
    url: "https://www.puig.com/en/newsroom/Rabanne-appoints-Olivier-Rousteing-as-Creative%20Director/",
    retrievedAt: "2026-09-17", claimContext: "Rabanne's owner announces Olivier Rousteing as creative director; first collection scheduled for March 2027",
    rightsBasis: "link-only", excerpt: "", reviewed: "2026-09-17",
  },
  ap: {
    id: "ap", publisher: "Associated Press", author: null, type: "news",
    url: "https://apnews.com/", retrievedAt: "2026-09-17", claimContext: "Rousteing led Balmain as creative director from 2011 to 2025",
    rightsBasis: "link-only", excerpt: "", reviewed: "2026-09-17",
  },
  galliera: {
    id: "galliera", publisher: "Palais Galliera (official site)", author: null, type: "primary",
    url: "https://www.palaisgalliera.paris.fr/", retrievedAt: "2026-09-17", claimContext: "the City of Paris fashion museum: name, address, programme",
    rightsBasis: "link-only", excerpt: "", reviewed: "2026-09-17",
  },
  "houses-curated": {
    id: "houses-curated", publisher: "ASILUM editorial — lib/asterisk/houses.js", author: "ASILUM", type: "editorial",
    url: null, retrievedAt: "2026-08-21", claimContext: "where a house is based and where it began — curated general fashion knowledge, one pass, no web research run",
    rightsBasis: "public-record", excerpt: "", reviewed: null,
  },
});

/** The source row, or null — never a made-up citation. */
export function sourceById(id) {
  return SOURCES[id] || null;
}

/** Every source a list of claims cites, deduplicated and in first-use order. */
export function sourcesFor(claims = []) {
  const seen = new Set(); const out = [];
  for (const c of claims) {
    const id = c && c.source;
    if (!id || seen.has(id) || !SOURCES[id]) continue;
    seen.add(id); out.push(SOURCES[id]);
  }
  return out;
}
