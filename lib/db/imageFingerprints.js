// lib/db/imageFingerprints.js
// Storage + collision scan for image fingerprints (schema-v33). SERVER-ONLY.
// The scan reads all rows (capped) and compares in JS — hamming distance has
// no index, and at founding-cohort scale a full scan is milliseconds. When
// the table outgrows that, a BK-tree or bit-sliced index is the upgrade.

import { getPool } from "./index.js";
import { hammingHex, DHASH_HAMMING_THRESHOLD } from "../images/fingerprint.js";

const mem = new Map(); // itemId -> { itemId, sourceName, imageUrl, dhash }
const SCAN_CAP = 10000;

export async function saveImageFingerprint({ itemId, sourceName, imageUrl, dhash }) {
  if (!itemId || !dhash) return null;
  const p = await getPool();
  if (!p) {
    mem.set(itemId, { itemId, sourceName, imageUrl, dhash });
    return { itemId };
  }
  await p.query(
    `INSERT INTO image_fingerprints (item_id, source_name, image_url, dhash)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (item_id) DO UPDATE SET
       source_name=$2, image_url=$3, dhash=$4, updated_at=now()`,
    [itemId, sourceName, imageUrl, dhash]
  );
  return { itemId };
}

/**
 * The stored fingerprint for one piece, or null.
 *
 * Null means we never fingerprinted it — an image that was missing, dead or
 * undecodable at intake. That is a real and common state, and callers must
 * report it as "not checked" rather than as "nothing found".
 */
export async function imageFingerprintFor(itemId) {
  if (!itemId) return null;
  const p = await getPool();
  if (!p) return mem.get(itemId) || null;
  const r = await p.query(
    `SELECT item_id, source_name, image_url, dhash FROM image_fingerprints WHERE item_id=$1`,
    [itemId]
  );
  const row = r.rows[0];
  return row
    ? { itemId: row.item_id, sourceName: row.source_name, imageUrl: row.image_url, dhash: row.dhash }
    : null;
}

// Collisions against OTHER sources only — a designer's own re-import always
// matches itself and that is not evidence of anything.
export async function findImageCollisions(dhash, { excludeSource, maxHamming = DHASH_HAMMING_THRESHOLD } = {}) {
  if (!dhash) return [];
  const p = await getPool();
  let rows;
  if (!p) {
    rows = [...mem.values()];
  } else {
    const r = await p.query(
      `SELECT item_id, source_name, dhash FROM image_fingerprints LIMIT $1`, [SCAN_CAP]);
    rows = r.rows.map((x) => ({ itemId: x.item_id, sourceName: x.source_name, dhash: x.dhash }));
  }
  const hits = [];
  for (const row of rows) {
    if (excludeSource && row.sourceName === excludeSource) continue;
    const d = hammingHex(dhash, row.dhash);
    if (d !== null && d <= maxHamming) hits.push({ itemId: row.itemId, sourceName: row.sourceName, distance: d });
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

// Screen a batch of normalized items before they land: fingerprint each
// identity image, collect cross-source collisions. Unfingerprintable images
// (no url, dead url, undecodable) are REPORTED, never fatal — a CDN hiccup
// must not block an intake, and absence of a fingerprint is stated, not
// hidden. Nothing is persisted here; the caller saves fingerprints only for
// items it actually writes.
export async function screenItemImages(items, { excludeSource, fingerprint } = {}) {
  const collisions = [];
  const unfingerprinted = [];
  const fingerprints = new Map();
  for (const item of items) {
    const url = item.img || (Array.isArray(item.images) ? item.images[0] : null);
    const dhash = url ? await fingerprint(url) : null;
    if (!dhash) {
      unfingerprinted.push(item.id);
      continue;
    }
    fingerprints.set(item.id, { dhash, imageUrl: url });
    const hits = await findImageCollisions(dhash, { excludeSource });
    if (hits.length) collisions.push({ itemId: item.id, title: item.title, against: hits.slice(0, 3) });
  }
  return { fingerprints, collisions, unfingerprinted };
}
