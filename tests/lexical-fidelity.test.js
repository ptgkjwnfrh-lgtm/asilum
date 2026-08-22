// tests/lexical-fidelity.test.js — the words a person actually types.
//
// Three measured failures, all about spelling rather than knowledge:
//
//   ACCENTS      "alaia dress" returned 40 dresses, NOT ONE of them Alaïa,
//                opening on a Salomon shirt dress; "stussy tee" returned 160
//                tops with no Stüssy; "comme des garcons" returned the right
//                14 items under the FALSE sentence `no piece here matches
//                "garcons" — showing comme des instead`.
//   CORRUPTION   "hot weather trousers" printed `reading "weather" as
//                "leather"` and then explained the rack in terms of a
//                material the person never typed. Also print→point,
//                stock→sock.
//   SPELLING     "rickowens" 621 items, "junyawatanabe" 529, "balenciga" 784
//                — compositional dumps under a note saying nothing matched.
//
// Measured before/after in scripts/measure-lexical-fidelity.mjs:
//   accent misses 2/9 -> 0 · corruptions 4/6 -> 0 · spelling dumps 7/10 -> 0
//   wrong resolutions 7/10 -> 0 · typo regressions 0/5 -> 0
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import { foldAccents, foldNorm, skeleton } from "../lib/search/text.js";
import { searchProducts, resolveBrandSpelling } from "../lib/search/index.js";
import { correctTokens, buildTypoVocab } from "../lib/search/typo.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const BRANDS = [...new Set(CATALOG.map((it) => it.brand).filter(Boolean))];

test("folding is accent-only, and symmetric", () => {
  assert.equal(foldAccents("Garçons"), "Garcons");
  assert.equal(foldNorm("  Aimé Leon Doré "), "aime leon dore");
  assert.equal(foldNorm("alaïa"), foldNorm("alaia"));
  assert.equal(skeleton("Comme des Garçons"), "commedesgarcons");
  // No stemming, no transliteration of what does not decompose.
  assert.equal(foldNorm("Stüssy"), "stussy");
  assert.equal(foldAccents("Straße"), "Straße");
});

test("an accented house answers to the way people type it, and to itself", async () => {
  for (const [q, house] of [
    ["alaia dress", "Alaïa"],
    ["alaïa dress", "Alaïa"],
    ["stussy tee", "Stüssy"],
    ["comme des garcons", "Comme des Garçons"],
    ["garçons knit", "Comme des Garçons"],
    ["aime leon dore", "Aimé Leon Dore"],
  ]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.ok(r.results.some((it) => it.brand === house), `${q} found no ${house}`);
  }
});

test("the right answer no longer wears a wrong explanation", async () => {
  const r = await searchProducts("comme des garcons", { limit: 24 });
  assert.ok(r.results.length > 0);
  assert.doesNotMatch(String(r.note || ""), /no piece here matches "garcons"/);
});

test("the bridge no longer rewrites ordinary English into fashion vocabulary", async () => {
  for (const [q, word] of [
    ["hot weather trousers", "weather"],
    ["cold weather boots", "weather"],
    ["shirt minus the print", "print"],
    ["in stock jacket", "stock"],
  ]) {
    const r = await searchProducts(q, { limit: 24 });
    const corrupted = (r.interpreted.typoCorrections || []).some((c) => c.from === word);
    assert.equal(corrupted, false, `${q} still rewrites "${word}"`);
    assert.doesNotMatch(String(r.note || ""), /as "leather"/);
  }
});

test("a correction may not change the first letter", () => {
  const vocab = buildTypoVocab({ garmentKeys: ["leather", "sweater", "jacket"], mappings: [] });
  // weather -> leather is distance 1 and was the live corruption.
  const { corrections } = correctTokens(["weather"], vocab, () => false);
  assert.deepEqual(corrections, []);
  // A slip inside the word is still corrected.
  const ok = correctTokens(["sweter"], vocab, () => false);
  assert.equal(ok.tokens[0], "sweater");
});

test("the typos the bridge exists for still get corrected", async () => {
  for (const [q, to] of [["sweter", "sweater"], ["trousrs", "trousers"],
                         ["jaket", "jacket"], ["sneakrs", "sneakers"], ["hoddie", "hoodie"]]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.ok((r.interpreted.typoCorrections || []).some((c) => c.from === q && c.to === to),
      `${q} lost its correction`);
  }
});

test("a house name resolves de-spaced or one letter off, and says so", async () => {
  for (const [q, house] of [
    ["rickowens", "Rick Owens"],
    ["junyawatanabe", "Junya Watanabe"],
    ["commedesgarcons", "Comme des Garçons"],
    ["balenciga", "Balenciaga"],
    ["jill sander", "Jil Sander"],
  ]) {
    const r = await searchProducts(q, { limit: 24 });
    assert.equal(r.interpreted.brandSpelling?.resolved, house, q);
    assert.ok(r.results.every((it) => it.brand === house), `${q} served another house`);
    assert.match(r.note, new RegExp(`reading "${q}" as ${house.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("a resolved spelling is never also reported as unmatched", async () => {
  // `reading "rickowens" as Rick Owens; no piece here matches "rickowens"`
  // is a sentence arguing with itself.
  const r = await searchProducts("rickowens", { limit: 24 });
  assert.doesNotMatch(r.note, /no piece here matches/);
  assert.deepEqual(r.unmatchedTokens, []);
});

test("ambiguity falls through instead of picking", () => {
  assert.equal(resolveBrandSpelling("issey miake", BRANDS), null);
  assert.equal(resolveBrandSpelling("telfar", BRANDS), null);
  // Too short to risk.
  assert.equal(resolveBrandSpelling("acne", BRANDS), null);
  // Exact skeleton still resolves.
  assert.equal(resolveBrandSpelling("acnestudios", BRANDS).brand, "Acne Studios");
});

test("a house this catalog does not stock is not invented", async () => {
  const r = await searchProducts("telfar", { limit: 24 });
  assert.equal(r.interpreted.brandSpelling, null);
  assert.equal(r.results.length, 0);
});

test("the kill flag restores the pre-change spelling behavior", async () => {
  const off = await searchProducts("rickowens", { limit: 24, brandSpelling: false });
  assert.equal(off.interpreted.brandSpelling, null);
  assert.ok(off.total > 200, "falls back to the compositional dump it used to be");
});
