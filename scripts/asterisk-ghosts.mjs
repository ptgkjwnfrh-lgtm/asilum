#!/usr/bin/env node
// scripts/asterisk-ghosts.mjs — THE TWENTY-FIVE. Asterisk trains on 25 real
// pieces and the site shows them as GHOST listings while the app is in demo
// (owner, 10 Sep 2026: "I just need ghost listings so there aren't just
// random images … we'll train asterisk on 25 pieces").
//
// For each spec: search the parent site, take the best-matching summaries,
// run THE STREAM on them (detail → decode → identify → compose), choose the
// one the identification says matches the spec, and either print it (default)
// or write it into the catalog as a ghost (--write: items row with
// listing_kind='ghost', typed product_tags, the identification row — schema
// v51 must be applied). --json <file> saves every chosen piece.
//
//   npm run asterisk:ghosts                      # dry: read, print, spend
//   npm run asterisk:ghosts -- --json ghosts.json
//   npm run asterisk:ghosts -- --write           # into the database behind DATABASE_URL
//   npm run asterisk:ghosts -- --only 3,7,22     # a subset of specs
//
// Keys from .env.local (eBay + ANTHROPIC_API_KEY). Cost is printed per piece
// and totalled; at opus-5/high with search a piece is ~$0.30, a candidate
// that fails the spec costs the same, so a full run is $8–15.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.existsSync(path.join(ROOT, ".env.local")) ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i > -1 ? args[i + 1] : null; };
const WRITE = args.includes("--write");
const JSON_OUT = opt("json");
const ONLY = opt("only") ? new Set(opt("only").split(",").map(Number)) : null;
const CANDIDATES = Math.max(1, Math.min(4, Number(opt("candidates")) || 2));
const BASE = opt("base");   // a previous run's JSON: its chosen pieces stand unless re-run here
const FROM = opt("from");   // write straight from a JSON, no reading at all
// never a ghost: fakes by the seller's own word, lots, sets, reproductions
const AVOID_ALWAYS = ["bootleg", "not real", "replica", "inspired by", "lot of", "lot ", "reproduction", "reprint", "custom made", "handmade by me", "set of", "+ tie", "bundle"];

const { searchEbayRaw } = await import("../lib/ingest/ebay.js");
const { processListing, streamStatus } = await import("../lib/asterisk/stream/index.js");

