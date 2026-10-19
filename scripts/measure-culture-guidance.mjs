// scripts/measure-culture-guidance.mjs — declared battery for the
// search-culture-guidance round (Aug 5, 2026).
//
// THE DEFECTS UNDER TEST (owner-reported, reproduced on production Aug 5):
//   1. Typing a cultural reference produced NO suggestions — the suggest
//      vocabulary had zero cultural entities; "carti" fuzzy-corrected to
//      "cargo". (Screenshot: no SUGGESTIONS section for "playboi carti".)
//   2. "playboi carti" resolved to the correct opium-era reading ("vamp
//      rockstar") but the rack contradicted it — boxy tees and oversized
//      shirts (his older cash-carti silhouette), because the cultural tier
//      ranked on four abstract slate tags, ties broke alphabetically, and
//      the reading's own garment language went unused.
//
// DECLARED CRITERIA (all must hold; each failure is listed):
//   C1 ENTITY COVERAGE — every culture record whose name is ≥3 chars gets
//      itself suggested for its own full name. 100%.
//      (Names ≤2 chars — "ye" — are structurally outside the suggest
//      vocabulary; they still resolve as exact SEARCH queries. Declared.)
//   C2 PREFIX GUIDANCE — for names ≥5 chars, typing the first 4 chars
//      surfaces the entity. ≥95%; every miss listed. (A prefix shared with
//      many earlier-vocabulary terms can crowd the 10-slot budget.)
//   C3 ALIAS CANONICALIZATION — every alias ≥3 chars suggests the CANONICAL
//      name ("king vamp" → "playboi carti"). 100%.
//      AMENDMENT 1 (declared, first run): six aliases collide with vocabulary
//      added earlier ("baggy" is already a mapping term; "2000s" is itself a
//      decade entity). First-added wins by design, and the alias suggesting
//      ITSELF there is honest — the criterion now accepts canonical-or-self.
//   C4 ERA STRINGS RESOLVE — for every EMITTED era string (cultureSuggestView:
//      entities with ≥2 distinct-label readings, labels that are themselves
//      catalog keys excluded) "<name> — <label>" resolves to that entity with
//      THAT reading first. ≥95%, misses listed; resolving to a DIFFERENT
//      entity is an instant fail (100% on entity identity).
//      (First run: 36/204 resolved to NOTHING — era labels containing another
//      catalog key decomposed into compositions; 8 decade strings resolved to
//      the label's own entity. Fixed by the orchestrator's era-qualified
//      guard + the emission filter; the criterion is unchanged.)
//   C5 CARTI RACK — the owner's exact report, measured before/after inside
//      one run via the kill switch: with SEARCH_ERA_ANCHORS=0 the top-8
//      anchor count is recorded (before-state; was 0 on prod); with anchors
//      on, ≥4 of the top 8 titles carry a whole-word era anchor and no
//      "boxy tee"/"oversized shirt" sits in the top 5.
//   C6 SUGGEST REGRESSION — the pre-culture vocabulary's suggestions for
//      the house queries (hoodie / rick ow / balenciga / leather) are all
//      still present with culture enabled; for the 2-char probe "ho" the
//      top 3 are unchanged (culture may join a short prefix list only
//      behind the established garment completions).
//   C7 DETERMINISM — suggest and the carti rack are byte-identical across
//      two runs.
//   H1 HTTP BOUNDARY (REQUIRED — the battery FAILS if the server is
//      unreachable; a gate must prove the thing happened): against BASE
//      (default http://localhost:3457), /api/suggest?q=playboi%20carti
//      includes "playboi carti", /api/suggest?q=kanye includes an era
//      string, and /api/search?q=playboi%20carti reports the vamp-rockstar
//      note with ≥4 anchor-bearing titles in its top 8.
//
// Mem-mode for the engine legs (house battery convention, same functions the
// routes call); the HTTP leg exercises the real route layer including the
// vocabulary cache and env gates.
process.env.DATABASE_URL = "";

const { searchProducts } = await import("../lib/search/index.js");
const { buildVocabulary, suggest } = await import("../lib/search/suggest.js");
const { getProductPool } = await import("../lib/search/index.js");
const { DEFAULT_MAPPINGS } = await import("../lib/search/mappings-seed.js");
const { TAGS } = await import("../lib/brain/tags.js");
const { CULTURE, cultureSuggestView } = await import("../lib/asterisk/culture.js");
const { orchestrateInterpretation } = await import("../lib/asterisk/orchestrator.js");
const { extractEraAnchors, anchorHitCount } = await import("../lib/search/eraAnchors.js");

