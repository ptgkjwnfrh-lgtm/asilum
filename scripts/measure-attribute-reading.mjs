#!/usr/bin/env node
// scripts/measure-attribute-reading.mjs — does the engine READ the attribute
// words in a query, or does it only disclose that it cannot?
//
// WHY THIS EXISTS. The Aug 5 vibe sweep (scripts/measure-vibe-sweep.mjs)
// reports zero defects and will keep reporting zero while this whole class of
// failure is live, because the engine is HONEST about it: asked for "vintage
// knit" it says `no piece here matches "vintage"` and serves the knitwear
// rack. That is not a lie, so it is not a defect — and it is also not an
// answer. 46 of 78 modified-garment queries in that sweep land there. This
// script measures the other half of the contract: not "did it avoid claiming
// what it lacks", but "did it use what it has".
//
// A/B IN ONE PROCESS. Each capability under test is behind its own kill flag,
// so baseline and after are two calls to the same function in the same run —
// no worktree pair, no cross-process embedding jitter (the trap that cost
// measure-noun-coverage three amendments).
//
//   node scripts/measure-attribute-reading.mjs
//
// DECLARED OUTCOME CLASSES — every probe lands in exactly one, decided
// against the REAL item fields, never against a label the engine printed:
//   READ          ≥1 result and EVERY served item satisfies the attribute.
//   HONEST-EMPTY  0 results and the note names what was asked for.
//   FALLBACK      results served, the attribute could not be honored AT ALL by
//                 this catalog, and the response says so in those terms and
//                 names what it is showing instead. An answer to a different,
//                 stated question — the correct outcome for "1970s jacket".
//   BROWSE        results served, the attribute is not honored, and the
//                 response discloses the word as unmatched. Honest, not an
//                 answer. This is the pre-change behavior.
//   DEFECT        anything else: served items violate the attribute with no
//                 disclosure, an empty rack with no explanation, or an error.
//
// SUCCESS CRITERIA FOR THE ERA ROUND (declared before the run):
//   1. era families: every probe READ or HONEST-EMPTY with the flag on, and
//      BROWSE goes to zero. The baseline is reported, not asserted — see the
//      amendment below.
//   2. zero DEFECT in either arm.
//   3. controls: identical (id, matchReason, confidenceScore) sequences in
//      both arms. Era reading must not touch a query that names no era.
//
// AMENDMENT 1 (declared after run 1, before the change was accepted). Run 1
// asserted the baseline arm answers ZERO probes. It answers TEN, and the ten
// are real, not a classifier bug: "2010s jacket" and "2020s knit" and their
// eight siblings. Two mechanisms stack — the long-standing `era match` +1.5
// (a decade-string containment test that predates this work) lifts the right
// decade, and 807 of 915 catalog items ARE from those two decades, so the top
// 24 satisfy the ask by weight of the pool. Neither is comprehension: every
// other decade, every year, every season and "vintage" still browsed. An
// assertion that the baseline scores zero would have failed a correct
// measurement, so the baseline is now REPORTED and the gate is on the after
// arm plus strict improvement.
//
// AMENDMENT 2 (declared after run 2). Run 2 flagged twelve DEFECTs on
// "80s jacket" / "1970s knit" and their siblings. The engine was right and
// the classifier was wrong twice over:
//   (a) DISCLOSURE. It only recognised a disclosure that QUOTES the query
//       word (`no piece here matches "80s"`). The era layer discloses in
//       better English — `nothing from the 1980s in outerwear — the nearest
//       here is 1991 — showing outerwear instead` — plus a machine-readable
//       `interpreted.era.served === false`. Structured disclosure now counts.
//   (b) THE CLASS. "1970s jacket" SHOULD serve outerwear: filtering it to
//       nothing turned four curated decade racks into blank pages (vibe sweep
//       run 2). That outcome deserves its own name, FALLBACK, rather than
//       being scored as the pre-change BROWSE it is strictly better than.
// Gate restated: across built families BROWSE and DEFECT must both be zero;
// era-absent must be 100% FALLBACK; every other era family READ or
// HONEST-EMPTY. (Origin round: the arms now gate SEARCH_ORIGIN_READING too,
// and origin-absent joins era-absent under the FALLBACK rule.)
//
// AMENDMENT 3 (price-range round). The two arms differ ONLY by
// SEARCH_ERA_READING. Budget parsing has no kill flag of its own — a floor is
// an extension of the ceiling the dense layer has applied since Day 26, and
// that has never been flagged either — so the price-range family reads the
// SAME in both arms by construction. Its baseline is the previous run of this
// script, recorded in the PR: 0 READ / 12 BROWSE. Families whose capability
// the flag does not gate are marked `gated: false` in the table below, so an
// identical off→on pair is never mistaken for a change that did nothing.
// Families for capabilities not yet built are listed and measured anyway, so
// the gap is a number in this file rather than a memory.

process.env.DATABASE_URL = "";
const { searchProducts } = await import("../lib/search/index.js");
const { itemMatchesEra, parseEraConstraint } = await import("../lib/search/era.js");
const { parseDenseConstraints } = await import("../lib/search/denseQuery.js");
const { parseOriginConstraint, itemMatchesOrigin } = await import("../lib/search/origin.js");
const { CATALOG } = await import("../lib/ingest/catalog.js");

