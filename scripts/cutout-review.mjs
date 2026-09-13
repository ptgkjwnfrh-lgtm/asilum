#!/usr/bin/env node
// scripts/cutout-review.mjs — EVERY PICTURE REVIEWED.
//
// The owner asked for every product picture to be reviewed, and a status of
// "ok" from the lifter is not a review: Vision reports that it found a subject
// and matted it, not that the result is a piece floating cleanly in white
// space. This reads back what was actually STORED and judges the alpha channel
// itself, which is the only thing a reader will see.
//
//   npm run cutouts:review              # the catalog covers
//   npm run cutouts:review -- --extras  # the gallery images too
//   npm run cutouts:review -- --json out.json
//   npm run cutouts:review -- --limit 200
//
// THREE FAULTS IT LOOKS FOR, none of which coverage alone can see:
//
//   FRAGMENTS   more than one substantial island of opacity. A pair of shoes is
//               two islands and fine; a seller's collage of four photographs is
//               four, and matting it leaves four garments floating in one card.
//               The test is not the count but the SHAPE of the distribution —
//               a second island worth more than a fifth of the first is a
//               second subject, and anything past two of those is a collage.
//   FULL-FRAME  the kept region fills its own bounding box like a rectangle. A
//               garment silhouette leaves air in its box — between a sleeve and
//               a body, under a hem, around a heel — and fills perhaps half of
//               it. Filling nearly all of it means one of two things, and they
//               look identical to a number: the lift kept a chunk of table, OR
//               the photograph was a tight crop with no background to remove in
//               the first place — a waistband detail, a folded flat-lay, a
//               label. LOOKING AT THE FIRST 28 THIS FLAGGED, most were the
//               second. That is the honest description of this fault: it hands
//               a person a short pile to judge, not a verdict.
//
//               THE FIRST VERSION OF THIS CHECK MEASURED OPACITY AT THE FRAME
//               EDGE and scored exactly zero on all 895 cutouts, because the
//               pipeline pads every cutout with a transparent margin before
//               storing it — the test could not fail, which is not the same as
//               passing.
//   SPECKLE     many tiny islands: matte debris, usually a patterned background
//               that the lift half-kept. Invisible at thumbnail size and ugly
//               at full size.
//
// It writes nothing to the database. It produces the list a person looks at.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.existsSync(path.join(ROOT, ".env.local")) ? fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i > -1 ? args[i + 1] : null; };
const LIMIT = Math.max(1, Math.min(40000, Number(opt("limit")) || 40000));
const EXTRAS = args.includes("--extras");
const JSON_OUT = opt("json");
const CONCURRENCY = Math.max(1, Math.min(12, Number(opt("concurrency")) || 6));

// A mask is judged at this size: big enough that a real fragment survives,
// small enough that 900 of them take a minute.
const GRID = 320;             // enough resolution that real debris survives the resize
const SECOND_SUBJECT = 0.2;   // an island this fraction of the largest is another subject
const SPECKLE = 0.0008;       // an island smaller than this fraction of the frame is debris
const FULL_FRAME = 0.88;      // a subject filling this much of its own box is worth a look

