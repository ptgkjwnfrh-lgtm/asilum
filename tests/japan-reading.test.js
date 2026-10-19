// tests/japan-reading.test.js
// READING JAPANESE LISTINGS — and, more importantly, NOT GUESSING AT THEM.
//
// The pressure on this module will be to fill the gaps with something clever:
// transliterate the katakana, fuzzy-match to the nearest house, ask a model.
// Every one of those turns an unread word into a confident wrong answer on a
// ¥77,000 listing. The refusals are the tests.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readJapaneseTitle, unreadFromTitles } from "../lib/ingest/japan/read.js";
import { HOUSES, COLORS, TABLES } from "../lib/ingest/japan/vocabulary.js";
import { TYPE_WEIGHTS } from "../lib/search/denseQuery.js";
import { adapterStatuses } from "../lib/ingest/adapters/index.js";
import { readEvidence } from "../lib/authenticity/evidence.js";

test("a real listing reads into facets", () => {
  const r = readJapaneseTitle("【中古】ディオール シルク スカーフ ネイビー Aランク");
  assert.equal(r.facets.brand, "Dior");
  assert.equal(r.facets.garment, "scarf");
  assert.equal(r.facets.material, "silk");
  assert.equal(r.facets.condition, "excellent", "Aランク is not merely 'used'");
});

test("the longest condition wins — 新品未使用 is not 新品", () => {
  assert.equal(readJapaneseTitle("サンローラン 新品未使用").facets.condition, "new");
  assert.equal(readJapaneseTitle("サンローラン 未使用に近い").facets.condition, "near-unused");
});

test("IT DOES NOT GUESS — an unknown house is queued, never transliterated", () => {
  const r = readJapaneseTitle("トロッター柄 ツイリー");
  assert.equal(r.facets.brand, undefined, "no brand may be invented");
  assert.ok(r.unread.includes("トロッター"), "the unread word goes to a person");
});

test("what was READ never appears in the archivalist queue", () => {
  // A word the tables consumed is not an open question. Leaking it would send
  // an archivalist to rule on something already ruled.
  const r = readJapaneseTitle("ヘルムートラング パンツ 古着 ウール レディース");
  assert.equal(r.archive, true);
  assert.deepEqual(r.unread, [], "everything here was read");
});

test("the queue is ordered by how much reading a mapping buys", () => {
  const q = unreadFromTitles([
    "アルパカ コート", "アルパカ ニット", "アルパカ シャツ", "モヘア コート",
  ]);
  assert.equal(q[0].term, "アルパカ");
  assert.equal(q[0].count, 3, "the frequent word is worth an archivalist's hour first");
});

test("COLOUR IS A CLAIM, not a facet", () => {
  // A katakana colour word is worth no more than an English one: it goes
  // through lib/ingest/colorEvidence.js and only survives if the photographs
  // agree. Promoting it here would let a Japanese listing assert what an
  // English one must prove.
  const r = readJapaneseTitle("プラダ バッグ ブラック");
  assert.equal(r.merchantColor, "black");
  assert.equal(r.facets.color, undefined, "colour must not reach the facet directly");
});

test("every facet the reader emits is a real facet", () => {
  // The whole point of mapping to facet VALUES is that a Japanese listing lands
  // on the same axes as an English one. A typo here would create a private
  // vocabulary that search cannot see.
  const emitted = new Set();
  for (const title of ["ディオール スカーフ シルク 美品 メンズ", "プラダ ブーツ レザー 中古 レディース"]) {
    for (const key of Object.keys(readJapaneseTitle(title).facets)) emitted.add(key);
  }
  assert.ok(emitted.size >= 4);
  // Checked against the search scorer's facet table, which is the register
  // available on this branch. When PR #415 lands, this should read
  // lib/tagging/vocabulary.js FACETS instead — same property, one register.
  const known = new Set([...Object.keys(TYPE_WEIGHTS), "condition", "color", "silhouette"]);
  for (const facet of emitted) {
    assert.ok(known.has(facet),
      `"${facet}" is not a facet the scorer knows — it would land on the unknown floor`);
  }
});

test("A SELLER ADMISSION IS EVIDENCE; a seller's assertion is not", async () => {
  assert.equal(readJapaneseTitle("バレンシアガ スーパーコピー").claim, "declared-replica");
  assert.equal(readJapaneseTitle("サンローラン 正規品").claim, "asserted");

  const piece = (sellerClaim) => ({
    id: "j1", price: 900, source_name: "taobao",
    source_product_url: "https://example.com/1", sellerClaim,
  });
  const declared = await readEvidence(piece("declared-replica"));
  assert.ok(declared.observations.some((o) => /describes this listing as a copy/.test(o.said)),
    "an admission against interest is reported");
  const asserted = await readEvidence(piece("asserted"));
  assert.equal(asserted.observations.length, 0,
    "repeating a seller's 'genuine' back would turn a claim into an endorsement");
});

test("a declared replica outranks an asserted genuine in the same title", () => {
  // A seller claiming both is telling us the useful half.
  assert.equal(readJapaneseTitle("正規品 スーパーコピー").claim, "declared-replica");
});

test("the tables are null-prototype — a listing word is not a property name", () => {
  // The same trap the tag register and the search vocabulary both hit.
  for (const [name, table] of Object.entries(TABLES)) {
    assert.equal(Object.getPrototypeOf(table), null, `${name} must not inherit`);
  }
  assert.equal(readJapaneseTitle("constructor toString").facets.brand, undefined);
  assert.equal(HOUSES.constructor, undefined);
  assert.equal(COLORS.toString, undefined);
});

test("the reader is pure — no network, no database, no model", () => {
  const src = readFileSync("lib/ingest/japan/read.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /fetch\(|getPool|import\(|adapter|openai|anthropic/i,
    "reading a title must not reach for anything");
});

test("the proxies are DECLARED and honestly disabled", () => {
  // Blocked on an agreement, not on code. A disabled adapter that states its
  // blocker is the truthful shape; a stub that returned fake listings is the
  // thing this codebase refuses to do.
  const byName = Object.fromEntries(adapterStatuses().map((s) => [s.source, s]));
  for (const source of ["buyee", "zenmarket"]) {
    assert.ok(byName[source], `${source} must be registered so its status is visible`);
    assert.equal(byName[source].enabled, false, `${source} must not be live`);
    assert.match(byName[source].needs, /agreement/i,
      `${source} must name the agreement it waits on, not just an env var`);
  }
});
