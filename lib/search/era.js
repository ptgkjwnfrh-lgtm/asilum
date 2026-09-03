// lib/search/era.js — era comprehension for the search engine (Aug 21).
//
// THE GAP THIS EXISTS FOR (measured, scripts/measure-attribute-reading.mjs):
// every one of the 915 catalog items carries a real production date —
// `era: { year, season, decade, raw }`, 915/915 populated, 1990–2025 — and
// the engine never read a word of it. "vintage knit" ranked a 2025 Off-White
// turtleneck first and disclosed `no piece here matches "vintage"`; "90s
// jacket" put a 1996 Miu Miu anorak FOURTH, under three pieces from 2015,
// 2020 and 2016. The disclosure was honest, which is why this was invisible
// from the defect count — the engine was truthfully reporting that it could
// not read a field it owns.
//
// This module lifts era language out of the token stream and turns it into a
// constraint over real item fields, exactly the way gender and budget already
// work (lib/search/denseQuery.js). It is a FILTER, not a bonus: a piece is
// either from the nineties or it is not, and a rank nudge would leave 2025
// pieces sitting in a rack the user asked to be historical.
//
// DECLARED DECISIONS — the ones a reader will otherwise have to guess at:
//
//   * "y2k" is NOT read as an era. It names a LOOK, and a piece cut in 2023
//     can wear it; it already resolves to an aesthetic mapping
//     (mappings-seed.js) that returns 507 items. Reading it as 1998–2004
//     would silently replace a working aesthetic answer with a date filter.
//   * "archival" / "archive" are NOT read as an era either. ARCHIVAL is one
//     of the ten brain aesthetic tags (117 items carry it) and the word
//     already maps to it. Age and the archival look are different claims.
//   * "vintage" IS an age claim, and the trade's ordinary bar is twenty
//     years. VINTAGE_MIN_AGE is that bar, computed against a supplied year
//     so nothing here depends on the wall clock at import time.
//   * A season word ALONE ("winter", "summer") is left to the existing
//     climate constraint. Only a season word PAIRED WITH A YEAR becomes a
//     season filter — "fall 2015" is a collection, "winter" is a use.
//     THE EXCEPTION, added Aug 22: "resort", "cruise" and "pre-fall" name
//     nothing BUT a collection slot. Nobody dresses "for resort weather".
//     463 of the 915 items sit in those two seasons (Resort 236, Pre-Fall
//     227) and had no standalone path at all — "resort jacket" reported
//     `no piece here matches "resort"` while 41 outerwear pieces are Resort.
//   * GLUED SHORTHAND — fw15, aw18, ss01, pf19, rs16 — is the trade's own
//     way of writing a collection, and lib/tagging/dense.js already mints
//     exactly that string as its highest-weighted tag type. A two-digit year
//     resolves to the most recent NON-FUTURE year, so fw15 is 2015 and never
//     1915.
//   * An item with NO year FAILS an era constraint. Mirrors the budget rule:
//     an unpriced item cannot claim to be under a budget, and an undated one
//     cannot claim to be from the nineties. Silence is not evidence.
//   * FALLBACK — an era constraint NARROWS a rack, it never replaces one with
//     nothing. MEASURED (vibe sweep, run 2 of this change): filtering first
//     turned "1980s", "1970s", "1960s" and "1950s" from a curated cultural
//     rack of 24 vibe-correct pieces into an empty page, because this catalog
//     starts in 1990. Those queries are asking for a LOOK the culture records
//     can serve. So when the constraint empties the pool, the engine drops it,
//     re-reads the query without it, and says both halves out loud (see
//     eraMissNote). A budget behaves the opposite way on purpose: showing a
//     $2,000 jacket to a $400 ceiling is useless, while showing the 1980s
//     look to someone who typed "1980s" is the answer.
//
// Pure module: no db, no env, no clock of its own. Unit-testable.

// The trade's ordinary bar for "vintage" — twenty years old, by production
// year. Not a house style: it is the line most resale platforms publish.
export const VINTAGE_MIN_AGE = 20;

