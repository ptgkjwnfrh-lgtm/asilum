// scripts/measure-search-honesty.mjs — declared battery for the search-honesty
// round (Aug 5, 2026).
//
// THE DEFECT UNDER TEST (owner-reported, reproduced on production): searching
// different things returned the same results. "wool sweater" and "knitted
// scarf" returned a byte-identical knitwear rack; "leather jacket" returned
// all 170 outerwear items in raw catalog order. Cause: a query word the
// catalog cannot match (no item carries material/colour data) contributed
// nothing, every item in the garment category tied on score, and ties fell to
// pool order — while every row was still labelled "garment match".
//
// DECLARED CRITERIA (all must hold; ranking itself is deliberately unchanged):
//   C1 DISTINCTNESS — two queries that differ only in an unmatched modifier
//      must no longer be silently identical: either their racks differ, or the
//      response says the modifier matched nothing. (Honest sameness is fine;
//      SILENT sameness is the bug.)
//   C2 DISCLOSURE — every unmatched query token appears in unmatchedTokens
//      and in the note.
//   C3 NO FALSE MATCH LABEL — an item whose title contains NO query word at
//      all reports "category browse", never "garment match"/"title match".
//      AMENDMENT 1 (declared, first run): the criterion originally demanded
//      that nothing lacking the MODIFIER claim a match — but on "leather
//      jacket" a varsity jacket genuinely matches the word "jacket", and
//      saying so is honest; the missing "leather" is what needs disclosing,
//      and C2 covers it. The criterion now targets the real defect: rows the
//      query text never touched at all must not claim to match it.
//   C4 CANONICAL PROBES HOLD (the house regression set, algorithm-evaluation
//      skill): "good blanks" → Helmut Lang top; "trashed jeans" → bottoms
//      only; "like Rick Owens" → Rick Owens penalised off the top.
//   C5 TYPO BRIDGE NEVER CORRUPTS REAL VOCABULARY — shift/plaid/smock/gauze
//      /lined/frill survive uncorrected.
//   C6 CLIMATE — "warm coat" no longer excludes Fall/Winter outerwear.
//   C7 DETERMINISM — identical queries return identical order run to run.
process.env.DATABASE_URL = "";
const { searchProducts } = await import("../lib/search/index.js");

const ids = (r, n = 20) => r.results.slice(0, n).map((i) => i.id).join(",");
const out = { pass: [], fail: [] };
const check = (name, ok, detail) => (ok ? out.pass : out.fail).push(`${name}: ${detail}`);

// C1 + C2
const PAIRS = [["wool sweater", "knitted scarf"], ["leather jacket", "warm coat"], ["silk blouse", "striped blouse"]];
for (const [a, b] of PAIRS) {
  const ra = await searchProducts(a, { limit: 20 });
  const rb = await searchProducts(b, { limit: 20 });
  const identical = ids(ra) === ids(rb);
  const disclosed = (ra.unmatchedTokens?.length || 0) > 0 || (rb.unmatchedTokens?.length || 0) > 0;
  check("C1 distinctness", !identical || disclosed,
    `"${a}" vs "${b}" identical=${identical} disclosed=${disclosed} (unmatched: ${JSON.stringify(ra.unmatchedTokens)}/${JSON.stringify(rb.unmatchedTokens)})`);
}
for (const q of ["wool sweater", "black boots", "plaid skirt"]) {
  const r = await searchProducts(q, { limit: 5 });
  const tok = q.split(" ")[0];
  check("C2 disclosure", r.unmatchedTokens?.includes(tok) && (r.note || "").includes(tok),
    `"${q}" unmatched=${JSON.stringify(r.unmatchedTokens)} note=${JSON.stringify(r.note)}`);
}

// C3
for (const q of ["leather jacket", "wool sweater", "silk blouse"]) {
  const r = await searchProducts(q, { limit: 20 });
  const qt = q.split(" ");
  const liar = r.results.find((i) => {
    const title = String(i.title).toLowerCase();
    const touched = qt.some((t) => title.includes(t) || (t.endsWith("s") && title.includes(t.slice(0, -1))));
    return !touched && ["garment match", "title match", "product name match"].includes(i.matchReason);
  });
  check("C3 no false match label", !liar,
    liar ? `"${q}": ${liar.id} "${liar.title}" claimed ${liar.matchReason} with no query word in the title`
         : `"${q}": untouched rows all report category browse`);
}

// C4 canonical probes
{
  const blanks = await searchProducts("good blanks", { limit: 5 });
  check("C4 good blanks", blanks.results[0]?.brand === "Helmut Lang", `top=${blanks.results[0]?.brand} ${blanks.results[0]?.title}`);
  const jeans = await searchProducts("trashed jeans", { limit: 12 });
  const offCat = jeans.results.filter((i) => i.category !== "bottoms");
  check("C4 trashed jeans", offCat.length === 0, `${offCat.length} non-bottoms in top 12`);
  const ro = await searchProducts("like Rick Owens", { limit: 10 });
  const roTop = ro.results.slice(0, 5).filter((i) => i.brand === "Rick Owens").length;
  check("C4 like Rick Owens", roTop === 0, `${roTop} Rick Owens pieces in top 5`);
}

// C5
{
  const { correctTokens, buildTypoVocab } = await import("../lib/search/typo.js");
  const { GARMENT_CATEGORY } = await import("../lib/search/index.js");
  const vocab = buildTypoVocab({ garmentKeys: Object.keys(GARMENT_CATEGORY), mappings: [] });
  const words = ["shift", "plaid", "smock", "gauze", "lined", "frill"];
  const { corrections } = correctTokens(words, vocab, () => false);
  check("C5 typo bridge", corrections.length === 0, corrections.length ? JSON.stringify(corrections) : "no real word corrupted");
}

// C6
{
  const r = await searchProducts("warm coat", { limit: 200 });
  const fw = r.results.filter((i) => /fall|pre-fall/i.test(i.era?.season || "")).length;
  check("C6 climate", fw > 0, `${fw} Fall/Winter outerwear items present in the rack`);
}

// C7
{
  const a = await searchProducts("wool sweater", { limit: 20 });
  const b = await searchProducts("wool sweater", { limit: 20 });
  check("C7 determinism", ids(a) === ids(b), ids(a) === ids(b) ? "identical order run-to-run" : "ORDER DRIFTED");
}

console.log("PASS");
for (const p of out.pass) console.log("  ✓", p);
if (out.fail.length) { console.log("FAIL"); for (const f of out.fail) console.log("  ✗", f); }
console.log(`\n${out.pass.length} passed, ${out.fail.length} failed`);
process.exit(out.fail.length ? 1 : 0);
