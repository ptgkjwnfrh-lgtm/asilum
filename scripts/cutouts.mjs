#!/usr/bin/env node
// scripts/cutouts.mjs — THE PIECE, ISOLATED.
//
// Owner, 12 September 2026: "every product listing should only have the piece
// isolated. i need every product picture reviewed and i need their backgrounds
// gone. i need it to look like the products are floating in the white space of
// the site. if there is a model in the picture keep the model in the clothes,
// just green screen the back ground."
//
//   npm run cutouts                    # dry: what would be processed, and what it costs
//   npm run cutouts -- --write         # lift, upload, record
//   npm run cutouts -- --limit 40      # a slice, for looking at
//   npm run cutouts -- --extras        # the gallery images too, not just the cover
//   npm run cutouts -- --redo          # reprocess rows that already have a cutout
//   npm run cutouts -- --sheet out.png # a contact sheet of this run, before/after
//
// WHY VISION AND NOT A FLOOD FILL. The corpus was measured before anything was
// built: of 40 sampled listings only 8 had the seamless studio background a
// border flood-fill needs. The rest are a garment on a carpet, on a wooden
// table, on a door, on a mannequin in somebody's hallway, worn by a person in a
// mirror. A colour-keyed matte cannot cut those and would have quietly mangled
// three quarters of the catalog. VNGenerateForegroundInstanceMaskRequest is the
// subject lift macOS ships — it understands a person wearing the garment, which
// is exactly the owner's "keep the model in the clothes".
//
// MACOS ONLY, BY NATURE. Vision is an Apple framework; this is an operator
// tool, like the ingest, and it says so rather than pretending to be portable.
// CI never runs it.
//
// WHAT IT NEVER DOES. It never overwrites `img`. The source photograph stays
// exactly what the seller published; `cutout_url` is the derived image and the
// app prefers it only when one exists. A failed lift leaves the row alone and
// the reader sees the original — never a hole, never a broken image.
//
// ⚖ RIGHTS. eBay's Browse image URLs are display-licensed for API consumers
// (lib/ingest/ebay.js). Fetching one, matting it and re-serving the result from
// our own storage is a DERIVED WORK and a different act from displaying the
// source url — it is not covered by the 10/12 September ingest rulings, and
// docs/epn-terms-check-2026-08-22.md's open questions bear on it. Recorded in
// docs/cutouts-2026-09-12.md for the owner's ruling.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.existsSync(path.join(ROOT, ".env.local")) ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i > -1 ? args[i + 1] : null; };
const WRITE = args.includes("--write");
const EXTRAS = args.includes("--extras");
const REDO = args.includes("--redo");
const SHEET = opt("sheet");
const LIMIT = Math.max(1, Math.min(20000, Number(opt("limit")) || 20000));
const CHUNK = Math.max(1, Math.min(80, Number(opt("chunk")) || 40));
// The source fetch is the whole wall clock — Vision lifts an image in ~0.12s
// and eBay's CDN answers in whatever it answers in. 897 covers at six in
// flight took forty-five minutes; the gallery is nine times that.
const FETCH_CONCURRENCY = Math.max(1, Math.min(32, Number(opt("fetch")) || 6));

// The long edge of a stored cutout. 1400 is the largest the catalog card, the
// piece page and a retina lightbox can actually use; beyond it the file grows
// and nothing looks better.
//
// A GALLERY IMAGE IS NOT A COVER. The cover is the piece's face — it carries
// the card, the modal and the float view. The other eight photographs of the
// same garment are a second angle, a label, a flaw: looked at, not lived with.
// They default smaller because the whole catalog's gallery at cover settings is
// 1.08 GB and the Supabase tier is 1 GB — and because a tier you have silently
// filled is a failure that arrives later, wearing someone else's clothes.
const MAX_EDGE = Math.max(320, Math.min(2000, Number(opt("max-edge")) || (EXTRAS ? 1000 : 1400)));
const QUALITY = Math.max(40, Math.min(95, Number(opt("quality")) || (EXTRAS ? 74 : 82)));
// Stop cleanly before the storage tier is full rather than failing mid-upload.
const BUDGET_MB = Math.max(1, Number(opt("budget-mb")) || 850);
// A piece that touches the frame does not read as floating. After the matte is
// trimmed to the subject, the frame is opened back up by this fraction.
const FLOAT_PAD = 0.06;