// Bare two-digit decades resolve to their most recent occurrence THAT IS NOT
// IN THE FUTURE, which is how the words are used in resale ("90s denim" is
// never 1890s, and "40s tailoring" is never 2040s). Explicit four-digit forms
// reach further back than the bare ones can.
const DECADE_WORDS = Object.assign(Object.create(null), {
  "20s": 2020, "2020s": 2020, twenties: 2020,
  "10s": 2010, "2010s": 2010, tens: 2010,
  "00s": 2000, "2000s": 2000, noughties: 2000, aughts: 2000,
  "90s": 1990, "1990s": 1990, nineties: 1990,
  "80s": 1980, "1980s": 1980, eighties: 1980,
  "70s": 1970, "1970s": 1970, seventies: 1970,
  "60s": 1960, "1960s": 1960, sixties: 1960,
  "50s": 1950, "1950s": 1950, fifties: 1950,
  "40s": 1940, "1940s": 1940, forties: 1940,
  "30s": 1930, "1930s": 1930, thirties: 1930,
  "1920s": 1920, "1910s": 1910, "1900s": 1900,
});

// early / mid / late split a decade into thirds-ish, the way the words are
// actually used. Declared so the boundaries are reviewable rather than felt.
const DECADE_PARTS = Object.assign(Object.create(null), {
  early: [0, 3],
  mid: [4, 6],
  late: [7, 9],
});

// Season words → the catalog's own `era.season` values. Both halves of a
// slash season answer to either word: a Fall/Winter piece IS a winter piece.
// Season slots that can only ever mean a collection.
const STANDALONE_SEASONS = Object.assign(Object.create(null), { resort: "Resort", cruise: "Resort" });

// The trade's shorthand. fw/aw are the same slot under two names.
const GLUED_SEASONS = Object.assign(Object.create(null), { fw: "Fall/Winter", aw: "Fall/Winter", ss: "Spring/Summer", pf: "Pre-Fall", rs: "Resort" });

const SEASON_WORDS = Object.assign(Object.create(null), {
  fall: "Fall/Winter", autumn: "Fall/Winter", winter: "Fall/Winter",
  fw: "Fall/Winter",
  spring: "Spring/Summer", summer: "Spring/Summer", ss: "Spring/Summer",
  resort: "Resort", cruise: "Resort",
});

// Catalog dates are production years, so the plausible window is bounded on
// both sides: a four-digit number outside it is a price, a model number, or
// a product name ("Levi's 1947"), never a collection year we can serve.
const MIN_PLAUSIBLE_YEAR = 1900;

// A four-digit number sitting behind one of these words is a MAGNITUDE, not a
// date. MEASURED (run 1 of measure-attribute-reading): "over 2000 jacket"
// parsed 2000 as a collection year and filtered the rack to nine pieces made
// in the year 2000 — a plausible, disclosed, and completely wrong reading of
// a budget. "under N" never reaches here (parseDenseConstraints eats it
// first); the rest arrive intact until the price-range round consumes them,
// and this guard has to hold either way.
const MAGNITUDE_PREPOSITIONS = new Set([
  "over", "above", "under", "below", "between", "and", "to", "from",
  "around", "about", "near", "up", "least", "most", "than",
]);

/**
 * Does this token look like a collection year? Exported so the budget parser
 * can decline a range whose endpoints are both years — see the RANGE note in
 * parseDenseConstraints.
 */
export const looksLikeYearToken = (t, nowYear = new Date().getUTCFullYear()) =>
  isYearToken(String(t ?? "").toLowerCase(), nowYear);

const isYearToken = (t, nowYear) => {
  if (!/^\d{4}$/.test(t)) return false;
  const n = Number(t);
  return n >= MIN_PLAUSIBLE_YEAR && n <= nowYear + 1;
};

// Is the token at `i` a year, given what precedes it in the ORIGINAL stream?
const isYearAt = (tokens, i, nowYear) =>
  isYearToken(String(tokens[i] || "").toLowerCase(), nowYear) &&
  !MAGNITUDE_PREPOSITIONS.has(String(tokens[i - 1] || "").toLowerCase());

// Every letter-only word this module reads. The typo bridge must never
// "correct" one of them: "nineties", "noughties", "resort" and friends are
// real vocabulary that sits within edit distance of a table key, and a
// rewritten era word is a silently wrong rack (typo.js NEVER_CORRECT, same
// lesson as plaid→plain).
export const ERA_WORDS = new Set([
  ...Object.keys(DECADE_WORDS).filter((w) => /^[a-z]+$/.test(w)),
  ...Object.keys(DECADE_PARTS),
  ...Object.keys(SEASON_WORDS),
  "vintage",
]);

/**
 * Lift era language out of a token stream.
 *
 * @param {string[]} tokens  remaining query tokens (post dense-constraint parse)
 * @param {{ nowYear?: number }} opts
 * @returns {{ tokens: string[], era: null | {
 *            minYear: number, maxYear: number, season: string|null,
 *            label: string, words: string[] } }}
 *
 * `label` is the phrase the engine may say out loud ("the 1990s", "Fall/Winter
 * 2015", "twenty years old or more"); `words` are the query words consumed, so
 * the disclosure layer never reports them as unmatched.
 */
