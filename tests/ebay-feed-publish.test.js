// tests/ebay-feed-publish.test.js — the eBay feed PUBLISHER (owner brief §15,
// 1 Oct 2026). Memory mode end to end over a synthetic gzip TSV in the
// documented column order (buy_feed_v1_beta_oas3.json, Item schema) —
// explicitly a FIXTURE, never inventory. The laws pinned: no AI processing
// over eBay text or images, no title-derived brand or era, the stale guard,
// resume from a checkpoint, a finished file is a no-op, rejections grouped
// by reason, availability words kept apart, the daily date on the wire,
// and the catch-up window.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  parseTsvLine, columnIndex, missingColumns, decodeAspects, mapFeedRow, feedRowRefusal,
  catalogIdFor, publishStagedFeed, catchUpPlan,
} from "../lib/ingest/ebayFeedPublish.js";
import { feedRequest, DAILY_WINDOW_DAYS } from "../lib/ingest/ebayFeed.js";
import { observationWins, readFeedCheckpoint, resetMemoryCheckpoints } from "../lib/db/production/ebayFeed.js";
import { mem } from "../lib/db/core/store.js";
import { normalizeEbayItem } from "../lib/ingest/ebay.js";

const GATE = { ready: true, missing: [] };
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

// the documented Item columns the mapper reads, in the documented order
const HEADER = ["ItemId", "Title", "ImageUrl", "Category", "CategoryId", "BuyingOptions", "SellerUsername", "Brand", "Condition",
  "PriceValue", "PriceCurrency", "PrimaryItemGroupId", "ItemEndDate", "SellerItemRevision", "ItemLocationCountry", "LocalizedAspects",
  "Availability", "ImageAlteringProhibited", "EstimatedAvailableQuantity", "AvailabilityThresholdType", "AdditionalImageUrls",
  "ItemWebUrl", "ItemAffiliateWebUrl", "Color", "Size", "Gender", "Material"];

function row(over = {}) {
  const base = {
    ItemId: "v1|110000000001|0", Title: "Helmut Lang 1998 painter jeans archive", ImageUrl: "https://i.ebayimg.com/images/g/a/s-l1600.jpg",
    Category: "Clothing, Shoes & Accessories|Men|Men's Clothing|Jeans", CategoryId: "11483", BuyingOptions: "FIXED_PRICE",
    SellerUsername: "archive_seller", Brand: "Helmut Lang", Condition: "Pre-owned", PriceValue: "420.00", PriceCurrency: "USD",
    PrimaryItemGroupId: "", ItemEndDate: "", SellerItemRevision: "3", ItemLocationCountry: "US",
    LocalizedAspects: `${b64("Size")}:${b64("32")};${b64("Color")}:${b64("Indigo")}`,
    Availability: "AVAILABLE", ImageAlteringProhibited: "true", EstimatedAvailableQuantity: "1", AvailabilityThresholdType: "",
    AdditionalImageUrls: "https://i.ebayimg.com/images/g/b/s-l1600.jpg|https://i.ebayimg.com/images/g/c/s-l1600.jpg",
    ItemWebUrl: "https://www.ebay.com/itm/110000000001", ItemAffiliateWebUrl: "https://www.ebay.com/itm/110000000001?mkevt=1&campid=TEST",
    Color: "", Size: "", Gender: "male", Material: "Denim",
  };
  return { ...base, ...over };
}
const line = (r) => HEADER.map((h) => r[h] ?? "").join("\t");
function tsv(rows) { return [HEADER.join("\t"), ...rows.map(line)].join("\n") + "\n"; }

