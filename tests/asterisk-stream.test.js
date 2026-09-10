// tests/asterisk-stream.test.js — THE STREAM, step by step, without a
// network: the parent's tags decoded (3), the identification capped (2/4),
// the tags composed into the one object the brain reads (4), the profile
// reflecting on an answer (5), the shared map's prior and how it bends
// alpha (5b). The model itself is exercised by tests/asterisk-identify-live
// .test.js, which runs only with a key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeAspects, aspectText, parentTagReadings } from "../lib/asterisk/stream/decode.js";
import { capIdentification, IdentificationSchema, DESCRIPTOR_CAP } from "../lib/asterisk/stream/schema.js";
import { composeTags, splitTags } from "../lib/asterisk/stream/tags.js";
import { buildMessages, SYSTEM_PROMPT, identifyConfig } from "../lib/asterisk/stream/identify.js";
import { processListing } from "../lib/asterisk/stream/index.js";
import { reflectOn, applyReflection, streamOutcomeRows, REFLECT_HIDE } from "../lib/brain/reflect.js";
import { learn, DESCRIPTOR_KEYS_CAP } from "../lib/brain/index.js";
import { blendedScore, STREAM_GAIN } from "../lib/brain/bridges.js";
import { bumpStreamOutcomes, getStreamPriors, itemStreamPrior, streamPrior, recordReflection, listReflections, purgeReflections, saveIdentification, getIdentifications } from "../lib/db/production.js";
import { normalizeSourceProduct, typedTagsFrom } from "../lib/ingest/adapters/normalize.js";
import { TAGS } from "../lib/brain/tags.js";

// the real seller tags of the first production item read on 10 Sep 2026
const ASPECTS = [
  { name: "Pattern", value: "Solid" }, { name: "Outer Shell Material", value: "Polyester" },
  { name: "Occasion", value: "Casual" }, { name: "Garment Care", value: "Dry Clean Only" },
  { name: "Size", value: "S" }, { name: "Color", value: "Black" }, { name: "Vintage", value: "No" },
  { name: "Brand", value: "HELMUT LANG" }, { name: "Insulation Material", value: "Polyester" },
  { name: "Personalize", value: "No" }, { name: "Size Type", value: "Regular" }, { name: "Type", value: "Jacket" },
  { name: "Department", value: "Men" }, { name: "Style", value: "Bomber Jacket" }, { name: "Theme", value: "Cowboy" },
  { name: "Season", value: "Fall, Spring" }, { name: "Features", value: "Snap Pockets, Utility Sleeve" },
];

function fakeRecord(over = {}) {
  return {
    identification: { house: "Helmut Lang", line: null, designer: null, garment: "bomber jacket", collection: "Travis Scott collaboration", season: "FW", year: { value: 2019, low: 2019, high: 2020, confidence: 0.7 }, origin: null, what_it_is: "a collaboration bomber" },
    evidence: ["cowboy graphic on the chest"], parent_tag_readings: [{ parent: "Theme=Cowboy", meaning: "the print's motif" }],
    construction: ["raglan sleeve"], materials: ["polyester shell"], fit: ["boxy"], details: ["snap pockets"], references: ["Travis Scott"], subcultures: [], mood: [],
    descriptors: [{ tag: "Snap Pockets", weight: 0.8, kind: "detail" }, { tag: "astroworld", weight: 0.6, kind: "reference" }, { tag: "boxy", weight: 0.7, kind: "fit" }],
    taste: Object.fromEntries(TAGS.map((t) => [t, t === "STREETWEAR" ? 0.9 : t === "STATEMENT" ? 0.8 : 0])),
    confidence: 0.8,
    ...over,
  };
}

test("step 3: eBay item specifics decode into canonical fields, lists split, noise dropped", () => {
  const d = decodeAspects(ASPECTS);
  assert.equal(d.brand, "HELMUT LANG");
  assert.equal(d.size, "S");
  assert.equal(d.style, "Bomber Jacket");
  assert.equal(d.theme, "Cowboy");
  assert.equal(d.vintage, false);
  assert.deepEqual(d.season, ["fall", "spring"]);
  assert.deepEqual(d.features, ["snap pockets", "utility sleeve"]);
  assert.equal(d.outerMaterial, "Polyester");
  assert.equal(d.raw.Personalize, "No", "raw keeps everything");
  assert.ok(!("personalize" in d), "noise never becomes a field");
  assert.match(aspectText(d), /Bomber Jacket/);
  const readings = parentTagReadings(d);
  assert.ok(readings.find((r) => r.parent === "Vintage=No" && /contemporary/.test(r.meaning)));
  assert.ok(readings.find((r) => r.parent === "Theme=Cowboy" && /motif/.test(r.meaning)));
});