export function parseEraConstraint(tokens = [], { nowYear = new Date().getUTCFullYear() } = {}) {
  const rest = [];
  const words = [];
  let minYear = null;
  let maxYear = null;
  let season = null;
  let label = null;

  const yr = (k) => (isYearToken(String(tokens[k] ?? "").toLowerCase(), nowYear) ? Number(tokens[k]) : null);
  const takeRange = (a, b, consumed, wordsUsed) => {
    minYear = Math.min(a, b); maxYear = Math.max(a, b);
    label = `${Math.min(a, b)}\u2013${Math.max(a, b)}`;
    words.push(...wordsUsed);
    return consumed;
  };

  // A two-digit year resolves to the most recent occurrence that is not in
  // the future: 15 -> 2015, 98 -> 1998. The catalog runs 1990-2025.
  const twoDigitYear = (n) => (2000 + n <= nowYear ? 2000 + n : 1900 + n);

  for (let i = 0; i < tokens.length; i++) {
    const t = String(tokens[i] || "").toLowerCase();

    // GLUED SHORTHAND: fw15, aw18, ss01, pf19, rs16.
    const glued = t.match(/^(fw|aw|ss|pf|rs)(\d{2}|\d{4})$/);
    if (glued && GLUED_SEASONS[glued[1]]) {
      const raw = Number(glued[2]);
      const y = glued[2].length === 4 ? raw : twoDigitYear(raw);
      if (y >= MIN_PLAUSIBLE_YEAR && y <= nowYear + 1) {
        season = GLUED_SEASONS[glued[1]];
        minYear = y; maxYear = y;
        label = `${season} ${y}`;
        words.push(t);
        continue;
      }
    }

    // A collection slot that can only mean a collection. "pre fall" arrives
    // as two tokens because the tokenizer splits the hyphen.
    if (t === "pre" && String(tokens[i + 1] || "").toLowerCase() === "fall" &&
        !isYearToken(String(tokens[i + 2] || "").toLowerCase(), nowYear)) {
      season = "Pre-Fall";
      minYear = MIN_PLAUSIBLE_YEAR; maxYear = nowYear + 1;
      label = "the Pre-Fall collections";
      words.push("pre", "fall");
      i++;
      continue;
    }
    if (STANDALONE_SEASONS[t] && !isYearToken(String(tokens[i + 1] || "").toLowerCase(), nowYear)) {
      season = STANDALONE_SEASONS[t];
      minYear = MIN_PLAUSIBLE_YEAR; maxYear = nowYear + 1;
      label = `the ${season} collections`;
      words.push(t);
      continue;
    }

    // RANGES, checked before anything else so the magnitude guard cannot eat
    // an endpoint. "between 1990 and 2000", "from 1990 to 2000", "1990 to
    // 2000", and the hyphen form "1990-2000" (the tokenizer splits it into
    // two adjacent years). Two four-digit YEARS are read as years, never as
    // dollars — a $1,990-to-$2,000 budget is a band nobody types, while
    // 1990-2000 is a decade people ask for constantly.
    if (t === "between" && yr(i + 1) != null && String(tokens[i + 2]).toLowerCase() === "and" && yr(i + 3) != null) {
      i += takeRange(yr(i + 1), yr(i + 3), 3, [t, String(tokens[i + 1]), "and", String(tokens[i + 3])]);
      continue;
    }
    if (yr(i) != null && String(tokens[i + 1]).toLowerCase() === "to" && yr(i + 2) != null) {
      // "from 1996 to 1998" — the opening word belongs to the range, not to
      // the text scorer, so it is never reported as an unmatched word.
      const wordsUsed = [t, "to", String(tokens[i + 2])];
      if (rest[rest.length - 1] === "from") { rest.pop(); wordsUsed.unshift("from"); }
      i += takeRange(yr(i), yr(i + 2), 2, wordsUsed);
      continue;
    }
    if (yr(i) != null && yr(i + 1) != null) {
      i += takeRange(yr(i), yr(i + 1), 1, [t, String(tokens[i + 1])]);
      continue;
    }

    // "fall 2015" / "resort 2016" / "pre fall 2019" — a season is only an era
    // claim when a year follows it (see the header). "pre" + "fall" is how the
    // tokenizer splits "pre-fall", so peek one further before giving up.
    const seasonBase = SEASON_WORDS[t];
    if (seasonBase) {
      const preFall = t === "fall" && rest[rest.length - 1] === "pre";
      const next = tokens[i + 1];
      if (next && isYearAt(tokens, i + 1, nowYear)) {
        const y = Number(next);
        season = preFall ? "Pre-Fall" : seasonBase;
        if (preFall) rest.pop();
        minYear = y; maxYear = y;
        label = `${season} ${y}`;
        // In query order, so the sentence reads back the way it was typed.
        if (preFall) words.push("pre");
        words.push(t, next);
        i++;
        continue;
      }
      // No year: leave the word to the climate constraint and text scoring.
      rest.push(t);
      continue;
    }

    // "early 2000s" / "late 90s" / "mid 2010s"
    const part = DECADE_PARTS[t];
    const nextDecade = part && tokens[i + 1] ? DECADE_WORDS[String(tokens[i + 1]).toLowerCase()] : undefined;
    if (part && nextDecade !== undefined) {
      minYear = nextDecade + part[0];
      maxYear = nextDecade + part[1];
      label = `the ${t} ${nextDecade}s`;
      words.push(t, String(tokens[i + 1]).toLowerCase());
      i++;
      continue;
    }

    const decade = DECADE_WORDS[t];
    if (decade !== undefined) {
      minYear = decade; maxYear = decade + 9;
      label = `the ${decade}s`;
      words.push(t);
      continue;
    }

    if (isYearAt(tokens, i, nowYear)) {
      const y = Number(t);
      minYear = y; maxYear = y;
      label = String(y);
      words.push(t);
      continue;
    }

    if (t === "vintage") {
      minYear = MIN_PLAUSIBLE_YEAR;
      maxYear = nowYear - VINTAGE_MIN_AGE;
      label = `${VINTAGE_MIN_AGE} years old or more`;
      words.push(t);
      continue;
    }

    rest.push(t);
  }

  if (minYear === null) return { tokens: rest, era: null };
  return { tokens: rest, era: { minYear, maxYear, season, label, words } };
}