async function staged(t, rows, manifestOver = {}) {
  const root = await mkdtemp(join(tmpdir(), "asilum-feed-pub-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "ebay-feed-fixture");
  await mkdir(dir);
  const gz = gzipSync(tsv(rows));
  await writeFile(join(dir, "items.tsv.gz"), gz);
  const manifest = { version: 1, categoryId: "11450", marketplace: "EBAY_US", feedScope: "ALL_ACTIVE", date: null,
    revision: '"v1"', lastModified: "2026-10-01T04:00:00.000Z", compressedBytes: gz.length, expandedBytes: 1,
    sha256: createHash("sha256").update(gz).digest("hex"), stagedAt: new Date().toISOString(),
    status: "staged_not_published", aiProcessing: false, ...manifestOver };
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
  return { dir, manifest };
}

test.beforeEach(() => { mem.items.clear(); resetMemoryCheckpoints(); });

test("the TSV line parser honours the spec's quoting rule", () => {
  assert.deepEqual(parseTsvLine("a\tb\tc"), ["a", "b", "c"]);
  assert.deepEqual(parseTsvLine("a\t\tc\t"), ["a", "", "c", ""]);
  assert.deepEqual(parseTsvLine('x\t"Marvel HULK 8 \\" Figure"\ty'), ["x", 'Marvel HULK 8 " Figure', "y"]);
  assert.deepEqual(parseTsvLine('"W \\\\ Tracking\twith tab"\tz'), ["W \\ Tracking\twith tab", "z"]);
  const idx = columnIndex("ItemId\tTitle\tITEM_WEB_URL");
  assert.deepEqual(idx, { itemid: 0, title: 1, itemweburl: 2 });
  assert.deepEqual(missingColumns(idx), ["imageurl", "pricevalue", "pricecurrency"]);
});

test("aspects decode from base64 pairs; undecodable pairs are skipped, never guessed", () => {
  assert.deepEqual(decodeAspects(`${b64("Size")}:${b64("XL")};${b64("Color")}:${b64("Red")};broken;${b64("Lbl")}|${b64("Fit")}:${b64("Slim")}`),
    { Size: "XL", Color: "Red", Fit: "Slim" });
  assert.deepEqual(decodeAspects(""), {});
});

test("a feed row maps to the catalog row the Browse path would give the same listing — without any AI, title-brand or era", () => {
  const r = {}; HEADER.forEach((h) => { r[h.toLowerCase()] = row()[h]; });
  const { row: out, refused } = mapFeedRow(r, { observedAt: "2026-10-01T04:00:00.000Z" });
  assert.equal(refused, undefined);
  assert.equal(out.id, catalogIdFor("v1|110000000001|0"));
  assert.equal(out.id, normalizeEbayItem({ itemId: "v1|110000000001|0", title: "x" }).id, "one listing, one id, whichever door");
  assert.equal(out.source_name, "ebay");
  assert.equal(out.source_product_id, "v1|110000000001|0");
  assert.deepEqual(out.tags, {}, "no inferTags over eBay text");
  assert.equal(out.brand, "Helmut Lang");
  assert.equal(out.era, null); assert.equal(out.decade, null);
  assert.equal(out.price, 420); assert.equal(out.currency, "USD");
  assert.equal(out.url, "https://www.ebay.com/itm/110000000001?mkevt=1&campid=TEST", "the affiliate URL carries the permitted attribution");
  assert.equal(out.images.length, 3);
  assert.equal(out.size.label, "32"); assert.equal(out.size.gender, "male");
  assert.equal(out.material, "Denim"); assert.equal(out.merchantColor, "Indigo");
  assert.equal(out.availability_status, "available"); assert.equal(out.is_available, true);
  assert.equal(out.source_observed_at, "2026-10-01T04:00:00.000Z");
  assert.equal(out.source_revision, "3");
  assert.equal(out.image_altering_prohibited, true);
  assert.equal(out.colorEvidence, null, "no image analysis");
  // a row with no brand column never takes the title's first words
  const noBrand = { ...r, brand: "", localizedaspects: "" };
  assert.equal(mapFeedRow(noBrand, { observedAt: "2026-10-01T04:00:00.000Z" }).row.brand, "Unknown");
});

test("availability words stay apart: unavailable, ended and removed are never sold", () => {
  const base = {}; HEADER.forEach((h) => { base[h.toLowerCase()] = row()[h]; });
  assert.equal(mapFeedRow({ ...base, availability: "TEMPORARILY_UNAVAILABLE" }).row.availability_status, "unavailable");
  assert.equal(mapFeedRow({ ...base, availability: "UNAVAILABLE" }).row.is_available, false);
  assert.equal(mapFeedRow({ ...base, changemetadata: "ENDED", itemsnapshotdate: "2026-10-02T09:15:00.000Z" }).row.availability_status, "ended");
  assert.equal(mapFeedRow({ ...base, changemetadata: "DELETED" }).row.availability_status, "removed");
  assert.equal(mapFeedRow({ ...base, changemetadata: "ENDED", itemsnapshotdate: "2026-10-02T09:15:00.000Z" }).row.source_observed_at, "2026-10-02T09:15:00.000Z", "a snapshot row is dated by its own stamp");
  assert.equal(mapFeedRow({ ...base, availability: "SOMETHING_NEW" }).row.availability_status, "unknown");
  assert.equal(mapFeedRow({ ...base, estimatedavailablequantity: "0" }).row.is_available, false);
  assert.equal(mapFeedRow({ ...base, estimatedavailablequantity: "", availabilitythresholdtype: "MORE_THAN" }).row.is_available, true);
});

test("refusals name their reason", () => {
  const ok = {}; HEADER.forEach((h) => { ok[h.toLowerCase()] = row()[h]; });
  assert.equal(feedRowRefusal(ok), null);
  assert.equal(feedRowRefusal({ ...ok, itemid: "../x" }), "bad-item-id");
  assert.equal(feedRowRefusal({ ...ok, title: "Jeans" }), "title-too-short");
  assert.equal(feedRowRefusal({ ...ok, imageurl: "" }), "no-image");
  assert.equal(feedRowRefusal({ ...ok, pricevalue: "0" }), "no-price");
  assert.equal(feedRowRefusal({ ...ok, pricevalue: "999999" }), "price-over-ceiling");
  assert.equal(feedRowRefusal({ ...ok, buyingoptions: "AUCTION" }), "not-fixed-price");
  assert.equal(feedRowRefusal({ ...ok, itemweburl: "" }), "no-source-url");
});

test("the stale guard: newer observation wins; same moment compares the seller revision; never-observed takes the first", () => {
  const cur = { source_observed_at: "2026-10-05T00:00:00.000Z", source_revision: "7" };
  assert.equal(observationWins({ source_observed_at: "2026-10-06T00:00:00.000Z", source_revision: "1" }, cur), true);
  assert.equal(observationWins({ source_observed_at: "2026-10-01T00:00:00.000Z", source_revision: "99" }, cur), false, "an old bootstrap cannot roll back a daily file");
  assert.equal(observationWins({ source_observed_at: "2026-10-05T00:00:00.000Z", source_revision: "8" }, cur), true);
  assert.equal(observationWins({ source_observed_at: "2026-10-05T00:00:00.000Z", source_revision: "6" }, cur), false);
  assert.equal(observationWins({ source_observed_at: "2026-10-05T00:00:00.000Z", source_revision: null }, cur), true);
  assert.equal(observationWins({ source_observed_at: "2026-10-05T00:00:00.000Z" }, { source_observed_at: null }), true);
  assert.equal(observationWins({ source_observed_at: null }, cur), false);
});

test("publication is gated, bounded, checkpointed, idempotent, and writes only through the stale guard", async (t) => {
  const rows = [
    row(),
    row({ ItemId: "v1|110000000002|0", Title: "Raf Simons AW03 Closer parka archive", Brand: "Raf Simons", PriceValue: "3200", SellerItemRevision: "1" }),
    row({ ItemId: "v1|110000000003|0", Title: "Jeans" }),                                    // title-too-short
    row({ ItemId: "v1|110000000001|0" }),                                                       // duplicate-in-file
    row({ ItemId: "v1|110000000004|0", Title: "Margiela tabi boots 41 split toe black", Brand: "Maison Margiela", BuyingOptions: "AUCTION" }), // not-fixed-price
  ];
  const { dir, manifest } = await staged(t, rows);
  await assert.rejects(publishStagedFeed({ directory: dir, gate: { ready: false, missing: ["feed_entitlement"] } }), /feed_entitlement/);
  assert.equal(mem.items.size, 0, "nothing written without the gates");

  const dry = await publishStagedFeed({ directory: dir, dryRun: true, gate: GATE });
  assert.equal(dry.rowsRead, 5); assert.equal(dry.rowsUpserted, 0); assert.equal(mem.items.size, 0);
  assert.deepEqual(dry.rowsRejected, { "title-too-short": 1, "duplicate-in-file": 1, "not-fixed-price": 1 });

  // bounded: one row, then resume from the checkpoint
  const first = await publishStagedFeed({ directory: dir, limit: 1, batch: 1, gate: GATE });
  assert.equal(first.status, "running"); assert.equal(first.rowsUpserted, 1); assert.equal(first.lastLine, 2);
  const cp = await readFeedCheckpoint(manifest.sha256);
  assert.equal(cp.status, "running"); assert.equal(cp.last_line, 2);
  const rest = await publishStagedFeed({ directory: dir, gate: GATE });
  assert.equal(rest.resumedFrom, 2);
  assert.equal(rest.status, "done"); assert.equal(rest.rowsRead, 5); assert.equal(rest.rowsUpserted, 2); assert.equal(rest.rowsStale, 0);
  assert.deepEqual(rest.rowsRejected, { "title-too-short": 1, "duplicate-in-file": 1, "not-fixed-price": 1 });
  assert.equal(mem.items.size, 2);
  const stored = mem.items.get(catalogIdFor("v1|110000000001|0"));
  assert.equal(stored.source_observed_at, "2026-10-01T04:00:00.000Z");
  assert.deepEqual(stored.tags, {});

  // a finished file is a no-op
  const again = await publishStagedFeed({ directory: dir, gate: GATE });
  assert.equal(again.noop, true); assert.equal(mem.items.size, 2);

  // an OLDER file for the same listings cannot overwrite — counted as stale
  const older = await staged(t, [row({ PriceValue: "1.00", SellerItemRevision: "99" })], { lastModified: "2026-09-20T04:00:00.000Z" });
  const stale = await publishStagedFeed({ directory: older.dir, gate: GATE });
  assert.equal(stale.rowsUpserted, 0); assert.equal(stale.rowsStale, 1);
  assert.equal(mem.items.get(catalogIdFor("v1|110000000001|0")).price, 420);

  // a NEWER daily file does
  const newer = await staged(t, [row({ PriceValue: "390.00", SellerItemRevision: "4" })], { lastModified: "2026-10-03T04:00:00.000Z", feedScope: "NEWLY_LISTED", date: "2026-10-02" });
  const fresh = await publishStagedFeed({ directory: newer.dir, gate: GATE });
  assert.equal(fresh.rowsUpserted, 1);
  assert.equal(mem.items.get(catalogIdFor("v1|110000000001|0")).price, 390);
});

test("a file that is not an item feed, or carries no generation time, is refused whole", async (t) => {
  const bad = await staged(t, [row()], { lastModified: null, date: null });
  await assert.rejects(publishStagedFeed({ directory: bad.dir, gate: GATE }), /generation time/);
  const root = await mkdtemp(join(tmpdir(), "asilum-feed-pub-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "x"); await mkdir(dir);
  const gz = gzipSync("Foo\tBar\n1\t2\n");
  await writeFile(join(dir, "items.tsv.gz"), gz);
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ sha256: createHash("sha256").update(gz).digest("hex"), status: "staged_not_published", aiProcessing: false, lastModified: "2026-10-01T00:00:00.000Z", categoryId: "11450", marketplace: "EBAY_US", feedScope: "ALL_ACTIVE" }));
  await assert.rejects(publishStagedFeed({ directory: dir, gate: GATE }), /header lacks itemid/);
  const cp = await readFeedCheckpoint(createHash("sha256").update(gz).digest("hex"));
  assert.equal(cp.status, "failed");
  await assert.rejects(publishStagedFeed({ directory: dir, gate: GATE }), /header lacks/, "a failed checkpoint is retried, not treated as done");
});

test("the daily date goes on the wire as yyyyMMdd and only inside the 3–14 day window", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const r = feedRequest({ categoryId: "11450", feedScope: "NEWLY_LISTED", date: "2026-10-10", now });
  assert.match(r.url, /date=20261010/);
  assert.equal(r.date, "2026-10-10");
  assert.throws(() => feedRequest({ categoryId: "11450", feedScope: "NEWLY_LISTED", date: "2026-10-14", now }), /3-14 days/);
  assert.throws(() => feedRequest({ categoryId: "11450", feedScope: "NEWLY_LISTED", date: "2026-09-30", now }), /3-14 days/);
  const b = feedRequest({ categoryId: "11450", feedScope: "ALL_ACTIVE", date: "2026-10-10", now });
  assert.ok(!/date=/.test(b.url), "the bootstrap ignores a date; none is sent");
  const s = feedRequest({ categoryId: "11450", feedScope: "SNAPSHOT", snapshotHour: "2026-10-15T09", now });
  assert.match(s.url, /item_snapshot\?category_id=11450&snapshot_date=2026-10-15T09%3A00%3A00\.000Z/);
  assert.throws(() => feedRequest({ categoryId: "11450", feedScope: "SNAPSHOT", snapshotHour: "2026-10-15T11", now }), /two hours/);
  assert.deepEqual(DAILY_WINDOW_DAYS, { min: 3, max: 14 });
});

