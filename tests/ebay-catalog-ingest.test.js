// tests/ebay-catalog-ingest.test.js — THE CATALOG DOOR.
//
// scripts/ebay-ingest.mjs fills `items` from the real marketplace. The laws it
// admits and refuses by live in lib/ingest/catalogGate.js so they can be tested
// without spending an API call, and the write it performs is the same
// persistProducts() the admin sync route uses — one writer, tested here once.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summaryRefusal, catalogRefusal, wordRefusal, hasReadableTags, eraWithEvidence, MAX_PRICE,
} from "../lib/ingest/catalogGate.js";

const summary = (over = {}) => ({
  title: "Helmut Lang 1998 Archive Denim Trucker Jacket Size 48",
  image: { imageUrl: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg" },
  price: { value: "420.00", currency: "USD" },
  ...over,
});

test("stage one admits a real listing and refuses the marketplace's junk", () => {
  assert.equal(summaryRefusal(summary()), null);
  const cases = [
    ["no-title", { title: "Jacket" }],
    ["no-image", { image: null }],
    ["no-price", { price: { value: "0" } }],
    ["no-price", { price: null }],
    ["price-out-of-range", { price: { value: String(MAX_PRICE + 1) } }],
    ["seller-says-not-authentic", { title: "Helmut Lang Bootleg Denim Trucker Jacket Size 48" }],
    ["seller-says-not-authentic", { title: "Archive Denim Trucker Jacket inspired by Helmut Lang" }],
    ["lot-or-bundle", { title: "Lot of 12 Vintage Designer T-Shirts Wholesale Resale" }],
    ["lot-or-bundle", { title: "Vintage Band Tee Bundle 5 Pcs Mixed Sizes 1990s" }],
    ["not-a-garment", { title: "Vintage Vogue Sewing Pattern Trucker Jacket 1970s Size 14" }],
    ["not-a-garment", { title: "Authentic Helmut Lang Dust Bag Only Black Archive" }],
    ["made-to-order", { title: "Custom Made Leather Jacket Any Size Available 1970s Style" }],
  ];
  for (const [reason, over] of cases) {
    assert.equal(summaryRefusal(summary(over)), reason, `${JSON.stringify(over)} should refuse as ${reason}`);
  }
});

test("a word law reads the whole string, and a clean one passes", () => {
  assert.equal(wordRefusal("Helmut Lang denim trucker, 1998, made in Italy"), null);
  assert.equal(wordRefusal("a faithful REPRODUCTION of the 1970s original"), "seller-says-not-authentic");
  assert.equal(wordRefusal(""), null);
});

const product = (over = {}) => ({
  id: "ebay-abc", title: "Helmut Lang 1998 Archive Denim Trucker Jacket",
  description: "Genuine archive piece, pre-owned, measurements in photos.",
  img: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg",
  source_name: "ebay", source_product_id: "v1|123|0",
  source_product_url: "https://www.ebay.com/itm/123", url: "https://www.ebay.com/itm/123",
  price: 420, currency: "USD", availability_status: "available", is_available: true,
  tags: { ARCHIVAL: 0.43, MINIMAL: 0.25, denim: 0.5 },
  ...over,
});

test("stage two admits a composed listing and refuses what the catalog cannot carry", () => {
  assert.equal(catalogRefusal(product()), null);
  assert.equal(catalogRefusal(product({ tags: {} })), "untagged");
  assert.equal(catalogRefusal(product({ tags: { ARCHIVAL: 0.02 } })), "untagged",
    "a weight under the floor is not a reading");
  assert.equal(catalogRefusal(product({ source_product_url: null, url: null })), "no-source-url");
  assert.equal(catalogRefusal(product({ source_product_id: "" })), "no-source-id");
  assert.equal(catalogRefusal(product({ img: null })), "no-image");
  assert.equal(catalogRefusal(product({ price: 0 })), "no-price");
});

test("the description is read at stage two, because that is when we first have it", () => {
  // The listing that motivated the two stages: a title a buyer would trust and
  // a body that admits what it is. Stage one cannot see this — the search
  // summary carries no description.
  const sneaky = { title: "Led Zeppelin 1975 Tour T-Shirt Single Stitch Vintage",
    description: "High quality reproduction of the original 1975 tour shirt." };
  assert.equal(summaryRefusal(summary(sneaky)), null, "stage one has nothing to go on");
  assert.equal(catalogRefusal(product(sneaky)), "seller-says-not-authentic");
});

test("a piece the checkout gate would refuse never becomes inventory", () => {
  // One rule, every door (lib/purchasable.js): if the ticket flow would not
  // buy it, the catalog does not present it as buyable stock.
  const unavailable = catalogRefusal(product({ availability_status: "sold" }));
  assert.match(unavailable, /^checkout-would-refuse:/);
  assert.match(unavailable, /"sold"/);
  const seeded = catalogRefusal(product({ source_name: "asilum-seed" }));
  assert.match(seeded, /^checkout-would-refuse:.*demo archive record/);
});

test("a seller who DENIES the word is not refused by it", async () => {
  const { authenticityRefusal } = await import("../lib/ingest/catalogGate.js");
  // Honest listings say the word in order to deny it. A law that cannot hear
  // the denial refuses exactly the listings it exists to protect.
  assert.equal(authenticityRefusal("Genuine archive piece. This is NOT a reproduction."), null);
  assert.equal(authenticityRefusal("No bootlegs in my store, ever."), null);
  assert.equal(authenticityRefusal("High quality reproduction of the 1975 original."), "seller-says-not-authentic");
  assert.equal(authenticityRefusal("Not a replica. Well, it is a reproduction of the 1975 shirt."),
    "seller-says-not-authentic", "denying once does not license admitting once");
  assert.equal(summaryRefusal(summary({ title: "Vintage Tour Tee 1975 — not a reprint, original" })), null);
});

test("packaging is junk when it is the thing sold, and an extra when it is not", () => {
  // The same words on both sides of the line; "only" is what separates them.
  assert.equal(wordRefusal("Authentic Helmut Lang Dust Bag Only Black Archive"), "not-a-garment");
  assert.equal(wordRefusal("Prada Authenticity Card Only"), "not-a-garment");
  assert.equal(wordRefusal("Chanel Box Only No Jacket"), "not-a-garment");
  assert.equal(wordRefusal("Vintage Wool Coat with original receipt"), null);
  assert.equal(wordRefusal("Rick Owens Leather Jacket, comes on its hanger"), null);
  assert.equal(wordRefusal("Comme des Garcons Shirt with dust bag included"), null);
});

test("the other three laws never read a description", async () => {
  const { authenticityRefusal } = await import("../lib/ingest/catalogGate.js");
  // A body that mentions a bundle discount, a dust bag or made-to-order
  // boilerplate is not selling those things. Only the authenticity law reads
  // here, which is why these all pass.
  for (const body of [
    "Bundle discount on 3+ items from my store.",
    "Comes with the original dust bag and receipt.",
    "Any size available on request for other listings.",
    "Photographed on a mannequin, measurements in the photos.",
  ]) {
    assert.equal(authenticityRefusal(body), null, body);
    assert.equal(catalogRefusal(product({ description: body })), null, body);
  }
});

test("hasReadableTags answers for both layers", () => {
  assert.equal(hasReadableTags({ ARCHIVAL: 0.3 }), true, "a canonical aesthetic");
  assert.equal(hasReadableTags({ "dagger collar": 0.4 }), true, "a descriptor");
  assert.equal(hasReadableTags({}), false);
  assert.equal(hasReadableTags({ ARCHIVAL: 0 }), false);
  assert.equal(hasReadableTags(null), false);
});

test("an era with no evidence behind it is not written", () => {
  assert.equal(eraWithEvidence({ decade: "2020s", raw: null }), null, "guessEra's contemporary assumption");
  assert.deepEqual(eraWithEvidence({ year: 1998, decade: "1990s", raw: "1998" }), { year: 1998, decade: "1990s", raw: "1998" });
  assert.equal(eraWithEvidence(null), null);
});

test("one writer: persistProducts stores the row, its typed tags and its photographs", async () => {
  const { persistProducts } = await import("../lib/ingest/adapters/sync.js");
  const { normalizeSourceProduct } = await import("../lib/ingest/adapters/normalize.js");
  const { getItem } = await import("../lib/db/index.js");
  const { getProductTags } = await import("../lib/db/production.js");
  const row = normalizeSourceProduct({
    ...product({ id: "ebay-persist-1", source_product_id: "persist-1" }),
    brand: "Helmut Lang", material: "Cotton Denim", condition: "Pre-owned",
    images: ["https://i.ebayimg.com/images/g/a/s-l1600.jpg", "https://i.ebayimg.com/images/g/b/s-l1600.jpg"],
  }, "ebay");
  const upserted = await persistProducts([row], { sourceName: "ebay" });
  assert.equal(upserted, 1);
  const stored = await getItem(row.id);
  assert.ok(stored, "the item is in the catalog");
  assert.equal(stored.source_name, "ebay");
  assert.equal(stored.title, row.title);
  const tags = await getProductTags(row.id);
  const facets = new Set(tags.map((t) => t.tag_type || t.tagType));
  assert.ok(facets.has("brand"), "the house is a typed tag");
  assert.ok(tags.some((t) => t.tag === "helmut lang"), "and it is the house the seller named");
});

test("the same tag at two strengths folds to one row, at the stronger one", async () => {
  const { dedupeTagRows } = await import("../lib/db/production/catalog.js");
  // The real listing that found this: Material aspect "Cotton" AND a composed
  // descriptor `cotton`, both faceted material. Postgres takes the list into
  // one INSERT ... ON CONFLICT DO UPDATE and refuses to touch a row twice
  // ("cannot affect row a second time"); the in-memory store skipped the
  // duplicate and said nothing, so every test passed while a real ingest wrote
  // items with no tags at all.
  const folded = dedupeTagRows([
    { tag: "cotton", tagType: "material", confidence: 0.5, source: "system" },
    { tag: "cotton", tagType: "material", confidence: 0.8, source: "asterisk" },
    { tag: "cotton", tagType: "detail", confidence: 0.3, source: "system" },
  ]);
  assert.equal(folded.length, 2, "one row per (tag, facet) — a facet is part of the identity");
  const material = folded.find((r) => r.tagType === "material");
  assert.equal(material.confidence, 0.8, "the stronger claim survives, as ON CONFLICT's GREATEST would");
  assert.equal(material.source, "asterisk");
  assert.deepEqual(dedupeTagRows([]), []);
});

test("a composed listing's own tag rows survive the fold", async () => {
  const { typedTagsFrom, normalizeSourceProduct } = await import("../lib/ingest/adapters/normalize.js");
  const { dedupeTagRows } = await import("../lib/db/production/catalog.js");
  // End to end on the shape that broke: the seller's material aspect and a
  // descriptor of the same word.
  const row = normalizeSourceProduct({
    ...product({ id: "ebay-fold-1" }), brand: "Helmut Lang", material: "Cotton",
    typedTags: [{ tag: "cotton", tagType: "material", confidence: 0.5, source: "asterisk" }],
  }, "ebay");
  const rows = typedTagsFrom(row).map((t) => ({ ...t, tag: t.tag.toLowerCase() }));
  const pairs = rows.map((r) => `${r.tag}/${r.tagType}`);
  assert.ok(pairs.length > new Set(pairs).size, "the raw rows really do collide");
  const folded = dedupeTagRows(rows);
  assert.equal(new Set(folded.map((r) => `${r.tag}/${r.tagType}`)).size, folded.length);
});

test("an unnamed house is never registered as a brand called Unknown", async () => {
  const { typedTagsFrom, normalizeSourceProduct } = await import("../lib/ingest/adapters/normalize.js");
  // What the ingest passes when no seller aspect named a house: brand null,
  // which the normalizer writes as "Unknown" in the row (honest) and which
  // must NOT become a brand facet anyone could filter by (a lie).
  const row = normalizeSourceProduct({ ...product({ id: "ebay-nohouse" }), brand: null }, "ebay");
  assert.equal(row.brand, "Unknown");
  assert.deepEqual(row.designers, [], "nothing is credited to Unknown either");
  const brandTags = typedTagsFrom(row).filter((t) => t.tagType === "brand");
  assert.deepEqual(brandTags, []);
});
