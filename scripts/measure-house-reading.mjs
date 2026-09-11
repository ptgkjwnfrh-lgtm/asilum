#!/usr/bin/env node
// scripts/measure-house-reading.mjs — does the brain READ a house's name as
// the house, or as a pile of words?
//
// WHY THIS EXISTS. Every ingestion path turns "<title> <brand>" into a taste
// vector through one bridge (lib/ingest/inferTags.js → coldStart →
// promptVector). A house the knowledge base knows should therefore stamp its
// aesthetics on every listing that names it. MEASURED before the knowledge
// round (11 Sep 2026): 21 of the seed catalog's 64 brands had no reachable
// key and 12 produced an EMPTY vector — "Alaïa", "Fendi", "Louis Vuitton",
// "Needles", "Y/Project" among them. (A first version of this instrument
// also reported every 3+-word brand as unreadable; that was the instrument —
// the fuzzy substring bridge rescued most of them. The reader change is
// pinned by tests/brain-phrase-reading.test.js on the 4 keys it did not.)
//
// A/B IN ONE PROCESS: BRAIN_PHRASE_MATCH is read per call, so the legacy
// two-token reader and the phrase reader run against the same tables.
//
//   node scripts/measure-house-reading.mjs                # the catalog's brands
//   node scripts/measure-house-reading.mjs --brands "Guidi,Julius,Tom Ford"
//   node scripts/measure-house-reading.mjs --file names.txt   # one name per line
//
// DECLARED OUTCOME CLASSES, per brand string, decided against the tables
// (never against a label the engine prints):
//   UNIT      promptVector(brand) equals the tag vector of ONE curated key.
//   WORDS     some vector, but not one key's — the words were read separately.
//   EMPTY     no vector at all: the brain has nothing to say about the house.
//   NO-ORIGIN (reported beside the class) the origin register has no row.
// Gate for the round: EMPTY = 0 on the seed catalog and every UNIT brand in
// the legacy reader stays UNIT in the phrase reader.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = "";

const { promptVector } = await import("../lib/brain/index.js");
const { kbResolveExact, kbTagsFor, tagsToVec, foldKey } = await import("../lib/brain/kb.js");
const { houseOrigin } = await import("../lib/asterisk/houses.js");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i > -1 ? args[i + 1] : null; };
let names;
if (opt("brands")) names = opt("brands").split(",").map((s) => s.trim()).filter(Boolean);
else if (opt("file")) names = fs.readFileSync(opt("file"), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
else {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/ingest/catalog.json"), "utf8"));
  const items = Array.isArray(cat) ? cat : cat.items || [];
  names = [...new Set(items.map((i) => i.brand).filter(Boolean))].sort();
}

// order-insensitive: promptVector emits tags in TAGS order, tagsToVec in key order
const canon = (v) => JSON.stringify(Object.entries(v).filter(([, x]) => x).sort());
const same = (a, b) => canon(a) === canon(b);
function classify(name) {
  const v = promptVector(name);
  if (!Object.keys(v).length) return "EMPTY";
  const key = kbResolveExact(foldKey(name));
  if (key && same(v, tagsToVec(key.tags))) return "UNIT";
  // a unit read through a short form or alias also counts, if it is one key
  return "WORDS";
}
function run(flag) {
  process.env.BRAIN_PHRASE_MATCH = flag;
  const out = {};
  for (const n of names) out[n] = classify(n);
  return out;
}
const legacy = run("0");
const phrase = run("1");
delete process.env.BRAIN_PHRASE_MATCH;

const count = (m) => Object.values(m).reduce((a, c) => ((a[c] = (a[c] || 0) + 1), a), {});
const cl = count(legacy), cp = count(phrase);
console.log(`house reading · ${names.length} names`);
console.log(`  legacy (two-token): UNIT ${cl.UNIT || 0} · WORDS ${cl.WORDS || 0} · EMPTY ${cl.EMPTY || 0}`);
console.log(`  phrase reader:      UNIT ${cp.UNIT || 0} · WORDS ${cp.WORDS || 0} · EMPTY ${cp.EMPTY || 0}`);
const noOrigin = names.filter((n) => !houseOrigin(n));
console.log(`  no origin row: ${noOrigin.length}`);
let regressions = 0;
for (const n of names) {
  if (legacy[n] === "UNIT" && phrase[n] !== "UNIT") { regressions++; console.log(`  REGRESSION ${n}: ${legacy[n]} → ${phrase[n]}`); }
}
console.log("\n  per name (phrase reader):");
for (const n of names) {
  const flag = phrase[n] === "UNIT" ? " " : phrase[n] === "WORDS" ? "~" : "!";
  console.log(`   ${flag} ${phrase[n].padEnd(5)} ${n}${houseOrigin(n) ? "" : "   (no origin row)"}${legacy[n] !== phrase[n] ? `   was ${legacy[n]}` : ""}`);
}
const gateEmpty = (cp.EMPTY || 0) === 0;
console.log(`\n  GATE: EMPTY=0 ${gateEmpty ? "PASS" : "FAIL"} · regressions ${regressions} ${regressions === 0 ? "PASS" : "FAIL"}`);
process.exitCode = gateEmpty && regressions === 0 ? 0 : 1;
