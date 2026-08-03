#!/usr/bin/env node
// scripts/embed-catalog.mjs — backfill text-v1 embeddings for the catalog
// (asterisk-boost r4). Requires EMBEDDINGS_PROVIDER + EMBEDDINGS_API_KEY in
// the environment (plus DATABASE_URL to write to Supabase; without it the
// vectors land in the in-memory store and die with the process — the script
// warns and continues so the pipeline can still be smoke-tested).
//
//   EMBEDDINGS_PROVIDER=voyage EMBEDDINGS_API_KEY=... \
//     ~/.local/node-v20.18.1-darwin-arm64/bin/node scripts/embed-catalog.mjs
//
// Idempotent: items already embedded under the current provider are skipped;
// pass --force to re-embed everything (e.g. after a model change).

import { embeddingsConfigured, embedTexts, itemEmbedText, TEXT_SPACE } from "../lib/embeddings/index.js";
import { providerInfo } from "../lib/embeddings/provider.js";
import { listItems, listEmbeddings, saveEmbeddings, getPool } from "../lib/db/index.js";
import { CATALOG } from "../lib/ingest/catalog.js";

const force = process.argv.includes("--force");

if (!embeddingsConfigured()) {
  console.error("EMBEDDINGS_PROVIDER / EMBEDDINGS_API_KEY not set — nothing to do.");
  process.exit(1);
}
const info = providerInfo();
console.error(`provider: ${info.name}/${info.model} → space ${TEXT_SPACE}`);
if (!(await getPool())) {
  console.error("WARNING: no DATABASE_URL — writing to the in-memory store (smoke test only).");
}

let items = await listItems(5000);
if (!items.length) items = CATALOG; // empty store → embed the seed catalog
const existing = force
  ? new Set()
  : new Set(
      (await listEmbeddings(TEXT_SPACE, "product"))
        .filter((r) => r.provider === `${info.name}/${info.model}`)
        .map((r) => r.owner_id)
    );
const todo = items.filter((it) => it && it.id && !existing.has(it.id));
console.error(`catalog ${items.length} items · already embedded ${existing.size} · to embed ${todo.length}`);

let done = 0;
for (let i = 0; i < todo.length; i += 64) {
  const batch = todo.slice(i, i + 64);
  const res = await embedTexts(batch.map(itemEmbedText));
  if (!res.ok) {
    console.error(`batch ${i / 64 + 1} failed: ${res.hint || "provider error"} — stopping.`);
    process.exit(2);
  }
  await saveEmbeddings(batch.map((it, j) => ({
    ownerId: it.id,
    ownerKind: "product",
    space: TEXT_SPACE,
    provider: `${info.name}/${info.model}`,
    vector: res.data.vectors[j],
  })));
  done += batch.length;
  console.error(`embedded ${done}/${todo.length}`);
  await new Promise((r) => setTimeout(r, 300)); // stay politely under rate limits
}
console.error(`done — ${done} embedded, ${existing.size} skipped.`);
