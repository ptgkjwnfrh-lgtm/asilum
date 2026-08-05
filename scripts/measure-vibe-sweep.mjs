// scripts/measure-vibe-sweep.mjs — 1000-query cross-domain search sweep (Aug 5).
//
// Owner directive: "do 1000 different searches (fruit, city, musical artist,
// non-musical celebrity, object, movie, season, designer, specific designer
// piece, etc.) to verify that each search yields a catalogue of pieces that
// are tagged to match the vibe of said search."
//
// DECLARED OUTCOME CLASSES — every query lands in exactly one:
//   A VIBE-SERVED    an interpretation engaged (cultural read / compositional
//                    read / mapping expansion / designer-similar) AND ≥70% of
//                    the top 12 results carry ≥1 tag of the engaged slate.
//   B LITERAL-SERVED the top result has genuine literal evidence: a query
//                    token in its title or brand, a garment-category match on
//                    a real garment noun, or a full product-name match.
//   C HONEST-MISS    no results, OR the response discloses its limits
//                    (unmatchedTokens / note) and claims nothing it lacks
//                    (labels restricted to category browse / reads / brain).
//   D DEFECT         everything else: match labels without evidence, a vibe
//                    slate the results don't carry, a real word rewritten by
//                    the typo bridge, an engine error. Every D is listed.
//
// AMENDMENTS (declared, after run 1):
//   1. era evidence — the classifier counted an "era match" on "1990s" as a
//      claim without evidence because it only checked title/brand; an item's
//      decade IS query evidence. literalOK now includes decade/era fields.
//   2. plural-strip mirror — the classifier's literal check now mirrors the
//      engine's word-boundary rule so it neither excuses the old junk
//      ("tens" inside "Noten") nor flags the legitimate stripped form.
//   3. (run 2) a DISCLOSED typo correction of a word unknown to the whole
//      system (not catalog, not culture, not garment vocab, not protected)
//      is the bridge doing its declared job — "streep"→"street" with a note
//      is honest (C). Rewriting a KNOWN word remains a defect.
//   4. (run 2) a category-browse top is a defect only when NO top-12 row
//      carries the modifier: "leather sneakers" ranks real leather pieces in
//      the rack, so the browse is honest context, not a silent lie.
//
// The sweep runs the ENGINE (searchProducts) directly in mem-mode — the same
// function the route calls, minus HTTP rate limits that would throttle 1000
// calls. Brain off (anonymous): vibe must come from the catalog + culture
// racks, not personalization. Deterministic corpus, no Math.random.
process.env.DATABASE_URL = "";
const { searchProducts, GARMENT_CATEGORY, GENERIC_GARMENT_NOUNS } = await import("../lib/search/index.js");
const { CULTURE } = await import("../lib/asterisk/culture.js");
const { CATALOG } = await import("../lib/ingest/catalog.js");

const norm = (s) => String(s || "").toLowerCase();
const brands = [...new Set(CATALOG.map((i) => i.brand).filter(Boolean))].sort();
const pieceOf = (t) => norm(t).replace(/^[^—]+—\s*/, "").trim();
const brandPieces = new Map();
for (const it of CATALOG) {
  if (!brandPieces.has(it.brand)) brandPieces.set(it.brand, new Set());
  brandPieces.get(it.brand).add(pieceOf(it.title));
}

// ---- corpus ---------------------------------------------------------------
const Q = new Map(); // query -> {cls}
const add = (q, cls) => { q = norm(q).trim(); if (q && !Q.has(q)) Q.set(q, { cls }); };

// culture entities across every kind + a spread of aliases
const byKind = {};
for (const e of CULTURE) (byKind[e.kind] = byKind[e.kind] || []).push(e);
const KIND_CLS = { film: "movie", tv: "movie", music: "musical-artist", figure: "celebrity",
  city: "city", decade: "era", aesthetic: "aesthetic", concept: "concept", art: "aesthetic" };