test("step 3: a decade aspect and a year aspect both read; the object form is accepted", () => {
  assert.equal(decodeAspects({ Decade: "1990s" }).decade, "1990s");
  assert.equal(decodeAspects({ Era: "70s" }).decade, "1970s");
  const y = decodeAspects({ "Release Year": "1998" });
  assert.equal(y.year, 1998); assert.equal(y.decade, "1990s");
  assert.equal(decodeAspects({ "Release Year": "1492" }).year, undefined);
});

test("step 2: the identification is capped — confidence never confirmed, tags normalized, junk dropped, years bounded", () => {
  const rec = capIdentification(fakeRecord({
    confidence: 1, identification: { ...fakeRecord().identification, year: { value: 2500, low: null, high: null, confidence: 1 } },
    descriptors: [
      { tag: "  DAGGER   Collar ", weight: 1, kind: "detail" },
      { tag: "dagger collar", weight: 0.4, kind: "detail" },
      { tag: "x", weight: 0.05, kind: "detail" },
      { tag: "<script>alert(1)</script>", weight: 0.9, kind: "reference" },
      { tag: "not a kind", weight: 0.9, kind: "banana" },
      ...Array.from({ length: 50 }, (_, i) => ({ tag: `filler ${i}`, weight: 0.5, kind: "detail" })),
    ],
  }));
  assert.equal(rec.confidence, 0.95);
  assert.equal(rec.identification.year.value, null, "a year outside 1900–2030 is dropped");
  assert.equal(rec.identification.year.confidence, 0.95);
  assert.equal(rec.descriptors[0].tag, "dagger collar");
  assert.equal(rec.descriptors[0].weight, 0.9, "descriptor weight caps at 0.9 — never an aesthetic's full 1.0");
  assert.equal(rec.descriptors.filter((d) => d.tag === "dagger collar").length, 1, "deduped");
  assert.ok(!rec.descriptors.find((d) => /script|alert/.test(d.tag) && d.tag.includes("<")));
  assert.ok(!rec.descriptors.find((d) => d.tag === "x"), "a weight under 0.1 is dropped");
  assert.ok(!rec.descriptors.find((d) => d.tag === "not a kind"));
  assert.equal(rec.descriptors.length, DESCRIPTOR_CAP);
});

test("the schema refuses an unknown aesthetic and an out-of-range weight", () => {
  const bad = fakeRecord(); bad.taste.PUNK = 0.5;
  assert.equal(IdentificationSchema.safeParse(bad).success, false);
  const bad2 = fakeRecord(); bad2.descriptors[0].weight = 7;
  assert.equal(IdentificationSchema.safeParse(bad2).success, false);
  assert.equal(IdentificationSchema.safeParse(fakeRecord()).success, true);
});

test("step 4: tags compose into one object — UPPERCASE aesthetics + lowercase descriptors — with and without a model", () => {
  const d = decodeAspects(ASPECTS);
  const plain = composeTags({ title: "Helmut Lang FW1998 Raw Denim Trucker Jacket", brand: "HELMUT LANG", decoded: d });
  assert.ok(plain.canonical.ARCHIVAL > 0, "the lexicon alone still tags");
  assert.ok(plain.tags["bomber jacket"] > 0 && plain.tags["snap pockets"] > 0, "seller facts become descriptors without a model");
  const deep = composeTags({ title: "Helmut Lang x Travis Scott Cowboy Bomber", brand: "HELMUT LANG", decoded: d, identification: capIdentification(fakeRecord()) });
  assert.ok(deep.tags.STREETWEAR > plain.tags.STREETWEAR, "a confident model reading moves the aesthetic");
  assert.ok(deep.tags.astroworld > 0 && deep.tags.boxy > 0);
  const { canonical, descriptors } = splitTags(deep.tags);
  assert.ok(Object.keys(canonical).every((k) => TAGS.includes(k)));
  assert.ok(Object.keys(descriptors).every((k) => k === k.toLowerCase()));
  assert.ok(deep.typed.every((r) => ["detail", "reference", "fit", "material", "silhouette", "garment", "decade", "origin", "subculture", "mood", "collection"].includes(r.tagType)));
  assert.ok(!deep.typed.find((r) => r.tagType === "color"), "colour is never written as a descriptor row");
});