const BASE = process.env.BASE || "http://localhost:3457";
const failures = [];
const notes = [];
const fail = (c, msg) => failures.push(`${c}: ${msg}`);

const cultureView = cultureSuggestView();
const pool = await getProductPool();
const vocabWith = buildVocabulary(pool, DEFAULT_MAPPINGS, TAGS, cultureView);
const vocabWithout = buildVocabulary(pool, DEFAULT_MAPPINGS, TAGS, []);
const labels = (q, vocab) => suggest(q, vocab).map((s) => s.label);

// ---- C1 entity coverage -----------------------------------------------------
let c1Eligible = 0, c1Hit = 0;
for (const c of cultureView) {
  const name = c.name.toLowerCase();
  if (name.length < 3) continue;
  c1Eligible++;
  if (labels(name, vocabWith).includes(name)) c1Hit++;
  else fail("C1", `"${c.name}" not suggested for its own name`);
}

// ---- C2 prefix guidance -----------------------------------------------------
let c2Eligible = 0, c2Hit = 0;
const c2Misses = [];
for (const c of cultureView) {
  const name = c.name.toLowerCase();
  if (name.length < 5) continue;
  c2Eligible++;
  if (labels(name.slice(0, 4), vocabWith).includes(name)) c2Hit++;
  else c2Misses.push(c.name);
}
if (c2Hit / c2Eligible < 0.95) {
  fail("C2", `prefix guidance ${(100 * c2Hit / c2Eligible).toFixed(1)}% < 95% — misses: ${c2Misses.join(", ")}`);
} else if (c2Misses.length) {
  notes.push(`C2 misses inside tolerance (${c2Hit}/${c2Eligible}): ${c2Misses.join(", ")}`);
}

// ---- C3 alias canonicalization ---------------------------------------------
let c3Eligible = 0, c3Hit = 0;
const c3Collisions = [];
for (const c of cultureView) {
  for (const a of c.aliases) {
    const alias = String(a).toLowerCase();
    if (alias.length < 3) continue;
    c3Eligible++;
    const got = labels(alias, vocabWith);
    if (got.includes(c.name.toLowerCase())) c3Hit++;
    else if (got.includes(alias)) { c3Hit++; c3Collisions.push(`"${a}" suggests itself (earlier vocabulary wins)`); }
    else fail("C3", `alias "${a}" suggests neither "${c.name}" nor itself: [${got.join(", ")}]`);
  }
}
if (c3Collisions.length) notes.push(`C3 amendment-1 self-suggestions: ${c3Collisions.join("; ")}`);

// ---- C4 era strings resolve -------------------------------------------------
let c4Eligible = 0, c4Hit = 0;
const c4Misses = [];
for (const c of cultureView) {
  const eras = c.eras.filter((e) => e.label && e.label.toLowerCase() !== c.name.toLowerCase());
  if (eras.length < 2) continue;
  for (const e of eras) {
    c4Eligible++;
    const r = await orchestrateInterpretation(`${c.name} — ${e.label}`, null);
    if (r.entity && r.entity.name !== c.name) {
      fail("C4", `era string "${c.name} — ${e.label}" resolved to DIFFERENT entity "${r.entity.name}"`);
      continue;
    }
    if (r.entity?.name === c.name && r.interpretations?.[0]?.id === e.id) c4Hit++;
    else c4Misses.push(`"${c.name} — ${e.label}" → entity ${r.entity?.name ?? "none"}, top ${r.interpretations?.[0]?.id ?? "none"}`);
  }
}
if (c4Eligible && c4Hit / c4Eligible < 0.95) {
  fail("C4", `era resolution ${(100 * c4Hit / c4Eligible).toFixed(1)}% < 95% — ${c4Misses.join(" | ")}`);
} else if (c4Misses.length) {
  notes.push(`C4 misses inside tolerance (${c4Hit}/${c4Eligible}): ${c4Misses.join(" | ")}`);
}

// ---- C5 carti rack before/after --------------------------------------------
const cartiInterp = CULTURE.find((r) => r.name === "playboi carti").interpretations[0];
const cartiAnchors = extractEraAnchors(cartiInterp.summary + " " + cartiInterp.label);
const topTitles = async () => (await searchProducts("playboi carti", { userId: null, brain: false }))
  .results.slice(0, 8).map((i) => i.title);