const GARMENTS = ["jacket", "knit", "jeans", "boots", "dress", "trousers"];
const cross = (words, garments = GARMENTS) =>
  words.flatMap((w) => garments.map((g) => `${w} ${g}`));

const FAMILIES = [
  { name: "era-decade", built: true, gated: true, probes: cross(["90s", "1990s", "nineties", "2000s", "2010s", "2020s"]) },
  { name: "era-decade-part", built: true, gated: true, probes: cross(["early 2000s", "mid 2010s", "late 90s"]) },
  { name: "era-year", built: true, gated: true, probes: cross(["1996", "2015", "2020", "2024"]) },
  { name: "era-range", built: true, gated: true, probes: cross(["between 1990 and 2000", "1996 to 1998"]) },
  { name: "era-season", built: true, gated: true, probes: cross(["fall 2015", "spring 2020", "resort 2016"]) },
  { name: "era-relative", built: true, gated: true, probes: cross(["vintage"]) },
  { name: "era-absent", built: true, gated: true, probes: cross(["80s", "1970s"]) },
  { name: "price-range", built: true, gated: false, probes: cross(["over 2000", "between 400 and 800", "up to 300"]) },
  { name: "origin", built: true, gated: true, probes: cross(["japanese", "belgian", "italian", "french", "american", "british"]) },
  { name: "origin-absent", built: true, gated: true, probes: cross(["korean", "brazilian"]) },
];

// Controls: queries that name no attribute at all. Their racks must be
// byte-identical in both arms.
const CONTROLS = [
  "jacket", "knit", "trashed jeans", "good blanks", "like rick owens",
  "playboi carti", "marilyn manson", "gorpcore", "y2k jacket", "bootcut",
  "womens dress", "jacket under 400", "leather jacket", "quiet luxury",
  "winter coat", "summer dress",
];

// ---- attribute checkers ---------------------------------------------------
// Each answers ONE question against real fields: does this served item
// satisfy what the query asked for? `null` = this family has no checker yet,
// so the probe can only be BROWSE or DEFECT.
function eraChecker(query) {
  const toks = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const { era } = parseEraConstraint(toks);
  if (!era) return null;
  return (item) => itemMatchesEra(item, era);
}

// The budget checker reads the same parser the engine uses, then verifies the
// SERVED items against the real `price` field.
function priceChecker(query) {
  const { constraints } = parseDenseConstraints(
    query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1)
  );
  const { minPrice, maxPrice } = constraints;
  if (minPrice == null && maxPrice == null) return null;
  return (item) =>
    typeof item.price === "number" &&
    (minPrice == null || item.price >= minPrice) &&
    (maxPrice == null || item.price <= maxPrice);
}

function originChecker(query) {
  const { origin } = parseOriginConstraint(
    query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1)
  );
  if (!origin) return null;
  return (item) => itemMatchesOrigin(item, origin);
}

const CHECKERS = {
  "era-decade": eraChecker, "era-decade-part": eraChecker, "era-year": eraChecker,
  "era-range": eraChecker, "era-season": eraChecker, "era-relative": eraChecker,
  "era-absent": eraChecker, "price-range": priceChecker,
  origin: originChecker, "origin-absent": originChecker,
};

const ATTR_WORDS = (query) =>
  query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !GARMENTS.includes(t));

function classify(query, family, res) {
  const results = res.results || [];
  const checker = (CHECKERS[family] || (() => null))(query);
  const note = String(res.note || "");
  // Structured disclosure counts (amendment 2): `served: false` is the
  // engine saying, in a field, that it could not honor the attribute.
  const declaredUnservable =
    (res.interpreted?.era ? res.interpreted.era.served === false : false) ||
    (res.interpreted?.origin ? res.interpreted.origin.served === false : false);
  const disclosed =
    declaredUnservable ||
    (res.unmatchedTokens || []).length > 0 ||
    ATTR_WORDS(query).some((w) => note.includes(`"${w}"`));

  if (!checker) {
    // No way to verify the attribute — the probe can only prove disclosure.
    if (!results.length) return note ? { out: "HONEST-EMPTY", why: note } : { out: "DEFECT", why: "empty with no note" };
    return disclosed
      ? { out: "BROWSE", why: "attribute disclosed as unmatched" }
      : { out: "DEFECT", why: `served ${results.length} with no disclosure and no reading` };
  }

  if (!results.length) {
    return note ? { out: "HONEST-EMPTY", why: note } : { out: "DEFECT", why: "empty with no note" };
  }
  const bad = results.filter((it) => !checker(it));
  if (!bad.length) return { out: "READ", why: `${results.length} served, all satisfy` };
  if (declaredUnservable && note) return { out: "FALLBACK", why: note };
  if (disclosed) return { out: "BROWSE", why: `${bad.length}/${results.length} violate, disclosed` };
  return { out: "DEFECT", why: `${bad.length}/${results.length} violate with no disclosure (e.g. ${bad[0].id} ${bad[0].title})` };
}

