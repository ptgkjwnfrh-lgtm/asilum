// lib/db/production/corrections.js — WHEN A READER SAYS WE GOT IT WRONG.
//
// Schema v5. A correction is a PROMISE, not a hint: a brand pushed away with
// "dont-recommend-brand", or a piece marked already-owned, must not reappear
// on any recommendation surface — and the standing-exclusion query below is
// what every one of those surfaces reads.
//
// The `wrong-*` codes are a different kind: they open a moderation task rather
// than changing what a reader is shown, because a claim about the CATALOG is
// not a statement about that reader's taste.

import {
  getPool, normalizeEvent, memRecordEvent, EVENT_INSERT_SQL,
  getProfile, saveProfile, getBoards, identityHash, hasDecayColumns,
  memAdoptEvents, adoptMemoryCoreData, adoptMemoryLedgers, countMemInteractions,
} from "../index.js";
import { halfLifeMs } from "../../brain/popularity.js";
import { mem, push, boundedLimit, withOrderedUserLocks, engKey } from "./store.js";
import { insertModerationTask, moderationTaskRow } from "./moderation.js";

// ---- User corrections (Day 11; supabase/schema-v5-corrections.sql) -----------
// Structured feedback — event + correction persist in ONE transaction so a
// correction can never exist without its canonical event (Day 8 posture).

const CORRECTION_RATE_LIMIT = 20;
const CORRECTION_SIGNAL_CODES = [
  "not-my-style", "less-like-this", "more-like-this", "dont-recommend-silhouette",
];

function correctionRateLimitError() {
  const error = new Error("too many corrections; try again shortly");
  error.code = "CORRECTION_RATE_LIMIT";
  return error;
}

function correctionDbRow(r) {
  return {
    id: r.id, userId: r.user_id, productId: r.product_id, brand: r.brand,
    code: r.code, tags: r.tags || [], note: r.note,
    createdAt: new Date(r.created_at).getTime(), persistent: true,
  };
}

