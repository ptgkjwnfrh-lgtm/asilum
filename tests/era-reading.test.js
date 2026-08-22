// tests/era-reading.test.js — the search engine reads the production date it
// already owns (lib/search/era.js), and reads it narrowly.
//
// The contract under test is not "era words return something". It is:
//   * an era word becomes a CONSTRAINT over the real `era` field, never a
//     ranking bonus that leaves 2025 pieces in a 1990s rack;
//   * the words this module deliberately does NOT claim stay unclaimed
//     (y2k, archival, a bare season word, a budget magnitude);
//   * an undated piece cannot be sold as a dated one;
//   * a query naming no era is untouched.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseEraConstraint, itemMatchesEra, applyEraConstraint, eraMissNote,
  ERA_WORDS, VINTAGE_MIN_AGE,
} from "../lib/search/era.js";
import { correctTokens, buildTypoVocab } from "../lib/search/typo.js";
import { searchProducts, GARMENT_CATEGORY, GENERIC_GARMENT_NOUNS } from "../lib/search/index.js";

const toks = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
const parse = (s, nowYear = 2026) => parseEraConstraint(toks(s), { nowYear });

const item = (year, season = "Resort") => ({ id: "x", era: { year, season, decade: `${Math.floor(year / 10) * 10}s` } });

test("decade words resolve to their most recent occurrence, not the 1890s", () => {
  for (const w of ["90s", "1990s", "nineties"]) {
    const { era } = parse(`${w} jacket`);
    assert.deepEqual([era.minYear, era.maxYear], [1990, 1999], w);
    assert.equal(era.label, "the 1990s");
  }
  assert.deepEqual([parse("2020s knit").era.minYear, parse("2020s knit").era.maxYear], [2020, 2029]);
});

test("early / mid / late split the decade at declared boundaries", () => {
  assert.deepEqual([parse("early 2000s tops").era.minYear, parse("early 2000s tops").era.maxYear], [2000, 2003]);
  assert.deepEqual([parse("mid 2010s tops").era.minYear, parse("mid 2010s tops").era.maxYear], [2014, 2016]);
  assert.deepEqual([parse("late 90s tops").era.minYear, parse("late 90s tops").era.maxYear], [1997, 1999]);
});

test("a season is an era claim only when a year follows it", () => {
  const withYear = parse("fall 2015 jacket").era;
  assert.equal(withYear.season, "Fall/Winter");
  assert.deepEqual([withYear.minYear, withYear.maxYear], [2015, 2015]);
  assert.equal(parse("resort 2016 knit").era.season, "Resort");
  assert.equal(parse("pre fall 2019 knit").era.season, "Pre-Fall");
  // Bare season words belong to the climate constraint, not to a date.
  assert.equal(parse("winter coat").era, null);
  assert.equal(parse("summer dress").era, null);
  // …and the word survives for text/climate scoring.
  assert.ok(parse("winter coat").tokens.includes("winter"));
});

test("vintage is an age claim measured against the supplied year, never the wall clock", () => {
  const { era } = parse("vintage knit", 2026);
  assert.equal(era.maxYear, 2026 - VINTAGE_MIN_AGE);
  assert.equal(parse("vintage knit", 2030).era.maxYear, 2030 - VINTAGE_MIN_AGE);
});

test("the words this module refuses to claim stay unclaimed", () => {
  // y2k names a look (it already maps to aesthetic tags); archival is one of
  // the ten brain tags. Reading either as a date would replace a working
  // answer with a filter.
  assert.equal(parse("y2k jacket").era, null);
  assert.equal(parse("archival jacket").era, null);
  assert.equal(parse("archive jacket").era, null);
});

test("a four-digit number behind a budget word is a magnitude, not a year", () => {
  // Measured in run 1 of measure-attribute-reading: "over 2000 jacket" had
  // filtered the rack to nine pieces made in the year 2000.
  for (const q of ["over 2000 jacket", "above 2000 jacket", "between 1000 and 2000 jacket", "under 2000 jacket"]) {
    assert.equal(parse(q).era, null, q);
  }
  // A bare year is still a year.
  assert.equal(parse("2000 jacket").era.minYear, 2000);
});

test("an undated piece cannot claim a date", () => {
  const { era } = parse("90s jacket");
  assert.equal(itemMatchesEra({ id: "u", era: null }, era), false);
  assert.equal(itemMatchesEra({ id: "u" }, era), false);
  assert.equal(itemMatchesEra(item(1995), era), true);
  assert.equal(itemMatchesEra(item(2001), era), false);
  // Season must match exactly when one was asked for.
  const fw = parse("fall 2015 jacket").era;
  assert.equal(itemMatchesEra(item(2015, "Fall/Winter"), fw), true);
  assert.equal(itemMatchesEra(item(2015, "Resort"), fw), false);
});