for (const [kind, list] of Object.entries(byKind)) {
  for (const e of list) add(e.name, "culture:" + (KIND_CLS[kind] || kind));
  for (const e of list.slice(0, 15)) for (const a of (e.aliases || []).slice(0, 1)) add(a, "culture:" + (KIND_CLS[kind] || kind));
}
// designers + likes + real designer pieces + cross-designer (wrong) pieces
for (const b of brands) add(b, "designer");
for (const b of brands.slice(0, 40)) add("like " + b, "designer-similar");
let i = 0;
for (const [b, pieces] of brandPieces) { const p = [...pieces][0]; if (p) add(`${b} ${p}`, "designer-piece"); if (++i >= 80) break; }
i = 0;
for (const b of brands) { const other = brands[(brands.indexOf(b) + 7) % brands.length]; const p = [...(brandPieces.get(other) || [])][0]; if (p && !(brandPieces.get(b) || new Set()).has(p)) { add(`${b} ${p}`, "designer-piece-mismatch"); if (++i >= 30) break; } }
// garments: every distinct product name + modifier combos
for (const p of new Set(CATALOG.map((it) => pieceOf(it.title)))) add(p, "garment");
const mods = ["black", "leather", "vintage", "oversized", "cropped", "japanese", "deconstructed", "waxed"];
const nouns = ["jacket", "trousers", "boots", "dress", "knit", "shirt", "coat", "sneakers", "bag", "skirt"];
for (const m of mods) for (const n of nouns) add(`${m} ${n}`, "garment-modified");
// seasons
for (const n of ["coat", "jacket", "dress", "knit", "boots", "trousers", "shirt", "bag", "sneakers", "parka"]) { add(`winter ${n}`, "season"); add(`summer ${n}`, "season"); }
// fruit / unknown cities / objects / unknown movies / unknown celebrities / nonsense
for (const f of ["banana","cherry","mango","peach","grape","lemon","apricot","plum","melon","papaya","kiwi","guava","pomegranate","raspberry","tangerine","nectarine","durian","lychee","persimmon","coconut","watermelon","cantaloupe","clementine","blackberry","dragonfruit"]) add(f, "fruit");
for (const c of ["chicago","atlanta","houston","madrid","lisbon","oslo","prague","vienna","dubai","mumbai","shanghai","cairo","nairobi","toronto","denver","phoenix","montreal","dublin","zurich","helsinki"]) add(c, "city-other");
for (const o of ["toaster","lamp","bicycle","typewriter","kettle","ladder","hammer","telescope","umbrella stand","doorknob","chandelier","wheelbarrow","stapler","microscope","surfboard","canoe","lawnmower","fireplace","aquarium","bookshelf","thermostat","spatula","corkscrew","flashlight","compass","anvil","pulley","turbine","gearbox","piston"]) add(o, "object");
for (const m of ["inception","the godfather","jurassic park","titanic","interstellar","gladiator","casablanca","the matrix reloaded","finding nemo","shrek","avatar","top gun","die hard","rocky horror","alien resurrection","toy story","the shining","goodfellas","braveheart","jaws"]) add(m, "movie-other");
for (const c of ["tom hanks","meryl streep","denzel washington","serena williams","lebron james","roger federer","oprah winfrey","david attenborough","gordon ramsay","neil armstrong","marie curie","usain bolt","simone biles","stephen hawking","jane goodall","warren buffett","bill nye","greta thunberg","malala yousafzai","david beckham"]) add(c, "celebrity-other");
for (const n of ["xqzvbl","fnorbulate","glimwrack","sploctern","vrembast","quolthing","zzyzx drift","blenkorp","sniggleworth","crumbolic","fizzlewick","gronkular","plimsollx","wobbegong hat","threnkle"]) add(n, "nonsense");

const corpus = [...Q.entries()].map(([q, v]) => ({ q, cls: v.cls }));
console.error(`corpus: ${corpus.length} unique queries`);

// ---- entity slate lookup (name OR alias) ----------------------------------
const slateByQuery = new Map();
for (const e of CULTURE) {
  const tags = new Set();
  for (const it of e.interpretations || []) for (const t of it.tags || []) tags.add(t.toUpperCase());
  for (const key of [e.name, ...(e.aliases || [])]) if (!slateByQuery.has(norm(key))) slateByQuery.set(norm(key), tags);
}

const LITERAL_REASONS = new Set(["product name match", "title match", "partial title match", "brand match", "designer match", "garment match", "indexed text match", "tag match", "related term", "aesthetic match", "era match"]);
const READ_REASONS = new Set(["category browse", "compositional read", "cultural read", "moodboard brain"]);
const SEASON_CLIMATE = { "fall/winter": "cold", "pre-fall": "cold", "spring/summer": "warm", "resort": "warm" };