// ---- run ------------------------------------------------------------------
async function arm(reading) {
  const eraReading = reading, originReading = reading;
  const rows = [];
  for (const fam of FAMILIES) {
    for (const q of fam.probes) {
      let r;
      try {
        r = await searchProducts(q, { limit: 24, eraReading, originReading });
      } catch (e) {
        rows.push({ fam: fam.name, q, out: "DEFECT", why: "ENGINE ERROR: " + e.message, n: 0 });
        continue;
      }
      rows.push({ fam: fam.name, q, n: (r.results || []).length, ...classify(q, fam.name, r) });
    }
  }
  return rows;
}

async function controlPrints(reading) {
  const out = new Map();
  for (const q of CONTROLS) {
    const r = await searchProducts(q, { limit: 24, eraReading: reading, originReading: reading });
    out.set(q, {
      note: r.note || null,
      rows: (r.results || []).map((it) => `${it.id}|${it.matchReason}|${it.confidenceScore}`),
    });
  }
  return out;
}

const off = await arm(false);
const on = await arm(true);
const cOff = await controlPrints(false);
const cOn = await controlPrints(true);

function tally(rows) {
  const by = {};
  for (const r of rows) {
    const b = (by[r.fam] = by[r.fam] || { READ: 0, "HONEST-EMPTY": 0, FALLBACK: 0, BROWSE: 0, DEFECT: 0, total: 0 });
    b[r.out]++; b.total++;
  }
  return by;
}
const tOff = tally(off), tOn = tally(on);

console.log(`\nATTRIBUTE READING — ${off.length} probes per arm, catalog ${CATALOG.length} items`);
console.log("family".padEnd(18), "total", "  READ off→on", " EMPTY off→on", " FALLBK off→on", " BROWSE off→on", " DEFECT off→on");
for (const fam of FAMILIES) {
  const a = tOff[fam.name], b = tOn[fam.name];
  const pair = (k) => `${String(a[k]).padStart(4)}→${String(b[k]).padEnd(4)}`;
  console.log(
    (fam.name + (fam.built ? "" : " *") + (fam.built && !fam.gated ? " \u2020" : "")).padEnd(18),
    String(a.total).padStart(5),
    "  " + pair("READ"), " " + pair("HONEST-EMPTY"), "  " + pair("FALLBACK"), "  " + pair("BROWSE"), "  " + pair("DEFECT")
  );
}
console.log("* capability not built — measured to keep the gap countable");
console.log("\u2020 not gated by SEARCH_ERA_READING — both arms are the same run by construction (amendment 3)");

const sum = (t, k) => Object.entries(t).filter(([f]) => FAMILIES.find((x) => x.name === f)?.built).reduce((a, [, v]) => a + v[k], 0);
const answeredOff = sum(tOff, "READ") + sum(tOff, "HONEST-EMPTY") + sum(tOff, "FALLBACK");
const answeredOn = sum(tOn, "READ") + sum(tOn, "HONEST-EMPTY") + sum(tOn, "FALLBACK");
const builtTotal = FAMILIES.filter((f) => f.built).reduce((a, f) => a + f.probes.length, 0);
console.log(`\nbuilt families answered: ${answeredOff}/${builtTotal} → ${answeredOn}/${builtTotal}`);

const defects = [...off.map((r) => ({ ...r, arm: "off" })), ...on.map((r) => ({ ...r, arm: "on" }))]
  .filter((r) => r.out === "DEFECT");
console.log(`DEFECTS: ${defects.length}`);
for (const d of defects.slice(0, 30)) console.log(`  [${d.arm}] [${d.fam}] "${d.q}" — ${d.why}`);

// ---- controls -------------------------------------------------------------
let broken = 0;
for (const [q, a] of cOff) {
  const b = cOn.get(q);
  const same = a.rows.length === b.rows.length && a.rows.every((r, i) => r === b.rows[i]) && a.note === b.note;
  if (!same) {
    broken++;
    console.log(`  CONTROL BROKEN "${q}": ${a.rows.length} vs ${b.rows.length} rows; note ${JSON.stringify(a.note)} vs ${JSON.stringify(b.note)}`);
  }
}
console.log(`controls: ${CONTROLS.length - broken}/${CONTROLS.length} invariant`);

const browseOn = sum(tOn, "BROWSE");
const absent = tOn["era-absent"];
const oAbsent = tOn["origin-absent"];
const absentAllFallback = absent.FALLBACK === absent.total && oAbsent.FALLBACK === oAbsent.total;
const pass = defects.length === 0 && broken === 0 &&
  answeredOn === builtTotal && browseOn === 0 && answeredOn > answeredOff && absentAllFallback;
console.log(`absent families all FALLBACK: ${absentAllFallback ? "yes" : "no"} (era ${absent.FALLBACK}/${absent.total}, origin ${oAbsent.FALLBACK}/${oAbsent.total})`);
console.log(`\nVERDICT: ${pass ? "PASS" : "FAIL"} (criteria 1–3 in this file's header)`);
process.exit(pass ? 0 : 1);
