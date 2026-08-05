#!/usr/bin/env node
// scripts/build-vector-neighbors.mjs — precompute item-item vector neighbors
// for the feed (r18). Reads the catalog embeddings (text-v1, the space the
// search stack already uses) ONCE from the keyed DB and writes the top-K
// cosine neighbors per item to lib/brain/vector-neighbors.json — a small
// vendored artifact the feed imports statically. No query-time API calls,
// works in mem-mode, deterministic given the same embeddings.
//
//   set -a; source .env.local; set +a
//   node scripts/build-vector-neighbors.mjs
//
// REBUILD RITUAL (documented in knowledge/architecture/search.md's re-embed
// law): any change that re-embeds the catalog (category moves, itemEmbedText
// changes) must re-run this script in the same PR. The artifact carries
// provenance (embedding row count + space) and tests/vector-neighbors.test.js
// fails if neighbor ids leave the catalog.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEmbeddings } from "../lib/db/index.js";
import { TEXT_SPACE, cosine } from "../lib/embeddings/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const K = 12;
const rows = await listEmbeddings(TEXT_SPACE, "product", 5000);
if (!rows.length) { console.error("no embeddings in DB — is DATABASE_URL set and the catalog embedded?"); process.exit(1); }
const catalogIds = new Set(CATALOG.map((it) => it.id));
const vecs = rows
  .filter((r) => catalogIds.has(r.owner_id))
  .map((r) => ({ id: r.owner_id, v: Array.isArray(r.vector) ? r.vector : JSON.parse(r.vector) }));
console.log(`embeddings: ${rows.length} rows, ${vecs.length} catalog-matched`);

const neighbors = {};
for (let i = 0; i < vecs.length; i++) {
  const sims = [];
  for (let j = 0; j < vecs.length; j++) {
    if (i === j) continue;
    sims.push([vecs[j].id, cosine(vecs[i].v, vecs[j].v)]);
  }
  sims.sort((a, b) => b[1] - a[1]);
  neighbors[vecs[i].id] = sims.slice(0, K).map(([id, s]) => [id, +s.toFixed(4)]);
  if (i % 100 === 0) console.log(`  ${i}/${vecs.length}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, "..", "lib", "brain", "vector-neighbors.json");
fs.writeFileSync(dest, JSON.stringify({
  space: TEXT_SPACE, k: K, items: vecs.length, embeddingRows: rows.length,
  neighbors,
}));
console.log(`wrote ${dest}: ${vecs.length} items × top-${K}`);