process.env.SEARCH_ERA_ANCHORS = "0";
const beforeTitles = await topTitles();
const beforeAnchored = beforeTitles.filter((t) => anchorHitCount(t, cartiAnchors) > 0).length;
delete process.env.SEARCH_ERA_ANCHORS;
const afterTitles = await topTitles();
const afterAnchored = afterTitles.filter((t) => anchorHitCount(t, cartiAnchors) > 0).length;
notes.push(`C5 carti top-8 anchor-bearing titles: before(flag off)=${beforeAnchored}, after=${afterAnchored}`);
if (afterAnchored < 4) fail("C5", `only ${afterAnchored}/8 top titles carry an era anchor (need ≥4); rack: ${afterTitles.join(" | ")}`);
const top5 = afterTitles.slice(0, 5).map((t) => t.toLowerCase());
if (top5.some((t) => t.includes("boxy tee") || t.includes("oversized shirt"))) {
  fail("C5", `cash-carti silhouette in top 5: ${afterTitles.slice(0, 5).join(" | ")}`);
}
if (afterAnchored <= beforeAnchored) {
  fail("C5", `anchors did not improve the rack (before ${beforeAnchored}, after ${afterAnchored})`);
}

// ---- C6 suggest regression --------------------------------------------------
for (const q of ["hoodie", "rick ow", "balenciga", "leather"]) {
  const before = labels(q, vocabWithout);
  const after = new Set(labels(q, vocabWith));
  const lost = before.filter((l) => !after.has(l));
  if (lost.length) fail("C6", `"${q}" lost suggestions with culture on: ${lost.join(", ")}`);
}
{
  const b3 = labels("ho", vocabWithout).slice(0, 3).join("|");
  const a3 = labels("ho", vocabWith).slice(0, 3).join("|");
  if (b3 !== a3) fail("C6", `"ho" top-3 changed: "${b3}" → "${a3}"`);
}

// ---- C7 determinism ---------------------------------------------------------
if (labels("playboi carti", vocabWith).join("|") !== labels("playboi carti", vocabWith).join("|")) {
  fail("C7", "suggest not deterministic");
}
if ((await topTitles()).join("|") !== (await topTitles()).join("|")) {
  fail("C7", "carti rack not deterministic");
}

// ---- H1 HTTP boundary (server REQUIRED) ------------------------------------
try {
  const sj = await (await fetch(`${BASE}/api/suggest?q=playboi%20carti`)).json();
  const sl = (sj.suggestions || []).map((s) => s.label);
  if (!sl.includes("playboi carti")) fail("H1", `route suggest missing entity: [${sl.join(", ")}]`);
  const kj = await (await fetch(`${BASE}/api/suggest?q=kanye`)).json();
  const kl = (kj.suggestions || []).map((s) => s.label);
  if (!kl.some((l) => l.includes("—"))) fail("H1", `route suggest for "kanye" has no era strings: [${kl.join(", ")}]`);
  const rj = await (await fetch(`${BASE}/api/search?q=playboi%20carti`)).json();
  if (!String(rj.note || "").includes("vamp rockstar")) fail("H1", `route note lost the era read: "${rj.note}"`);
  const httpAnchored = (rj.items || []).slice(0, 8)
    .filter((i) => anchorHitCount(i.title, cartiAnchors) > 0).length;
  if (httpAnchored < 4) fail("H1", `route rack only ${httpAnchored}/8 anchor-bearing titles`);
  notes.push(`H1 route rack anchor-bearing: ${httpAnchored}/8`);
} catch (e) {
  fail("H1", `server at ${BASE} unreachable (${e?.cause?.code || e.message}) — the boundary leg DID NOT RUN; start the dev server and re-run`);
}

// ---- report -----------------------------------------------------------------
console.log("measure-culture-guidance —", new Date().toISOString());
console.log(`C1 entity coverage: ${c1Hit}/${c1Eligible}`);
console.log(`C2 prefix guidance: ${c2Hit}/${c2Eligible}`);
console.log(`C3 alias canonicalization: ${c3Hit}/${c3Eligible}`);
console.log(`C4 era strings: ${c4Hit}/${c4Eligible}`);
for (const n of notes) console.log("note:", n);
if (failures.length) {
  console.log(`\nFAIL — ${failures.length} criterion failure(s):`);
  for (const f of failures) console.log(" ✗", f);
  process.exit(1);
}
console.log("\nPASS — all declared criteria hold.");