const BUCKET = "cutouts";

if (process.platform !== "darwin") {
  console.error("cutouts needs macOS — VNGenerateForegroundInstanceMaskRequest is an Apple framework.\n" +
                "Run it from the operator's Mac; CI is not expected to.");
  process.exit(1);
}

// ---- the lifter ------------------------------------------------------------
const BIN_DIR = path.join(os.tmpdir(), "asilum-cutouts");
const BIN = path.join(BIN_DIR, "lift-subject");
const SWIFT = path.join(ROOT, "scripts", "lift-subject.swift");
function ensureLifter() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const fresh = fs.existsSync(BIN) && fs.statSync(BIN).mtimeMs > fs.statSync(SWIFT).mtimeMs;
  if (fresh) return;
  const r = spawnSync("swiftc", ["-O", "-o", BIN, SWIFT], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error("could not build the subject lifter:\n" + (r.stderr || r.error?.message || ""));
    process.exit(1);
  }
}

/** Run one batch of [src, out] pairs through Vision; returns a result per pair. */
function lift(pairs) {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, [], { stdio: ["pipe", "pipe", "inherit"] });
    const out = [];
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) > -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.trim()) { try { out.push(JSON.parse(line)); } catch { out.push({ status: "unreadable" }); } }
      }
    });
    child.on("error", reject);
    child.on("close", () => resolve(out));
    child.stdin.write(pairs.map(([a, b]) => `${a}\t${b}`).join("\n") + "\n");
    child.stdin.end();
  });
}

// ---- storage ---------------------------------------------------------------
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicUrl = (key) => `${SUPABASE}/storage/v1/object/public/${BUCKET}/${key}`;

