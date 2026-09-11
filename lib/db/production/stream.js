// lib/db/production/stream.js — the stream's three records (schema v51):
// what Asterisk read in a piece, what people answered, and the shared map
// that routes the next piece. The mem path MIRRORS the Postgres path, as
// everything in lib/db does.

import { getPool } from "../index.js";
import { mem, push } from "./store.js";

// ---- identifications ----------------------------------------------------------

export async function saveIdentification(itemId, { source = "ebay", record = null, status = "ok", model = null, promptVersion = null, usage = null, costUsd = 0, searched = false, decoded = null, readings = null } = {}) {
  if (!itemId) return null;
  const id = record?.identification || {};
  const row = {
    itemId: String(itemId).slice(0, 80), source: String(source).slice(0, 40),
    house: id.house || null, line: id.line || null, designer: id.designer || null, garment: id.garment || null,
    collection: id.collection || null, season: id.season || null,
    year: id.year?.value ?? null, yearLow: id.year?.low ?? null, yearHigh: id.year?.high ?? null,
    yearConfidence: Number(id.year?.confidence) || 0, whatItIs: id.what_it_is || null,
    evidence: record?.evidence || [], descriptors: record?.descriptors || [],
    decoded: decoded || {}, readings: readings || record?.parent_tag_readings || [],
    taste: record?.taste || {}, confidence: Number(record?.confidence) || 0, status: String(status).slice(0, 30),
    model, promptVersion, tokensIn: usage?.input_tokens || 0, tokensOut: usage?.output_tokens || 0,
    costUsd: Number(costUsd) || 0, searched: !!searched, updatedAt: Date.now(),
  };
  const p = await getPool();
  if (!p) { mem.identifications.set(row.itemId, row); return row; }
  await p.query(
    `INSERT INTO asterisk_identifications (item_id, source, house, line, designer, garment, collection, season,
       year, year_low, year_high, year_confidence, what_it_is, evidence, descriptors, decoded, readings, taste,
       confidence, status, model, prompt_version, tokens_in, tokens_out, cost_usd, searched, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,now())
     ON CONFLICT (item_id) DO UPDATE SET
       source=EXCLUDED.source, house=EXCLUDED.house, line=EXCLUDED.line, designer=EXCLUDED.designer,
       garment=EXCLUDED.garment, collection=EXCLUDED.collection, season=EXCLUDED.season, year=EXCLUDED.year,
       year_low=EXCLUDED.year_low, year_high=EXCLUDED.year_high, year_confidence=EXCLUDED.year_confidence,
       what_it_is=EXCLUDED.what_it_is, evidence=EXCLUDED.evidence, descriptors=EXCLUDED.descriptors,
       decoded=EXCLUDED.decoded, readings=EXCLUDED.readings, taste=EXCLUDED.taste, confidence=EXCLUDED.confidence,
       status=EXCLUDED.status, model=EXCLUDED.model, prompt_version=EXCLUDED.prompt_version,
       tokens_in=EXCLUDED.tokens_in, tokens_out=EXCLUDED.tokens_out, cost_usd=EXCLUDED.cost_usd,
       searched=EXCLUDED.searched, updated_at=now()`,
    [row.itemId, row.source, row.house, row.line, row.designer, row.garment, row.collection, row.season,
     row.year, row.yearLow, row.yearHigh, row.yearConfidence, row.whatItIs, JSON.stringify(row.evidence),
     JSON.stringify(row.descriptors), JSON.stringify(row.decoded), JSON.stringify(row.readings),
     JSON.stringify(row.taste), row.confidence, row.status, row.model, row.promptVersion, row.tokensIn,
     row.tokensOut, row.costUsd, row.searched]
  );
  return row;
}