test("the catch-up plan knows which daily files are fetchable, not yet served, or lost to the window", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const plan = catchUpPlan({ bootstrapObservedAt: "2026-09-28T04:00:00.000Z", now, published: new Set(["2026-10-05"]) });
  assert.deepEqual(plan.expired, ["2026-09-29", "2026-09-30"]);
  assert.deepEqual(plan.fetchable, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
  assert.deepEqual(plan.notYet, ["2026-10-13", "2026-10-14", "2026-10-15"]);
  assert.equal(plan.complete, false);
  assert.equal(catchUpPlan({ bootstrapObservedAt: "2026-10-15T04:00:00.000Z", now }).complete, true);
});

// THE SQL ITSELF, against a real database (CI's Postgres; skipped without
// TEST_DATABASE_URL). The memory mirror above proves the rule; this proves the
// statement — a parse error, a wrong conflict target or a regexp escape that
// survived the JS template would otherwise ship green.
import { randomUUID } from "node:crypto";
const databaseUrl = process.env.TEST_DATABASE_URL || "";
test("Postgres: the stale guard writes a newer observation and refuses an older one", { skip: !databaseUrl }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const db = await import("../lib/db/index.js");
  const pool = await db.getPool();
  const id = `ebay-pgfeed-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  t.after(async () => { await pool.query("DELETE FROM items WHERE id = $1", [id]); });
  const base = { id, title: "Postgres feed fixture row", brand: "Fixture", price: 10, currency: "USD", tags: {}, img: "https://example.org/a.jpg",
    alt: "x", source: "ebay", source_name: "ebay", source_product_id: "v1|1|0", url: "https://www.ebay.com/itm/1", availability_status: "available", is_available: true };
  const first = await db.upsertFeedItems([{ ...base, source_observed_at: "2026-10-05T00:00:00.000Z", source_revision: "7" }]);
  assert.deepEqual(first, { written: [id], stale: 0 });
  const older = await db.upsertFeedItems([{ ...base, price: 1, source_observed_at: "2026-10-01T00:00:00.000Z", source_revision: "99" }]);
  assert.deepEqual(older, { written: [], stale: 1 });
  const sameOlderRev = await db.upsertFeedItems([{ ...base, price: 2, source_observed_at: "2026-10-05T00:00:00.000Z", source_revision: "6" }]);
  assert.deepEqual(sameOlderRev, { written: [], stale: 1 });
  const newer = await db.upsertFeedItems([{ ...base, price: 3, source_observed_at: "2026-10-06T00:00:00.000Z", source_revision: "1" }]);
  assert.deepEqual(newer, { written: [id], stale: 0 });
  const { rows } = await pool.query("SELECT price, source_revision, source_observed_at FROM items WHERE id = $1", [id]);
  assert.equal(Number(rows[0].price), 3); assert.equal(rows[0].source_revision, "1");
  const sha = createHash("sha256").update(id).digest("hex");
  t.after(async () => { await pool.query("DELETE FROM ebay_feed_checkpoints WHERE sha256 = $1", [sha]); });
  await db.writeFeedCheckpoint({ sha256: sha, categoryId: "11450", marketplace: "EBAY_US", feedScope: "ALL_ACTIVE", rowsRead: 3, rowsRejected: { "no-image": 1 }, lastLine: 4 });
  const cp = await db.readFeedCheckpoint(sha);
  assert.equal(cp.status, "running"); assert.equal(cp.last_line, 4); assert.deepEqual(cp.rows_rejected, { "no-image": 1 });
});