async function upload(key, body) {
  const res = await fetch(`${SUPABASE}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY,
      "Content-Type": "image/webp", "x-upsert": "true", "cache-control": "public, max-age=31536000, immutable",
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`storage ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return publicUrl(key);
}

// ---- the verdict on one image ---------------------------------------------
// Both tails are failures, and they fail differently. A mask that covers almost
// the whole frame removed nothing; a mask that covers almost none of it lost
// the piece. Either way the row keeps its original photograph and the id lands
// in the review pile with the reason.
const COVERAGE_FLOOR = 0.02;
const COVERAGE_CEILING = 0.97;
export function verdict(lifted) {
  if (!lifted || lifted.status !== "ok") return { ok: false, status: lifted?.status || "unreadable" };
  if (lifted.coverage > COVERAGE_CEILING) return { ok: false, status: "no-background-found" };
  if (lifted.coverage < COVERAGE_FLOOR) return { ok: false, status: "subject-lost" };
  return { ok: true, status: "ok" };
}

// ---- main ------------------------------------------------------------------
if (!SUPABASE || !SERVICE_KEY) { console.error("cutouts needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (WRITE && !process.env.DATABASE_URL) { console.error("--write needs DATABASE_URL"); process.exit(1); }

ensureLifter();
const { getPool } = await import(path.join(ROOT, "lib/db/core/pool.js"));
const pool = await getPool();
if (!pool) { console.error("no database behind DATABASE_URL"); process.exit(1); }

const where = REDO ? "" : "AND cutout_url IS NULL";
const covers = (await pool.query(
  `SELECT id, title, img AS src, 'item' AS kind FROM items
   WHERE source_name IS NOT NULL AND img IS NOT NULL ${where}
   ORDER BY created_at DESC, id LIMIT $1`, [LIMIT])).rows;
const extras = EXTRAS ? (await pool.query(
  `SELECT g.id::text AS id, i.title, g.image_url AS src, 'image' AS kind
   FROM product_images g JOIN items i ON i.id = g.product_id
   WHERE g.image_url IS NOT NULL ${REDO ? "" : "AND g.cutout_url IS NULL"}
   ORDER BY g.product_id, g.id LIMIT $1`, [LIMIT])).rows : [];
const work = [...covers, ...extras].slice(0, LIMIT);

console.log(`\n*ASILUM — the piece, isolated`);
console.log(`lifter    : Apple Vision foreground-instance mask (on-device)`);
console.log(`work      : ${covers.length} cover image${covers.length === 1 ? "" : "s"}${EXTRAS ? ` + ${extras.length} gallery image${extras.length === 1 ? "" : "s"}` : ""}`);
console.log(`shape     : long edge ${MAX_EDGE}px, webp q${QUALITY}`);
console.log(`mode      : ${WRITE ? `WRITE — upload to ${BUCKET}/ and record on the row` : "DRY RUN — nothing uploaded, nothing recorded"}\n`);
if (!work.length) { console.log("nothing to do.\n"); process.exit(0); }

/** What the bucket already holds, in bytes — the budget starts from here. */
async function bucketBytes() {
  let total = 0, offset = 0;
  for (const prefix of ["item/", "image/"]) {
    offset = 0;
    for (;;) {
      const res = await fetch(`${SUPABASE}/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000, offset }),
        signal: AbortSignal.timeout(30_000),
      });
      const rows = await res.json().catch(() => []);
      if (!Array.isArray(rows) || !rows.length) break;
      for (const f of rows) total += f.metadata?.size || 0;
      offset += rows.length;
      if (rows.length < 1000) break;
    }
  }
  return total;
}

const startingBytes = WRITE ? await bucketBytes() : 0;
if (WRITE) {
  console.log(`storage   : ${(startingBytes / 1048576).toFixed(0)} MB already stored, budget ${BUDGET_MB} MB\n`);
}
let stoppedForBudget = false;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "asilum-cut-"));
const tally = new Map();
const bump = (k) => tally.set(k, (tally.get(k) || 0) + 1);
const sheet = [];
let bytesIn = 0, bytesOut = 0, done = 0;

async function pool_(list, width, work_) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, list.length || 1)) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await work_(list[i], i); }
  }));
  return out;
}

for (let start = 0; start < work.length; start += CHUNK) {
  if (WRITE && (startingBytes + bytesOut) / 1048576 > BUDGET_MB) { stoppedForBudget = true; break; }
  const batch = work.slice(start, start + CHUNK);
  // 1. fetch the source photographs
  const fetched = await pool_(batch, FETCH_CONCURRENCY, async (row) => {
    try {
      const res = await fetch(row.src, { signal: AbortSignal.timeout(25_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      bytesIn += buf.length;
      const p = path.join(TMP, `${row.kind}-${row.id}.jpg`);
      fs.writeFileSync(p, buf);
      return p;
    } catch { return null; }
  });
  // 2. lift every one that arrived
  const pairs = [];
  const index = [];
  batch.forEach((row, i) => {
    if (!fetched[i]) { bump("fetch-failed"); return; }
    pairs.push([fetched[i], path.join(TMP, `${row.kind}-${row.id}.png`)]);
    index.push(i);
  });
  const lifted = pairs.length ? await lift(pairs) : [];
  // 3. judge, shape, upload, record
  for (let j = 0; j < index.length; j++) {
    const row = batch[index[j]];
    const v = verdict(lifted[j]);
    if (!v.ok) {
      bump(v.status);
      if (WRITE) await record(row, { status: v.status, coverage: lifted[j]?.coverage ?? null, url: null });
      continue;
    }
    try {
      const cutPath = pairs[j][1];
      let img = sharp(cutPath);
      // trim the transparent margin to the piece, then open the frame back up
      // so it floats instead of touching the edge
      try { img = img.trim({ threshold: 6 }); } catch { /* uniform image: keep as is */ }
      const meta = await img.toBuffer({ resolveWithObject: true });
      const pad = Math.round(Math.max(meta.info.width, meta.info.height) * FLOAT_PAD);
      const webp = await sharp(meta.data)
        .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: QUALITY, alphaQuality: 90, effort: 4 })
        .toBuffer();
      bytesOut += webp.length;
      const url = WRITE ? await upload(`${row.kind}/${row.id}.webp`, webp) : publicUrl(`${row.kind}/${row.id}.webp`);
      if (WRITE) await record(row, { status: "ok", coverage: lifted[j].coverage, url });
      bump("ok");
      if (SHEET && sheet.length < 60) sheet.push({ src: pairs[j][0], cut: webp, title: row.title });
    } catch (e) {
      bump("encode-failed");
      if (WRITE) await record(row, { status: "encode-failed", coverage: lifted[j]?.coverage ?? null, url: null });
    }
  }
  done += batch.length;
  process.stdout.write(`\r  ${done}/${work.length} processed — ${[...tally].map(([k, n]) => `${k} ${n}`).join(", ")}          `);
}
process.stdout.write("\n");

async function record(row, { status, coverage, url }) {
  if (row.kind === "item") {
    await pool.query(
      `UPDATE items SET cutout_url=$2, cutout_status=$3, cutout_coverage=$4, cutout_at=now() WHERE id=$1`,
      [row.id, url, status, coverage]);
  } else {
    await pool.query(
      `UPDATE product_images SET cutout_url=$2, cutout_status=$3, cutout_coverage=$4, cutout_at=now() WHERE id=$1`,
      [Number(row.id), url, status, coverage]);
  }
}

const ok = tally.get("ok") || 0;
if (stoppedForBudget) {
  console.log(`\nSTOPPED AT THE STORAGE BUDGET — ${(( startingBytes + bytesOut) / 1048576).toFixed(0)} MB of ${BUDGET_MB} MB used.`);
  console.log(`${work.length - done} images were not processed. Raise --budget-mb, lower --max-edge, or add storage.`);
}
console.log(`\n${ok}/${done || work.length} isolated (${(100 * ok / (done || work.length)).toFixed(1)}%)`);
console.log(`source ${(bytesIn / 1048576).toFixed(0)} MB in → ${(bytesOut / 1048576).toFixed(0)} MB of webp out`);
const failures = [...tally].filter(([k]) => k !== "ok").sort((a, b) => b[1] - a[1]);
if (failures.length) {
  console.log(`\nNOT ISOLATED — these keep the photograph the seller took, and go in the review pile:`);
  for (const [k, n] of failures) console.log(`  ${String(n).padStart(4)}  ${k}`);
}
if (SHEET && sheet.length) {
  const CELL = 260, COLS = 6;
  const tiles = [];
  for (const s of sheet) {
    tiles.push(await sharp(s.src).resize(CELL, CELL, { fit: "contain", background: "#0b0f0d" }).toBuffer());
    tiles.push(await sharp({ create: { width: CELL, height: CELL, channels: 3, background: "#f4f6f5" } })
      .composite([{ input: await sharp(s.cut).resize(CELL, CELL, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer() }])
      .png().toBuffer());
  }
  const H = Math.ceil(tiles.length / COLS) * CELL;
  await sharp({ create: { width: COLS * CELL, height: H, channels: 3, background: "#000" } })
    .composite(tiles.map((b, n) => ({ input: b, left: (n % COLS) * CELL, top: Math.floor(n / COLS) * CELL })))
    .png().toFile(SHEET);
  console.log(`\ncontact sheet: ${SHEET}`);
}
fs.rmSync(TMP, { recursive: true, force: true });
if (!WRITE) console.log(`\nDRY RUN — nothing was uploaded or recorded. Re-run with --write.\n`);
process.exit(0);
