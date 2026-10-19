// lib/ingest/ebayFeedPublish.js — THE PUBLISHER: a staged eBay feed file
// (lib/ingest/ebayFeed.js) → rows in the existing catalog. Owner brief §15,
// points 2–5 (1 Oct 2026). SERVER-ONLY.
//
// What it is: a streaming reader of the Feed Beta TSV (the documented
// columns, in the documented order — buy_feed_v1_beta_oas3.json, Item and
// ItemSnapshot schemas), a deterministic mapper into the catalog's one
// normalizer, and a bounded, checkpointed, idempotent writer with the
// stale guard (lib/db/production/ebayFeed.js). Batches of PUBLISH_BATCH rows; the
// checkpoint advances per batch; a killed run resumes from its last line;
// a finished file re-run is a no-op.
//
// What it refuses to be: an AI processing path. The Browse sync path runs
// tag inference over titles and colour analysis over images; eBay's API
// License / EPN Prohibited AI Uses make that a permission question the
// owner has not settled for bulk data. So this mapper hands the normalizer
// `tags: {}` (no inferTags), never calls verifyProductColors, never fetches
// an image, never names a brand from a title (the `brand` column or
// "Unknown"), never assigns an era (no guessEra fallback survives). The
// typed product_tags it writes are the source's own facts — brand,
// category, condition, material — through the vocabulary, as "system".
//
// Availability (brief §15.5): AVAILABLE → available; TEMPORARILY_UNAVAILABLE
// / UNAVAILABLE → unavailable; a snapshot's ENDED → ended, DELETED →
// removed. Nothing here ever says "sold" — absence from a file is not a
// sale, and only a confirmed sale may say so.

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { normalizeSourceProduct, typedTagsFrom } from "./adapters/normalize.js";
import { upsertFeedItems, readFeedCheckpoint, writeFeedCheckpoint } from "../db/production/ebayFeed.js";
import { addProductTags, addProductImages } from "../db/production.js";
import { recordSyncLog } from "../db/production.js";
import { feedReadiness } from "./ebayFeed.js";
import { DAILY_WINDOW_DAYS } from "./ebayFeed.js";

export const FEED_SOURCE = "ebay";
export const PUBLISH_BATCH = 500;
export const MIN_TITLE_LENGTH = 12;
export const MAX_PRICE = 100_000;

// ---- the TSV ----------------------------------------------------------------
/** Split one feed line into fields. A field that holds a tab, a quote or a
 *  backslash arrives wrapped in double quotes with `"` and `\` escaped by a
 *  backslash (the spec's Title rule). Pure. */
export function parseTsvLine(line) {
  const out = [];
  let i = 0;
  const n = line.length;
  while (i <= n) {
    if (line[i] === '"') {
      let s = "";
      i++;
      while (i < n) {
        const ch = line[i];
        if (ch === "\\" && i + 1 < n) { s += line[i + 1]; i += 2; continue; }
        if (ch === '"') { i++; break; }
        s += ch; i++;
      }
      out.push(s);
      // the quoted field ends at a tab or the end of the line
      if (line[i] === "\t") i++; else if (i >= n) break; else { /* stray text after a quote: keep reading as the next field */ }
      if (i >= n && line[n - 1] === "\t") out.push("");
      continue;
    }
    const tab = line.indexOf("\t", i);
    if (tab < 0) { out.push(line.slice(i)); break; }
    out.push(line.slice(i, tab));
    i = tab + 1;
    if (i === n) { out.push(""); break; }
  }
  return out;
}

const fold = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header line → { columnKey: index } with keys folded (ItemId / itemId /
 *  ITEM_ID all read as "itemid"). */
export function columnIndex(headerLine) {
  const out = {};
  parseTsvLine(headerLine).forEach((name, i) => { const k = fold(name); if (k && !(k in out)) out[k] = i; });
  return out;
}

const REQUIRED = ["itemid", "title", "imageurl", "pricevalue", "pricecurrency", "itemweburl"];

/** The header must carry the columns the mapper reads; a file that does not
 *  is not an item feed and is refused whole, with the names it lacks. */
export function missingColumns(index) {
  return REQUIRED.filter((k) => !(k in index));
}

