// Approved Feed Beta downloads, staged on disk, never sent into ASTERISK.
// A complete gzip + manifest is promoted atomically; interrupted downloads
// cannot be mistaken for a completed import. This is NOT a catalog publisher.
import { mkdir, mkdtemp, open, rename, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getAppToken } from "./ebay.js";

export const FEED_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.item.feed";
const CHUNK_BYTES = 10 * 1024 * 1024;

export function feedReadiness(env = process.env) {
  const missing = [];
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) missing.push("production_credentials");
  if (env.EBAY_ENV !== "PRODUCTION") missing.push("production_environment");
  if (env.EBAY_PARTNERSHIP_APPROVED !== "1") missing.push("partnership_approval");
  if (env.EBAY_FEED_APPROVED !== "1") missing.push("feed_entitlement");
  return { ready: missing.length === 0, missing };
}

export function feedRequest({ categoryId, marketplace = "EBAY_US", feedScope = "ALL_ACTIVE", date }) {
  if (!/^\d{1,12}$/.test(String(categoryId || ""))) throw new Error("Numeric L1 categoryId required");
  if (!/^EBAY_[A-Z]{2,8}$/.test(marketplace)) throw new Error("Invalid marketplace");
  if (!["ALL_ACTIVE", "NEWLY_LISTED"].includes(feedScope)) throw new Error("Unsupported feed scope");
  if (feedScope === "NEWLY_LISTED" && !date) throw new Error("Daily feed requires date");
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    throw new Error("date must be a valid YYYY-MM-DD");
  }
  const url = new URL("https://api.ebay.com/buy/feed/v1_beta/item");
  url.searchParams.set("category_id", String(categoryId));
  url.searchParams.set("feed_scope", feedScope);
  if (date) url.searchParams.set("date", date);
  return { url: url.href, marketplace, categoryId: String(categoryId), feedScope, date: date || null };
}

export async function stageEbayFeed(options, { fetchImpl = fetch, tokenProvider = getAppToken } = {}) {
  const gate = feedReadiness();
  if (!gate.ready) throw new Error(`eBay Feed unavailable: ${gate.missing.join(", ")}`);
  const request = feedRequest(options);
  const maxBytes = options.maxBytes ?? 10 * 1024 ** 3;
  const maxExpandedBytes = options.maxExpandedBytes ?? 100 * 1024 ** 3;
  if (![maxBytes, maxExpandedBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("Invalid byte limit");
  if (!options.outputDir) throw new Error("outputDir required on durable worker storage");
  const root = resolve(options.outputDir);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temp = await mkdtemp(join(root, ".ebay-partial-"));
  let file;
  try {
    const path = join(temp, "items.tsv.gz");
    file = await open(path, "wx", 0o600);
    const hash = createHash("sha256");
    // `revision` is whatever the server offers for range consistency (an ETag
    // first); `lastModified` is kept APART from it, validated as a date, because
    // daily catch-up (owner brief §15 point 4) starts from the bootstrap's
    // generation time — an ETag cannot stand in for that.
    let offset = 0, total = null, revision = null, lastModified = null;
    while (total === null || offset < total) {
      const end = Math.min(offset + CHUNK_BYTES, total ?? maxBytes, maxBytes) - 1;
      const token = await tokenProvider({ scope: FEED_SCOPE });
      const response = await fetchImpl(request.url, {
        headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": request.marketplace,
          Range: `bytes=${offset}-${end}`, "Accept-Encoding": "identity" },
        redirect: "error", signal: AbortSignal.timeout(120_000),
      });
      async function reject(message) {
        await response.body?.cancel().catch(() => {});
        throw new Error(message);
      }
      if (![200, 206].includes(response.status)) await reject(`eBay Feed HTTP ${response.status}; check entitlement, date or quota`);
      const encoding = response.headers.get("content-encoding");
      if (encoding && encoding !== "identity") await reject("Unexpected transfer encoding for byte-range download");
      const version = response.headers.get("etag") || response.headers.get("last-modified");
      if (!version) await reject("Feed revision header missing; cannot safely combine ranges");
      if (revision !== null && revision !== version) await reject("Feed changed during download; restart required");
      revision = version;
      const lm = response.headers.get("last-modified");
      if (lm) {
        const t = Date.parse(lm);
        if (!Number.isFinite(t)) await reject("Feed Last-Modified header is not a date");
        const iso = new Date(t).toISOString();
        if (lastModified !== null && lastModified !== iso) await reject("Feed Last-Modified changed during download; restart required");
        lastModified = iso;
      }
      let length;
      if (response.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
        if (!range) await reject("Invalid Content-Range");
        const [, start, stop, size] = range.map(Number);
        if (![start, stop, size].every(Number.isSafeInteger) || start !== offset || stop < start || stop > end || stop >= size || size > maxBytes || (total !== null && size !== total)) {
          await reject("Inconsistent or oversized feed range");
        }
        total = size;
        length = stop - start + 1;
      } else {
        length = Number(response.headers.get("content-length"));
        if (offset !== 0 || !Number.isSafeInteger(length) || length <= 0 || length > maxBytes) await reject("Unexpected full-file response");
        total = length;
      }
      if (!response.body) throw new Error("Empty feed body");
      let received = 0;
      for await (const chunk of response.body) {
        received += chunk.byteLength;
        if (received > length) throw new Error("Feed chunk exceeds declared length");
        hash.update(chunk);
        // FileHandle.write may be partial; do not silently drop the remainder.
        let written = 0;
        while (written < chunk.byteLength) {
          const result = await file.write(chunk, written, chunk.byteLength - written);
          if (!result.bytesWritten) throw new Error("Feed write made no progress");
          written += result.bytesWritten;
        }
      }
      if (received !== length) throw new Error("Truncated feed chunk");
      offset += received;
    }
    await file.sync();
    await file.close(); file = null;
    // Exhaust the decompressor to verify gzip CRC/trailer, without accumulating
    // the expanded file or performing recommendation/vision processing.
    let expandedBytes = 0;
    await pipeline(createReadStream(path), createGunzip(), new Writable({
      write(chunk, encoding, done) {
        expandedBytes += chunk.length;
        done(expandedBytes > maxExpandedBytes ? new Error("Expanded feed exceeds byte limit") : null);
      },
    }));
    if (!expandedBytes) throw new Error("Empty expanded feed");
    const sha256 = hash.digest("hex");
    const manifest = { version: 1, ...request, revision, lastModified, compressedBytes: offset,
      expandedBytes, sha256, stagedAt: new Date().toISOString(),
      status: "staged_not_published", aiProcessing: false };
    await writeFile(join(temp, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    // Unique destination: concurrent runs never overwrite another run's files.
    const destination = join(root, temp.split(/[\\/]/).at(-1).replace(".ebay-partial-", "ebay-feed-"));
    await rename(temp, destination);
    return { ...manifest, directory: destination };
  } catch (error) {
    if (file) await file.close().catch(() => {});
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}