// house: the identification must name it (or the seller's brand must).
// need: words the title OR the descriptors must carry (any of each group).
// avoid: words that disqualify a title (reprints, lots, wrong garment).
export const SPECS = [
  // ---- fifteen archival pieces, one per house ---------------------------
  { n: 1, q: "rick owens archive leather jacket", house: "rick owens", need: [["jacket", "coat", "blazer"]] },
  { n: 2, q: "undercover jun takahashi archive", house: "undercover", need: [["jacket", "shirt", "coat", "knit", "sweater", "tee", "pants", "trousers"]], avoid: ["gu x", "nike", "uniqlo"] },
  { n: 3, q: "helmut lang 1998 archive", house: "helmut lang", need: [["jacket", "coat", "trousers", "pants", "shirt", "jeans", "denim"]] },
  { n: 4, q: "saint laurent paris hedi slimane archive", house: "saint laurent", need: [["jacket", "blazer", "boots", "shirt", "jeans", "coat"]] },
  { n: 5, q: "comme des garcons homme plus jacket archive", house: "comme des garcons", aliases: ["cdg", "comme des garçons"], need: [["jacket", "coat", "shirt", "skirt", "blazer", "trousers", "dress"]], avoid: ["nike", "converse", "play ", "junya", "wallet"] },
  { n: 6, q: "tom ford blazer jacket men", house: "tom ford", need: [["jacket", "blazer", "suit", "coat", "shirt"]], avoid: ["sunglass", "fragrance", "eyewear", "cologne"] },
  { n: 7, q: "gucci tom ford era 90s archive", house: "gucci", need: [["jacket", "blazer", "shirt", "trousers", "pants", "coat", "dress", "boots"]], avoid: ["belt", "wallet", "sunglass"] },
  { n: 8, q: "vetements hoodie oversized archive", house: "vetements", need: [["hoodie", "jacket", "coat", "jeans", "shirt", "sweater", "tee", "sweatshirt"]] },
  { n: 9, q: "lgb le grand bleu japan archive", house: "l.g.b.", aliases: ["lgb", "le grand bleu", "l.g.b"], need: [["jacket", "shirt", "pants", "denim", "leather", "boots", "coat", "knit"]] },
  { n: 10, q: "the row archive", house: "the row", need: [["coat", "jacket", "trousers", "pants", "knit", "sweater", "dress", "shirt", "boots"]] },
  { n: 11, q: "marc jacobs archive 90s grunge", house: "marc jacobs", need: [["jacket", "dress", "coat", "shirt", "skirt", "sweater", "cardigan"]] },
  { n: 12, q: "gianni versace vintage archive", house: "versace", need: [["jacket", "blazer", "shirt", "dress", "coat", "jeans", "trousers"]] },
  { n: 13, q: "salvatore ferragamo vintage", house: "ferragamo", need: [["loafers", "shoes", "pumps", "heels", "boots", "bag", "jacket", "coat", "scarf"]] },
  { n: 14, q: "balmain paris archive", house: "balmain", need: [["jacket", "blazer", "jeans", "coat", "dress", "boots"]] },
  { n: 15, q: "givenchy archive riccardo tisci", house: "givenchy", need: [["jacket", "coat", "shirt", "sweatshirt", "tee", "dress", "trousers"]] },
  // ---- ten named pieces ----------------------------------------------------
  { n: 16, q: "vintage 70s cropped leather jacket spread collar", need: [["jacket"], ["leather"]], want: ["dagger collar", "spread collar", "cropped", "1970s"], avoid: ["faux", "pleather"] },
  { n: 17, q: "baby blue capri pants slim", need: [["capri", "capris", "cropped pants", "pedal pushers"]], want: ["baby blue", "light blue", "slim"] },
  { n: 18, q: "vintage low rise light wash bootcut jeans men", need: [["jeans", "denim"]], want: ["bootcut", "boot cut", "low rise", "light wash"], men: true },
  { n: 19, q: "vintage french cuff dress shirt cotton spread collar", need: [["shirt"]], want: ["french cuff", "double cuff", "spread collar", "full collar", "cotton"], avoid: ["polyester", "tie", "set"], men: true },
  { n: 20, q: "100% cashmere sweater crewneck", need: [["sweater", "jumper", "pullover", "knit"], ["cashmere"]] },
  { n: 21, q: "vintage 1970s mens leather boots cuban heel beatle boots", need: [["boots", "boot"]], want: ["cuban heel", "2 inch heel", "stacked heel", "chelsea", "beatle", "leather", "1970s", "vintage"], avoid: ["women", "faux", "vegan", "synthetic", "made in china"], men: true },
  { n: 22, q: "vintage led zeppelin t-shirt original 1970s", need: [["led zeppelin"], ["shirt", "tee", "t-shirt"]], want: ["vintage", "1970s", "single stitch", "original"], avoid: ["reprint", "reproduction", "bootleg", "lot of", "new with tags", "nwt"] },
  { n: 23, q: "vintage 1970s maxi dress floral prairie", need: [["maxi", "dress"]], want: ["1970s", "vintage", "maxi", "prairie", "floral"] },
  { n: 24, q: "vintage brown leather slouchy oversized hobo bag", need: [["bag", "hobo", "tote"], ["leather"]], want: ["slouch", "slouchy", "oversized", "brown"] },
  { n: 25, q: "red kitten heels leather", need: [["heels", "pumps", "slingback", "mules"]], want: ["kitten heel", "red", "low heel"] },
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const has = (hay, needle) => norm(hay).includes(norm(needle));

function titleScore(spec, summary) {
  const title = norm(summary.title);
  if ([...AVOID_ALWAYS, ...(spec.avoid || [])].some((w) => title.includes(norm(w)))) return -1;
  let score = 0;
  for (const group of spec.need || []) if (group.some((w) => title.includes(norm(w)))) score += 2; else return -1;
  for (const w of spec.want || []) if (title.includes(norm(w))) score += 1;
  if (spec.house) { const names = [spec.house, ...(spec.aliases || [])]; if (names.some((h) => title.includes(norm(h)))) score += 2; }
  if (summary.image?.imageUrl) score += 1;
  if (summary.price?.value && Number(summary.price.value) > 0) score += 0.5;
  return score;
}

// Does the READ piece match the spec? House by identification or seller tag;
// garment words by title or descriptors; `want` words earn extra.
function specMatch(spec, result) {
  const p = result.product, rec = p.identification;
  const words = [p.title, p.description, ...(p.descriptors || []).map((d) => d.tag), rec?.identification?.garment, rec?.identification?.what_it_is].filter(Boolean).join(" ");
  let score = 0;
  const notes = [];
  if (spec.house) {
    const names = [spec.house, ...(spec.aliases || [])];
    const houseRead = rec?.identification?.house && names.some((h) => has(rec.identification.house, h) || has(h, rec.identification.house));
    const houseSeller = names.some((h) => has(p.brand, h) || has(p.sellerBrand, h));
    if (houseRead) { score += 3; notes.push(`house read: ${rec.identification.house} @${rec.confidence}`); }
    else if (houseSeller && !rec?.identification?.house) { score += 1.5; notes.push("house by seller tag, unread"); }
    else if (houseSeller && rec?.identification?.house) { score += 0.5; notes.push(`house DISAGREES: read ${rec.identification.house}`); }
    else { notes.push("house missing"); return { score: -1, notes }; }
  }
  for (const group of spec.need || []) {
    if (group.some((w) => has(words, w))) score += 1; else { notes.push(`missing: ${group.join("/")}`); return { score: -1, notes }; }
  }
  for (const w of spec.want || []) if (has(words, w)) { score += 0.75; notes.push(`has ${w}`); }
  if ([...AVOID_ALWAYS, ...(spec.avoid || [])].some((w) => has(words, w))) { notes.push("avoid word present"); score -= 3; }
  if (spec.men && /\b(women'?s|womens|ladies|girls)\b/i.test(`${p.title} ${rec?.identification?.what_it_is || ""}`) && !/\bmen'?s\b/i.test(p.title)) { notes.push("women's, spec is men's"); return { score: -1, notes }; }
  if (rec) score += rec.confidence;
  return { score, notes };
}

async function chooseFor(spec) {
  const raws = await searchEbayRaw(spec.q, { limit: 12 });
  const ranked = raws.map((s) => ({ s, t: titleScore(spec, s) })).filter((x) => x.t >= 0).sort((a, b) => b.t - a.t).slice(0, CANDIDATES);
  const tried = [];
  for (const { s } of ranked) {
    const result = await processListing(s, { deep: true });
    const match = specMatch(spec, result);
    tried.push({ result, match });
    if (match.score >= (spec.house ? 4.5 : 2.5)) break; // good enough — stop spending
  }
  tried.sort((a, b) => b.match.score - a.match.score);
  return { spec, searched: raws.length, tried, chosen: tried[0]?.match.score >= 0 ? tried[0] : null };
}

const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);
const status = streamStatus();
console.log(`ASTERISK GHOSTS · ${WRITE ? "WRITE" : "dry run"} · identify ${status.identify.enabled ? `${status.identify.model}/${status.identify.effort}${status.identify.search ? "+search" : ""}` : "OFF"} · candidates ${CANDIDATES}\n`);
if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) { console.error("no eBay keys in .env.local"); process.exit(2); }