/** "U2l6ZQ==:WEw=;Q29sb3I=:UmVk" → { Size: "XL", Color: "Red" }. Labelled
 *  groups ("label|name:value") drop the label. Undecodable pairs are
 *  skipped, never guessed. */
export function decodeAspects(field) {
  const out = {};
  for (const pair of String(field || "").split(";")) {
    const body = pair.includes("|") ? pair.slice(pair.lastIndexOf("|") + 1) : pair;
    const colon = body.indexOf(":");
    if (colon < 1) continue;
    try {
      const name = Buffer.from(body.slice(0, colon).trim(), "base64").toString("utf8").trim();
      const value = Buffer.from(body.slice(colon + 1).trim(), "base64").toString("utf8").trim();
      if (name && value && !(name in out)) out[name] = value.slice(0, 120);
    } catch { /* skip */ }
  }
  return out;
}

// ---- the mapping ------------------------------------------------------------
const AVAILABILITY_WORD = { AVAILABLE: "available", TEMPORARILY_UNAVAILABLE: "unavailable", UNAVAILABLE: "unavailable" };
const SNAPSHOT_CHANGE = { ENDED: "ended", DELETED: "removed" };

/** The catalog id the Browse path gives the same listing (lib/ingest/ebay.js
 *  normalizeEbayItem) — one listing, one row, whichever door it came in. */
export function catalogIdFor(itemId) {
  return "ebay-" + createHash("sha256").update(String(itemId)).digest("hex").slice(0, 32);
}

/** Why a row may not enter, or null. The laws of lib/ingest/catalogGate.js
 *  (PR #467, not yet on main) are the fuller set; these are the ones a feed
 *  row can answer from its own columns. */
