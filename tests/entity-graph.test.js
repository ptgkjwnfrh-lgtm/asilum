// tests/entity-graph.test.js — the entity graph and the source registry
// (V.2 brief §9). The laws: one record per entity; every relationship's
// ends exist and every relationship cites a source that exists; a claim
// cites only a registered source; no quotation without a source; a house
// from the curated register is labelled editorial, never sourced; a spot
// is a sourced permanent place, never a fixture; the finder is
// typo-tolerant and never names two; the overview says what it cannot say.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENTITIES, RELATIONS, ENTITY_TYPES, entityById, findEntity, overviewFor, chronologyFor, designersAt, graphCoverage, PASSENGER_ELIGIBILITY,
} from "../lib/entities/graph.js";
import { SOURCES, SOURCE_RIGHTS, sourceById, sourcesFor } from "../lib/entities/sources.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

test("every source row is complete and its rights basis is one of the named kinds", () => {
  for (const s of Object.values(SOURCES)) {
    assert.ok(s.id && s.publisher && s.retrievedAt && s.claimContext, s.id + " is incomplete");
    assert.ok(SOURCE_RIGHTS.includes(s.rightsBasis), s.id + " rights basis");
    assert.ok(s.url === null || /^https:\/\//.test(s.url), s.id + " url");
    assert.ok("reviewed" in s, s.id + " must say whether a person reviewed it");
  }
  assert.equal(sourceById("made-up"), null);
  assert.deepEqual(sourcesFor([{ source: "ap" }, { source: "ap" }, { source: "nope" }]).map((s) => s.id), ["ap"]);
});

test("the register is canonical: one record per entity, typed, with ends that exist", () => {
  const seen = new Set();
  for (const e of ENTITIES) {
    assert.ok(ENTITY_TYPES.includes(e.type), e.id + " type");
    // an entity's own aliases may repeat its name; two ENTITIES may not share one
    for (const key of new Set([e.name, ...(e.aliases || [])].map(fold))) {
      assert.ok(!seen.has(key), `"${key}" names two entities`);
      seen.add(key);
    }
  }
  for (const r of RELATIONS) {
    assert.ok(entityById(r.from), r.from + " missing");
    assert.ok(entityById(r.to), r.to + " missing");
    assert.ok(SOURCES[r.source], `relation ${r.from}→${r.to} cites ${r.source}, which is not registered`);
    assert.ok(r.role && r.start, "a tenure carries a role and a start");
  }
  const cov = graphCoverage();
  assert.equal(cov.entities, ENTITIES.length);
  assert.ok(cov.byType.house > 50, "the curated house register rides in");
  assert.equal(cov.byType.artist, 0, "no artist is invented");
  assert.equal(cov.byType.passenger, 0, "no passenger qualifies yet");
});

test("claims cite registered sources; a quotation never appears without one; curated origin is editorial", () => {
  for (const e of ENTITIES) {
    for (const f of e.facts || []) assert.ok(SOURCES[f.source], `${e.id}: claim "${f.claim}" cites ${f.source}`);
    if (e.quote) assert.ok(e.quote.source && SOURCES[e.quote.source], e.id + " quote without a source");
    if (e.type === "house") assert.ok(SOURCES[e.basisSource], e.id + " basis source");
  }
  const rick = overviewFor("house-rick-owens");
  assert.equal(rick.type, "house");
  assert.match(rick.editorialNote, /editorial knowledge, not a sourced fact/);
  assert.deepEqual(rick.missing, ["authorized introduction", "founder card"]);
  const rab = overviewFor("rabanne");
  assert.equal(rab.editorialNote, null, "a house with a sourced basis is not labelled editorial");
  assert.equal(rab.basisSource.id, "puig");
});

test("a spot is a sourced permanent place; fixtures and dated events never become spots", () => {
  const spots = ENTITIES.filter((e) => e.type === "spot");
  assert.ok(spots.length >= 1);
  for (const s of spots) assert.ok(s.sourceUrl, s.id + " has no official link");
  assert.ok(!spots.some((s) => s.placeId === "pgc-fashion-week-2026"), "a dated event is not a spot");
  const g = overviewFor("spot-palais-galliera");
  assert.equal(g.kind, "exhibition"); assert.match(g.locality, /Paris/); assert.ok(g.sourceUrl);
});

test("the finder is typo-tolerant and never names two", () => {
  assert.equal(findEntity("rousteing").id, "olivier-rousteing");
  assert.equal(findEntity("rousting").id, "olivier-rousteing", "one edit on a surname alone");
  assert.equal(findEntity("olivier rousting").id, "olivier-rousteing");
  assert.equal(findEntity("rabane").id, "rabanne", "the house, not the designer whose alias mentions it");
  assert.equal(findEntity("paco rabanne").id, "rabanne");
  assert.equal(findEntity("balmain").id, "balmain");
  assert.equal(findEntity("Rick Owens leather jacket").id, "house-rick-owens");
  assert.equal(findEntity("palais galliera").id, "spot-palais-galliera");
  assert.equal(findEntity("black cropped leather jacket"), null, "a product query names no one");
  assert.equal(findEntity("paris"), null, "a city alone names no house");
  assert.equal(findEntity(""), null);
});

test("chronology runs in date order both ways and links designer and house", () => {
  const c = chronologyFor("olivier-rousteing");
  assert.deepEqual(c.map((x) => [x.house.id, x.role, x.start, x.end]), [["balmain", "Creative Director", "2011", "2025"], ["rabanne", "Creative Director", "2026-07", null]]);
  assert.equal(c[0].source.id, "ap"); assert.equal(c[1].source.id, "puig");
  assert.deepEqual(designersAt("balmain").map((d) => d.designer.id), ["olivier-rousteing"]);
  const o = overviewFor("olivier-rousteing");
  assert.equal(o.chronology.length, 2);
  assert.deepEqual(o.missing, ["attributed quotation"], "the intro is sourced; the quotation is honestly absent");
  assert.ok(o.sources.some((s) => s.id === "puig") && o.sources.some((s) => s.id === "ap"));
});

test("the passenger rule is recorded, configurable, and nobody qualifies yet", () => {
  assert.equal(PASSENGER_ELIGIBILITY.impressionsPerMonth, 1_000_000);
  assert.equal(PASSENGER_ELIGIBILITY.consecutiveMonths, 6);
  assert.equal(PASSENGER_ELIGIBILITY.configurable, true);
  assert.match(PASSENGER_ELIGIBILITY.separately, /never added into impressions/);
});

test("search and discover read the graph; the sheet opens linked entities inside itself", () => {
  const search = read("app/components/SearchSheet.jsx");
  assert.ok(/findEntity\(q\)/.test(search) && !/findOverview/.test(search));
  const discover = read("app/discover/page.js");
  assert.ok(/findEntity\(searched\)/.test(discover) && !/findOverview/.test(discover));
  const sheet = read("app/components/OverviewSheet.jsx");
  assert.ok(/pushSheet\("overview", \{ entity: next/.test(sheet), "a chip pushes the linked entity onto the sheet stack");
  const card = read("app/components/EntityOverview.jsx");
  assert.ok(/no approved \{o\.missing\.join/.test(card), "the card prints what it cannot say");
  assert.ok(/trains your taste on the house's tags/.test(card), "STAMP names its exact effect");
});