let chosen = [];
let cost = 0, reads = 0;
if (BASE) {
  const prior = JSON.parse(fs.readFileSync(BASE, "utf8"));
  chosen = (prior.chosen || []).filter((c) => !ONLY || !ONLY.has(c.spec.n));
  console.log(`base: ${chosen.length} pieces kept from ${BASE}\n`);
}
if (FROM) {
  chosen = JSON.parse(fs.readFileSync(FROM, "utf8")).chosen || [];
  console.log(`from: ${chosen.length} pieces in ${FROM}`);
}
for (const spec of FROM ? [] : SPECS) {
  if (ONLY && !ONLY.has(spec.n)) continue;
  let pick;
  try { pick = await chooseFor(spec); } catch (e) { console.log(`${pad(spec.n, 3)} ${pad(spec.q, 44)} FAILED: ${String(e.message).slice(0, 160)}\n`); continue; }
  for (const t of pick.tried) { cost += t.result.summary.costUsd || 0; reads += 1; }
  if (!pick.chosen) { console.log(`${pad(spec.n, 3)} ${pad(spec.q, 44)} ∅ no candidate matched (${pick.searched} searched, ${pick.tried.length} read)\n`); continue; }
  const { result, match } = pick.chosen;
  const p = result.product, rec = p.identification;
  const y = rec?.identification?.year;
  console.log(`${pad(spec.n, 3)} ${pad(spec.q, 44)} → ${p.title.slice(0, 70)}`);
  console.log(`    ${p.brand}${p.sellerBrand ? ` (seller: ${p.sellerBrand})` : ""} · ${p.category} · ${p.era?.decade || "?"} · ${p.size?.label || "—"} · ${p.currency} ${p.price} · match ${match.score.toFixed(2)} · $${(result.summary.costUsd || 0).toFixed(2)}`);
  if (rec) console.log(`    ↳ ${[rec.identification.house, rec.identification.line, rec.identification.garment, y?.value ? `${y.value} (${y.confidence})` : y?.low || y?.high ? `${y.low ?? "?"}–${y.high ?? "?"}` : null].filter(Boolean).join(" · ")} · conf ${rec.confidence}`);
  if (rec) console.log(`    ↳ ${rec.identification.what_it_is.slice(0, 150)}`);
  console.log(`    ↳ ${(p.descriptors || []).slice(0, 10).map((d) => d.tag).join(" · ")}`);
  console.log(`    ↳ ${match.notes.join("; ")}\n`);
  chosen.push({ spec: { n: spec.n, q: spec.q, house: spec.house || null }, match, product: { ...p, listing_kind: "ghost" }, decoded: result.decoded, readings: result.readings, identification: result.identification });
}