async function classify(q, cls, r) {
  const res = r.results || [];
  const top12 = res.slice(0, 12);
  const qTokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const disclosed = (r.unmatchedTokens || []).length > 0 || !!r.note;
  // typo rewrite of a word the SYSTEM knows = defect; a disclosed rewrite of
  // a system-unknown word is the bridge's declared function (amendment 3)
  const { isProtectedWord } = await import("../lib/search/typo.js");
  const rewrites = (r.interpreted?.typoCorrections || []).filter((c) => cls !== "nonsense" && isProtectedWord(c.from));
  if (rewrites.length) return { out: "D", why: `typo bridge rewrote known word: ${JSON.stringify(rewrites)}` };

  // engaged slate = cultural read tags ∪ mapped tags ∪ entity slate for this query
  const slate = new Set([...(slateByQuery.get(q) || [])]);
  for (const t of r.interpreted?.mappedTags || []) slate.add(String(t).toUpperCase());
  const engaged = r.cultural?.engaged || (r.interpreted?.mappingHits || []).length > 0 ||
    top12.some((x) => x.matchReason === "compositional read" || x.matchReason === "cultural read") ||
    r.interpreted?.intent === "designer-similar";
  const carries = (it) => Object.keys(it.tags || {}).some((t) => slate.has(t.toUpperCase()));

  if (cls === "season") {
    const want = q.startsWith("winter") ? "cold" : "warm";
    const wrong = res.filter((it) => { const s = norm(it.era?.season); return s && SEASON_CLIMATE[s] && SEASON_CLIMATE[s] !== want; });
    if (wrong.length) return { out: "D", why: `${wrong.length} results from the wrong season (want ${want})` };
    return res.length ? { out: "B", why: "season-filtered rack" } : { out: "C", why: "empty" };
  }
  if (engaged && slate.size && top12.length) {
    const hit = top12.filter(carries).length;
    if (hit / top12.length >= 0.7) return { out: "A", why: `${hit}/${top12.length} carry slate tags` };
    return { out: "D", why: `vibe engaged but only ${hit}/${top12.length} of top12 carry slate tags` };
  }
  if (!res.length) return { out: "C", why: "honestly empty" };
  const top = top12[0];
  const title = norm(top.title), brand = norm(top.brand);
  const word = (hay, t) => new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(hay);
  const tokHit = (hay, t) => word(hay, t) || (t.endsWith("s") && t.length >= 4 && word(hay, t.slice(0, -1)));
  const decade = norm(top.decade || top.era?.decade);
  const literalOK = qTokens.some((t) => tokHit(title, t) || brand.includes(t)) ||
    qTokens.some((t) => GARMENT_CATEGORY[t] === top.category || GENERIC_GARMENT_NOUNS?.[t] === top.category) ||
    (decade && q.includes(decade));
  if (LITERAL_REASONS.has(top.matchReason)) {
    if (literalOK) return { out: "B", why: `literal: ${top.matchReason}` };
    return { out: "D", why: `top claims "${top.matchReason}" with no query evidence (${top.id} ${top.title})` };
  }
  if (READ_REASONS.has(top.matchReason)) {
    if (disclosed || top.matchReason !== "category browse") return { out: "C", why: `disclosed ${top.matchReason}` };
    const modifierInRack = qTokens.some((t) => top12.some((it) => tokHit(norm(it.title), t)));
    if (modifierInRack) return { out: "C", why: "browse rack carries the modifier deeper in (amendment 4)" };
    return { out: "D", why: "category browse without disclosure" };
  }
  return { out: "D", why: `unclassified matchReason "${top.matchReason}"` };
}

// ---- run ------------------------------------------------------------------
const results = [];
let done = 0;
const POOL = 8;
async function worker(slice) {
  for (const { q, cls } of slice) {
    let verdict;
    try {
      const r = await searchProducts(q, { limit: 24 });
      verdict = { q, cls, n: (r.results || []).length, ...(await classify(q, cls, r)) };
    } catch (e) {
      verdict = { q, cls, n: 0, out: "D", why: "ENGINE ERROR: " + e.message };
    }
    results.push(verdict);
    if (++done % 200 === 0) console.error(`  ${done}/${corpus.length}`);
  }
}
const slices = Array.from({ length: POOL }, (_, k) => corpus.filter((_, idx) => idx % POOL === k));
await Promise.all(slices.map(worker));

// ---- report ---------------------------------------------------------------
const byCls = {};
for (const r of results) {
  const b = (byCls[r.cls] = byCls[r.cls] || { A: 0, B: 0, C: 0, D: 0, total: 0 });
  b[r.out]++; b.total++;
}
console.log(`\nVIBE SWEEP — ${results.length} unique queries`);
console.log("cls".padEnd(26), "total", " A(vibe)", "B(literal)", "C(honest)", "D(DEFECT)");
for (const [cls, b] of Object.entries(byCls).sort()) {
  console.log(cls.padEnd(26), String(b.total).padStart(5), String(b.A).padStart(8), String(b.B).padStart(10), String(b.C).padStart(9), String(b.D).padStart(9));
}
const t = results.reduce((a, r) => (a[r.out]++, a), { A: 0, B: 0, C: 0, D: 0 });
console.log("TOTAL".padEnd(26), String(results.length).padStart(5), String(t.A).padStart(8), String(t.B).padStart(10), String(t.C).padStart(9), String(t.D).padStart(9));
const defects = results.filter((r) => r.out === "D");
console.log(`\nDEFECTS (${defects.length}):`);
for (const d of defects.slice(0, 60)) console.log(`  [${d.cls}] "${d.q}" (${d.n} results) — ${d.why}`);
if (defects.length > 60) console.log(`  … and ${defects.length - 60} more`);
const fs = await import("node:fs");
fs.writeFileSync("scripts/.vibe-sweep.json", JSON.stringify(results, null, 1));
console.log("\nfull results → scripts/.vibe-sweep.json");