/** Does one item's real `era` field satisfy the constraint? */
export function itemMatchesEra(item, era) {
  if (!era) return true;
  const raw = item && item.era;
  const year = Number(
    (raw && typeof raw === "object" ? raw.year : null) ?? item?.year ?? NaN
  );
  // An undated piece cannot claim a date (see header).
  if (!Number.isFinite(year)) return false;
  if (year < era.minYear || year > era.maxYear) return false;
  if (era.season) {
    const s = raw && typeof raw === "object" ? String(raw.season ?? "") : "";
    if (s !== era.season) return false;
  }
  return true;
}

/** Filter a pool by era. A filter, not a score — see applyOriginConstraint.
 *  Pair with the miss note below, which says what the catalog DOES hold from
 *  nearby years rather than returning an unexplained empty shelf. */
export function applyEraConstraint(items = [], era = null) {
  if (!era) return items;
  return items.filter((it) => itemMatchesEra(it, era));
}

/**
 * The sentence to say when an era constraint could not be served.
 *
 * `fellBack` is the ordinary case (see the FALLBACK note in the header): the
 * rack the user gets is the era-free one, so the sentence has to say both
 * halves — what is not here, and what is being shown instead.
 */
export function eraMissNote(era, scope = [], scopeLabel = null, { fellBack = false } = {}) {
  if (!era) return null;
  const years = scope
    .map((it) => Number(it?.era && typeof it.era === "object" ? it.era.year : NaN))
    .filter((y) => Number.isFinite(y));
  const where = scopeLabel ? ` in ${scopeLabel}` : "";
  const instead = fellBack ? (scopeLabel ? ` — showing ${scopeLabel} instead` : " — showing everything instead") : "";
  if (!years.length) {
    return `nothing dated${where} — this catalog carries no production year for those pieces`;
  }
  // The NEAREST year, not the outer range. "nothing from the late 1990s —
  // what is here runs 1990–2025" reads as a contradiction: the range covers
  // the ask, and the reader is left thinking the engine is confused. What is
  // actually true is that the window is empty and something close is not.
  const distanceTo = (y) => (y < era.minYear ? era.minYear - y : y > era.maxYear ? y - era.maxYear : 0);
  let nearest = years[0];
  for (const y of years) if (distanceTo(y) < distanceTo(nearest)) nearest = y;
  // era.label already names the season when there is one ("Fall/Winter 2015"),
  // so it is never appended twice.
  return `nothing from ${era.label}${where} — the nearest here is ${nearest}${instead}`;
}