chosen.sort((a, b) => a.spec.n - b.spec.n);
console.log(`═══ ${chosen.length}/${SPECS.length} chosen · ${reads} reads this run · $${cost.toFixed(2)}`);
if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify({ at: new Date().toISOString(), cost, chosen }, null, 1)); console.log(`wrote ${JSON_OUT}`); }

if (WRITE && chosen.length) {
  // ONE WRITER. This used to inline the upsert, the tag rows, the images and
  // the identification — the same four writes lib/ingest/adapters/sync.js
  // performs, in a second dialect that would drift from the first. It calls
  // persistProducts now (the catalog ingest calls it too); the only thing
  // peculiar to a ghost is the listing_kind it carries in.
  const { persistProducts } = await import("../lib/ingest/adapters/sync.js");
  const { recordSyncLog } = await import("../lib/db/production.js");
  const { normalizeSourceProduct } = await import("../lib/ingest/adapters/normalize.js");
  const { verifyProductColors } = await import("../lib/ingest/colorEvidence.js");
  const products = await verifyProductColors(chosen.map((c) => ({ ...normalizeSourceProduct({ ...c.product, source_product_id: c.product.source_product_id || c.product.id, source_product_url: c.product.url }, "ebay"), listing_kind: "ghost" })));
  const results = chosen.map((c, i) => ({ product: products[i], identification: c.identification, decoded: c.decoded, readings: c.readings }));
  const upserted = await persistProducts(products, { sourceName: "ebay", results });
  await recordSyncLog({ sourceName: "ebay", enabled: true, itemsSeen: chosen.length, itemsUpserted: upserted, status: "ok", note: "asterisk ghosts" }).catch(() => {});
  console.log(`wrote ${upserted} ghost listings`);
}
process.exit(0);