/** Connected components over the alpha channel, largest first. */
export function islands(alpha, w, h, threshold = 24) {
  const seen = new Uint8Array(w * h);
  const sizes = [];
  const q = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || alpha[s] < threshold) continue;
    let qh = 0, qt = 0, n = 0;
    q[qt++] = s; seen[s] = 1;
    while (qh < qt) {
      const i = q[qh++]; n++;
      const x = i % w, y = (i / w) | 0;
      const push = (j) => { if (!seen[j] && alpha[j] >= threshold) { seen[j] = 1; q[qt++] = j; } };
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

export function judge({ sizes, boxFill, area }) {
  const faults = [];
  const largest = sizes[0] || 0;
  const subjects = sizes.filter((n) => n >= largest * SECOND_SUBJECT).length;
  const speckles = sizes.filter((n) => n < area * SPECKLE).length;
  if (!largest) faults.push("empty");
  if (subjects > 2) faults.push(`fragments:${subjects}`);
  if (boxFill >= FULL_FRAME) faults.push(`full-frame:${(boxFill * 100).toFixed(0)}%`);
  if (speckles > 8) faults.push(`speckle:${speckles}`);
  // the score a person sorts by: 0 is perfect, higher is worse
  const score = (subjects > 2 ? subjects - 2 : 0) * 2
    + Math.max(0, boxFill - FULL_FRAME) * 25
    + Math.min(2, speckles / 8);
  return { faults, score: +score.toFixed(2), subjects, speckles, boxFill: +(boxFill * 100).toFixed(1) };
}

const { getPool } = await import(path.join(ROOT, "lib/db/core/pool.js"));
const pool = await getPool();
if (!pool) { console.error("no database behind DATABASE_URL"); process.exit(1); }

const { rows: coverRows } = await pool.query(
  `SELECT id, title, brand, img, cutout_url, cutout_status, cutout_coverage, 'cover' AS kind
   FROM items WHERE cutout_url IS NOT NULL ORDER BY id LIMIT $1`, [LIMIT]);
// The gallery is judged by the same laws — a second angle of a garment is still
// a product picture, and the owner asked for every one of them.
const { rows: galleryRows } = EXTRAS ? await pool.query(
  `SELECT g.id::text AS id, i.title, i.brand, g.image_url AS img, g.cutout_url,
          g.cutout_status, g.cutout_coverage, 'gallery' AS kind
   FROM product_images g JOIN items i ON i.id = g.product_id
   WHERE g.cutout_url IS NOT NULL ORDER BY g.product_id, g.id LIMIT $1`, [LIMIT]) : { rows: [] };
const rows = [...coverRows, ...galleryRows];
const { rows: notCut } = await pool.query(
  `SELECT id, title, cutout_status, 'cover' AS kind FROM items
   WHERE cutout_url IS NULL AND cutout_status IS NOT NULL
   ${EXTRAS ? `UNION ALL
   SELECT g.id::text, i.title, g.cutout_status, 'gallery'
   FROM product_images g JOIN items i ON i.id = g.product_id
   WHERE g.cutout_url IS NULL AND g.cutout_status IS NOT NULL` : ""}`);

console.log(`\nreviewing ${coverRows.length} covers${EXTRAS ? ` + ${galleryRows.length} gallery images` : ""} (${notCut.length} pictures were not isolated)\n`);

async function review(row) {
  try {
    const res = await fetch(row.cutout_url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { ...row, faults: ["unreachable"], score: 9 };
    const buf = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(buf)
      .resize(GRID, GRID, { fit: "inside" })
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    // the bounding box of everything opaque, and how much of it is filled
    let minX = w, maxX = -1, minY = h, maxY = -1, opaque = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[y * w + x] < 24) continue;
      opaque++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const boxArea = maxX < 0 ? 0 : (maxX - minX + 1) * (maxY - minY + 1);
    const boxFill = boxArea ? opaque / boxArea : 0;
    const sizes = islands(data, w, h);
    const verdict = judge({ sizes, boxFill, area: w * h });
    return { ...row, ...verdict, bytes: buf.length };
  } catch (e) {
    return { ...row, faults: ["review-failed"], score: 9, error: String(e.message).slice(0, 80) };
  }
}

const out = new Array(rows.length);
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < rows.length) {
    const i = next++;
    out[i] = await review(rows[i]);
    if (++done % 25 === 0) process.stdout.write(`\r  ${done}/${rows.length}   `);
  }
}));
process.stdout.write("\r");

const flagged = out.filter((r) => r.faults.length).sort((a, b) => b.score - a.score);
const clean = out.length - flagged.length;
console.log(`\n${clean}/${out.length} clean · ${flagged.length} flagged for a look\n`);
if (EXTRAS) {
  for (const kind of ["cover", "gallery"]) {
    const set = out.filter((r) => r.kind === kind);
    if (!set.length) continue;
    const bad = set.filter((r) => r.faults.length).length;
    console.log(`  ${kind.padEnd(8)} ${set.length - bad}/${set.length} clean`);
  }
  console.log("");
}
const byFault = new Map();
for (const r of flagged) for (const f of r.faults) {
  const k = f.split(":")[0];
  byFault.set(k, (byFault.get(k) || 0) + 1);
}
for (const [k, n] of [...byFault].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
if (notCut.length) {
  const why = new Map();
  for (const r of notCut) why.set(r.cutout_status, (why.get(r.cutout_status) || 0) + 1);
  console.log(`\nnot isolated (kept the seller's photograph):`);
  for (const [k, n] of [...why].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
}
console.log(`\nworst twenty:`);
for (const r of flagged.slice(0, 20)) {
  console.log(`  ${String(r.score).padStart(5)}  ${(r.kind || "cover").padEnd(8)} ${r.faults.join(" ").padEnd(22)} ${(r.brand || "").slice(0, 16).padEnd(17)} ${r.title.slice(0, 40)}`);
}
if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ reviewed: out.length, clean, flagged: flagged.length,
    items: out.map((r) => ({ id: r.id, kind: r.kind, title: r.title, brand: r.brand, photograph: r.img, cutout: r.cutout_url,
      coverage: r.cutout_coverage, faults: r.faults, score: r.score, subjects: r.subjects, speckles: r.speckles, boxFill: r.boxFill })),
    notIsolated: notCut }, null, 1));
  console.log(`\nwrote ${JSON_OUT}`);
}
process.exit(0);