export async function getIdentifications(ids = []) {
  const keys = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  const out = new Map();
  if (!keys.length) return out;
  const p = await getPool();
  if (!p) {
    for (const id of keys) if (mem.identifications.has(id)) out.set(id, mem.identifications.get(id));
    return out;
  }
  const { rows } = await p.query("SELECT * FROM asterisk_identifications WHERE item_id = ANY($1::text[])", [keys]);
  for (const r of rows) {
    out.set(r.item_id, {
      itemId: r.item_id, source: r.source, house: r.house, line: r.line, designer: r.designer, garment: r.garment,
      collection: r.collection, season: r.season, year: r.year, yearLow: r.year_low, yearHigh: r.year_high,
      yearConfidence: Number(r.year_confidence) || 0, whatItIs: r.what_it_is, evidence: r.evidence || [],
      descriptors: r.descriptors || [], decoded: r.decoded || {}, readings: r.readings || [], taste: r.taste || {},
      confidence: Number(r.confidence) || 0, status: r.status, model: r.model, promptVersion: r.prompt_version,
      tokensIn: r.tokens_in, tokensOut: r.tokens_out, costUsd: Number(r.cost_usd) || 0, searched: !!r.searched,
      updatedAt: new Date(r.updated_at).getTime(),
    });
  }
  return out;
}

export async function identificationTotals() {
  const p = await getPool();
  if (!p) {
    let cost = 0, identified = 0;
    for (const r of mem.identifications.values()) { cost += r.costUsd || 0; if (r.status === "ok") identified++; }
    return { rows: mem.identifications.size, identified, costUsd: +cost.toFixed(4) };
  }
  const { rows } = await p.query(
    "SELECT count(*)::int AS rows, count(*) FILTER (WHERE status='ok')::int AS identified, COALESCE(sum(cost_usd),0)::float AS cost FROM asterisk_identifications"
  );
  return { rows: rows[0].rows, identified: rows[0].identified, costUsd: +Number(rows[0].cost).toFixed(4) };
}

// ---- the shared stream map ---------------------------------------------------

const OUTCOME_COL = { like: "likes", dislike: "dislikes", ignore: "ignores" };
const K = 3; // the prior's pseudo-count: three unseen answers, so one dislike is a lean, not a law

export function streamPrior({ likes = 0, dislikes = 0, ignores = 0 } = {}) {
  const n = likes + dislikes + ignores;
  if (!n) return 0;
  return Math.max(-1, Math.min(1, (likes - 2 * dislikes - 0.25 * ignores) / (n + K)));
}

export async function bumpStreamOutcomes(rows = []) {
  const clean = rows
    .map((r) => ({ descriptor: String(r.descriptor || "").slice(0, 40), tasteTag: String(r.tasteTag || "").slice(0, 20), col: OUTCOME_COL[r.outcome] }))
    .filter((r) => r.descriptor && r.tasteTag && r.col)
    .slice(0, 200);
  if (!clean.length) return 0;
  const p = await getPool();
  if (!p) {
    for (const r of clean) {
      const key = `${r.descriptor}|${r.tasteTag}`;
      const row = mem.streamOutcomes.get(key) || { descriptor: r.descriptor, tasteTag: r.tasteTag, likes: 0, dislikes: 0, ignores: 0 };
      row[r.col] += 1;
      row.updatedAt = Date.now();
      mem.streamOutcomes.set(key, row);
    }
    return clean.length;
  }
  for (const col of Object.values(OUTCOME_COL)) {
    const part = clean.filter((r) => r.col === col);
    if (!part.length) continue;
    await p.query(
      `INSERT INTO stream_outcomes (descriptor, taste_tag, ${col})
       SELECT descriptor, taste_tag, 1 FROM jsonb_to_recordset($1::jsonb) AS x(descriptor text, taste_tag text)
       ON CONFLICT (descriptor, taste_tag) DO UPDATE SET ${col} = stream_outcomes.${col} + 1, updated_at = now()`,
      [JSON.stringify(part.map((r) => ({ descriptor: r.descriptor, taste_tag: r.tasteTag })))]
    );
  }
  return clean.length;
}

