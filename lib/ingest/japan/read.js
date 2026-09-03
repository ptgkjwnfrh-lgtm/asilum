// lib/ingest/japan/read.js — a Japanese listing title, read into facets.
//
// Pure: no network, no database, no model. Give it a title, get back what the
// archivalist register in ./vocabulary.js could recognise — and, separately,
// what it could NOT.
//
// ── THE TWO OUTPUTS ARE EQUALLY IMPORTANT ───────────────────────────────────
//
// `facets` is what we read. `unread` is the katakana runs the tables did not
// cover, and it is the half that makes the system improve: those go to an
// archivalist, who writes the mapping down, and the next listing reads. That
// loop is what "trained via ASILUM archivalists" means in practice, and it is
// the same shape lib/asterisk/unknownQueries.js already uses for search.
//
// NOTHING HERE GUESSES. A katakana run that is not in the table is not
// transliterated, not fuzzy-matched to the nearest house, not passed to a
// model. It is reported as unread. A wrong brand attribution on a ¥77,000
// listing is worse than an unread one, and unlike a guess it is fixable.
//
// ── WHY facets, AND NOT A TRANSLATION ───────────────────────────────────────
//
// The output is facet values from lib/tagging/vocabulary.js — `garment`,
// `condition`, `gender`, `brand` — so a Japanese listing lands on exactly the
// axes an English one does. Search then cannot tell them apart, which is the
// whole point: the reader never learns that a translation happened, because
// from their side one did not. See docs/INVISIBLE-MACHINERY.md.

import {
  HOUSES, GARMENTS, MATERIALS, COLORS, CONDITIONS, DEPARTMENTS,
  AUTHENTICITY_CLAIMS, ARCHIVE_WORDS,
} from "./vocabulary.js";

/** Runs of katakana — where a Japanese listing keeps its foreign nouns. */
const KATAKANA_RUN = /[゠-ヿㇰ-ㇿー]{2,}/g;

const MAX_TITLE = 400;

/** Longest key first, so 「新品未使用」 wins over 「新品」. */
function longestFirst(table) {
  return Object.keys(table).sort((a, b) => b.length - a.length);
}
const HOUSE_KEYS = longestFirst(HOUSES);
const GARMENT_KEYS = longestFirst(GARMENTS);
const CONDITION_KEYS = longestFirst(CONDITIONS);
const DEPARTMENT_KEYS = longestFirst(DEPARTMENTS);
const MATERIAL_KEYS = longestFirst(MATERIALS);
const COLOR_KEYS = longestFirst(COLORS);
const CLAIM_KEYS = longestFirst(AUTHENTICITY_CLAIMS);

/**
 * Read one listing title.
 *
 * Returns `{ facets, claim, archive, unread, matched }`:
 *
 *   facets   `{ brand?, garment?, material?, condition?, gender? }` — facet
 *            VALUES, ready
 *            for the tag layer. A facet only appears when a table matched it.
 *   merchantColor  the seller's colour word — a CLAIM, for colorEvidence to
 *            corroborate against the photographs. Never a facet directly.
 *   claim    what the seller said about authenticity, or null. "asserted" is
 *            worth nothing; "declared-replica" is an admission and is real
 *            evidence — see lib/authenticity/evidence.js.
 *   archive  the listing calls itself old stock (古着, アーカイブ).
 *   unread   katakana runs no table covered. THE ARCHIVALIST QUEUE.
 *   matched  which words were consumed, so a reading can be explained.
 *
 * Never throws and never guesses. An unreadable title returns empty facets and
 * its katakana in `unread`, which is a perfectly good answer.
 */
export function readJapaneseTitle(rawTitle) {
  const title = String(rawTitle ?? "").slice(0, MAX_TITLE);
  const facets = {};
  const matched = [];
  let remaining = title;

  const take = (keys, table, facet) => {
    for (const key of keys) {
      if (!remaining.includes(key)) continue;
      if (facet && facets[facet] === undefined) facets[facet] = table[key];
      matched.push(key);
      // Remove it so a longer key's substring cannot match again, and so the
      // leftover katakana is genuinely leftover.
      remaining = remaining.split(key).join(" ");
      if (facet) return;
    }
  };

  take(HOUSE_KEYS, HOUSES, "brand");
  take(GARMENT_KEYS, GARMENTS, "garment");
  take(CONDITION_KEYS, CONDITIONS, "condition");
  take(MATERIAL_KEYS, MATERIALS, "material");
  take(DEPARTMENT_KEYS, DEPARTMENTS, "gender");

  // The seller's colour word, kept OUT of the facets on purpose: it is a claim
  // for lib/ingest/colorEvidence.js to corroborate against the photographs,
  // exactly as an English listing's colour is. See ./vocabulary.js COLORS.
  let merchantColor = null;
  for (const key of COLOR_KEYS) {
    if (!remaining.includes(key)) continue;
    merchantColor = COLORS[key];
    matched.push(key);
    remaining = remaining.split(key).join(" ");
    break;
  }

  // Claims are collected without a facet: authenticity is not a property of
  // the garment, it is something a person typed.
  let claim = null;
  for (const key of CLAIM_KEYS) {
    if (!remaining.includes(key)) continue;
    const kind = AUTHENTICITY_CLAIMS[key];
    // A declared replica outranks an asserted genuine, because a seller
    // claiming both is telling us the useful half.
    if (kind === "declared-replica" || !claim) claim = kind;
    matched.push(key);
    remaining = remaining.split(key).join(" ");
  }

  let archive = false;
  for (const word of ARCHIVE_WORDS) {
    if (!remaining.includes(word)) continue;
    archive = true;
    matched.push(word);
    remaining = remaining.split(word).join(" ");
  }

  const unread = [...new Set((remaining.match(KATAKANA_RUN) || []))]
    .filter((run) => run.length >= 3)
    .slice(0, 8);

  return { facets, merchantColor, claim, archive, unread, matched };
}

/**
 * The archivalist queue for a batch of titles: every katakana run the tables
 * could not read, most frequent first.
 *
 * Frequency ordering is the whole value — it puts the word that appears on
 * ninety listings above the one that appears on one, so an hour of a person's
 * time buys the most reading. `count` travels with each row so the reviewer
 * can see what they are buying.
 */
export function unreadFromTitles(titles = []) {
  const seen = new Map();
  for (const title of titles) {
    for (const run of readJapaneseTitle(title).unread) {
      seen.set(run, (seen.get(run) || 0) + 1);
    }
  }
  return [...seen.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}
