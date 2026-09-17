// tests/descriptor-vocabulary.test.js — one word for one thing in the stream.
//
// MEASURED (deep first light, 10 Sep 2026): the identification step named
// one 1970s construction three ways on three listings — "dagger collar",
// "dagger lapels", "dagger point collar" — and each spelling became its own
// key in item.tags and its own stream. This pins the glossary that folds
// them, and the laws that keep it honest: every concept sourced, every term
// claimed once, nothing invented for a word the glossary does not know.
process.env.DATABASE_URL = "";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DESCRIPTOR_CONCEPTS, DESCRIPTOR_PROVENANCE, lookupDescriptor, canonicalDescriptor,
  reconcileDescriptors, descriptorTerms, promptVocabulary, eraOfDescriptor, normalizeTerm,
} from "../lib/asterisk/descriptors.js";
import { FACETS } from "../lib/tagging/vocabulary.js";

// THE STREAM'S DESCRIPTOR SHAPE, pinned here verbatim from PR #465
// (lib/asterisk/stream/schema.js: DESCRIPTOR_RE, DESCRIPTOR_KINDS, and the
// kind → product_tags facet map in lib/asterisk/stream/tags.js). That branch
// is not on main yet, so the test carries the contract instead of importing
// it; when #465 lands, replace these three with the imports and delete this
// comment — the shared-constants test will then catch any drift.
const DESCRIPTOR_RE = /^[a-z0-9][a-z0-9' -]{0,29}$/;
const DESCRIPTOR_KINDS = ["garment", "material", "silhouette", "fit", "detail", "reference", "subculture", "mood", "collection", "decade", "origin", "color"];
const KIND_FACET = {
  garment: "garment", material: "material", silhouette: "silhouette", fit: "fit",
  detail: "detail", reference: "reference", subculture: "subculture", mood: "mood",
  collection: "collection", decade: "decade", origin: "origin",
};
// facets that exist on main today; `detail` and `reference` arrive with v51
const FACETS_ON_MAIN = new Set(Object.keys(FACETS));

test("every concept is sourced, legally spelled, and keyed to a kind the stream knows", () => {
  assert.ok(DESCRIPTOR_CONCEPTS.length >= 350, `expected the glossary, got ${DESCRIPTOR_CONCEPTS.length}`);
  assert.equal(DESCRIPTOR_PROVENANCE.method, "curated-web-informed");
  assert.match(DESCRIPTOR_PROVENANCE.curatedAt, /^\d{4}-\d{2}-\d{2}$/);
  for (const c of DESCRIPTOR_CONCEPTS) {
    assert.match(c.canonical, DESCRIPTOR_RE, `${c.canonical}: not a legal stream tag`);
    assert.equal(normalizeTerm(c.canonical), c.canonical, `${c.canonical}: the stream would respell it`);
    assert.ok(DESCRIPTOR_KINDS.includes(c.kind), `${c.canonical}: kind "${c.kind}"`);
    const facet = KIND_FACET[c.kind];
    assert.ok(c.kind === "color" || facet === "detail" || facet === "reference" || FACETS_ON_MAIN.has(facet),
      `${c.canonical}: kind "${c.kind}" lands on no product_tags facet`);
    assert.match(c.source, /^https:\/\//, `${c.canonical}: source`);
    assert.ok(c.meaning.length > 10 && c.meaning.length <= 160, `${c.canonical}: meaning`);
    for (const s of c.synonyms) assert.match(s, DESCRIPTOR_RE, `${c.canonical}: synonym "${s}"`);
  }
});

test("a term is claimed by exactly one concept", () => {
  const owner = new Map();
  for (const c of DESCRIPTOR_CONCEPTS) {
    for (const t of [c.canonical, ...c.synonyms]) {
      assert.ok(!owner.has(t) || owner.get(t) === c.canonical, `"${t}" claimed by ${owner.get(t)} and ${c.canonical}`);
      owner.set(t, c.canonical);
    }
  }
  assert.equal(descriptorTerms().length, owner.size);
});

test("the three spellings the model wrote on first light fold onto one word", () => {
  for (const spelling of ["dagger collar", "dagger lapels", "dagger point collar", "spearpoint collar", "Dagger Collar", "dagger-collar"]) {
    assert.equal(canonicalDescriptor(spelling), "dagger collar", spelling);
  }
  assert.equal(eraOfDescriptor("dagger lapels"), "1970s");
  assert.equal(canonicalDescriptor("type 3"), canonicalDescriptor("type iii"));
  assert.equal(canonicalDescriptor("selvage"), canonicalDescriptor("selvedge"));
});

test("plurals and singulars meet on one key; distinct things stay distinct", () => {
  assert.equal(canonicalDescriptor("welt pockets"), canonicalDescriptor("welt pocket"));
  assert.equal(canonicalDescriptor("flap chest pockets"), canonicalDescriptor("flap chest pocket"));
  assert.notEqual(canonicalDescriptor("type ii"), canonicalDescriptor("type iii"));
  assert.notEqual(canonicalDescriptor("peak lapel"), canonicalDescriptor("notch lapel"));
  assert.notEqual(canonicalDescriptor("derby"), canonicalDescriptor("oxford"));
});

test("a word the glossary does not know passes through unchanged — nothing is invented", () => {
  assert.equal(lookupDescriptor("bull head graphic"), null);
  assert.equal(canonicalDescriptor("bull head graphic"), "bull head graphic");
  assert.equal(canonicalDescriptor("Cowboy Patch!"), "cowboy patch");
  assert.equal(canonicalDescriptor(""), null);
  assert.equal(canonicalDescriptor("###"), null);
  assert.equal(normalizeTerm("Garçons"), "garcons");
});

test("reconciling a descriptor list keeps the strongest weight and the glossary's kind", () => {
  const { descriptors, merged } = reconcileDescriptors([
    { tag: "dagger lapels", weight: 0.7, kind: "detail" },
    { tag: "dagger collar", weight: 0.81, kind: "silhouette" },
    { tag: "dagger point collar", weight: 0.6, kind: "detail" },
    { tag: "bull head graphic", weight: 0.5, kind: "detail" },
    { tag: "lambskin", weight: 0.4, kind: "material" },
  ]);
  const dagger = descriptors.find((d) => d.tag === "dagger collar");
  assert.ok(dagger);
  assert.equal(dagger.weight, 0.81);
  assert.equal(dagger.kind, "detail");
  assert.equal(descriptors.length, 3);
  assert.deepEqual(merged.map((m) => m.from).sort(), ["dagger lapels", "dagger point collar"]);
  assert.ok(descriptors.some((d) => d.tag === "bull head graphic" && d.kind === "detail"));
});

test("the prompt sheet is compact and carries a meaning for every term", () => {
  const sheet = promptVocabulary();
  assert.ok(sheet.length >= 350);
  for (const row of sheet) {
    assert.ok(row.term && row.kind && row.meaning, JSON.stringify(row));
    assert.ok(row.meaning.length <= 160);
  }
  const details = promptVocabulary({ kinds: ["detail"] });
  assert.ok(details.length > 100 && details.every((r) => r.kind === "detail"));
});