// descriptor → prior in [-1, 1] for these aesthetics (averaged when several)
export async function getStreamPriors(tasteTags = []) {
  const tags = [...new Set(tasteTags.filter(Boolean))].slice(0, 3);
  const out = new Map();
  if (!tags.length) return out;
  const acc = new Map();
  const add = (row) => {
    const prior = streamPrior(row);
    const a = acc.get(row.descriptor) || { sum: 0, n: 0 };
    a.sum += prior; a.n += 1; acc.set(row.descriptor, a);
  };
  const p = await getPool();
  if (!p) {
    for (const row of mem.streamOutcomes.values()) if (tags.includes(row.tasteTag)) add(row);
  } else {
    const { rows } = await p.query("SELECT descriptor, likes, dislikes, ignores FROM stream_outcomes WHERE taste_tag = ANY($1::text[])", [tags]);
    for (const r of rows) add(r);
  }
  for (const [d, a] of acc) out.set(d, +(a.sum / a.n).toFixed(4));
  return out;
}

// One item's prior: the mean over its descriptors that have any evidence.
export function itemStreamPrior(item, priors) {
  if (!priors || !priors.size || !item?.tags) return 0;
  let sum = 0, n = 0;
  for (const [k, w] of Object.entries(item.tags)) {
    if (k !== k.toLowerCase() || !(w > 0.15) || !priors.has(k)) continue;
    sum += priors.get(k) * Math.min(1, w); n += 1;
  }
  return n ? +(sum / n).toFixed(4) : 0;
}

export async function streamMapSnapshot({ limit = 40 } = {}) {
  const p = await getPool();
  let rows;
  if (!p) rows = [...mem.streamOutcomes.values()];
  else rows = (await p.query("SELECT descriptor, taste_tag, likes, dislikes, ignores FROM stream_outcomes")).rows
    .map((r) => ({ descriptor: r.descriptor, tasteTag: r.taste_tag, likes: r.likes, dislikes: r.dislikes, ignores: r.ignores }));
  return rows.map((r) => ({ ...r, prior: streamPrior(r), n: r.likes + r.dislikes + r.ignores }))
    .sort((a, b) => b.n - a.n).slice(0, Math.max(1, Math.min(200, limit)));
}

// ---- reflections ----------------------------------------------------------------

export async function recordReflection({ userId, itemId, action, expectation = 0, blamed = [], credited = [], note = "" } = {}) {
  if (!userId || !itemId || !action) return null;
  const row = {
    userId: String(userId).slice(0, 80), itemId: String(itemId).slice(0, 80), action: String(action).slice(0, 20),
    expectation: Number(expectation) || 0,
    blamed: (blamed || []).slice(0, 8).map((b) => ({ tag: b.tag, belief: b.belief, push: b.push })),
    credited: (credited || []).slice(0, 6).map((b) => ({ tag: b.tag, push: b.push })),
    note: String(note || "").slice(0, 200), createdAt: Date.now(),
  };
  const p = await getPool();
  if (!p) return push(mem.reflections, { id: mem.seq++, ...row });
  const { rows } = await p.query(
    `INSERT INTO asterisk_reflections (user_id, item_id, action, expectation, blamed, credited, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [row.userId, row.itemId, row.action, row.expectation, JSON.stringify(row.blamed), JSON.stringify(row.credited), row.note]
  );
  return { id: rows[0].id, ...row };
}

export async function listReflections(userId, limit = 20) {
  if (!userId) return [];
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const p = await getPool();
  if (!p) return mem.reflections.filter((r) => r.userId === userId).slice(-lim).reverse();
  const { rows } = await p.query(
    "SELECT id, item_id, action, expectation, blamed, credited, note, created_at FROM asterisk_reflections WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, lim]
  );
  return rows.map((r) => ({ id: r.id, itemId: r.item_id, action: r.action, expectation: Number(r.expectation) || 0, blamed: r.blamed || [], credited: r.credited || [], note: r.note, createdAt: new Date(r.created_at).getTime() }));
}

export async function purgeReflections(userId, { queryTarget = null } = {}) {
  if (!userId) return 0;
  const p = queryTarget || await getPool();
  if (!p) {
    const before = mem.reflections.length;
    mem.reflections = mem.reflections.filter((r) => r.userId !== userId);
    return before - mem.reflections.length;
  }
  return (await p.query("DELETE FROM asterisk_reflections WHERE user_id=$1", [userId])).rowCount;
}