export function feedRowRefusal(r) {
  if (!/^v1\|\d+\|\d+$/.test(r.itemid || "") && !/^\d{6,}$/.test(r.itemid || "")) return "bad-item-id";
  if (String(r.title || "").trim().length < MIN_TITLE_LENGTH) return "title-too-short";
  if (!/^https?:\/\//.test(r.imageurl || "")) return "no-image";
  const price = Number(r.pricevalue);
  if (!Number.isFinite(price) || price <= 0) return "no-price";
  if (price > MAX_PRICE) return "price-over-ceiling";
  if (r.buyingoptions && !/FIXED_PRICE/.test(r.buyingoptions)) return "not-fixed-price";
  if (!/^https?:\/\//.test(r.itemweburl || "")) return "no-source-url";
  return null;
}

/** Row object (folded keys) → catalog row, or { refused } . `observedAt` is
 *  the file's generation time (ISO); a snapshot row's own itemSnapshotDate
 *  wins when present. */
export function mapFeedRow(r, { observedAt = null } = {}) {
  const refused = feedRowRefusal(r);
  if (refused) return { refused };
  const aspects = decodeAspects(r.localizedaspects);
  const brand = (r.brand || aspects.Brand || "").trim();
  const images = [r.imageurl, ...String(r.additionalimageurls || "").split("|")].map((s) => s.trim()).filter(Boolean);
  const change = String(r.changemetadata || "").toUpperCase();
  const availability = SNAPSHOT_CHANGE[change] || AVAILABILITY_WORD[String(r.availability || "").toUpperCase()] || "unknown";
  const qty = r.estimatedavailablequantity === "" || r.estimatedavailablequantity == null ? null : Number(r.estimatedavailablequantity);
  const isAvailable = availability === "available" && (qty === null || qty > 0 || r.availabilitythresholdtype === "MORE_THAN");
  const observed = r.itemsnapshotdate && Number.isFinite(Date.parse(r.itemsnapshotdate))
    ? new Date(Date.parse(r.itemsnapshotdate)).toISOString() : observedAt;
  const row = normalizeSourceProduct({
    id: catalogIdFor(r.itemid),
    source_product_id: r.itemid,
    title: r.title,
    brand: brand || "Unknown",            // never the first words of the title
    price: Number(r.pricevalue),
    currency: r.pricecurrency,
    // the affiliate URL carries EPN's permitted attribution; the plain URL otherwise
    url: r.itemaffiliateweburl || r.itemweburl,
    images,
    category: r.category || "",
    condition: r.condition || null,
    color: r.color || aspects.Color || null,
    material: r.material || aspects.Material || null,
    size: r.size || aspects.Size ? { label: r.size || aspects.Size, gender: /^(male|female|unisex)$/i.test(r.gender || "") ? r.gender.toLowerCase() : undefined } : null,
    tags: {},                              // NO inference over eBay text — see the header
    era: null,
    availability_status: availability,
    is_available: isAvailable,
  }, FEED_SOURCE);
  // the normalizer's title-reading fallbacks are a guess the brief forbids
  row.era = null;
  row.decade = null;
  row.source_observed_at = observed;
  row.source_revision = r.selleritemrevision ? String(r.selleritemrevision).slice(0, 40) : null;
  row.source_item_group = r.primaryitemgroupid || null;
  row.image_altering_prohibited = String(r.imagealteringprohibited).toLowerCase() === "true";
  return { row };
}

// ---- the publisher ------------------------------------------------------------
async function* feedLines(path) {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

/**
 * Publish one staged directory (manifest.json + items.tsv.gz). Options:
 *   directory  — the stager's output (required)
 *   limit      — stop after this many rows read (bounded runs)
 *   dryRun     — map and count, write nothing
 *   batch      — rows per write (PUBLISH_BATCH)
 *   gate       — feedReadiness override for tests; production reads the env
 * Returns the checkpoint-shaped report.
 */
export async function publishStagedFeed({ directory, limit = Infinity, dryRun = false, batch = PUBLISH_BATCH, gate = null } = {}) {
  const readiness = gate || feedReadiness();
  if (!readiness.ready) throw new Error(`eBay Feed publication unavailable: ${readiness.missing.join(", ")}`);
  if (!directory) throw new Error("directory required");
  const dir = resolve(directory);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  if (manifest.status !== "staged_not_published" || !/^[0-9a-f]{64}$/.test(manifest.sha256 || "")) throw new Error("not a staged feed manifest");
  if (manifest.aiProcessing) throw new Error("manifest claims AI processing; refusing");
  const observedAt = manifest.lastModified || (manifest.date ? manifest.date + "T00:00:00.000Z" : null);
  if (!observedAt) throw new Error("the manifest carries no generation time (lastModified or date); a row cannot be dated");

  const prior = dryRun ? null : await readFeedCheckpoint(manifest.sha256);
  if (prior && prior.status === "done") {
    return { ...checkpointReport(prior), resumedFrom: prior.last_line, noop: true };
  }
  const state = {
    sha256: manifest.sha256, categoryId: manifest.categoryId, marketplace: manifest.marketplace,
    feedScope: manifest.feedScope, feedDate: manifest.date || null, observedAt,
    status: "running", rowsRead: prior ? prior.rows_read : 0, rowsUpserted: prior ? prior.rows_upserted : 0,
    rowsStale: prior ? prior.rows_stale : 0, rowsRejected: prior ? { ...(prior.rows_rejected || {}) } : {},
    lastLine: prior ? prior.last_line : 0, error: null, finishedAt: null,
  };
  const resumedFrom = state.lastLine;
  if (!dryRun) await writeFeedCheckpoint(state);

  let index = null, lineNo = 0, pending = [], seen = new Set();
  const reject = (why) => { state.rowsRejected[why] = (state.rowsRejected[why] || 0) + 1; };
  const flush = async () => {
    if (!pending.length) return;
    if (!dryRun) {
      const { written, stale } = await upsertFeedItems(pending);
      state.rowsUpserted += written.length;
      state.rowsStale += stale;
      const wrote = new Set(written);
      for (const p of pending) {
        if (!wrote.has(p.id)) continue;
        await addProductTags(p.id, typedTagsFrom(p));
        if (p.images && p.images.length > 1) await addProductImages(p.id, p.images.map((u) => ({ imageUrl: u })));
      }
    }
    pending = [];
    state.lastLine = lineNo;
    if (!dryRun) await writeFeedCheckpoint(state);
  };

  try {
    for await (const line of feedLines(join(dir, "items.tsv.gz"))) {
      lineNo++;
      if (lineNo === 1) {
        index = columnIndex(line);
        const missing = missingColumns(index);
        if (missing.length) throw new Error("not an item feed: header lacks " + missing.join(", "));
        continue;
      }
      if (!line.trim()) continue;
      if (lineNo <= resumedFrom) {
        // already published by an earlier run: re-read for its id only, so a
        // duplicate past the checkpoint is still seen as one (the first cut
        // started `seen` empty on resume and re-wrote the duplicate as new)
        const fields = parseTsvLine(line);
        const r = {};
        for (const [k, i] of Object.entries(index)) r[k] = fields[i] ?? "";
        if (!feedRowRefusal(r)) seen.add(catalogIdFor(r.itemid));
        continue;
      }
      if (state.rowsRead >= limit) break;
      state.rowsRead++;
      const fields = parseTsvLine(line);
      const r = {};
      for (const [k, i] of Object.entries(index)) r[k] = fields[i] ?? "";
      const { refused, row } = mapFeedRow(r, { observedAt });
      if (refused) { reject(refused); continue; }
      if (seen.has(row.id)) { reject("duplicate-in-file"); continue; }
      seen.add(row.id);
      pending.push(row);
      if (pending.length >= batch) await flush();
    }
    await flush();
    state.status = state.rowsRead >= limit && Number.isFinite(limit) ? "running" : "done";
    state.finishedAt = state.status === "done" ? new Date().toISOString() : null;
    if (!dryRun) {
      await writeFeedCheckpoint(state);
      await recordSyncLog({ sourceName: "ebay-feed", itemsSeen: state.rowsRead, itemsUpserted: state.rowsUpserted, status: state.status === "done" ? "ok" : "running" }).catch(() => {});
    }
    return { ...state, resumedFrom, dryRun, noop: false };
  } catch (error) {
    state.status = "failed";
    state.error = String(error && error.message || error).slice(0, 400);
    if (!dryRun) {
      await writeFeedCheckpoint(state).catch(() => {});
      await recordSyncLog({ sourceName: "ebay-feed", itemsSeen: state.rowsRead, itemsUpserted: state.rowsUpserted, status: "failed", error: state.error }).catch(() => {});
    }
    throw error;
  }
}

function checkpointReport(c) {
  return {
    sha256: c.sha256, categoryId: c.category_id, marketplace: c.marketplace, feedScope: c.feed_scope, feedDate: c.feed_date,
    observedAt: c.observed_at, status: c.status, rowsRead: c.rows_read, rowsUpserted: c.rows_upserted, rowsStale: c.rows_stale,
    rowsRejected: c.rows_rejected || {}, lastLine: c.last_line, error: c.error, finishedAt: c.finished_at,
  };
}

// ---- catch-up planning (pure) ---------------------------------------------------
/**
 * The daily NEWLY_LISTED files a bootstrap needs after it, as YYYY-MM-DD
 * strings, given the bootstrap's generation time and now. The feed serves a
 * daily file only 3–14 days after its date, so the plan says which days are
 * still fetchable and which have fallen out of the window (a gap the
 * operator must know about — the next bootstrap closes it). `published` is
 * the set of dates already applied.
 */
export function catchUpPlan({ bootstrapObservedAt, now = Date.now(), published = new Set() }) {
  const start = Date.parse(bootstrapObservedAt);
  if (!Number.isFinite(start)) throw new Error("bootstrapObservedAt must be a date");
  const day = 86_400_000;
  const nowDay = Math.floor(now / day);
  const fetchable = [], expired = [], notYet = [];
  for (let d = Math.floor(start / day) + 1; d <= nowDay; d++) {
    const iso = new Date(d * day).toISOString().slice(0, 10);
    if (published.has(iso)) continue;
    const age = nowDay - d;
    if (age < DAILY_WINDOW_DAYS.min) notYet.push(iso);
    else if (age > DAILY_WINDOW_DAYS.max) expired.push(iso);
    else fetchable.push(iso);
  }
  return { fetchable, expired, notYet, complete: expired.length === 0 && notYet.length === 0 && fetchable.length === 0 };
}