export async function createUserCorrectionWithEvent(c, evt, moderation = null) {
  const row = {
    userId: String(c.userId).slice(0, 80),
    productId: c.productId ? String(c.productId).slice(0, 80) : null,
    brand: c.brand ? String(c.brand).slice(0, 120) : null,
    code: String(c.code).slice(0, 40),
    tags: (c.tags || []).map(String).slice(0, 8),
    note: c.note ? String(c.note).slice(0, 300) : null,
  };
  if (!row.productId) throw new TypeError("correction productId required");
  const n = normalizeEvent(evt);
  if (n.userId !== row.userId) throw new TypeError("correction and event user must match");
  const task = moderation ? moderationTaskRow(moderation) : null;
  const p = await getPool();
  if (!p) {
    const existing = mem.corrections.find((item) =>
      item.userId === row.userId && item.productId === row.productId && item.code === row.code);
    if (existing) return { correction: existing, moderationTask: null, duplicate: true };
    const cutoff = Date.now() - 60_000;
    if (mem.corrections.filter((item) =>
      item.userId === row.userId && item.createdAt > cutoff).length >= CORRECTION_RATE_LIMIT) {
      throw correctionRateLimitError();
    }
    memRecordEvent(n);
    const correction = push(mem.corrections,
      { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
    const moderationTask = task
      ? push(mem.moderationTasks, { ...task, createdAt: Date.now(), persistent: false })
      : null;
    return { correction, moderationTask, duplicate: false };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO user_corrections (user_id, product_id, brand, code, tags, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, product_id, code) WHERE product_id IS NOT NULL DO NOTHING
       RETURNING id, user_id, product_id, brand, code, tags, note, created_at`,
      [row.userId, row.productId, row.brand, row.code, JSON.stringify(row.tags), row.note]
    );
    if (!rows[0]) {
      const existing = await client.query(
        `SELECT id, user_id, product_id, brand, code, tags, note, created_at
         FROM user_corrections WHERE user_id=$1 AND product_id=$2 AND code=$3`,
        [row.userId, row.productId, row.code]);
      await client.query("COMMIT");
      return { correction: correctionDbRow(existing.rows[0]), moderationTask: null, duplicate: true };
    }
    const recent = await client.query(
      `SELECT count(*)::int AS n FROM user_corrections
       WHERE user_id=$1 AND created_at > now() - interval '1 minute'`,
      [row.userId]);
    if ((recent.rows[0]?.n || 0) > CORRECTION_RATE_LIMIT) throw correctionRateLimitError();
    await client.query(EVENT_INSERT_SQL, [n.userId, n.type, n.payloadJson, n.at]);
    if (task) await insertModerationTask(client, task);
    await client.query("COMMIT");
    return {
      correction: correctionDbRow(rows[0]),
      moderationTask: task ? { ...task, persistent: true } : null,
      duplicate: false,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function listUserCorrections(userId, limit = 200) {
  limit = boundedLimit(limit, 200, 500);
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 200));
  const p = await getPool();
  if (!p) return mem.corrections.filter((x) => x.userId === userId).slice(-safeLimit).reverse();
  const { rows } = await p.query(
    `SELECT id, user_id, product_id, brand, code, tags, note, created_at
     FROM user_corrections WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [userId, safeLimit]);
  return rows.map((r) => ({
    ...correctionDbRow(r),
  }));
}

export async function getUserCorrectionSignalSummary(userId) {
  const p = await getPool();
  if (!p) {
    const relevant = mem.corrections.filter((correction) =>
      correction.userId === userId && CORRECTION_SIGNAL_CODES.includes(correction.code));
    const aggregated = new Map();
    for (const correction of relevant) for (const rawTag of correction.tags || []) {
      const tag = String(rawTag).trim().toLowerCase();
      if (!tag) continue;
      const key = correction.code + "\0" + tag;
      aggregated.set(key, (aggregated.get(key) || 0) + 1);
    }
    return {
      count: relevant.length,
      signals: [...aggregated].map(([key, occurrences]) => {
        const [code, tag] = key.split("\0");
        return { code, tag, occurrences };
      }),
    };
  }
  const { rows } = await p.query(
    `WITH corrections AS MATERIALIZED (
       SELECT id, code, tags FROM user_corrections
       WHERE user_id=$1 AND code=ANY($2::text[])
     ), signals AS (
       SELECT code, lower(tag.value) AS tag, count(*)::int AS occurrences
       FROM corrections
       CROSS JOIN LATERAL jsonb_array_elements_text(tags) AS tag(value)
       GROUP BY code, lower(tag.value)
     )
     SELECT (SELECT count(*)::int FROM corrections) AS correction_count,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'code', code, 'tag', tag, 'occurrences', occurrences)) FROM signals), '[]'::jsonb) AS signals`,
    [userId, CORRECTION_SIGNAL_CODES]);
  return { count: rows[0]?.correction_count || 0, signals: rows[0]?.signals || [] };
}

export async function getUserRecommendationExclusions(userId) {
  const p = await getPool();
  if (!p) {
    const corrections = mem.corrections.filter((correction) => correction.userId === userId);
    return {
      brands: [...new Set(corrections
        .filter((correction) => correction.code === "dont-recommend-brand" && correction.brand)
        .map((correction) => correction.brand.trim().toLowerCase()))],
      productIds: [...new Set(corrections
        .filter((correction) => ["already-own", "not-my-style"].includes(correction.code))
        .map((correction) => correction.productId).filter(Boolean))],
    };
  }
  const { rows } = await p.query(
    `SELECT
       COALESCE(array_agg(DISTINCT lower(brand)) FILTER (
         WHERE code='dont-recommend-brand' AND brand IS NOT NULL), '{}') AS brands,
       COALESCE(array_agg(DISTINCT product_id) FILTER (
         WHERE code IN ('already-own','not-my-style') AND product_id IS NOT NULL), '{}') AS product_ids
     FROM user_corrections WHERE user_id=$1`,
    [userId]);
  return { brands: rows[0]?.brands || [], productIds: rows[0]?.product_ids || [] };
}

export async function getUserCorrectionState(userId, { productId = null, brand = null } = {}) {
  const normalizedBrand = String(brand || "").trim().toLowerCase();
  if (!productId && !normalizedBrand) return { alreadyOwn: false, excludedBrand: false };
  const p = await getPool();
  if (!p) {
    return {
      alreadyOwn: !!productId && mem.corrections.some((c) =>
        c.userId === userId && c.productId === productId && c.code === "already-own"),
      excludedBrand: !!normalizedBrand && mem.corrections.some((c) =>
        c.userId === userId && c.code === "dont-recommend-brand" &&
        String(c.brand || "").trim().toLowerCase() === normalizedBrand),
    };
  }
  const { rows } = await p.query(
    `SELECT
       COALESCE(bool_or(code='already-own' AND product_id=$2), false) AS already_own,
       COALESCE(bool_or(code='dont-recommend-brand' AND lower(brand)=$3), false) AS excluded_brand
     FROM user_corrections
     WHERE user_id=$1 AND ((product_id=$2 AND code='already-own') OR
       (lower(brand)=$3 AND code='dont-recommend-brand'))`,
    [userId, productId, normalizedBrand]);
  return {
    alreadyOwn: rows[0]?.already_own === true,
    excludedBrand: rows[0]?.excluded_brand === true,
  };
}

export async function adoptUserCorrections(fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return 0;
  const p = await getPool();
  if (!p) {
    const source = mem.corrections.filter((correction) => correction.userId === fromUserId);
    for (const correction of source) {
      const duplicate = mem.corrections.some((candidate) =>
        candidate.userId === toUserId && candidate.productId === correction.productId &&
        candidate.code === correction.code);
      if (!duplicate) correction.userId = toUserId;
    }
    mem.corrections = mem.corrections.filter((correction) =>
      correction.userId !== fromUserId);
    mem.styleProfiles.delete(fromUserId);
    memAdoptEvents(fromUserId, toUserId, "USER_CORRECTED_RECOMMENDATION");
    return source.length;
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const count = await client.query(
      "SELECT count(*)::int AS n FROM user_corrections WHERE user_id=$1", [fromUserId]);
    await client.query(
      `INSERT INTO user_corrections (user_id, product_id, brand, code, tags, note, created_at)
       SELECT $2, product_id, brand, code, tags, note, created_at
       FROM user_corrections WHERE user_id=$1 AND product_id IS NOT NULL
       ON CONFLICT (user_id, product_id, code) WHERE product_id IS NOT NULL DO NOTHING`,
      [fromUserId, toUserId]);
    await client.query(
      "UPDATE user_corrections SET user_id=$2 WHERE user_id=$1 AND product_id IS NULL",
      [fromUserId, toUserId]);
    await client.query(
      "DELETE FROM user_corrections WHERE user_id=$1 AND product_id IS NOT NULL", [fromUserId]);
    await client.query(
      "UPDATE user_events SET user_id=$2 WHERE user_id=$1 AND type='USER_CORRECTED_RECOMMENDATION'",
      [fromUserId, toUserId]);
    await client.query("DELETE FROM user_style_profiles WHERE user_id=$1", [fromUserId]);
    await client.query("COMMIT");
    return count.rows[0]?.n || 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Evidence mass → merge weight. Raw interaction counts are the honest measure
// of how much taste a side actually earned, but weighting LINEARLY by them lets
// a 5000-interaction account drown a 300-interaction device at 5.7% — months of
// real use on a second device, erased. sqrt is the conservative middle: it still
// crushes the pathological case (500 vs 1 → device 4.3%) while giving that same
// 300-interaction device 19.7%. Declared and measured in tests/adoption-mass.
function evidenceWeight(mass) {
  const n = Number(mass);
  return Number.isFinite(n) && n > 0 ? Math.sqrt(n) : 1;
}

// WHAT WAS WRONG (Aug 7, Round A). mergeVector treated the two cases
// inconsistently: a tag on ONE side kept its FULL value, a tag on BOTH sides was
// AVERAGED. So presence of weak corroborating evidence was punished harder than
// absence of any evidence at all. Measured: an account at TAILORED 0.8 signing
// in on a barely-used device holding TAILORED 0.1 came out at 0.45 — the
// account's strongest conviction nearly halved — while that same device's
// GORP 0.9, which the account had never expressed, arrived untouched at 0.9.
// The merge systematically favoured whichever side was newer.
//
// The averaging was only ever correct for the case it was written for: adoption
// from a device into an EMPTY account, where the account contributes nothing and
// (a+0)/2 never runs because the key is absent. Promoting accounts to primary
// identity makes the both-sides case the normal one, so it has to be right.
//
// Weighting by evidence mass makes absence the LIMIT of presence rather than a
// separate rule: a side with no opinion on a key has zero weight for that key,
// which is exactly "keep the other side". Equal masses reproduce the old
// arithmetic exactly, so this is a strict generalization — every adoption test
// written against (a+b)/2 still passes unchanged.
function mergeTasteProfiles(targetRaw, sourceRaw, { targetMass = 1, sourceMass = 1 } = {}) {
  const targetWeight = evidenceWeight(targetMass);
  const sourceWeight = evidenceWeight(sourceMass);
  const normalize = (raw) => {
    if (!raw || typeof raw !== "object") return { long: {}, session: {}, _meta: {} };
    if (raw.long || raw.session) {
      return { long: raw.long || {}, session: raw.session || {}, _meta: raw._meta || {} };
    }
    const long = {};
    for (const [key, value] of Object.entries(raw)) if (!key.startsWith("_")) long[key] = value;
    return { long, session: {}, _meta: raw._meta || {} };
  };
  const target = normalize(targetRaw);
  const source = normalize(sourceRaw);
  const mergeVector = (left, right) => {
    const merged = {};
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const a = Number(left[key]);
      const b = Number(right[key]);
      // Both sides hold an opinion: weighted mean. Only one does: that side is
      // the whole of the evidence, so it carries through untouched — the same
      // formula with the absent side's weight at zero.
      if (Number.isFinite(a) && Number.isFinite(b)) {
        // Equal evidence is the old code's exact case, and it is by far the
        // most common one (both sides at mass 0). Route it through the original
        // expression rather than the general one: (a*w + b*w) / 2w differs from
        // (a + b) / 2 in the last ULP, so the general form alone would drift
        // every equal-mass adoption by ~1e-16 for no reason and make "strictly
        // generalizes the old behaviour" only approximately true.
        const blended = targetWeight === sourceWeight
          ? (a + b) / 2
          : (a * targetWeight + b * sourceWeight) / (targetWeight + sourceWeight);
        merged[key] = Math.max(-1, Math.min(1, blended));
      } else if (Number.isFinite(a)) merged[key] = a;
      else if (Number.isFinite(b)) merged[key] = b;
    }
    return merged;
  };
  const mergeRing = (name, cap) => {
    const combined = [...(target._meta[name] || []), ...(source._meta[name] || [])];
    const seen = new Set();
    return combined.filter((entry) => {
      const key = typeof entry === "object" ? JSON.stringify(entry) : String(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, cap);
  };
  // Bridge impression counters are the r16/r19 tuning DENOMINATOR. The spread
  // below lets the target (account) win on any _meta key, so the device's
  // accumulated bridgeStats/bridgeServed were discarded on adoption — while
  // user_events (the NUMERATOR) transfer additively in the same transaction,
  // handing tunedSplit a numerator without its denominator (audit #16). Sum
  // them per bridge instead, same 100k cap as markBridgeImpressions.
  const mergeCounters = (name) => {
    const out = {};
    for (const side of [source._meta[name], target._meta[name]]) {
      if (!side || typeof side !== "object") continue;
      for (const [bridge, v] of Object.entries(side)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) out[bridge] = Math.min(100_000, (out[bridge] || 0) + n);
      }
    }
    return out;
  };
  const merged = {
    long: mergeVector(target.long, source.long),
    session: mergeVector(target.session, source.session),
    _meta: {
      // lastServe is a single pending-serve pointer; keep the target's (the
      // account continues from here) — the spread already does this.
      ...source._meta, ...target._meta,
      // Ring caps match the canonical writers (audit #16): recent →
      // RECENT_CAP 20 (lib/brain/index.js), seen → SEEN_CAP 200, activity →
      // ACTIVITY_MAX 30 (lib/brain/memory.js), looksSeen → SEEN_LOOKS_CAP 300
      // (app/api/outfits), follows → FOLLOW_CAP 10 (app/api/follow). A larger
      // merge cap let the next writer silently truncate — or, for follows,
      // never (it only slices on add), leaving the feed blending 100 boards.
      recent: mergeRing("recent", 20), seen: mergeRing("seen", 200),
      activity: mergeRing("activity", 30), looksSeen: mergeRing("looksSeen", 300),
      follows: mergeRing("follows", 10),
      lastActive: Math.max(Number(target._meta.lastActive) || 0, Number(source._meta.lastActive) || 0) || undefined,
    },
  };
  for (const name of ["bridgeStats", "bridgeServed"]) {
    if (source._meta[name] || target._meta[name]) merged._meta[name] = mergeCounters(name);
  }
  return merged;
}

// Adopt all device-owned personalization in one database transaction. The
// database advisory locks coordinate serverless instances; the durable result
// makes retries idempotent after a lost response.
export async function adoptAccountData(fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    return { movedProfile: false, movedBoards: 0, movedCorrections: 0, movedRecords: 0, duplicate: true };
  }
  const p = await getPool();
  const adoptionKey = `${fromUserId}|${toUserId}`;
  if (!p) {
    const prior = mem.adoptions.get(adoptionKey);
    if (prior) return { ...(await prior), duplicate: true };
    const run = withOrderedUserLocks([fromUserId, toUserId], async () => {
      let movedProfile = false;
      let movedBoards = 0;
      const sourceProfile = await getProfile(fromUserId);
      if (sourceProfile && Object.keys(sourceProfile).length > 0) {
        const targetProfile = await getProfile(toUserId);
        // Counted BEFORE adoptMemoryCoreData moves the interaction rows below,
        // or both sides would read as the account and weighting would no-op.
        await saveProfile(toUserId, mergeTasteProfiles(targetProfile, sourceProfile, {
          targetMass: countMemInteractions(toUserId),
          sourceMass: countMemInteractions(fromUserId),
        }));
        await saveProfile(fromUserId, {});
        movedProfile = true;
      }
      const targetHasDefault = (await getBoards(toUserId)).some((board) => board.isDefault);
      const sourceBoards = await getBoards(fromUserId);
      for (const [index, source] of sourceBoards.entries()) {
        source.userId = toUserId;
        source.isDefault = !targetHasDefault && index === 0;
        movedBoards++;
      }
      const movedCorrections = await adoptUserCorrections(fromUserId, toUserId);
      let movedRecords = adoptMemoryCoreData(fromUserId, toUserId);
      // Identity-keyed corroboration ledgers (v22/v23). See adoptMemoryLedgers.
      movedRecords += adoptMemoryLedgers(fromUserId, toUserId);
      // Wire engagement (v28) lives in THIS module's mem, not the ledger
      // store adoptMemoryLedgers walks — so its rekey belongs here. Same
      // law: the account absorbs the device's likes/saves, and a collision
      // collapses to one row, because it is one person on that counter.
      {
        const fromHash = identityHash(fromUserId), toHash = identityHash(toUserId);
        if (fromHash !== toHash) {
          for (const key of [...mem.engagements]) {
            const [postId, rowHash, kind] = key.split("|");
            if (rowHash !== fromHash) continue;
            mem.engagements.delete(key);
            mem.engagements.add(engKey(postId, toHash, kind));
            movedRecords++;
          }
        }
      }
      // unknown_query_votes: "one identity cannot vote a query into research".
      // Same defeat as the edge ledger — an unmoved device vote let the same
      // person vote twice, inflating the demand count that drives promotion
      // into the research pipeline. Rekey, dropping the vote if the account
      // already cast one for that query, and keep the row counts honest.
      {
        const fromHash = identityHash(fromUserId), toHash = identityHash(toUserId);
        for (const voteKey of [...mem.unknownVotes]) {
          const split = voteKey.lastIndexOf("|");
          if (voteKey.slice(split + 1) !== fromHash) continue;
          const queryId = voteKey.slice(0, split);
          mem.unknownVotes.delete(voteKey);
          const targetKey = queryId + "|" + toHash;
          if (mem.unknownVotes.has(targetKey)) {
            // Double vote by one person: retract it from the tallies.
            for (const row of mem.unknownQueries.values()) {
              if (String(row.id) !== queryId) continue;
              row.demand_count = Math.max(0, row.demand_count - 1);
              row.distinct_identities = Math.max(0, row.distinct_identities - 1);
            }
          } else {
            mem.unknownVotes.add(targetKey);
          }
          movedRecords++;
        }
      }
      if (mem.measurements.has(fromUserId)) {
        if (!mem.measurements.has(toUserId)) mem.measurements.set(toUserId, mem.measurements.get(fromUserId));
        mem.measurements.delete(fromUserId);
        movedRecords++;
      }
      for (const collection of [
        mem.searchLogs, mem.tickets, mem.uploads, mem.outfits, mem.analyses,
        mem.stylistRequests, mem.stylistFeedback, mem.aiEvents,
      ]) {
        for (const row of collection) {
          if (row.userId === fromUserId) {
            row.userId = toUserId;
            movedRecords++;
          }
        }
      }
      for (const post of mem.posts) {
        if (post.authorId === fromUserId) {
          post.authorId = toUserId;
          movedRecords++;
        }
      }
      for (const feedback of mem.interpretationFeedback) {
        if (feedback.user_id !== fromUserId) continue;
        const target = mem.interpretationFeedback.find((row) =>
          row !== feedback
          && row.user_id === toUserId
          && row.normalized_query === feedback.normalized_query
          && row.interpretation_id === feedback.interpretation_id);
        if (target) {
          target.verdict = feedback.verdict;
          target.contract_version = feedback.contract_version;
        } else {
          feedback.user_id = toUserId;
        }
        movedRecords++;
      }
      mem.interpretationFeedback = mem.interpretationFeedback.filter((row) => row.user_id !== fromUserId);
      for (const follow of mem.follows) {
        if (follow.userId !== fromUserId) continue;
        const dup = mem.follows.some((row) =>
          row.userId === toUserId && row.kind === follow.kind && row.target === follow.target);
        if (!dup) follow.userId = toUserId;
        movedRecords++;
      }
      mem.follows = mem.follows.filter((row) => row.userId !== fromUserId);
      for (const piece of mem.wardrobe) {
        if (piece.user_id !== fromUserId) continue;
        const collision = piece.source_ref && mem.wardrobe.some((row) =>
          row !== piece && row.user_id === toUserId
          && row.source === piece.source && row.source_ref === piece.source_ref);
        if (!collision) piece.user_id = toUserId;
        movedRecords++;
      }
      mem.wardrobe = mem.wardrobe.filter((row) => row.user_id !== fromUserId);
      for (const key of [...mem.railPrefs.keys()]) {
        if (!key.startsWith(fromUserId + "|")) continue;
        const railId = key.slice(fromUserId.length + 1);
        const toKey = toUserId + "|" + railId;
        if (!mem.railPrefs.has(toKey)) mem.railPrefs.set(toKey, mem.railPrefs.get(key));
        mem.railPrefs.delete(key);
        movedRecords++;
      }
      // account-side preferences win; device preferences move only into a gap
      if (mem.memoryPreferences.has(fromUserId) && !mem.memoryPreferences.has(toUserId)) {
        mem.memoryPreferences.set(toUserId, mem.memoryPreferences.get(fromUserId));
        movedRecords++;
      }
      mem.memoryPreferences.delete(fromUserId);
      mem.styleProfiles.delete(fromUserId);
      return { movedProfile, movedBoards, movedCorrections, movedRecords, duplicate: false };
    });
    mem.adoptions.set(adoptionKey, run);
    try {
      return await run;
    } catch (error) {
      throw error;
    } finally {
      // Completed moves are naturally idempotent because the source is empty;
      // clearing allows a later signed-out session to accumulate and move new data.
      mem.adoptions.delete(adoptionKey);
    }
  }

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    for (const identity of [`user-lock:${fromUserId}`, `user-lock:${toUserId}`].sort()) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [identity]);
    }
    const prior = await client.query(
      `SELECT moved_profile,moved_boards,moved_corrections
       FROM identity_adoptions WHERE from_user_id=$1 AND to_user_id=$2`,
      [fromUserId, toUserId]
    );
    const sourceProfile = await client.query(
      "SELECT vec FROM profiles WHERE user_id=$1 AND vec <> '{}'::jsonb FOR UPDATE", [fromUserId]);
    const targetProfile = await client.query(
      "SELECT vec FROM profiles WHERE user_id=$1 FOR UPDATE", [toUserId]);
    const sourceBoards = await client.query(
      "SELECT id,is_default FROM boards WHERE user_id=$1 ORDER BY is_default DESC,created_at,id FOR UPDATE",
      [fromUserId]
    );
    const correctionCount = await client.query(
      "SELECT count(*)::int AS n FROM user_corrections WHERE user_id=$1", [fromUserId]);
    const linkedCount = await client.query(
      `SELECT (
        (SELECT count(*) FROM interactions WHERE user_id=$1) +
        (SELECT count(*) FROM user_events WHERE user_id=$1) +
        (SELECT count(*) FROM search_logs WHERE user_id=$1) +
        (SELECT count(*) FROM editorial_posts WHERE author_id=$1) +
        (SELECT count(*) FROM mood_board_uploads WHERE user_id=$1) +
        (SELECT count(*) FROM mood_board_analysis WHERE user_id=$1) +
        (SELECT count(*) FROM stylist_requests WHERE user_id=$1) +
        (SELECT count(*) FROM stylist_outfits WHERE user_id=$1) +
        (SELECT count(*) FROM stylist_feedback WHERE user_id=$1) +
        (SELECT count(*) FROM ai_model_events WHERE user_id=$1) +
        (SELECT count(*) FROM user_measurements WHERE user_id=$1) +
        (SELECT count(*) FROM interpretation_feedback WHERE user_id=$1) +
        (SELECT count(*) FROM user_follows WHERE user_id=$1) +
        (SELECT count(*) FROM asterisk_memory_preferences WHERE user_id=$1) +
        (SELECT count(*) FROM wardrobe_items WHERE user_id=$1) +
        (SELECT count(*) FROM user_rail_prefs WHERE user_id=$1) +
        (SELECT count(*) FROM purchase_tickets WHERE user_id=$1)
      )::int AS n`,
      [fromUserId]
    );
    // The identity_hash ledgers are adoptable state too, and until Aug 7 this
    // early return could not see them — it enumerates user_id tables only.
    //
    // REACHABLE, and it bypassed the ledger rekey below. GET /api/interpret
    // writes unknown_query_votes via noteUnknownQuery and NOTHING else: no
    // profile, no event, no search log, no interaction. So: sign in once
    // (creating the identity_adoptions row), sign out (adoption has emptied
    // the device), search something flagged for research while signed out,
    // sign back in — prior exists, every user_id counter reads 0, and the
    // vote is never rekeyed. The same human then votes twice on a query, and
    // the vote survives account deletion.
    //
    // Postgres-only: the mem path dedupes on an in-flight promise it deletes
    // in `finally`, so it has no persistent `prior` and never takes this
    // branch. Every unit test runs mem, which is why it survived.
    const ledgerCount = await client.query(
      `SELECT (
        (SELECT count(*) FROM edge_contributors WHERE identity_hash=$1) +
        (SELECT count(*) FROM popularity_contributors WHERE identity_hash=$1) +
        (SELECT count(*) FROM unknown_query_votes WHERE identity_hash=$1)
      )::int AS n`,
      [identityHash(fromUserId)]
    );
    const newSignals = sourceProfile.rowCount > 0 || sourceBoards.rowCount > 0 ||
      (correctionCount.rows[0]?.n || 0) > 0 || (linkedCount.rows[0]?.n || 0) > 0 ||
      (ledgerCount.rows[0]?.n || 0) > 0;
    if (prior.rowCount && !newSignals) {
      await client.query("COMMIT");
      return {
        movedProfile: prior.rows[0].moved_profile,
        movedBoards: prior.rows[0].moved_boards,
        movedCorrections: prior.rows[0].moved_corrections,
        movedRecords: 0,
        duplicate: true,
      };
    }

    const movedProfile = sourceProfile.rowCount > 0;
    if (movedProfile) {
      // Evidence mass per side, read inside the same transaction and BEFORE the
      // interactions UPDATE below reassigns the device's rows to the account —
      // afterwards both counts would be the account's and the weighting would
      // silently collapse to the old 50/50 average.
      const mass = await client.query(
        `SELECT
           (SELECT count(*) FROM interactions WHERE user_id=$1)::int AS source_mass,
           (SELECT count(*) FROM interactions WHERE user_id=$2)::int AS target_mass`,
        [fromUserId, toUserId]
      );
      const merged = mergeTasteProfiles(targetProfile.rows[0]?.vec || {}, sourceProfile.rows[0].vec, {
        targetMass: mass.rows[0]?.target_mass || 0,
        sourceMass: mass.rows[0]?.source_mass || 0,
      });
      await client.query(
        `INSERT INTO profiles (user_id,vec,updated_at) VALUES ($1,$2,now())
         ON CONFLICT (user_id) DO UPDATE SET vec=EXCLUDED.vec,updated_at=now()`,
        [toUserId, JSON.stringify(merged)]
      );
      await client.query("DELETE FROM profiles WHERE user_id=$1", [fromUserId]);
    }

    let movedBoards = 0;
    if (sourceBoards.rowCount) {
      const targetDefault = await client.query(
        "SELECT 1 FROM boards WHERE user_id=$1 AND is_default=true LIMIT 1", [toUserId]);
      if (targetDefault.rowCount) {
        await client.query("UPDATE boards SET is_default=false WHERE user_id=$1", [fromUserId]);
      } else if (!sourceBoards.rows.some((board) => board.is_default)) {
        await client.query("UPDATE boards SET is_default=true WHERE id=$1", [sourceBoards.rows[0].id]);
      }
      const moved = await client.query("UPDATE boards SET user_id=$2 WHERE user_id=$1", [fromUserId, toUserId]);
      movedBoards = moved.rowCount;
    }

    await client.query(
      `INSERT INTO user_corrections (user_id,product_id,brand,code,tags,note,created_at)
       SELECT $2,product_id,brand,code,tags,note,created_at
       FROM user_corrections WHERE user_id=$1 AND product_id IS NOT NULL
       ON CONFLICT (user_id,product_id,code) WHERE product_id IS NOT NULL DO NOTHING`,
      [fromUserId, toUserId]
    );
    await client.query(
      "UPDATE user_corrections SET user_id=$2 WHERE user_id=$1 AND product_id IS NULL",
      [fromUserId, toUserId]
    );
    await client.query(
      "DELETE FROM user_corrections WHERE user_id=$1 AND product_id IS NOT NULL", [fromUserId]);
    for (const [table, column] of [
      ["interactions", "user_id"], ["user_events", "user_id"], ["search_logs", "user_id"],
      ["editorial_posts", "author_id"], ["mood_board_uploads", "user_id"],
      ["mood_board_analysis", "user_id"], ["stylist_requests", "user_id"],
      ["stylist_outfits", "user_id"], ["stylist_feedback", "user_id"],
      ["ai_model_events", "user_id"], ["purchase_tickets", "user_id"],
    ]) {
      await client.query(`UPDATE ${table} SET ${column}=$2 WHERE ${column}=$1`, [fromUserId, toUserId]);
    }
    await client.query(
      `INSERT INTO processed_operations (scope,user_id,operation_id,created_at)
       SELECT scope,$2,operation_id,created_at FROM processed_operations WHERE user_id=$1
       ON CONFLICT (scope,user_id,operation_id) DO NOTHING`,
      [fromUserId, toUserId]
    );
    await client.query("DELETE FROM processed_operations WHERE user_id=$1", [fromUserId]);
    await client.query("DELETE FROM user_style_profiles WHERE user_id=$1", [fromUserId]);
    await client.query(
      `INSERT INTO user_measurements
         (user_id,usual_size,preferred_unit,chest_in,waist_in,hips_in,inseam_in,height_in,updated_at)
       SELECT $2,usual_size,preferred_unit,chest_in,waist_in,hips_in,inseam_in,height_in,updated_at
       FROM user_measurements WHERE user_id=$1
       ON CONFLICT (user_id) DO NOTHING`, [fromUserId, toUserId]);
    await client.query("DELETE FROM user_measurements WHERE user_id=$1", [fromUserId]);
    await client.query(
      `INSERT INTO interpretation_feedback
         (user_id,normalized_query,interpretation_id,contract_version,verdict,created_at)
       SELECT $2,normalized_query,interpretation_id,contract_version,verdict,created_at
       FROM interpretation_feedback WHERE user_id=$1
       ON CONFLICT (user_id,normalized_query,interpretation_id) DO UPDATE SET
         contract_version=EXCLUDED.contract_version,
         verdict=EXCLUDED.verdict`,
      [fromUserId, toUserId]
    );
    await client.query("DELETE FROM interpretation_feedback WHERE user_id=$1", [fromUserId]);
    await client.query(
      `INSERT INTO user_follows (user_id,kind,target,created_at)
       SELECT $2,kind,target,created_at FROM user_follows WHERE user_id=$1
       ON CONFLICT (user_id,kind,target) DO NOTHING`,
      [fromUserId, toUserId]);
    await client.query("DELETE FROM user_follows WHERE user_id=$1", [fromUserId]);
    await client.query(
      `INSERT INTO asterisk_memory_preferences
         (user_id,hidden_sections,guidance_enabled,updated_at)
       SELECT $2,hidden_sections,guidance_enabled,updated_at
       FROM asterisk_memory_preferences WHERE user_id=$1
       ON CONFLICT (user_id) DO NOTHING`,
      [fromUserId, toUserId]);
    await client.query("DELETE FROM asterisk_memory_preferences WHERE user_id=$1", [fromUserId]);
    await client.query(
      `UPDATE wardrobe_items SET user_id=$2, updated_at=now()
       WHERE user_id=$1 AND (source_ref IS NULL OR NOT EXISTS (
         SELECT 1 FROM wardrobe_items AS w2
         WHERE w2.user_id=$2 AND w2.source=wardrobe_items.source AND w2.source_ref=wardrobe_items.source_ref))`,
      [fromUserId, toUserId]);
    await client.query("DELETE FROM wardrobe_items WHERE user_id=$1", [fromUserId]);
    await client.query(
      `INSERT INTO user_rail_prefs (user_id, rail_id, collapsed, hidden, updated_at)
       SELECT $2, rail_id, collapsed, hidden, updated_at FROM user_rail_prefs WHERE user_id=$1
       ON CONFLICT (user_id, rail_id) DO NOTHING`,
      [fromUserId, toUserId]);
    await client.query("DELETE FROM user_rail_prefs WHERE user_id=$1", [fromUserId]);

    // ---- identity_hash-keyed corroboration ledgers (v22/v23, v13 votes) ----
    // Everything above is keyed by user_id. These are keyed by sha256(user_id),
    // and adoption used to skip them entirely — see adoptMemoryLedgers in
    // lib/db/index.js for the two failures that caused (one human counting as
    // two distinct contributors, and erasure missing everything from before
    // sign-in). Same shape as purge: rekey, merge on collision, recompute the
    // materialized aggregate. Inside the same transaction and the same
    // advisory locks, so a concurrent write cannot interleave.
    const fromHash = identityHash(fromUserId);
    const toHash = identityHash(toUserId);

    // Wire engagement (v28), same law as the ledgers below: rekey the
    // device's likes/saves onto the account, and DO NOTHING on collision —
    // a person who liked a transmission before signing in and again after
    // is ONE person on that counter, not two. (No aggregate to recompute:
    // the counts are computed from this ledger on read.)
    await client.query(
      `WITH moved AS (
         DELETE FROM transmission_engagements WHERE identity_hash=$1
         RETURNING post_id, kind, created_at
       )
       INSERT INTO transmission_engagements (post_id, identity_hash, kind, created_at)
       SELECT post_id, $2, kind, created_at FROM moved
       ON CONFLICT (post_id, identity_hash, kind) DO NOTHING`,
      [fromHash, toHash]
    );

    const popMoved = await client.query(
      `WITH moved AS (
         DELETE FROM popularity_contributors WHERE identity_hash=$1
         RETURNING item_id, engaged, viewed, first_seen
       )
       INSERT INTO popularity_contributors (item_id, identity_hash, engaged, viewed, first_seen)
       SELECT item_id, $2, engaged, viewed, first_seen FROM moved
       ON CONFLICT (item_id, identity_hash) DO UPDATE SET
         engaged = popularity_contributors.engaged OR EXCLUDED.engaged,
         viewed  = popularity_contributors.viewed  OR EXCLUDED.viewed,
         -- EARLIEST wins. Decay is measured from first_seen, so letting a
         -- sign-in refresh it would let one identity keep an item permanently
         -- fresh just by signing in — the inverse of repetition-buys-nothing.
         first_seen = LEAST(popularity_contributors.first_seen, EXCLUDED.first_seen)
       RETURNING item_id`,
      [fromHash, toHash]
    );
    if (popMoved.rowCount) {
      // The people-counts must be recomputed even though the row count is
      // unchanged: two rows collapsing into one is exactly the double-count
      // this fixes, and the aggregate still says 2 until it is recomputed.
      const decayCols = await hasDecayColumns(client).catch(() => false);
      await client.query(
        decayCols
          ? `WITH touched AS (
               SELECT DISTINCT id FROM jsonb_to_recordset($1::jsonb) AS x(id text)
             ), agg AS (
               SELECT t.id,
                      count(*) FILTER (WHERE c.engaged)::int AS engagers,
                      count(*) FILTER (WHERE c.viewed)::int AS viewers,
                      COALESCE(sum(power(0.5, extract(epoch FROM (now() - c.first_seen)) / $2::float8))
                               FILTER (WHERE c.engaged), 0) AS engagers_decayed,
                      COALESCE(sum(power(0.5, extract(epoch FROM (now() - c.first_seen)) / $2::float8))
                               FILTER (WHERE c.viewed), 0) AS viewers_decayed
               FROM touched t LEFT JOIN popularity_contributors c ON c.item_id = t.id
               GROUP BY t.id
             )
             UPDATE popularity p SET engagers = agg.engagers, viewers = agg.viewers,
               engagers_decayed = agg.engagers_decayed,
               viewers_decayed = agg.viewers_decayed,
               decayed_at = now()
             FROM agg WHERE p.item_id = agg.id`
          : `WITH touched AS (
               SELECT DISTINCT id FROM jsonb_to_recordset($1::jsonb) AS x(id text)
             ), agg AS (
               SELECT t.id,
                      count(*) FILTER (WHERE c.engaged)::int AS engagers,
                      count(*) FILTER (WHERE c.viewed)::int AS viewers
               FROM touched t LEFT JOIN popularity_contributors c ON c.item_id = t.id
               GROUP BY t.id
             )
             UPDATE popularity p SET engagers = agg.engagers, viewers = agg.viewers
             FROM agg WHERE p.item_id = agg.id`,
        decayCols
          ? [JSON.stringify(popMoved.rows.map((r) => ({ id: r.item_id }))), halfLifeMs() / 1000]
          : [JSON.stringify(popMoved.rows.map((r) => ({ id: r.item_id })))]
      );
    }

    const edgeMoved = await client.query(
      `WITH moved AS (
         DELETE FROM edge_contributors WHERE identity_hash=$1
         RETURNING a, b, w, first_seen
       )
       INSERT INTO edge_contributors (a, b, identity_hash, w, first_seen)
       SELECT a, b, $2, w, first_seen FROM moved
       ON CONFLICT (a, b, identity_hash) DO UPDATE SET
         -- GREATEST, never sum: the ledger holds each contributor's BEST
         -- weight so the action hierarchy survives and repetition is worthless.
         w = GREATEST(edge_contributors.w, EXCLUDED.w),
         first_seen = LEAST(edge_contributors.first_seen, EXCLUDED.first_seen)
       RETURNING a, b`,
      [fromHash, toHash]
    );
    if (edgeMoved.rowCount) {
      await client.query(
        `WITH touched AS (
           SELECT DISTINCT a,b FROM jsonb_to_recordset($1::jsonb) AS x(a text,b text)
         ), agg AS (
           SELECT t.a, t.b,
                  COALESCE(sum(c.w),0)::real AS w,
                  count(c.identity_hash)::int AS contributors
           FROM touched t LEFT JOIN edge_contributors c ON c.a=t.a AND c.b=t.b
           GROUP BY t.a, t.b
         )
         UPDATE edges e SET w = agg.w, contributors = agg.contributors
         FROM agg WHERE e.a = agg.a AND e.b = agg.b`,
        [JSON.stringify(edgeMoved.rows.map((r) => ({ a: r.a, b: r.b })))]
      );
    }

    // unknown_query_votes: one identity, one vote per query. A vote the
    // account already cast is DROPPED rather than rekeyed, and the tallies it
    // fed are decremented — otherwise signing in leaves a phantom vote in
    // demand_count, which is what promotes a query into the research pipeline.
    const voteDropped = await client.query(
      `WITH moved AS (
         DELETE FROM unknown_query_votes WHERE identity_hash=$1 RETURNING query_id, last_voted
       ), kept AS (
         INSERT INTO unknown_query_votes (query_id, identity_hash, last_voted)
         SELECT query_id, $2, last_voted FROM moved
         ON CONFLICT (query_id, identity_hash) DO NOTHING
         RETURNING query_id
       )
       SELECT m.query_id FROM moved m
       WHERE NOT EXISTS (SELECT 1 FROM kept k WHERE k.query_id = m.query_id)`,
      [fromHash, toHash]
    );
    if (voteDropped.rowCount) {
      await client.query(
        `UPDATE unknown_queries q
         SET demand_count = GREATEST(0, q.demand_count - d.n),
             distinct_identities = GREATEST(0, q.distinct_identities - d.n)
         FROM (SELECT id, count(*)::int AS n
               FROM jsonb_to_recordset($1::jsonb) AS x(id bigint)
               GROUP BY id) d
         WHERE q.id = d.id`,
        [JSON.stringify(voteDropped.rows.map((r) => ({ id: Number(r.query_id) })))]
      );
    }

    const result = {
      movedProfile,
      movedBoards,
      movedCorrections: correctionCount.rows[0]?.n || 0,
      movedRecords: linkedCount.rows[0]?.n || 0,
      duplicate: false,
    };
    await client.query(
      `INSERT INTO identity_adoptions
         (from_user_id,to_user_id,moved_profile,moved_boards,moved_corrections)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (from_user_id,to_user_id) DO UPDATE SET
         moved_profile=identity_adoptions.moved_profile OR EXCLUDED.moved_profile,
         moved_boards=identity_adoptions.moved_boards+EXCLUDED.moved_boards,
         moved_corrections=identity_adoptions.moved_corrections+EXCLUDED.moved_corrections,
         adopted_at=now()`,
      [fromUserId, toUserId, result.movedProfile, result.movedBoards, result.movedCorrections]
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