test("the normalizer keeps both layers and writes the typed descriptor rows; junk keys are dropped", () => {
  const d = decodeAspects(ASPECTS);
  const c = composeTags({ title: "t", brand: "b", decoded: d, identification: capIdentification(fakeRecord()) });
  const p = normalizeSourceProduct({ title: "Helmut Lang bomber", brand: "HELMUT LANG", tags: { ...c.tags, "NOT A TAG": 1, "Mixed Case": 0.5, ["x".repeat(40)]: 0.5 }, typedTags: c.typed, descriptors: c.descriptors }, "ebay");
  assert.ok(p.tags.STREETWEAR > 0 && p.tags["snap pockets"] > 0);
  assert.ok(!("NOT A TAG" in p.tags) && !("Mixed Case" in p.tags) && !(("x".repeat(40)) in p.tags));
  const rows = typedTagsFrom(p);
  assert.ok(rows.find((r) => r.tag === "snap pockets" && r.tagType === "detail" && r.source === "asterisk"));
  assert.ok(rows.find((r) => r.tag === "astroworld" && r.tagType === "reference"));
});

test("step 1+4 together: processListing reads the detail, decodes, composes — and stays deterministic with identify off", async () => {
  const summary = { itemId: "v1|1|0", title: "Helmut Lang x Travis Scott Cowboy Bomber Jacket", price: { value: "290", currency: "USD" }, image: { imageUrl: "https://i.ebayimg.com/x/s-l1600.jpg" } };
  const detail = async (id) => ({ itemId: id, localizedAspects: ASPECTS, shortDescription: "Rare <b>bomber</b>", description: "<p>snap pockets</p>", brand: "HELMUT LANG", size: "S", condition: "Pre-owned", categoryPath: "Clothing|Men|Coats" });
  const r = await processListing(summary, { detail, deep: false });
  assert.equal(r.summary.detail, "read");
  assert.equal(r.summary.identifyStatus, "off");
  assert.equal(r.product.brand, "HELMUT LANG");
  assert.equal(r.product.brandSource, "aspect");
  assert.equal(r.product.size?.label, "S");
  assert.equal(r.product.description, "Rare bomber snap pockets");
  assert.ok(r.product.tags["bomber jacket"] > 0);
  assert.equal(r.readings.length > 5, true);
  // with a model answer injected
  const r2 = await processListing(summary, { detail, deep: true, identify: async () => ({ record: capIdentification(fakeRecord()), status: "ok", costUsd: 0.04, searched: true, usage: {}, model: "test" }) });
  assert.equal(r2.summary.identified, true);
  assert.equal(r2.product.era.year, 2019);
  assert.ok(r2.product.tags.astroworld > 0);
  assert.equal(r2.product.identification.identification.house, "Helmut Lang");
  // a model failure never loses the deterministic read
  const r3 = await processListing(summary, { detail, deep: true, identify: async () => { throw new Error("boom"); } });
  assert.equal(r3.summary.identifyStatus, "error");
  assert.ok(r3.product.tags["bomber jacket"] > 0);
});

test("the identify request carries the photographs first, the decoded tags, and a frozen charter", () => {
  const msgs = buildMessages({ title: "t", decoded: decodeAspects(ASPECTS), description: "d", price: 1, currency: "USD" }, ["https://i.ebayimg.com/a.jpg", "http://not-https/x.jpg"]);
  assert.equal(msgs[0].content[0].type, "image");
  assert.equal(msgs[0].content[0].source.url, "https://i.ebayimg.com/a.jpg");
  assert.equal(msgs[0].content.at(-1).type, "text");
  assert.match(msgs[0].content.at(-1).text, /"style": "Bomber Jacket"/);
  assert.match(SYSTEM_PROMPT, /dagger collar/);
  assert.ok(!/\d{4}-\d{2}-\d{2}|Date\.now/.test(SYSTEM_PROMPT), "nothing volatile in the cached charter");
  const c = identifyConfig();
  assert.equal(typeof c.enabled, "boolean");
  assert.ok(!("key" in c) && !("apiKey" in c), "the config never carries the key");
});