test("applyEraConstraint filters, and a null constraint is a no-op", () => {
  const items = [item(1995), item(2005), item(2020)];
  assert.equal(applyEraConstraint(items, parse("90s knit").era).length, 1);
  assert.equal(applyEraConstraint(items, null).length, 3);
});

test("the miss note names the nearest year, never a range that contradicts the ask", () => {
  const era = parse("late 90s bottoms").era;
  const note = eraMissNote(era, [item(1996), item(2020)], "bottoms");
  assert.match(note, /nearest here is 1996/);
  assert.match(note, /in bottoms/);
  // "what is here runs 1990–2025" would read as a contradiction: the range
  // covers the ask while the window is empty.
  assert.doesNotMatch(note, /runs/);
  // The fallback sentence has to say both halves.
  assert.match(eraMissNote(era, [item(1996)], "bottoms", { fellBack: true }), /showing bottoms instead/);
  assert.match(eraMissNote(era, [{ id: "n", era: null }]), /no production year/);
});

test("the typo bridge never rewrites an era word", () => {
  const vocab = buildTypoVocab({
    garmentKeys: [...Object.keys(GARMENT_CATEGORY), ...Object.keys(GENERIC_GARMENT_NOUNS)],
    mappings: [],
  });
  const words = [...ERA_WORDS].filter((w) => w.length >= 5 && /^[a-z]+$/.test(w));
  assert.ok(words.length >= 8, "era vocabulary should be worth protecting");
  const { tokens, corrections } = correctTokens(words, vocab, () => false);
  assert.deepEqual(tokens, words);
  assert.deepEqual(corrections, []);
});

// ---- engine level ---------------------------------------------------------

test("an era query serves only pieces from that era", async () => {
  const r = await searchProducts("90s jacket", { limit: 24 });
  assert.ok(r.results.length > 0);
  for (const it of r.results) {
    assert.ok(it.era.year >= 1990 && it.era.year <= 1999, `${it.id} ${it.era.year}`);
  }
  assert.equal(r.interpreted.era.label, "the 1990s");
  assert.match(r.note, /reading "90s" as the 1990s/);
  // The era word is read, so it is never reported as unmatched.
  assert.equal(r.unmatchedTokens.includes("90s"), false);
});

test("an era this catalog cannot serve falls back and says both halves", async () => {
  // MEASURED (vibe sweep run 2): filtering to empty turned four curated
  // decade racks into blank pages. An era narrows; it never replaces with
  // nothing. The disclosure has to carry the miss AND what is shown instead.
  const r = await searchProducts("80s jacket", { limit: 24 });
  assert.ok(r.results.length > 0, "falls back to the era-free rack");
  assert.equal(r.interpreted.era.served, false);
  assert.match(r.note, /nothing from the 1980s in outerwear/);
  assert.match(r.note, /nearest here is \d{4}/);
  assert.match(r.note, /showing outerwear instead/);
});

test("a decade with no pieces keeps its cultural reading instead of going blank", async () => {
  const r = await searchProducts("1980s", { limit: 24 });
  assert.equal(r.cultural.engaged, true);
  assert.ok(r.results.length > 0);
  assert.equal(r.interpreted.era.served, false);
});

test("a decade the catalog CAN serve is read as a date, not a look", async () => {
  const r = await searchProducts("1990s", { limit: 24 });
  assert.ok(r.results.length > 0);
  assert.equal(r.interpreted.era.served, true);
  for (const it of r.results) assert.ok(it.era.year >= 1990 && it.era.year <= 1999, it.id);
});

test("an era is never blamed for a pool a budget already emptied", async () => {
  const r = await searchProducts("80s jacket under 400", { limit: 24 });
  assert.equal(r.results.length, 0);
  assert.match(r.note, /under \$400/);
  assert.doesNotMatch(r.note, /1980s/);
});

test("era reading composes with the cultural tier instead of overriding it", async () => {
  const r = await searchProducts("90s marilyn manson", { limit: 24 });
  assert.equal(r.cultural.engaged, true);
  assert.ok(r.results.length > 0);
  for (const it of r.results) assert.ok(it.era.year < 2000, `${it.id} ${it.era.year}`);
});

test("a query naming no era is byte-identical with the reading off", async () => {
  for (const q of ["jacket", "trashed jeans", "good blanks", "y2k jacket", "winter coat"]) {
    const on = await searchProducts(q, { limit: 24, eraReading: true });
    const off = await searchProducts(q, { limit: 24, eraReading: false });
    const print = (r) => r.results.map((it) => `${it.id}|${it.matchReason}|${it.confidenceScore}`);
    assert.deepEqual(print(on), print(off), q);
    assert.equal(on.note, off.note, q);
  }
});

test("the kill flag restores the pre-change behavior exactly", async () => {
  const off = await searchProducts("vintage knit", { limit: 24, eraReading: false });
  assert.ok(off.results.length > 0);
  assert.ok(off.results.some((it) => it.era.year > 2006), "unfiltered rack");
  assert.match(off.note, /no piece here matches "vintage"/);
});