test("step 5: a dislike blames the tags the system believed in, hardest on the strongest belief; a surprise like credits", () => {
  const item = { id: "i1", tags: { STREETWEAR: 0.8, ARCHIVAL: 0.3, "snap pockets": 0.7, "dagger collar": 0.6, "boxy": 0.5 } };
  const before = { long: { STREETWEAR: 0.7, "snap pockets": 0.5, "boxy": -0.2 }, session: {}, _meta: {} };
  const r = reflectOn(before, item, "hide");
  assert.ok(r.expectation > 0.3);
  assert.deepEqual(r.blamed.map((b) => b.tag), ["STREETWEAR", "snap pockets"], "only tags the system believed in answer for it; boxy was already disliked, dagger collar unknown");
  assert.ok(r.blamed[0].push < r.blamed[1].push && r.blamed[0].push <= -REFLECT_HIDE * 0.8 * 0.5);
  const after = applyReflection(learn(before, item, "hide"), r);
  assert.ok(after.long.STREETWEAR < learn(before, item, "hide").long.STREETWEAR, "the reflection pushes beyond the base hide");
  assert.equal(after._meta.reflections[0].a, "hide");
  assert.equal(after._meta.reflections[0].b[0], "STREETWEAR");
  // an ignored scroll with no confident belief teaches nothing extra
  const ignore = reflectOn({ long: { MINIMAL: 0.3 }, session: {}, _meta: {} }, item, "skip");
  assert.equal(ignore.blamed.length, 0);
  assert.match(ignore.note, /weakly held/);
  // an ignored scroll the system was SURE about gets a small correction
  const sure = reflectOn({ long: { STREETWEAR: 0.9, "snap pockets": 0.9 }, session: {}, _meta: {} }, item, "skip");
  assert.ok(sure.expectation >= 0.4 && sure.blamed.length > 0 && sure.blamed[0].push > -0.1);
  // a like on tags the system had no belief about opens a stream
  const like = reflectOn({ long: { MINIMAL: 0.5 }, session: {}, _meta: {} }, item, "favorite");
  assert.ok(like.credited.find((b) => b.tag === "snap pockets") && like.credited.find((b) => b.tag === "STREETWEAR"));
  assert.match(like.note, /new stream/);
});

test("the profile never holds more than DESCRIPTOR_KEYS_CAP descriptor keys; the ten aesthetics are never evicted", () => {
  let p = { long: {}, session: {}, _meta: {} };
  for (let i = 0; i < 12; i++) {
    const tags = { ARCHIVAL: 0.5 };
    for (let j = 0; j < 50; j++) tags[`descriptor ${i}-${j}`] = 0.2 + (j % 5) / 10;
    p = learn(p, { id: `i${i}`, tags }, "favorite");
  }
  const descriptorKeys = Object.keys(p.long).filter((k) => !TAGS.includes(k));
  assert.ok(descriptorKeys.length <= DESCRIPTOR_KEYS_CAP, `${descriptorKeys.length} descriptor keys`);
  assert.ok(p.long.ARCHIVAL > 0);
});

test("step 5b: outcomes go to the shared map keyed by the reader's strongest aesthetics; the prior bends alpha, never invents it", async () => {
  const item = { id: "i1", tags: { STREETWEAR: 0.8, "snap pockets": 0.7, "dagger collar": 0.6 } };
  const before = { long: { STREETWEAR: 0.7, ARCHIVAL: 0.4, MINIMAL: 0.2 }, session: {}, _meta: {} };
  const rows = streamOutcomeRows(before, item, "hide");
  assert.deepEqual([...new Set(rows.map((r) => r.tasteTag))], ["STREETWEAR", "ARCHIVAL"], "top two aesthetics only");
  assert.ok(rows.every((r) => r.outcome === "dislike" && r.descriptor === r.descriptor.toLowerCase()));
  assert.equal(streamOutcomeRows(before, item, "dwell").length, 0);
  assert.equal(streamOutcomeRows({ long: {}, session: {}, _meta: {} }, item, "hide").length, 0, "no standing taste, no row");

  await bumpStreamOutcomes(rows);
  await bumpStreamOutcomes([{ descriptor: "dagger collar", tasteTag: "STREETWEAR", outcome: "like" }, { descriptor: "dagger collar", tasteTag: "STREETWEAR", outcome: "like" }, { descriptor: "dagger collar", tasteTag: "STREETWEAR", outcome: "like" }]);
  const priors = await getStreamPriors(["STREETWEAR"]);
  assert.ok(priors.get("snap pockets") < 0, "one dislike leans against");
  assert.ok(priors.get("dagger collar") > 0, "three likes and one dislike lean for");
  assert.equal(streamPrior({ likes: 0, dislikes: 0, ignores: 0 }), 0);
  assert.equal(streamPrior({ likes: 0, dislikes: 1, ignores: 0 }), -0.5, "a lone dislike is a lean, not a law (pseudo-count 3)");
  assert.ok(Math.abs(itemStreamPrior(item, priors)) <= 1);
  assert.equal(itemStreamPrior({ tags: { MINIMAL: 0.9 } }, priors), 0, "no descriptors with evidence, no prior");

  const taste = { STREETWEAR: 0.8 };
  const base = blendedScore(item, taste, {}).parts.alpha;
  const down = blendedScore(item, taste, { streamPrior: new Map([["i1", -1]]) }).parts.alpha;
  const up = blendedScore(item, taste, { streamPrior: new Map([["i1", 1]]) }).parts.alpha;
  assert.ok(down < base && up >= base);
  assert.ok(Math.abs(down - base * (1 - STREAM_GAIN)) < 1e-9);
  assert.equal(blendedScore({ id: "z", tags: { MINIMAL: 1 } }, taste, { streamPrior: new Map([["z", 1]]) }).parts.alpha, 0, "alpha 0 stays 0");
});

test("reflections and identifications persist in the memory backend and erase with the person", async () => {
  await recordReflection({ userId: "u-stream", itemId: "i1", action: "hide", expectation: 0.5, blamed: [{ tag: "STREETWEAR", belief: 0.7, push: -0.2 }], note: "sent on STREETWEAR — declined" });
  const rows = await listReflections("u-stream");
  assert.equal(rows.length, 1); assert.equal(rows[0].blamed[0].tag, "STREETWEAR");
  assert.equal(await purgeReflections("u-stream"), 1);
  assert.equal((await listReflections("u-stream")).length, 0);
  await saveIdentification("ebay-1", { record: capIdentification(fakeRecord()), model: "test", costUsd: 0.05, usage: { input_tokens: 10, output_tokens: 5 }, searched: true });
  const got = await getIdentifications(["ebay-1", "nope"]);
  assert.equal(got.size, 1); assert.equal(got.get("ebay-1").house, "Helmut Lang"); assert.equal(got.get("ebay-1").year, 2019);
});

test("step 3: the Italian and German seller-tag names read like the English ones; shoe fields and measurements are kept", () => {
  const d = decodeAspects([{ name: "Marca", value: "Helmut Lang" }, { name: "Taglia", value: "46" }, { name: "Colore", value: "Nero" }, { name: "Tessuto", value: "Denim" }, { name: "Stile", value: "Trucker" }, { name: "Verschluss", value: "Knöpfe" }, { name: "Kragenart", value: "Hemdkragen" }]);
  assert.equal(d.brand, "Helmut Lang"); assert.equal(d.size, "46"); assert.equal(d.color, "Nero"); assert.equal(d.material, "Denim");
  assert.equal(d.style, "Trucker"); assert.equal(d.closure, "Knöpfe"); assert.equal(d.neckline, "Hemdkragen");
  assert.equal(d.unknown.length, 0);
  const s = decodeAspects([{ name: "US Shoe Size", value: "10" }, { name: "EU Shoe Size", value: "43" }, { name: "Upper Material", value: "Leather" }, { name: "Inseam", value: "32 in" }, { name: "Toe Shape", value: "Round" }, { name: "Country of Origin", value: "Italy" }]);
  assert.equal(s.size, "US 10"); assert.deepEqual(s.shoeSizes, { us: "10", eu: "43" }); assert.equal(s.material, "Leather");
  assert.equal(s.measurements.inseam, "32 in"); assert.deepEqual(s.features, ["round"]); assert.equal(s.madeIn, "Italy");
});
