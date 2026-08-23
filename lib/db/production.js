// lib/db/production.js
// CRUD for the production-foundation tables (supabase/schema-v2.sql):
// product_tags, product_images, search_mappings, search_logs, purchase_tickets,
// editorial_posts, mood_board_uploads, stylist_outfits, source_sync_logs,
// product_availability_checks.
//
// Same posture as lib/db/index.js: Postgres when DATABASE_URL is set, small
// in-memory fallback otherwise so nothing crashes in a keyless dev run.
// Responses that depend on persistence report it honestly via `persistent`.

import { randomUUID } from "node:crypto";
import {
  getPool, normalizeEvent, memRecordEvent, memAdoptEvents, EVENT_INSERT_SQL,
  getProfile, saveProfile, getBoards, withUserLock,
  purgeMemoryUserData, adoptMemoryCoreData, adoptMemoryLedgers, countMemInteractions,
  countMemOperations, countMemLedgers, getInteractions, listEvents,
  identityHash, hasDecayColumns,
} from "./index.js";
import { halfLifeMs } from "../brain/popularity.js";
import { validateOpenCase, validateTransition } from "../brands/cases.js";
import { EMPTY_MEASUREMENTS, measurementProfileForDisplay } from "../brain/measurements.js";

const mem = {
  ontologyTags: new Map(),  // id -> row
  productAiTags: [],        // append-only, grouped by auditId
  reconciliations: [],
  facts: [],
  moderationTasks: [],
  corrections: [],
  productTags: [],       // {productId, tag, tagType, confidence, source}
  mappings: new Map(),   // phrase -> {mappedTags, relatedTerms, referenceType, confidence}
  searchLogs: [],
  tickets: [],           // capped ring
  posts: [],
  uploads: [],
  outfits: [],
  analyses: [],          // mood_board_analysis
  styleProfiles: new Map(), // userId -> profile row
  stylistRequests: [],
  stylistFeedback: [],
  aiEvents: [],          // ai_model_events
  adoptions: new Map(),  // "device|account" -> in-flight/completed result promise
  measurements: new Map(), // userId -> canonical inch storage
  unknownQueries: new Map(), // normalized_query -> row (v13)
  unknownVotes: new Set(),   // "queryId|identityHash"
  interpretationFeedback: [], // v13
  memoryPreferences: new Map(), // userId -> {hiddenSections, guidanceEnabled, updatedAt} (v14/v20)
  follows: [], // {userId, kind, target, createdAt} (v14; brand/user only)
  wardrobe: [], // wardrobe_items rows, snake_case (v15)
  railPrefs: new Map(), // "userId|railId" -> {collapsed, hidden} (v16)
  profileRooms: new Map(), // accountId(uuid) -> room row, camelCase (v17)
  profileModules: new Map(), // "accountId|module" -> module row (v17)
  brandCases: new Map(), // caseId -> case row, camelCase (v18)
  brandCaseEvents: [], // append-only transition ledger (v18)
  businessAccounts: new Map(), // accountId -> business-account row (v26)
  engagements: new Set(), // "postId|identityHash|kind" — person-deduped (v28)
  seq: 1,
};
const MEM_CAP = 2000;
function push(arr, row) { arr.push(row); if (arr.length > MEM_CAP) arr.splice(0, arr.length - MEM_CAP); return row; }
function boundedLimit(value, fallback, max) {
  return Math.max(1, Math.min(max, Math.trunc(Number(value)) || fallback));
}

function withOrderedUserLocks(userIds, fn) {
  const ids = [...new Set(userIds)].sort();
  const acquire = (index) => index >= ids.length
    ? fn()
    : withUserLock(ids[index], () => acquire(index + 1));
  return acquire(0);
}

// Coordinate ownership-sensitive operations across server instances without
// holding a database transaction open while Storage performs network I/O.
// The persistent key intentionally matches account adoption's user lock.
export async function withUserOperationLock(userId, fn) {
  if (!userId || typeof fn !== "function") throw new TypeError("user operation lock requires an identity and callback");
  const p = await getPool();
  if (!p) return withUserLock(userId, () => fn(null));
  const client = await p.connect();
  let locked = false;
  let releaseError = null;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [`user-lock:${userId}`]);
    locked = true;
    return await fn(client);
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`user-lock:${userId}`]);
      } catch (error) {
        releaseError = error;
      }
    }
    client.release(releaseError || undefined);
  }
}

export async function isPersistent() {
  return !!(await getPool());
}

// Delete user-linked personalization records while retaining purchase tickets
// and consent records.
//
// (Aug 6) This comment used to say that aggregate popularity and edge weights
// "are deidentified and cannot be reliably subtracted, so they remain". That
// stopped being true when the corroboration ledgers landed: edge_contributors
// (v22) and popularity_contributors (v23) are per-identity rows, so this
// function now erases them AND recomputes the affected aggregates. A privacy
// statement that outlives the code it describes is worse than the gap it
// described. What genuinely remains deidentified is the raw eng/imp event
// counters, which carry no identity column and are diagnostic only.
export async function purgePersonalizationData(userId, { queryTarget = null } = {}) {
  if (!userId) throw new TypeError("userId required");
  const p = queryTarget || await getPool();
  if (!p) {
    purgeMemoryUserData(userId);
    mem.corrections = mem.corrections.filter((row) => row.userId !== userId);
    mem.searchLogs = mem.searchLogs.filter((row) => row.userId !== userId);
    mem.posts = mem.posts.filter((row) => row.authorId !== userId);
    mem.uploads = mem.uploads.filter((row) => row.userId !== userId);
    mem.outfits = mem.outfits.filter((row) => row.userId !== userId);
    mem.analyses = mem.analyses.filter((row) => row.userId !== userId);
    mem.styleProfiles.delete(userId);
    mem.stylistRequests = mem.stylistRequests.filter((row) => row.userId !== userId);
    mem.stylistFeedback = mem.stylistFeedback.filter((row) => row.userId !== userId);
    mem.aiEvents = mem.aiEvents.filter((row) => row.userId !== userId);
    mem.measurements.delete(userId);
    mem.interpretationFeedback = mem.interpretationFeedback.filter((row) => row.user_id !== userId);
    mem.memoryPreferences.delete(userId);
    mem.follows = mem.follows.filter((row) => row.userId !== userId);
    mem.wardrobe = mem.wardrobe.filter((row) => row.user_id !== userId);
    // Wire engagement (v28) is identity_hash-keyed like the ledgers below;
    // erasure means this person stops counting on every transmission.
    {
      const goneHash = identityHash(userId);
      for (const key of [...mem.engagements]) {
        if (key.split("|")[1] === goneHash) mem.engagements.delete(key);
      }
    }
    // Mirrors the Postgres branch: erase this identity's research votes and
    // take them back out of the demand tallies.
    {
      const voterHash = identityHash(userId);
      for (const voteKey of [...mem.unknownVotes]) {
        const split = voteKey.lastIndexOf("|");
        if (voteKey.slice(split + 1) !== voterHash) continue;
        mem.unknownVotes.delete(voteKey);
        const queryId = voteKey.slice(0, split);
        for (const row of mem.unknownQueries.values()) {
          if (String(row.id) !== queryId) continue;
          row.demand_count = Math.max(0, row.demand_count - 1);
          row.distinct_identities = Math.max(0, row.distinct_identities - 1);
        }
      }
    }
    for (const key of mem.railPrefs.keys()) if (key.startsWith(userId + "|")) mem.railPrefs.delete(key);
    // Profile rooms key on the auth uuid (ADR-002) — erase them when the
    // purged identity is the account's sb- form.
    if (/^sb-[0-9a-f-]{36}$/i.test(userId)) {
      const accountId = userId.slice(3).toLowerCase();
      mem.profileRooms.delete(accountId);
      for (const key of mem.profileModules.keys()) if (key.startsWith(accountId + "|")) mem.profileModules.delete(key);
    }
    // The SAME disclosure the Postgres branch returns. It used to read
    // "deidentified aggregate item statistics", which stopped being accurate
    // on Aug 6 when the corroboration ledgers made the aggregates recomputable
    // — the Postgres wording was corrected then and this one was not, so mem
    // (what preview deploys and local dev run on) named a broader retention to
    // the user than actually happens. /api/privacy returns this array
    // verbatim, so the two backends were telling people different things.
    return { persistent: false, retained: RETAINED_AFTER_ERASURE };
  }
  const ownsClient = !queryTarget;
  const client = queryTarget || await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM mood_board_analysis WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM mood_board_uploads WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM stylist_feedback WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM stylist_outfits WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM stylist_requests WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM user_style_profiles WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM ai_model_events WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM user_corrections WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM editorial_posts WHERE author_id=$1", [userId]);
    // Wire engagement (v28): this person's likes/saves on OTHER people's
    // transmissions. (Engagements ON their own posts leave with those posts,
    // via ON DELETE CASCADE from the line above.) Counts are computed on
    // read, so there is no aggregate to recompute — the ledger IS the count.
    await client.query("DELETE FROM transmission_engagements WHERE identity_hash=$1", [identityHash(userId)]);
    await client.query("DELETE FROM search_logs WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM board_items WHERE board_id IN (SELECT id FROM boards WHERE user_id=$1)", [userId]);
    await client.query("DELETE FROM boards WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM interactions WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM user_events WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM processed_operations WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM identity_adoptions WHERE from_user_id=$1 OR to_user_id=$1", [userId]);
    await client.query("DELETE FROM user_measurements WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM interpretation_feedback WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM asterisk_memory_preferences WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM user_follows WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM wardrobe_items WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM user_rail_prefs WHERE user_id=$1", [userId]);
    await client.query("DELETE FROM profiles WHERE user_id=$1", [userId]);
    // The contributor ledger is the first identity-linked row in the gamma
    // graph, so erasure reaches it now. Deleting a contributor MUST recompute
    // the pair — otherwise a departed person keeps corroborating an edge and
    // its influence never falls back to what the remaining people actually
    // support. Pairs left with no contributors keep w=0/contributors=0 and
    // therefore score zero; the row itself is deidentified aggregate state.
    // popularity ledger: drop this identity's rows, then recompute the people
    // counts for every item they touched — a departed person must stop
    // counting as an engager or a viewer.
    const popGone = await client.query(
      "DELETE FROM popularity_contributors WHERE identity_hash=$1 RETURNING item_id", [identityHash(userId)]);
    if (popGone.rowCount) {
      // (r25) The DECAYED sums must be recomputed here too. Erasure that
      // updated only the lifetime counts would leave a departed person's
      // recency-weighted contribution scoring forever — the aggregate is
      // deidentified, but it would still be THEIR evidence, and "they stop
      // counting" has to mean every counter they are in.
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
          ? [JSON.stringify(popGone.rows.map((r) => ({ id: r.item_id }))), halfLifeMs() / 1000]
          : [JSON.stringify(popGone.rows.map((r) => ({ id: r.item_id })))]
      );
    }
    const gone = await client.query(
      "DELETE FROM edge_contributors WHERE identity_hash=$1 RETURNING a,b", [identityHash(userId)]);
    if (gone.rowCount) {
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
        [JSON.stringify(gone.rows.map((r) => ({ a: r.a, b: r.b })))]
      );
    }
    // (Aug 7, Round A) unknown_query_votes was NEVER erased — while the v22
    // header cites it as the PRECEDENT for hashing identity precisely because
    // it "is still pseudonymous personal data, so account deletion erases it".
    // The precedent did not do the thing it was cited for. Same shape as the
    // ledgers above: drop the rows, then take the votes back out of the
    // tallies that decide whether a query is promoted into research.
    const votesGone = await client.query(
      "DELETE FROM unknown_query_votes WHERE identity_hash=$1 RETURNING query_id",
      [identityHash(userId)]);
    if (votesGone.rowCount) {
      await client.query(
        `UPDATE unknown_queries q
         SET demand_count = GREATEST(0, q.demand_count - d.n),
             distinct_identities = GREATEST(0, q.distinct_identities - d.n)
         FROM (SELECT id, count(*)::int AS n
               FROM jsonb_to_recordset($1::jsonb) AS x(id bigint)
               GROUP BY id) d
         WHERE q.id = d.id`,
        [JSON.stringify(votesGone.rows.map((r) => ({ id: Number(r.query_id) })))]
      );
    }
    // The app namespaces authenticated identities as `sb-<auth uuid>` in its
    // server-owned tables. The original MVP profile uses the raw auth UUID and
    // cascades to legacy saved_items, so remove that row explicitly as well.
    if (/^sb-[0-9a-f-]{36}$/i.test(userId)) {
      await client.query("DELETE FROM user_profiles WHERE id=$1::uuid", [userId.slice(3)]);
      // v17 profile rooms key on the auth uuid (ADR-002): statement/anthem
      // are personal content — modules cascade from the room row.
      await client.query("DELETE FROM profile_rooms WHERE account_id=$1::uuid", [userId.slice(3)]);
    }
    await client.query("COMMIT");
    return { persistent: true, retained: RETAINED_AFTER_ERASURE };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

// ---- §6 export (the access right) -------------------------------------------
//
// CONSTITUTION.md §6 requires every signal to expose
// "edit/disconnect/forget/export/delete controls". Delete has existed since
// purgePersonalizationData; EXPORT did not, so a user could erase their data
// but never see it. This is that control.
//
// THE CONTRACT IS SYMMETRY WITH ERASURE: what we delete is what we show you.
// Anything purgePersonalizationData removes must appear here, and anything it
// deliberately RETAINS must be named rather than silently missing. The
// manifest below is that promise in machine-checkable form, and
// tests/privacy-export.test.js asserts purge's DELETE list is a subset of it —
// so a future table added to erasure and forgotten here fails a test instead
// of quietly narrowing the user's access right.
//
// §6 also forbids silent caps, so every bounded read reports `truncated` and
// the `cap` it hit rather than returning a short list that looks complete.
// WHAT ERASURE LEAVES BEHIND, in one place because three call sites returned
// it as a literal and the mem branch had already drifted from the Postgres one
// once — telling people on preview deploys a different retention from the one
// production performs.
//
// DIRECT MESSAGES ARE NAMED HERE because the 23 Aug review found erasure and
// export did not know the subsystem existed: no dm_* table is deleted, none is
// exported, and the retention disclosure did not mention them either. Silence
// read as "erased". A message is also the OTHER person's record of a
// conversation they took part in, so deleting one side's copy destroys
// somebody else's history — which is a decision to make deliberately and say
// out loud, not one to arrive at by forgetting.
export const RETAINED_AFTER_ERASURE = Object.freeze([
  "purchase tickets",
  "deidentified raw event counters (eng/imp, no identity column)",
  "auth account",
  "direct messages, which are also the other person's record of a conversation they were in",
  "your messaging settings and the blocks you made — erasing them would silently reopen a door you closed",
]);

export const EXPORT_MANIFEST = Object.freeze({
  // domain -> how the table is represented in the export
  profiles: { domain: "taste", mode: "rows" },
  boards: { domain: "boards", mode: "rows" },
  board_items: { domain: "boards", mode: "rows" },
  interactions: { domain: "interactions", mode: "rows" },
  user_events: { domain: "events", mode: "rows" },
  search_logs: { domain: "searches", mode: "rows" },
  user_follows: { domain: "follows", mode: "rows" },
  user_measurements: { domain: "measurements", mode: "rows" },
  wardrobe_items: { domain: "wardrobe", mode: "rows" },
  mood_board_uploads: { domain: "moodboard", mode: "rows" },
  mood_board_analysis: { domain: "moodboard", mode: "rows" },
  stylist_requests: { domain: "stylist", mode: "rows" },
  stylist_outfits: { domain: "stylist", mode: "rows" },
  stylist_feedback: { domain: "stylist", mode: "rows" },
  user_corrections: { domain: "corrections", mode: "rows" },
  interpretation_feedback: { domain: "interpretationFeedback", mode: "rows" },
  asterisk_memory_preferences: { domain: "preferences", mode: "rows" },
  user_rail_prefs: { domain: "preferences", mode: "rows" },
  user_style_profiles: { domain: "styleProfile", mode: "rows" },
  ai_model_events: { domain: "aiEvents", mode: "rows" },
  editorial_posts: { domain: "editorial", mode: "rows" },
  profile_rooms: { domain: "profileRoom", mode: "rows" },
  user_profiles: { domain: "profileRoom", mode: "rows" },
  // NOTE: the dm_* tables are deliberately absent — see DM_EXPORT_STATUS below.
  // Absent-with-a-reason, in a table a test can read, rather than absent.
  // Pseudonymous, identity_hash-keyed. The CONTENT is other people's graph —
  // an item pair or an item id — so exporting rows would hand one user a slice
  // of the co-engagement graph. The user's own fact is "you corroborated N of
  // these", which is what erasure removes, so counts are the honest unit.
  edge_contributors: { domain: "corroboration", mode: "count" },
  popularity_contributors: { domain: "corroboration", mode: "count" },
  unknown_query_votes: { domain: "corroboration", mode: "count" },
  // Also identity_hash-keyed (v28), but the CONTENT is the person's own act —
  // "you liked/saved these transmissions" — so rows are theirs to export,
  // unlike the graph ledgers above.
  transmission_engagements: { domain: "engagement", mode: "rows" },
  // Internal plumbing, not a signal about the person: replay-idempotency keys
  // and the record of which device identities merged in. Counted so the export
  // is complete, not detailed, because the contents describe the system.
  processed_operations: { domain: "internal", mode: "count" },
  identity_adoptions: { domain: "internal", mode: "count" },
});

// THE MAIL DESK IS NOT IN THE EXPORT, AND THIS IS WHERE THAT IS SAID.
//
// Every dm_* table has to appear here or in EXPORT_MANIFEST — the test in
// tests/privacy-export.test.js reads both and fails on a table in neither, so
// the next messaging table cannot be forgotten the way these seven were. That
// is the whole point of writing an absence down: an omission that has to be
// declared stops being an omission.
//
// Why they are excluded RATHER THAN EXPORTED, honestly:
//
//   - These tables key on the BARE AUTH UUID (ADR-002); every table in the
//     manifest keys on the identity STRING. The generic row reader has one
//     shape and it is the wrong one here, so a real DM export is a bespoke
//     reader, not a manifest line.
//   - A conversation is TWO people's record. Handing one side a verbatim copy
//     of the other side's messages is a disclosure decision, not a plumbing
//     one, and it is the owner's to make.
//
// Until then the retention disclosure NAMES them (RETAINED_AFTER_ERASURE), so
// the export and the delete both describe the same world — which is the rule
// this file already holds itself to, and the one it broke here by silence.
export const DM_EXPORT_STATUS = Object.freeze({
  dm_conversations: "two-party record; keys on the bare auth uuid — needs a bespoke reader and an owner ruling on disclosure",
  dm_participants: "two-party record; per-side state (folder, unread, consent) keyed on the bare auth uuid",
  dm_messages: "two-party record — one side's export would carry the other side's words",
  dm_blocks: "a safety control; naming who you blocked in an export is itself a disclosure",
  dm_settings: "your two switches; keyed on the bare auth uuid",
  dm_typing: "presence with a six-second expiry — nothing to export",
  dm_reactions: "attached to a two-party message",
});

// WHAT WAS WRONG (Aug 8, found by the codebase audit — in code shipped hours
// earlier). These were ASPIRATIONAL numbers, not achievable ones. Most of the
// readers below clamp their own `limit` internally, so asking for 5000
// interactions returned 500, and `bounded()` then stamped the short list with
// the REQUESTED cap and `truncated: false`.
//
//   requested   actually returned   reported
//   5000        500  (getInteractions Math.min(500,…))     cap 5000, truncated false
//   5000        1000 (listEvents Math.min(1000,…))         cap 5000, truncated false
//   200         100  (listStylistOutfits boundedLimit …100) cap 200,  truncated false
//
// A user with 3,000 interactions downloaded 500 of them under a header saying
// nothing had been cut. That is precisely the §6 "no silent caps" rule the
// export exists to satisfy — the honesty feature was the thing lying.
//
// Every value here is now the reader's REAL ceiling, verified against its
// clamp, so `truncated` means what it says. One cap per READER, not per
// display group: the three stylist readers have three different ceilings and
// sharing one number is how the outfits case slipped through.
const EXPORT_CAPS = Object.freeze({
  interactions: 500,        // getInteractions      Math.min(500, …)
  events: 1000,             // listEvents           Math.min(1000, …)
  searches: 1000,           // direct SQL below, no internal clamp
  wardrobe: 500,            // listWardrobeItems    boundedLimit(…, 200, 500)
  moodboardUploads: 200,    // listMoodBoardUploads boundedLimit(…, 60, 200)
  moodboardAnalyses: 200,   // listMoodBoardAnalyses boundedLimit(…, 60, 200)
  stylistOutfits: 100,      // listStylistOutfits   boundedLimit(…, 30, 100)
  stylistFeedback: 500,     // listStylistFeedback  boundedLimit(…, 100, 500)
  stylistRequests: 200,     // direct SQL below, no internal clamp
  corrections: 500,         // listUserCorrections  boundedLimit(…, 200, 500)
  editorial: 200,           // direct SQL below, no internal clamp
  aiEvents: 500,            // direct SQL below, no internal clamp
});

const bounded = (rows, cap) => ({
  rows, cap, truncated: Array.isArray(rows) && rows.length >= cap,
});

export async function exportPersonalizationData(userId, { queryTarget = null } = {}) {
  if (!userId) throw new TypeError("userId required");
  const accountId = /^sb-[0-9a-f-]{36}$/i.test(userId) ? userId.slice(3).toLowerCase() : null;
  const p = queryTarget || await getPool();

  const [
    taste, boards, interactions, events, follows, measurements, wardrobe,
    uploads, analyses, outfits, stylistFb, corrections, memoryPrefs, railPrefs,
    styleProfile,
  ] = await Promise.all([
    getProfile(userId),
    getBoards(userId),
    getInteractions(userId, { limit: EXPORT_CAPS.interactions }),
    listEvents(userId, EXPORT_CAPS.events),
    listFollows(userId),
    getUserMeasurements(userId),
    listWardrobeItems(userId, { status: "all", limit: EXPORT_CAPS.wardrobe }).catch(() => []),
    listMoodBoardUploads(userId, EXPORT_CAPS.moodboardUploads).catch(() => []),
    listMoodBoardAnalyses(userId, EXPORT_CAPS.moodboardAnalyses).catch(() => []),
    listStylistOutfits(userId, EXPORT_CAPS.stylistOutfits).catch(() => []),
    listStylistFeedback(userId, EXPORT_CAPS.stylistFeedback).catch(() => []),
    listUserCorrections(userId, EXPORT_CAPS.corrections).catch(() => []),
    getMemoryPreferences(userId).catch(() => null),
    getRailPrefs(userId).catch(() => ({})),
    getUserStyleProfileRow(userId).catch(() => null),
  ]);

  const data = {
    taste,
    boards,
    interactions: bounded(interactions, EXPORT_CAPS.interactions),
    events: bounded(events, EXPORT_CAPS.events),
    follows,
    measurements,
    wardrobe: bounded(wardrobe, EXPORT_CAPS.wardrobe),
    moodboard: {
      uploads: bounded(uploads, EXPORT_CAPS.moodboardUploads),
      analyses: bounded(analyses, EXPORT_CAPS.moodboardAnalyses),
    },
    stylist: {
      outfits: bounded(outfits, EXPORT_CAPS.stylistOutfits),
      feedback: bounded(stylistFb, EXPORT_CAPS.stylistFeedback),
      requests: bounded([], EXPORT_CAPS.stylistRequests),
    },
    corrections: bounded(corrections, EXPORT_CAPS.corrections),
    interpretationFeedback: [],
    preferences: { memory: memoryPrefs, rails: railPrefs },
    styleProfile,
    aiEvents: bounded([], EXPORT_CAPS.aiEvents),
    editorial: bounded([], EXPORT_CAPS.editorial),
    profileRoom: null,
  };

  const counts = { corroboration: { edges: 0, popularity: 0, researchVotes: 0 },
    internal: { operations: 0, adoptions: 0 } };

  if (!p) {
    const hash = identityHash(userId);
    data.searches = bounded(
      mem.searchLogs.filter((r) => r.userId === userId).slice(-EXPORT_CAPS.searches).reverse(),
      EXPORT_CAPS.searches);
    data.stylist.requests = bounded(
      mem.stylistRequests.filter((r) => r.userId === userId).slice(-EXPORT_CAPS.stylistRequests).reverse(),
      EXPORT_CAPS.stylistRequests);
    data.aiEvents = bounded(
      mem.aiEvents.filter((r) => r.userId === userId).slice(-EXPORT_CAPS.aiEvents).reverse(),
      EXPORT_CAPS.aiEvents);
    data.editorial = bounded(
      mem.posts.filter((r) => r.authorId === userId).slice(-EXPORT_CAPS.editorial).reverse(),
      EXPORT_CAPS.editorial);
    data.interpretationFeedback = mem.interpretationFeedback.filter((r) => r.user_id === userId);
    data.profileRoom = accountId ? (mem.profileRooms.get(accountId) || null) : null;
    // The edge/popularity ledgers live in index.js's `mem`, not this module's.
    const ledgers = countMemLedgers(userId);
    counts.corroboration.edges = ledgers.edges;
    counts.corroboration.popularity = ledgers.popularity;
    for (const key of mem.unknownVotes) if (key.endsWith("|" + hash)) counts.corroboration.researchVotes++;
    counts.internal.operations = countMemOperations(userId);
    counts.internal.adoptions = 0; // mem keeps no durable adoption ledger
  } else {
    const hash = identityHash(userId);
    const q = (sql, params) => p.query(sql, params);
    const [searches, requests, aiEvents, editorial, interp, room, corro, internal] = await Promise.all([
      q(`SELECT query, created_at FROM search_logs WHERE user_id=$1
         ORDER BY created_at DESC LIMIT $2`, [userId, EXPORT_CAPS.searches]),
      q(`SELECT id, created_at FROM stylist_requests WHERE user_id=$1
         ORDER BY created_at DESC LIMIT $2`, [userId, EXPORT_CAPS.stylistRequests]),
      q(`SELECT id, created_at FROM ai_model_events WHERE user_id=$1
         ORDER BY created_at DESC LIMIT $2`, [userId, EXPORT_CAPS.aiEvents]),
      q(`SELECT id, created_at FROM editorial_posts WHERE author_id=$1
         ORDER BY created_at DESC LIMIT $2`, [userId, EXPORT_CAPS.editorial]),
      q(`SELECT normalized_query, interpretation_id, verdict, created_at
         FROM interpretation_feedback WHERE user_id=$1`, [userId]),
      accountId
        ? q("SELECT * FROM profile_rooms WHERE account_id=$1::uuid", [accountId])
        : Promise.resolve({ rows: [] }),
      q(`SELECT
           (SELECT count(*) FROM edge_contributors WHERE identity_hash=$1)::int AS edges,
           (SELECT count(*) FROM popularity_contributors WHERE identity_hash=$1)::int AS popularity,
           (SELECT count(*) FROM unknown_query_votes WHERE identity_hash=$1)::int AS votes`,
        [hash]),
      q(`SELECT
           (SELECT count(*) FROM processed_operations WHERE user_id=$1)::int AS operations,
           (SELECT count(*) FROM identity_adoptions WHERE to_user_id=$1)::int AS adoptions`,
        [userId]),
    ]);
    data.searches = bounded(searches.rows, EXPORT_CAPS.searches);
    data.stylist.requests = bounded(requests.rows, EXPORT_CAPS.stylistRequests);
    data.aiEvents = bounded(aiEvents.rows, EXPORT_CAPS.aiEvents);
    data.editorial = bounded(editorial.rows, EXPORT_CAPS.editorial);
    data.interpretationFeedback = interp.rows;
    data.profileRoom = room.rows[0] || null;
    counts.corroboration = {
      edges: corro.rows[0].edges, popularity: corro.rows[0].popularity,
      researchVotes: corro.rows[0].votes,
    };
    counts.internal = {
      operations: internal.rows[0].operations, adoptions: internal.rows[0].adoptions,
    };
  }

  return {
    manifestVersion: 1,
    generatedAt: Date.now(),
    identity: { id: userId, kind: accountId ? "account" : "device" },
    persistent: !!p,
    data,
    counts,
    // Named, not silently absent — the same vocabulary purge returns, so the
    // two controls describe the same world.
    retained: RETAINED_AFTER_ERASURE,
    countedNotDetailed: {
      corroboration: "pseudonymous graph contributions — the content is an item pair or item id shared with other people, so your own fact is how many you corroborated",
      internal: "replay-idempotency keys and the record of which device identities merged into this one — system records, not signals about you",
    },
  };
}

// ---- Private user measurements ----------------------------------------------

export async function getUserMeasurements(userId) {
  const p = await getPool();
  if (!p) return measurementProfileForDisplay(mem.measurements.get(userId) || {});
  const { rows } = await p.query(
    `SELECT usual_size,preferred_unit,chest_in,waist_in,hips_in,inseam_in,height_in
     FROM user_measurements WHERE user_id=$1`, [userId]);
  if (!rows[0]) return { ...EMPTY_MEASUREMENTS };
  const row = rows[0];
  return measurementProfileForDisplay({
    usualSize: row.usual_size, preferredUnit: row.preferred_unit,
    inches: {
      chest: row.chest_in, waist: row.waist_in, hips: row.hips_in,
      inseam: row.inseam_in, height: row.height_in,
    },
  });
}

export async function saveUserMeasurements(userId, storage) {
  if (!userId || !storage?.inches) throw new TypeError("normalized measurements required");
  const p = await getPool();
  if (!p) {
    mem.measurements.set(userId, structuredClone(storage));
    return measurementProfileForDisplay(storage);
  }
  const m = storage.inches;
  await p.query(
    `INSERT INTO user_measurements
       (user_id,usual_size,preferred_unit,chest_in,waist_in,hips_in,inseam_in,height_in,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (user_id) DO UPDATE SET
       usual_size=EXCLUDED.usual_size,preferred_unit=EXCLUDED.preferred_unit,
       chest_in=EXCLUDED.chest_in,waist_in=EXCLUDED.waist_in,hips_in=EXCLUDED.hips_in,
       inseam_in=EXCLUDED.inseam_in,height_in=EXCLUDED.height_in,updated_at=now()`,
    [userId, storage.usualSize, storage.preferredUnit, m.chest, m.waist, m.hips, m.inseam, m.height]
  );
  return measurementProfileForDisplay(storage);
}

export async function deleteUserMeasurements(userId) {
  const p = await getPool();
  if (!p) return mem.measurements.delete(userId);
  return (await p.query("DELETE FROM user_measurements WHERE user_id=$1", [userId])).rowCount > 0;
}

// ---- product tags -------------------------------------------------------------

export async function addProductTags(productId, tags = []) {
  // tags: [{tag, tagType?, confidence?, source?}]
  const clean = tags
    .map((t) => ({
      tag: String(t.tag || "").trim().toLowerCase().slice(0, 60),
      tagType: t.tagType || t.tag_type || "aesthetic",
      confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0.5)),
      source: t.source || "system",
    }))
    .filter((t) => t.tag);
  if (!productId || !clean.length) return 0;
  const p = await getPool();
  if (!p) {
    for (const t of clean) {
      if (!mem.productTags.some((x) => x.productId === productId && x.tag === t.tag && x.tagType === t.tagType))
        push(mem.productTags, { id: mem.seq++, productId, ...t });
    }
    return clean.length;
  }
  await p.query(
    `INSERT INTO product_tags (product_id,tag,tag_type,confidence,source)
     SELECT $1,tag,tag_type,confidence,source
     FROM jsonb_to_recordset($2::jsonb) AS x(tag text,tag_type text,confidence real,source text)
     ON CONFLICT (product_id,tag,tag_type) DO UPDATE SET
       confidence=GREATEST(product_tags.confidence,EXCLUDED.confidence),source=EXCLUDED.source`,
    [productId, JSON.stringify(clean.map((t) => ({
      tag: t.tag, tag_type: t.tagType, confidence: t.confidence, source: t.source,
    })))]
  );
  return clean.length;
}

export async function getProductTags(productId) {
  const p = await getPool();
  if (!p) return mem.productTags.filter((t) => t.productId === productId);
  const { rows } = await p.query(
    "SELECT id, product_id, tag, tag_type, confidence, source FROM product_tags WHERE product_id=$1",
    [productId]
  );
  return rows.map((r) => ({ id: r.id, productId: r.product_id, tag: r.tag, tagType: r.tag_type, confidence: Number(r.confidence), source: r.source }));
}

// Products whose tag layer matches any of the given tags → { productId: score }.
export async function productsByTags(tags = [], { limit = 500 } = {}) {
  limit = boundedLimit(limit, 500, 1000);
  const want = tags.map((t) => String(t).toLowerCase()).filter(Boolean);
  const out = {};
  if (!want.length) return out;
  const p = await getPool();
  if (!p) {
    for (const t of mem.productTags) {
      if (want.includes(t.tag)) out[t.productId] = (out[t.productId] || 0) + t.confidence;
    }
    return out;
  }
  const { rows } = await p.query(
    `SELECT product_id, sum(confidence) AS score FROM product_tags
     WHERE tag = ANY($1) GROUP BY product_id ORDER BY score DESC LIMIT $2`,
    [want, limit]
  );
  for (const r of rows) out[r.product_id] = Number(r.score);
  return out;
}

// Same match, but scores kept per tag_type so callers can weight them
// (dense-layer search) → { productId: { tagType: score } }.
export async function productsByTagsTyped(tags = [], { limit = 500 } = {}) {
  limit = boundedLimit(limit, 500, 1000);
  const want = tags.map((t) => String(t).toLowerCase()).filter(Boolean);
  const out = {};
  if (!want.length) return out;
  const p = await getPool();
  if (!p) {
    for (const t of mem.productTags) {
      if (!want.includes(t.tag)) continue;
      (out[t.productId] ||= {})[t.tagType] = ((out[t.productId] ||= {})[t.tagType] || 0) + t.confidence;
    }
    return out;
  }
  const { rows } = await p.query(
    `WITH scores AS (
       SELECT product_id, tag_type, sum(confidence) AS score
       FROM product_tags
       WHERE tag = ANY($1)
       GROUP BY product_id, tag_type
     ), top_products AS (
       SELECT product_id
       FROM scores
       GROUP BY product_id
       ORDER BY sum(score) DESC, product_id
       LIMIT $2
     )
     SELECT scores.product_id, scores.tag_type, scores.score
     FROM scores
     JOIN top_products USING (product_id)
     ORDER BY scores.product_id, scores.tag_type`,
    [want, limit]
  );
  for (const r of rows) (out[r.product_id] ||= {})[r.tag_type] = Number(r.score);
  return out;
}

export async function deleteProductTag(id) {
  const p = await getPool();
  if (!p) {
    const i = mem.productTags.findIndex((t) => t.id === Number(id));
    if (i >= 0) mem.productTags.splice(i, 1);
    return i >= 0;
  }
  const r = await p.query("DELETE FROM product_tags WHERE id=$1", [id]);
  return r.rowCount > 0;
}

// Merge: every product tagged `from` gets `to` (same type), `from` rows removed.
export async function mergeProductTags(from, to) {
  const p = await getPool();
  const f = String(from || "").toLowerCase(), t = String(to || "").toLowerCase();
  if (!f || !t || f === t) return 0;
  if (!p) {
    let n = 0;
    for (const row of mem.productTags) if (row.tag === f) { row.tag = t; n++; }
    return n;
  }
  const r = await p.query(
    `INSERT INTO product_tags (product_id, tag, tag_type, confidence, source)
     SELECT product_id, $2, tag_type, confidence, 'admin' FROM product_tags WHERE tag=$1
     ON CONFLICT (product_id, tag, tag_type) DO NOTHING`,
    [f, t]
  );
  await p.query("DELETE FROM product_tags WHERE tag=$1", [f]);
  return r.rowCount;
}

// ---- product images -------------------------------------------------------------

export async function addProductImages(productId, images = []) {
  const clean = images
    .map((im, i) => ({
      imageUrl: im.imageUrl || im.image_url || (typeof im === "string" ? im : null),
      altText: im.altText || im.alt_text || null,
      position: im.position ?? i,
      sourceImageUrl: im.sourceImageUrl || im.source_image_url || null,
    }))
    .filter((im) => im.imageUrl);
  if (!productId || !clean.length) return 0;
  const p = await getPool();
  if (!p) return clean.length; // memory mode: items.img already covers display
  await p.query(
    `INSERT INTO product_images (product_id,image_url,alt_text,position,source_image_url)
     SELECT $1,image_url,alt_text,position,source_image_url
     FROM jsonb_to_recordset($2::jsonb)
       AS x(image_url text,alt_text text,position integer,source_image_url text)
     ON CONFLICT (product_id,image_url) DO UPDATE SET
       alt_text=EXCLUDED.alt_text,position=EXCLUDED.position,source_image_url=EXCLUDED.source_image_url`,
    [productId, JSON.stringify(clean.map((im) => ({
      image_url: im.imageUrl, alt_text: im.altText, position: im.position,
      source_image_url: im.sourceImageUrl,
    })))]
  );
  return clean.length;
}

export async function getProductImages(productId) {
  const p = await getPool();
  if (!p) return [];
  const { rows } = await p.query(
    "SELECT image_url, alt_text, position FROM product_images WHERE product_id=$1 ORDER BY position",
    [productId]
  );
  return rows.map((r) => ({ imageUrl: r.image_url, altText: r.alt_text, position: r.position }));
}

// ---- search mappings -------------------------------------------------------------

export async function upsertSearchMapping(m) {
  const phrase = String(m.searchPhrase || m.search_phrase || "").trim().toLowerCase();
  if (!phrase) return null;
  const row = {
    searchPhrase: phrase,
    mappedTags: (m.mappedTags || m.mapped_tags || []).map((t) => String(t).toLowerCase()),
    relatedTerms: (m.relatedTerms || m.related_terms || []).map((t) => String(t).toLowerCase()),
    referenceType: m.referenceType || m.reference_type || "aesthetic",
    confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0.7)),
  };
  const p = await getPool();
  if (!p) { mem.mappings.set(phrase, row); return row; }
  await p.query(
    `INSERT INTO search_mappings (search_phrase, mapped_tags, related_terms, reference_type, confidence, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (search_phrase) DO UPDATE SET
       mapped_tags=EXCLUDED.mapped_tags, related_terms=EXCLUDED.related_terms,
       reference_type=EXCLUDED.reference_type, confidence=EXCLUDED.confidence, updated_at=now()`,
    [phrase, JSON.stringify(row.mappedTags), JSON.stringify(row.relatedTerms), row.referenceType, row.confidence]
  );
  return row;
}

export async function listSearchMappings(limit = 500) {
  limit = boundedLimit(limit, 500, 1000);
  const p = await getPool();
  if (!p) return Array.from(mem.mappings.values());
  const { rows } = await p.query(
    "SELECT search_phrase, mapped_tags, related_terms, reference_type, confidence FROM search_mappings LIMIT $1",
    [limit]
  );
  return rows.map((r) => ({
    searchPhrase: r.search_phrase,
    mappedTags: r.mapped_tags || [],
    relatedTerms: r.related_terms || [],
    referenceType: r.reference_type,
    confidence: Number(r.confidence),
  }));
}

export async function deleteSearchMapping(phrase) {
  const key = String(phrase || "").trim().toLowerCase();
  const p = await getPool();
  if (!p) return mem.mappings.delete(key);
  const r = await p.query("DELETE FROM search_mappings WHERE search_phrase=$1", [key]);
  return r.rowCount > 0;
}

// ---- search logs -------------------------------------------------------------

// (r24) search_logs.served_ids arrives with schema v24. The column is detected
// ONCE per process rather than assumed, so this code is safe to deploy before
// the migration is applied: until then the per-search exposure record is
// simply absent, and the moment v24 lands it starts recording with no deploy.
// REQUIRED_SCHEMA_VERSION is deliberately NOT bumped for the same reason —
// bumping it would make the app refuse to boot until the migration ran, which
// turns an additive column into a deploy-order landmine.
let servedIdsColumn = null;
async function hasServedIdsColumn(p) {
  if (servedIdsColumn === null) {
    try {
      const r = await p.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='search_logs' AND column_name='served_ids'`
      );
      servedIdsColumn = r.rowCount > 0;
    } catch { servedIdsColumn = false; }
  }
  return servedIdsColumn;
}
/** Test seam: forget the detection so a battery can exercise both shapes. */
export function resetServedIdsColumnCache() { servedIdsColumn = null; }

export async function logSearch({ userId = null, query, interpreted = {}, resultCount = 0, servedIds = null }) {
  if (!query) return;
  const ids = Array.isArray(servedIds)
    ? servedIds.filter((id) => typeof id === "string" && id).slice(0, 100)
    : null;
  const p = await getPool();
  if (!p) { push(mem.searchLogs, { userId, query, interpreted, resultCount, servedIds: ids, at: Date.now() }); return; }
  if (ids && await hasServedIdsColumn(p)) {
    await p.query(
      "INSERT INTO search_logs (user_id, query, interpreted, result_count, served_ids) VALUES ($1,$2,$3,$4,$5)",
      [userId, String(query).slice(0, 200), JSON.stringify(interpreted), resultCount, JSON.stringify(ids)]
    );
    return;
  }
  await p.query(
    "INSERT INTO search_logs (user_id, query, interpreted, result_count) VALUES ($1,$2,$3,$4)",
    [userId, String(query).slice(0, 200), JSON.stringify(interpreted), resultCount]
  );
}

/**
 * Read back recent search logs. A measurement record nobody can read is not a
 * record — this is what makes the v24 exposure column inspectable by a battery
 * and by scripts/measure-slot-bias.mjs. Read-only, newest first, bounded.
 */
export async function listSearchLogs({ limit = 200 } = {}) {
  const n = Math.max(1, Math.min(2000, Number(limit) || 200));
  const p = await getPool();
  if (!p) return mem.searchLogs.slice(-n).reverse();
  const cols = (await hasServedIdsColumn(p))
    ? "user_id, query, interpreted, result_count, served_ids, created_at"
    : "user_id, query, interpreted, result_count, NULL::jsonb AS served_ids, created_at";
  const r = await p.query(`SELECT ${cols} FROM search_logs ORDER BY created_at DESC LIMIT $1`, [n]);
  return r.rows.map((row) => ({
    userId: row.user_id, query: row.query, interpreted: row.interpreted,
    resultCount: row.result_count, servedIds: row.served_ids || null, at: row.created_at,
  }));
}

// ---- purchase tickets -------------------------------------------------------------

export const TICKET_STATUSES = [
  "requested", "checking_availability", "available", "unavailable",
  "awaiting_user_consent", "awaiting_payment_or_checkout", "checkout_started",
  "checkout_completed_on_source", "canceled", "failed", "completed",
];

const TICKET_TRANSITIONS = Object.freeze({
  consent: {
    from: ["awaiting_user_consent"],
    to: "checkout_started",
  },
  cancel: {
    from: [
      "requested", "checking_availability", "available",
      "awaiting_user_consent", "awaiting_payment_or_checkout",
    ],
    to: "canceled",
  },
});

export async function createTicket(t) {
  if (!t.userId || !t.productId) throw new TypeError("ticket userId and productId required");
  const row = {
    userId: String(t.userId).slice(0, 80),
    productId: String(t.productId).slice(0, 80),
    sourceName: t.sourceName || null,
    sourceProductId: t.sourceProductId || null,
    sourceProductUrl: t.sourceProductUrl || null,
    status: "requested",
    itemPriceAtRequest: t.itemPriceAtRequest ?? null,
    availabilityStatus: t.availabilityStatus || "unknown",
    notes: t.notes || null,
    idempotencyKey: typeof t.idempotencyKey === "string" && /^[A-Za-z0-9-]{8,80}$/.test(t.idempotencyKey)
      ? t.idempotencyKey : null,
  };
  const p = await getPool();
  if (!p) {
    const existing = row.idempotencyKey
      ? mem.tickets.find((ticket) => ticket.userId === row.userId && ticket.idempotencyKey === row.idempotencyKey)
      : null;
    if (existing) return { ...memTicket(existing), duplicate: true };
    return memTicket(push(mem.tickets, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false, duplicate: false }));
  }
  const { rows } = await p.query(
    `INSERT INTO purchase_tickets
       (user_id, product_id, source_name, source_product_id, source_product_url,
        status, item_price_at_request, availability_status, notes,idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id,idempotency_key) WHERE idempotency_key IS NOT NULL
     DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING *, (xmax=0) AS inserted`,
    [row.userId, row.productId, row.sourceName, row.sourceProductId, row.sourceProductUrl,
     row.status, row.itemPriceAtRequest, row.availabilityStatus, row.notes,row.idempotencyKey]
  );
  return { ...ticketRow(rows[0]), idempotencyKey: rows[0].idempotency_key, duplicate: !rows[0].inserted };
}

export async function updateTicket(id, { status, consent = false, disclaimerVersion = null,
  currentPriceChecked = null, availabilityStatus = null, notes = null } = {}) {
  if (status && !TICKET_STATUSES.includes(status)) throw new RangeError("unknown ticket status");
  const p = await getPool();
  if (!p) {
    const t = mem.tickets.find((x) => x.id === Number(id));
    if (!t) return null;
    if (status) t.status = status;
    if (consent) { t.userConsentTimestamp = Date.now(); t.disclaimerVersion = disclaimerVersion; }
    if (currentPriceChecked != null) t.currentPriceChecked = currentPriceChecked;
    if (availabilityStatus) t.availabilityStatus = availabilityStatus;
    if (notes) t.notes = notes;
    return memTicket(t);
  }
  const { rows } = await p.query(
    `UPDATE purchase_tickets SET
       status = COALESCE($2, status),
       user_consent_timestamp = CASE WHEN $3 THEN now() ELSE user_consent_timestamp END,
       disclaimer_version = COALESCE($4, disclaimer_version),
       current_price_checked = COALESCE($5, current_price_checked),
       availability_status = COALESCE($6, availability_status),
       notes = COALESCE($7, notes),
       updated_at = now()
     WHERE id=$1 RETURNING *`,
    [id, status, consent, disclaimerVersion, currentPriceChecked, availabilityStatus, notes]
  );
  return rows[0] ? ticketRow(rows[0]) : null;
}

// The founders-fee link: which paid fee order issued this ticket. Ledger
// plumbing (admin/audit reads it via SQL); the public ticket shape is
// unchanged.
export async function linkTicketFeeOrder(id, feeOrderId) {
  const p = await getPool();
  if (!p) {
    const t = mem.tickets.find((x) => x.id === Number(id));
    if (!t) return false;
    t.feeOrderId = feeOrderId;
    return true;
  }
  const r = await p.query(
    `UPDATE purchase_tickets SET fee_order_id=$2, updated_at=now() WHERE id=$1`,
    [id, feeOrderId]
  );
  return r.rowCount > 0;
}

export async function getTicketByFeeOrder(feeOrderId) {
  if (!feeOrderId) return null;
  const p = await getPool();
  if (!p) {
    const t = mem.tickets.find((x) => x.feeOrderId === feeOrderId);
    return t ? memTicket(t) : null;
  }
  const { rows } = await p.query(`SELECT * FROM purchase_tickets WHERE fee_order_id=$1 LIMIT 1`, [feeOrderId]);
  return rows[0] ? ticketRow(rows[0]) : null;
}

// User-driven state changes use a compare-and-set update so two requests can
// never revive a terminal ticket or overwrite a transition made in parallel.
export async function transitionTicket(id, userId, action, { disclaimerVersion = null, notes = null } = {}) {
  const transition = TICKET_TRANSITIONS[action];
  if (!transition || !userId) throw new RangeError("unknown ticket transition");
  const p = await getPool();
  if (!p) {
    const ticket = mem.tickets.find((candidate) =>
      candidate.id === Number(id) && candidate.userId === userId);
    if (!ticket || !transition.from.includes(ticket.status)) return null;
    ticket.status = transition.to;
    if (action === "consent") {
      ticket.userConsentTimestamp = Date.now();
      ticket.disclaimerVersion = disclaimerVersion;
    }
    if (notes) ticket.notes = notes;
    return memTicket(ticket);
  }
  const consent = action === "consent";
  const { rows } = await p.query(
    `UPDATE purchase_tickets SET
       status=$4,
       user_consent_timestamp=CASE WHEN $5 THEN now() ELSE user_consent_timestamp END,
       disclaimer_version=CASE WHEN $5 THEN $6 ELSE disclaimer_version END,
       notes=COALESCE($7,notes),
       updated_at=now()
     WHERE id=$1 AND user_id=$2 AND status=ANY($3::text[])
     RETURNING *`,
    [id, userId, transition.from, transition.to, consent, disclaimerVersion, notes]
  );
  return rows[0] ? ticketRow(rows[0]) : null;
}

// The mem twin of ticketRow's DERIVED fields (audit resume, Aug 14 —
// law 4: mem and Postgres are one system with two implementations).
// Postgres derives `consented` from user_consent_timestamp inside
// ticketRow; the mem branches returned their raw stored objects, which
// never carry that key. /orders reads `t.consented` — so a ticket the
// user really had consented to said "consent on file" on Postgres and
// silently said nothing on mem, forever. Every mem ticket return goes
// through here now, for the same reason every Postgres one goes through
// ticketRow.
function memTicket(t) {
  return t == null ? t : { ...t, consented: !!t.userConsentTimestamp };
}

function ticketRow(r) {
  return {
    id: r.id, userId: r.user_id, productId: r.product_id, sourceName: r.source_name,
    sourceProductUrl: r.source_product_url, status: r.status,
    itemPriceAtRequest: r.item_price_at_request == null ? null : Number(r.item_price_at_request),
    currentPriceChecked: r.current_price_checked == null ? null : Number(r.current_price_checked),
    availabilityStatus: r.availability_status,
    consented: !!r.user_consent_timestamp,
    userReportedOutcome: r.user_reported_outcome || null,
    outcomeReportedAt: r.outcome_reported_at ? new Date(r.outcome_reported_at).getTime() : null,
    createdAt: new Date(r.created_at).getTime(),
    idempotencyKey: r.idempotency_key || null,
    persistent: true,
  };
}

export async function reportTicketOutcome(id, userId, outcome, event) {
  const allowed = new Set(["bought", "kept", "returned", "not-bought"]);
  if (!allowed.has(outcome) || !userId) throw new RangeError("invalid ticket outcome");
  const n = normalizeEvent(event);
  const p = await getPool();
  if (!p) {
    const ticket = mem.tickets.find((candidate) => candidate.id === Number(id) && candidate.userId === userId);
    if (!ticket || !["checkout_started", "checkout_completed_on_source", "completed"].includes(ticket.status)) return null;
    const duplicate = ticket.userReportedOutcome === outcome;
    ticket.userReportedOutcome = outcome;
    ticket.outcomeReportedAt = Date.now();
    if (!duplicate) memRecordEvent(n);
    return { ticket: memTicket(ticket), duplicate };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const changed = await client.query(
      `UPDATE purchase_tickets
       SET user_reported_outcome=$3, outcome_reported_at=now(), updated_at=now()
       WHERE id=$1 AND user_id=$2
         AND status=ANY($4::text[])
         AND user_reported_outcome IS DISTINCT FROM $3
       RETURNING *`,
      [id, userId, outcome, ["checkout_started", "checkout_completed_on_source", "completed"]]
    );
    if (changed.rows.length) {
      await client.query(EVENT_INSERT_SQL, [n.userId, n.type, n.payloadJson, n.at]);
      await client.query("COMMIT");
      return { ticket: ticketRow(changed.rows[0]), duplicate: false };
    }
    const existing = await client.query(
      `SELECT * FROM purchase_tickets
       WHERE id=$1 AND user_id=$2 AND status=ANY($3::text[])`,
      [id, userId, ["checkout_started", "checkout_completed_on_source", "completed"]]
    );
    await client.query("ROLLBACK");
    return existing.rows[0] ? { ticket: ticketRow(existing.rows[0]), duplicate: true } : null;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function listTickets(userId, limit = 50) {
  limit = boundedLimit(limit, 50, 200);
  const p = await getPool();
  if (!p) return mem.tickets.filter((t) => t.userId === userId).slice(-limit).reverse().map(memTicket);
  const { rows } = await p.query(
    "SELECT * FROM purchase_tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map(ticketRow);
}

export async function getTicket(id) {
  const p = await getPool();
  if (!p) return memTicket(mem.tickets.find((t) => t.id === Number(id))) || null;
  const { rows } = await p.query("SELECT * FROM purchase_tickets WHERE id=$1", [id]);
  return rows[0] ? ticketRow(rows[0]) : null;
}

// ---- editorial posts -------------------------------------------------------------

export async function createEditorialPost(post) {
  const row = {
    authorId: post.authorId || null,
    authorHandle: String(post.authorHandle || "anonymous").slice(0, 80),
    kind: ["user", "asilum", "article"].includes(post.kind) ? post.kind : "user",
    // Screened posts park under review; only the whitelist is accepted so a
    // caller can never mint an arbitrary moderation state.
    moderationStatus: ["visible", "under_review"].includes(post.moderationStatus)
      ? post.moderationStatus : "visible",
    title: post.title ? String(post.title).slice(0, 200) : null,
    // The transmission law (owner order, Aug 13): text posts live to 5000
    // characters. This cap must agree with the route's POST_MAX — a lower
    // one here silently truncated long transmissions for a month.
    body: post.body ? String(post.body).slice(0, 5000) : null,
    excerpt: post.excerpt ? String(post.excerpt).slice(0, 400) : null,
    imageUrl: post.imageUrl || null,
    externalUrl: post.externalUrl || null,
    tags: (post.tags || []).slice(0, 20),
    designerRefs: (post.designerRefs || []).slice(0, 10),
    productRefs: (post.productRefs || []).slice(0, 10),
  };
  const p = await getPool();
  if (!p) return push(mem.posts, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  const { rows } = await p.query(
    `INSERT INTO editorial_posts
       (author_id, author_handle, kind, title, body, excerpt, image_url, external_url, tags, designer_refs, product_refs, moderation_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, created_at`,
    [row.authorId, row.authorHandle, row.kind, row.title, row.body, row.excerpt, row.imageUrl,
     row.externalUrl, JSON.stringify(row.tags), JSON.stringify(row.designerRefs), JSON.stringify(row.productRefs),
     row.moderationStatus]
  );
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

export async function listEditorialPosts({ kind = null, limit = 60, handle = null, id = null, authorId = null } = {}) {
  // handle/id/authorId narrow the read (owner order, Aug 13: the wire's
  // identity chain — a poster's page, a post's permalink, the profile's
  // durable posts). Visibility rules are identical on every path: only
  // moderation-visible posts, newest first.
  limit = boundedLimit(limit, 60, 200);
  const p = await getPool();
  if (!p) {
    return mem.posts
      .filter((x) => (x.moderationStatus ?? "visible") === "visible"
        && (!kind || x.kind === kind)
        && (!handle || x.authorHandle === handle)
        && (id == null || String(x.id) === String(id))
        && (!authorId || x.authorId === authorId))
      .slice(-limit).reverse();
  }
  const { rows } = await p.query(
    `SELECT * FROM editorial_posts
     WHERE moderation_status='visible' AND ($1::text IS NULL OR kind=$1)
       AND ($3::text IS NULL OR author_handle=$3)
       AND ($4::bigint IS NULL OR id=$4)
       AND ($5::text IS NULL OR author_id=$5)
     ORDER BY created_at DESC LIMIT $2`,
    [kind, limit, handle, id, authorId]
  );
  return rows.map(editorialRow);
}

const editorialRow = (r) => ({
  id: r.id, authorId: r.author_id, authorHandle: r.author_handle, kind: r.kind,
  title: r.title, body: r.body, excerpt: r.excerpt, imageUrl: r.image_url,
  externalUrl: r.external_url, tags: r.tags || [], designerRefs: r.designer_refs || [],
  productRefs: r.product_refs || [], createdAt: new Date(r.created_at).getTime(),
  editedAt: r.edited_at ? new Date(r.edited_at).getTime() : null, persistent: true,
});

// Transmission lifecycle (owner directive, HANDOVER-2026-08-14 backlog 1):
// both verbs demand the author's verified identity in the WHERE clause —
// there is no path to another member's transmission, and a missing row and
// a stranger's row answer identically (null/false). Deletion is soft:
// moderation_status='deleted' keeps the row as record while every read
// path above (floor, permalink, profile, /u/[handle]) refuses it, so the
// permalink honestly 404s. Editing stamps edited_at — the floor's honesty
// label. moderationStatus rides along so a re-screened edit can park
// under review; the whitelist means an edit can never mint 'deleted' —
// deletion has its own verb. (An author may also re-edit a post that sits
// under review: the same deterministic screen decides again, and the filed
// moderation task stays for human eyes either way.)
export async function updateEditorialPost({ id, authorId, title = null, body = null, excerpt = null, tags = null, moderationStatus = "visible" }) {
  if (!authorId) throw new TypeError("updateEditorialPost authorId required");
  const status = ["visible", "under_review"].includes(moderationStatus) ? moderationStatus : "visible";
  const next = {
    title: title ? String(title).slice(0, 200) : null,
    body: body ? String(body).slice(0, 5000) : null,
    excerpt: excerpt ? String(excerpt).slice(0, 400) : null,
    // null leaves the stored tags alone; an array (even empty) replaces
    // them, so an author who deletes a hashtag really loses that tag.
    tags: tags == null ? null : (tags || []).slice(0, 20),
  };
  const p = await getPool();
  if (!p) {
    const row = mem.posts.find((x) => String(x.id) === String(id)
      && x.authorId === authorId && (x.moderationStatus ?? "visible") !== "deleted");
    if (!row) return null;
    const { tags: nextTags, ...fields } = next;
    Object.assign(row, fields, { moderationStatus: status, editedAt: Date.now() });
    if (nextTags != null) row.tags = nextTags;
    return { ...row };
  }
  const { rows } = await p.query(
    `UPDATE editorial_posts
        SET title=$3, body=$4, excerpt=$5, moderation_status=$6, edited_at=now(),
            tags = COALESCE($7::jsonb, tags)
      WHERE id=$1 AND author_id=$2 AND moderation_status <> 'deleted'
      RETURNING *`,
    [id, authorId, next.title, next.body, next.excerpt, status,
     next.tags == null ? null : JSON.stringify(next.tags)]
  );
  return rows[0] ? editorialRow(rows[0]) : null;
}

// ---- wire engagement: likes + saves (v28) ----------------------------------
// The handover's law: person-deduped counters in the popularity style
// (engagers, not events) — NO fabricated numbers, ever. The primary key
// (post_id, identity_hash, kind) IS the dedupe: liking twice, from ten tabs,
// or in a loop writes ONE row and counts ONE person. Counts are computed on
// read from that ledger and therefore cannot drift from their evidence —
// there is deliberately no denormalized counter column (see the migration).

const ENGAGE_KINDS = ["like", "save"];
const engKey = (postId, hash, kind) => `${postId}|${hash}|${kind}`;

// Toggle one person's like/save on one transmission. Returns the fresh
// counts, or null when the transmission is not on the wire — engaging with
// a deleted or held post must not mint a row (and must not tell the caller
// whether it ever existed).
export async function setTransmissionEngagement({ postId, userId, kind, on }) {
  if (!userId) throw new TypeError("setTransmissionEngagement userId required");
  if (!ENGAGE_KINDS.includes(kind)) throw new TypeError("unknown engagement kind");
  const hash = identityHash(userId);
  const p = await getPool();
  if (!p) {
    const live = mem.posts.some((x) => String(x.id) === String(postId)
      && (x.moderationStatus ?? "visible") === "visible");
    if (!live) return null;
    const key = engKey(postId, hash, kind);
    if (on) mem.engagements.add(key); else mem.engagements.delete(key);
    return (await engagementFor([postId], userId))[String(postId)];
  }
  if (on) {
    // The INSERT ... SELECT is the visibility gate and the write in one
    // statement: no row appears for a transmission the wire will not show.
    const { rowCount } = await p.query(
      `INSERT INTO transmission_engagements (post_id, identity_hash, kind)
       SELECT id, $2, $3 FROM editorial_posts
        WHERE id=$1 AND moderation_status='visible'
       ON CONFLICT (post_id, identity_hash, kind) DO NOTHING`,
      [postId, hash, kind]
    );
    // rowCount 0 is ambiguous — already engaged, or not visible. Ask the
    // ledger which: a row that exists means the engagement stands.
    if (!rowCount) {
      const { rowCount: exists } = await p.query(
        `SELECT 1 FROM transmission_engagements WHERE post_id=$1 AND identity_hash=$2 AND kind=$3`,
        [postId, hash, kind]
      );
      if (!exists) return null;
    }
  } else {
    await p.query(
      `DELETE FROM transmission_engagements WHERE post_id=$1 AND identity_hash=$2 AND kind=$3`,
      [postId, hash, kind]
    );
    // Withdrawing from a post that is gone is a no-op, not an error; the
    // caller still gets honest counts below (zeros if it is not on the wire).
  }
  return (await engagementFor([postId], userId))[String(postId)] || null;
}

// Counts for a page of transmissions, plus this viewer's own state.
// Returns { [postId]: { likes, saves, youLike, youSave } }. An anonymous
// viewer gets counts with both "you" flags false — honest, not hidden.
export async function engagementFor(postIds, userId = null) {
  const ids = [...new Set((postIds || []).map((v) => String(v)))].filter(Boolean);
  const out = {};
  for (const id of ids) out[id] = { likes: 0, saves: 0, youLike: false, youSave: false };
  if (!ids.length) return out;
  const hash = userId ? identityHash(userId) : null;
  const p = await getPool();
  if (!p) {
    for (const key of mem.engagements) {
      const [postId, rowHash, kind] = key.split("|");
      if (!out[postId]) continue;
      if (kind === "like") out[postId].likes += 1; else out[postId].saves += 1;
      if (hash && rowHash === hash) {
        if (kind === "like") out[postId].youLike = true; else out[postId].youSave = true;
      }
    }
    return out;
  }
  const { rows } = await p.query(
    `SELECT post_id, kind,
            count(*)::int AS people,
            bool_or($2::text IS NOT NULL AND identity_hash = $2) AS mine
       FROM transmission_engagements
      WHERE post_id = ANY($1::bigint[])
      GROUP BY post_id, kind`,
    [ids, hash]
  );
  for (const r of rows) {
    const bucket = out[String(r.post_id)];
    if (!bucket) continue;
    if (r.kind === "like") { bucket.likes = r.people; bucket.youLike = !!r.mine; }
    else { bucket.saves = r.people; bucket.youSave = !!r.mine; }
  }
  return out;
}

export async function deleteEditorialPost({ id, authorId }) {
  if (!authorId) throw new TypeError("deleteEditorialPost authorId required");
  const p = await getPool();
  if (!p) {
    const row = mem.posts.find((x) => String(x.id) === String(id)
      && x.authorId === authorId && (x.moderationStatus ?? "visible") !== "deleted");
    if (!row) return false;
    row.moderationStatus = "deleted";
    return true;
  }
  const { rows } = await p.query(
    `UPDATE editorial_posts SET moderation_status='deleted'
      WHERE id=$1 AND author_id=$2 AND moderation_status <> 'deleted'
      RETURNING id`,
    [id, authorId]
  );
  return rows.length > 0;
}

// ---- mood board uploads -------------------------------------------------------------

function buildUploadRow(u) {
  if (!u.userId) throw new TypeError("upload userId required");
  return {
    userId: String(u.userId).slice(0, 80),
    boardId: u.boardId || null,
    imageUrl: u.imageUrl || null,
    caption: u.caption ? String(u.caption).slice(0, 400) : null,
    source: u.source || "upload",
    colors: (u.colors || []).slice(0, 12),
    tags: (u.tags || []).slice(0, 40),        // [{tag, tag_type, confidence}]
    styleNotes: u.styleNotes || null,
    analyzedBy: ["none", "filename", "manual", "palette-v0", "vision"].includes(u.analyzedBy) ? u.analyzedBy : "none",
  };
}

const UPLOAD_INSERT_SQL =
  `INSERT INTO mood_board_uploads
     (user_id, board_id, image_url, caption, source, colors, tags, style_notes, analyzed_by, idempotency_key)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
   RETURNING id, created_at`;

const uploadParams = (row, idemKey = null) =>
  [row.userId, row.boardId, row.imageUrl, row.caption, row.source,
   JSON.stringify(row.colors), JSON.stringify(row.tags), row.styleNotes, row.analyzedBy, idemKey];

// A stored upload row → the API shape. Shared by list reads and the
// duplicate-return path (which must report the STORED row, not a rebuilt one).
const uploadFromRow = (r) => ({
  id: r.id, userId: r.user_id, boardId: r.board_id, imageUrl: r.image_url,
  caption: r.caption, source: r.source, colors: r.colors || [], tags: r.tags || [],
  styleNotes: r.style_notes, analyzedBy: r.analyzed_by,
  createdAt: new Date(r.created_at).getTime(), persistent: true,
});

export async function createMoodBoardUpload(u) {
  const row = buildUploadRow(u);
  const p = await getPool();
  if (!p) return push(mem.uploads, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  const { rows } = await p.query(UPLOAD_INSERT_SQL, uploadParams(row));
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

// Upload + its canonical event in ONE transaction (a failed write leaves
// neither behind), and IDEMPOTENT under client retries: when `idemKey` is
// supplied and a commit already succeeded but the response was lost, the
// retry conflicts on the per-user unique key, writes nothing (no duplicate
// event), and returns the STORED original upload marked duplicate:true.
// Memory mode mirrors the same dedupe. (Codex re-review of #13 + follow-ups.)
export async function createMoodBoardUploadWithEvent(u, evt, idemKey = null) {
  const row = buildUploadRow(u);
  const n = normalizeEvent(evt);
  const p = await getPool();
  if (!p) {
    if (idemKey) {
      const existing = mem.uploads.find(
        (x) => x.userId === row.userId && x.idempotencyKey === idemKey);
      if (existing) return { ...existing, duplicate: true };
    }
    memRecordEvent(n);
    return push(mem.uploads, {
      id: mem.seq++, ...row, idempotencyKey: idemKey || null,
      createdAt: Date.now(), persistent: false,
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // Upload first: with an idempotency conflict nothing is written, so the
    // event insert below is reached only for genuinely new uploads.
    const { rows } = await client.query(UPLOAD_INSERT_SQL, uploadParams(row, idemKey));
    if (!rows.length) {
      await client.query("ROLLBACK");
      const prior = await p.query(
        "SELECT * FROM mood_board_uploads WHERE user_id = $1 AND idempotency_key = $2",
        [row.userId, idemKey]);
      if (!prior.rows.length) throw new Error("idempotency conflict without prior row");
      // The STORED row, not the freshly-built one — what actually persisted
      // is the honest answer on a retry (Codex #13 follow-up).
      return { ...uploadFromRow(prior.rows[0]), duplicate: true };
    }
    await client.query(EVENT_INSERT_SQL, [n.userId, n.type, n.payloadJson, n.at]);
    await client.query("COMMIT");
    return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function listMoodBoardUploads(userId, limit = 60) {
  limit = boundedLimit(limit, 60, 200);
  const p = await getPool();
  if (!p) return mem.uploads.filter((x) => x.userId === userId).slice(-limit).reverse();
  const { rows } = await p.query(
    "SELECT * FROM mood_board_uploads WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map(uploadFromRow);
}

// ---- stylist outfits -------------------------------------------------------------

export async function saveStylistOutfit(o) {
  if (!o.userId) throw new TypeError("outfit userId required");
  const row = {
    userId: String(o.userId).slice(0, 80),
    signature: o.signature || null,
    genre: o.genre || null,
    items: (o.items || []).slice(0, 12),
    matchScore: o.matchScore == null ? null : Number(o.matchScore),
    reasons: (o.reasons || []).slice(0, 12),
    // AI-foundation fields (schema-v3) — optional, null for legacy callers.
    stylistRequestId: o.stylistRequestId || null,
    outfitName: o.outfitName || null,
    outfitSummary: o.outfitSummary || null,
    matchedTags: (o.matchedTags || []).slice(0, 16),
    colorLogic: o.colorLogic || null,
    silhouetteLogic: o.silhouetteLogic || null,
    aestheticLogic: o.aestheticLogic || null,
    modelProvider: o.modelProvider || null,
    modelName: o.modelName || null,
  };
  const p = await getPool();
  if (!p) return push(mem.outfits, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  const { rows } = await p.query(
    `INSERT INTO stylist_outfits (user_id, signature, genre, items, match_score, reasons,
       stylist_request_id, outfit_name, outfit_summary, matched_tags,
       color_logic, silhouette_logic, aesthetic_logic, model_provider, model_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, created_at`,
    [row.userId, row.signature, row.genre, JSON.stringify(row.items), row.matchScore,
     JSON.stringify(row.reasons), row.stylistRequestId, row.outfitName, row.outfitSummary,
     JSON.stringify(row.matchedTags), row.colorLogic, row.silhouetteLogic,
     row.aestheticLogic, row.modelProvider, row.modelName]
  );
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

export async function getStylistOutfit(id) {
  const p = await getPool();
  if (!p) return mem.outfits.find((o) => String(o.id) === String(id)) || null;
  const { rows } = await p.query("SELECT * FROM stylist_outfits WHERE id=$1", [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { id: r.id, userId: r.user_id, items: r.items || [], matchScore: r.match_score,
    matchedTags: r.matched_tags || [], outfitName: r.outfit_name, persistent: true };
}

export async function listStylistOutfits(userId, limit = 30) {
  limit = boundedLimit(limit, 30, 100);
  const p = await getPool();
  if (!p) return mem.outfits.filter((x) => x.userId === userId).slice(-limit).reverse();
  const { rows } = await p.query(
    "SELECT * FROM stylist_outfits WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, signature: r.signature, genre: r.genre,
    items: r.items || [], matchScore: r.match_score == null ? null : Number(r.match_score),
    reasons: r.reasons || [], createdAt: new Date(r.created_at).getTime(), persistent: true,
  }));
}

// ---- sync logs + availability checks ----------------------------------------------

export async function recordSyncLog({ sourceName, itemsSeen = 0, itemsUpserted = 0, status = "ok", error = null }) {
  const p = await getPool();
  if (!p) return { persistent: false };
  await p.query(
    `INSERT INTO source_sync_logs (source_name, finished_at, items_seen, items_upserted, status, error)
     VALUES ($1, now(), $2, $3, $4, $5)`,
    [sourceName, itemsSeen, itemsUpserted, status, error]
  );
  return { persistent: true };
}

export async function listSyncLogs(limit = 50) {
  limit = boundedLimit(limit, 50, 200);
  const p = await getPool();
  if (!p) return [];
  const { rows } = await p.query(
    "SELECT * FROM source_sync_logs ORDER BY started_at DESC LIMIT $1", [limit]
  );
  return rows;
}

export async function recordAvailabilityCheck({ productId, availabilityStatus = "unknown",
  previousPrice = null, currentPrice = null, sourceResponseStatus = null }) {
  if (!productId) return { persistent: false };
  const p = await getPool();
  if (!p) return { persistent: false };
  await p.query(
    `INSERT INTO product_availability_checks
       (product_id, availability_status, previous_price, current_price, source_response_status)
     VALUES ($1,$2,$3,$4,$5)`,
    [productId, availabilityStatus, previousPrice, currentPrice, sourceResponseStatus]
  );
  // Reflect the latest state onto the product row itself.
  await p.query(
    `UPDATE items SET availability_status=$2,
       is_available=($2 NOT IN ('sold','removed')),
       price=COALESCE($3, price), updated_at=now()
     WHERE id=$1`,
    [productId, availabilityStatus, currentPrice]
  );
  return { persistent: true };
}

// ---- AI foundation (schema-v3): analyses, style profiles, stylist flow, model events ----

export async function createMoodBoardAnalysis(a) {
  if (!a.userId || a.uploadId == null) throw new TypeError("analysis userId and uploadId required");
  const row = {
    uploadId: a.uploadId,
    userId: String(a.userId).slice(0, 80),
    analysisStatus: ["pending", "complete", "failed"].includes(a.analysisStatus) ? a.analysisStatus : "complete",
    analysisSource: ["local-rules", "manual", "model"].includes(a.analysisSource) ? a.analysisSource : "local-rules",
    modelProvider: a.modelProvider || null,
    modelName: a.modelName || null,
    promptVersion: a.promptVersion || null,
    rawModelOutput: a.rawModelOutput ? String(a.rawModelOutput).slice(0, 8000) : null,
    parsedTags: (a.parsedTags || []).slice(0, 60),
    summary: a.summary ? String(a.summary).slice(0, 500) : null,
    confidenceScore: a.confidenceScore == null ? null : Number(a.confidenceScore),
    errorMessage: a.errorMessage || null,
  };
  const p = await getPool();
  if (!p) return push(mem.analyses, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  const { rows } = await p.query(
    `INSERT INTO mood_board_analysis (upload_id, user_id, analysis_status, analysis_source,
       model_provider, model_name, prompt_version, raw_model_output, parsed_tags, summary,
       confidence_score, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, created_at`,
    [row.uploadId, row.userId, row.analysisStatus, row.analysisSource, row.modelProvider,
     row.modelName, row.promptVersion, row.rawModelOutput, JSON.stringify(row.parsedTags),
     row.summary, row.confidenceScore, row.errorMessage]
  );
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

export async function listMoodBoardAnalyses(userId, limit = 60) {
  limit = boundedLimit(limit, 60, 200);
  const p = await getPool();
  if (!p) return mem.analyses.filter((x) => x.userId === userId).slice(-limit).reverse();
  const { rows } = await p.query(
    "SELECT * FROM mood_board_analysis WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id, uploadId: r.upload_id, userId: r.user_id, analysisStatus: r.analysis_status,
    analysisSource: r.analysis_source, modelProvider: r.model_provider, modelName: r.model_name,
    promptVersion: r.prompt_version, parsedTags: r.parsed_tags || [], summary: r.summary,
    confidenceScore: r.confidence_score, errorMessage: r.error_message,
    createdAt: new Date(r.created_at).getTime(), persistent: true,
  }));
}

const PROFILE_LISTS = ["dominantAesthetics", "preferredColors", "preferredSilhouettes",
  "preferredFabrics", "preferredEras", "preferredBrands", "preferredDesigners", "avoidedTags"];

export async function upsertUserStyleProfile(profile) {
  if (!profile.userId) throw new TypeError("profile userId required");
  const row = { userId: String(profile.userId).slice(0, 80) };
  for (const k of PROFILE_LISTS) row[k] = (profile[k] || []).slice(0, 12);
  row.tasteSummary = profile.tasteSummary ? String(profile.tasteSummary).slice(0, 500) : null;
  row.confidenceScore = profile.confidenceScore == null ? null : Number(profile.confidenceScore);
  row.sources = profile.sources || {};
  row.lastRebuiltAt = Date.now();
  const p = await getPool();
  if (!p) { mem.styleProfiles.set(row.userId, { ...row, persistent: false }); return { ...row, persistent: false }; }
  await p.query(
    `INSERT INTO user_style_profiles (user_id, dominant_aesthetics, preferred_colors,
       preferred_silhouettes, preferred_fabrics, preferred_eras, preferred_brands,
       preferred_designers, avoided_tags, taste_summary, confidence_score, sources,
       last_rebuilt_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
     ON CONFLICT (user_id) DO UPDATE SET
       dominant_aesthetics=EXCLUDED.dominant_aesthetics, preferred_colors=EXCLUDED.preferred_colors,
       preferred_silhouettes=EXCLUDED.preferred_silhouettes, preferred_fabrics=EXCLUDED.preferred_fabrics,
       preferred_eras=EXCLUDED.preferred_eras, preferred_brands=EXCLUDED.preferred_brands,
       preferred_designers=EXCLUDED.preferred_designers, avoided_tags=EXCLUDED.avoided_tags,
       taste_summary=EXCLUDED.taste_summary, confidence_score=EXCLUDED.confidence_score,
       sources=EXCLUDED.sources, last_rebuilt_at=now(), updated_at=now()`,
    [row.userId, ...PROFILE_LISTS.map((k) => JSON.stringify(row[k])),
     row.tasteSummary, row.confidenceScore, JSON.stringify(row.sources)]
  );
  return { ...row, persistent: true };
}

export async function getUserStyleProfileRow(userId) {
  const p = await getPool();
  if (!p) return mem.styleProfiles.get(userId) || null;
  const { rows } = await p.query("SELECT * FROM user_style_profiles WHERE user_id=$1", [userId]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    userId: r.user_id, dominantAesthetics: r.dominant_aesthetics || [],
    preferredColors: r.preferred_colors || [], preferredSilhouettes: r.preferred_silhouettes || [],
    preferredFabrics: r.preferred_fabrics || [], preferredEras: r.preferred_eras || [],
    preferredBrands: r.preferred_brands || [], preferredDesigners: r.preferred_designers || [],
    avoidedTags: r.avoided_tags || [], tasteSummary: r.taste_summary,
    confidenceScore: r.confidence_score, sources: r.sources || {},
    lastRebuiltAt: r.last_rebuilt_at ? new Date(r.last_rebuilt_at).getTime() : null, persistent: true,
  };
}

export async function createStylistRequest(q) {
  if (!q.userId) throw new TypeError("request userId required");
  const row = {
    userId: String(q.userId).slice(0, 80),
    requestText: q.requestText ? String(q.requestText).slice(0, 400) : null,
    occasion: q.occasion ? String(q.occasion).slice(0, 80) : null,
    mood: q.mood ? String(q.mood).slice(0, 80) : null,
    budgetMin: q.budgetMin == null ? null : Number(q.budgetMin),
    budgetMax: q.budgetMax == null ? null : Number(q.budgetMax),
    sizePreferences: (q.sizePreferences || []).slice(0, 8).map(String),
    colorPreferences: (q.colorPreferences || []).slice(0, 8).map(String),
    excludedTags: (q.excludedTags || []).slice(0, 16).map(String),
    useMoodBoardBrain: q.useMoodBoardBrain !== false,
    status: "complete",
  };
  const p = await getPool();
  if (!p) return push(mem.stylistRequests, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  const { rows } = await p.query(
    `INSERT INTO stylist_requests (user_id, request_text, occasion, mood, budget_min, budget_max,
       size_preferences, color_preferences, excluded_tags, use_mood_board_brain, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
    [row.userId, row.requestText, row.occasion, row.mood, row.budgetMin, row.budgetMax,
     JSON.stringify(row.sizePreferences), JSON.stringify(row.colorPreferences),
     JSON.stringify(row.excludedTags), row.useMoodBoardBrain, row.status]
  );
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

export async function updateStylistRequestStatus(id, status) {
  const p = await getPool();
  if (!p) {
    const r = mem.stylistRequests.find((x) => String(x.id) === String(id));
    if (r) r.status = status;
    return;
  }
  await p.query("UPDATE stylist_requests SET status=$2 WHERE id=$1", [id, String(status).slice(0, 20)]);
}

export async function createStylistFeedback(f) {
  if (!f.userId || f.stylistOutfitId == null) throw new TypeError("feedback userId and stylistOutfitId required");
  const row = {
    userId: String(f.userId).slice(0, 80),
    stylistOutfitId: f.stylistOutfitId,
    feedbackType: ["like", "dislike", "save", "reject", "purchase", "note"].includes(f.feedbackType) ? f.feedbackType : "note",
    feedbackNotes: f.feedbackNotes ? String(f.feedbackNotes).slice(0, 400) : null,
    saved: f.saved === true, rejected: f.rejected === true, purchased: f.purchased === true,
  };
  const p = await getPool();
  if (!p) return push(mem.stylistFeedback, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  const { rows } = await p.query(
    `INSERT INTO stylist_feedback (user_id, stylist_outfit_id, feedback_type, feedback_notes,
       saved, rejected, purchased)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [row.userId, row.stylistOutfitId, row.feedbackType, row.feedbackNotes,
     row.saved, row.rejected, row.purchased]
  );
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

// Feedback rows joined to their outfit's matched tags (fuel for avoided_tags).
export async function listStylistFeedback(userId, limit = 100) {
  limit = boundedLimit(limit, 100, 500);
  const p = await getPool();
  if (!p) {
    return mem.stylistFeedback.filter((x) => x.userId === userId).slice(-limit).reverse()
      .map((f) => ({ ...f, matchedTags: (mem.outfits.find((o) => String(o.id) === String(f.stylistOutfitId))?.matchedTags) || [] }));
  }
  const { rows } = await p.query(
    `SELECT f.*, o.matched_tags FROM stylist_feedback f
     LEFT JOIN stylist_outfits o ON o.id = f.stylist_outfit_id
     WHERE f.user_id=$1 ORDER BY f.created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, stylistOutfitId: r.stylist_outfit_id,
    feedbackType: r.feedback_type, feedbackNotes: r.feedback_notes,
    saved: r.saved, rejected: r.rejected, purchased: r.purchased,
    matchedTags: r.matched_tags || [], createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function logAiModelEvent(e) {
  const row = {
    userId: e.userId ? String(e.userId).slice(0, 80) : null,
    feature: String(e.feature || "unknown").slice(0, 40),
    modelProvider: e.modelProvider || null,
    modelName: e.modelName || null,
    promptVersion: e.promptVersion || null,
    inputSummary: e.inputSummary ? String(e.inputSummary).slice(0, 300) : null,
    outputSummary: e.outputSummary ? String(e.outputSummary).slice(0, 300) : null,
    status: String(e.status || "unknown").slice(0, 30),
    errorMessage: e.errorMessage ? String(e.errorMessage).slice(0, 300) : null,
  };
  const p = await getPool();
  if (!p) return push(mem.aiEvents, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  const { rows } = await p.query(
    `INSERT INTO ai_model_events (user_id, feature, model_provider, model_name, prompt_version,
       input_summary, output_summary, status, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, created_at`,
    [row.userId, row.feature, row.modelProvider, row.modelName, row.promptVersion,
     row.inputSummary, row.outputSummary, row.status, row.errorMessage]
  );
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

export async function listAiModelEvents({ feature = null, limit = 100 } = {}) {
  limit = boundedLimit(limit, 100, 500);
  const p = await getPool();
  if (!p) return mem.aiEvents.filter((x) => !feature || x.feature === feature).slice(-limit).reverse();
  const { rows } = await p.query(
    `SELECT * FROM ai_model_events WHERE ($1::text IS NULL OR feature=$1)
     ORDER BY created_at DESC LIMIT $2`,
    [feature, limit]
  );
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, feature: r.feature, modelProvider: r.model_provider,
    modelName: r.model_name, promptVersion: r.prompt_version, inputSummary: r.input_summary,
    outputSummary: r.output_summary, status: r.status, errorMessage: r.error_message,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

// ---- Asterisk AI foundation (Day 10; supabase/schema-v4-asterisk.sql) --------
// Canonical ontology, dual-tag audit layer, reconciliations, learned facts,
// moderation queue. product_ai_tags is APPEND-ONLY — every audit pass is kept
// so results can be reprocessed when the system improves.

export async function upsertOntologyTags(entries = []) {
  const p = await getPool();
  let n = 0;
  for (const e of entries) {
    const row = {
      id: String(e.id), label: String(e.label), tagType: String(e.tagType),
      parentId: e.parentId || null, aliases: (e.aliases || []).map(String),
      description: e.description || "",
    };
    if (!p) { mem.ontologyTags.set(row.id, row); n++; continue; }
    await p.query(
      `INSERT INTO ontology_tags (id, label, tag_type, parent_id, aliases, description)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, tag_type=EXCLUDED.tag_type,
         parent_id=EXCLUDED.parent_id, aliases=EXCLUDED.aliases,
         description=EXCLUDED.description, version=ontology_tags.version+1, updated_at=now()`,
      [row.id, row.label, row.tagType, row.parentId, JSON.stringify(row.aliases), row.description]
    );
    n++;
  }
  return n;
}

export async function listOntologyTags({ tagType = null, limit = 500 } = {}) {
  limit = boundedLimit(limit, 500, 1000);
  const p = await getPool();
  if (!p) {
    return Array.from(mem.ontologyTags.values())
      .filter((t) => !tagType || t.tagType === tagType).slice(0, limit);
  }
  const { rows } = await p.query(
    `SELECT * FROM ontology_tags WHERE ($1::text IS NULL OR tag_type=$1)
     AND status='active' ORDER BY id LIMIT $2`, [tagType, limit]);
  return rows.map((r) => ({
    id: r.id, label: r.label, tagType: r.tag_type, parentId: r.parent_id,
    aliases: r.aliases || [], description: r.description, version: r.version,
  }));
}

export async function saveProductAiTags(productId, auditId, fields = [], meta = {}) {
  const p = await getPool();
  let n = 0;
  for (const f of fields.slice(0, 24)) {
    const row = {
      productId: String(productId), auditId: String(auditId),
      field: String(f.field).slice(0, 40), value: String(f.value).slice(0, 120),
      canonicalTag: f.canonicalTag || null,
      confidence: typeof f.confidence === "number" ? f.confidence : 0,
      status: String(f.status || "ai_generated").slice(0, 30),
      evidence: String(f.evidence || "").slice(0, 300),
      modelProvider: meta.modelProvider || null, modelName: meta.modelName || null,
      promptVersion: meta.promptVersion || null,
    };
    if (!p) { push(mem.productAiTags, { id: mem.seq++, ...row, createdAt: Date.now() }); n++; continue; }
    await p.query(
      `INSERT INTO product_ai_tags (product_id, audit_id, field, value, canonical_tag,
         confidence, status, evidence, model_provider, model_name, prompt_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [row.productId, row.auditId, row.field, row.value, row.canonicalTag,
       row.confidence, row.status, row.evidence, row.modelProvider, row.modelName, row.promptVersion]
    );
    n++;
  }
  return n;
}

// Latest audit pass for a product (history stays queryable by audit_id).
export async function getProductAiTags(productId) {
  const p = await getPool();
  if (!p) {
    const rows = mem.productAiTags.filter((t) => t.productId === productId);
    const last = rows.length ? rows[rows.length - 1].auditId : null;
    return rows.filter((t) => t.auditId === last);
  }
  const { rows } = await p.query(
    `SELECT * FROM product_ai_tags WHERE product_id=$1 AND audit_id =
       (SELECT audit_id FROM product_ai_tags WHERE product_id=$1
        ORDER BY created_at DESC LIMIT 1)
     ORDER BY field, value`, [productId]);
  return rows.map((r) => ({
    id: r.id, productId: r.product_id, auditId: r.audit_id, field: r.field,
    value: r.value, canonicalTag: r.canonical_tag, confidence: Number(r.confidence),
    status: r.status, evidence: r.evidence, modelProvider: r.model_provider,
    modelName: r.model_name, promptVersion: r.prompt_version,
  }));
}

export async function createTagReconciliation(rec) {
  const row = {
    id: String(rec.id), productId: String(rec.productId),
    agreementScore: typeof rec.agreementScore === "number" ? rec.agreementScore : 0,
    conflicts: rec.conflicts || [], missingBaseFields: rec.missingBaseFields || [],
    reviewRequired: !!rec.reviewRequired,
    analysisSource: rec.analysisSource || "local-rules",
  };
  const p = await getPool();
  if (!p) return push(mem.reconciliations, { ...row, createdAt: Date.now(), persistent: false });
  await p.query(
    `INSERT INTO tag_reconciliations (id, product_id, agreement_score, conflicts,
       missing_base_fields, review_required, analysis_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [row.id, row.productId, row.agreementScore, JSON.stringify(row.conflicts),
     JSON.stringify(row.missingBaseFields), row.reviewRequired, row.analysisSource]
  );
  return { ...row, persistent: true };
}

export async function listTagReconciliations({ productId = null, reviewRequired = null, limit = 50 } = {}) {
  limit = boundedLimit(limit, 50, 200);
  const p = await getPool();
  if (!p) {
    return mem.reconciliations
      .filter((r) => (!productId || r.productId === productId) &&
                     (reviewRequired == null || r.reviewRequired === reviewRequired))
      .slice(-limit).reverse();
  }
  const { rows } = await p.query(
    `SELECT * FROM tag_reconciliations
     WHERE ($1::text IS NULL OR product_id=$1)
       AND ($2::boolean IS NULL OR review_required=$2)
     ORDER BY created_at DESC LIMIT $3`, [productId, reviewRequired, limit]);
  return rows.map((r) => ({
    id: r.id, productId: r.product_id, agreementScore: Number(r.agreement_score),
    conflicts: r.conflicts || [], missingBaseFields: r.missing_base_fields || [],
    reviewRequired: r.review_required, analysisSource: r.analysis_source,
    resolution: r.resolution, resolvedBy: r.resolved_by,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function createLearnedFact(f) {
  const row = {
    id: "fact-" + randomUUID(),
    entityType: f.entityType, entityId: f.entityId, claim: f.claim,
    claimType: f.claimType, value: f.value ?? null,
    sourceUrls: f.sourceUrls || [], sourceTypes: f.sourceTypes || [],
    publicationDates: f.publicationDates || [], retrievedAt: f.retrievedAt || null,
    reliabilityScore: f.reliabilityScore || 0, confidenceScore: f.confidenceScore || 0,
    verificationStatus: f.verificationStatus || "discovered",
    reviewedBy: null, modelVersion: f.modelVersion || null,
  };
  const p = await getPool();
  if (!p) return push(mem.facts, { ...row, createdAt: Date.now(), persistent: false });
  await p.query(
    `INSERT INTO learned_facts (id, entity_type, entity_id, claim, claim_type, value,
       source_urls, source_types, publication_dates, retrieved_at,
       reliability_score, confidence_score, verification_status, model_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [row.id, row.entityType, row.entityId, row.claim, row.claimType, row.value,
     JSON.stringify(row.sourceUrls), JSON.stringify(row.sourceTypes),
     JSON.stringify(row.publicationDates), row.retrievedAt,
     row.reliabilityScore, row.confidenceScore, row.verificationStatus, row.modelVersion]
  );
  return { ...row, persistent: true };
}

export async function updateLearnedFactStatus(id, status, reviewedBy = null, expectedStatus = null) {
  const p = await getPool();
  if (!p) {
    const f = mem.facts.find((x) => x.id === id);
    if (!f) return null;
    if (expectedStatus && f.verificationStatus !== expectedStatus) return null;
    f.verificationStatus = status;
    if (reviewedBy) f.reviewedBy = reviewedBy;
    f.updatedAt = Date.now();
    return f;
  }
  const { rows } = await p.query(
    `UPDATE learned_facts SET verification_status=$2,
       reviewed_by=COALESCE($3, reviewed_by), updated_at=now()
     WHERE id=$1 AND ($4::text IS NULL OR verification_status=$4)
     RETURNING *`, [id, status, reviewedBy, expectedStatus]);
  return rows[0] ? factRow(rows[0]) : null;
}

const factRow = (r) => ({
  id: r.id, entityType: r.entity_type, entityId: r.entity_id, claim: r.claim,
  claimType: r.claim_type, value: r.value, sourceUrls: r.source_urls || [],
  sourceTypes: r.source_types || [], publicationDates: r.publication_dates || [],
  retrievedAt: r.retrieved_at, reliabilityScore: Number(r.reliability_score),
  confidenceScore: Number(r.confidence_score), verificationStatus: r.verification_status,
  reviewedBy: r.reviewed_by, modelVersion: r.model_version,
  createdAt: new Date(r.created_at).getTime(),
  updatedAt: new Date(r.updated_at).getTime(),
});

export async function listLearnedFacts({ id = null, entityType = null, entityId = null,
                                         status = null, limit = 100, offset = 0 } = {}) {
  limit = boundedLimit(limit, 100, 500);
  offset = Math.max(0, Math.min(100_000, Number.isFinite(Number(offset)) ? Math.trunc(Number(offset)) : 0));
  const p = await getPool();
  if (!p) {
    return mem.facts.filter((f) =>
      (!id || f.id === id) && (!entityType || f.entityType === entityType) &&
      (!entityId || f.entityId === entityId) &&
      (!status || f.verificationStatus === status)).slice().reverse().slice(offset, offset + limit);
  }
  const { rows } = await p.query(
    `SELECT * FROM learned_facts
     WHERE ($1::text IS NULL OR id=$1) AND ($2::text IS NULL OR entity_type=$2)
       AND ($3::text IS NULL OR entity_id=$3) AND ($4::text IS NULL OR verification_status=$4)
     ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`, [id, entityType, entityId, status, limit, offset]);
  return rows.map(factRow);
}

function moderationTaskRow(t) {
  return {
    id: "mod-" + randomUUID(),
    kind: String(t.kind).slice(0, 40), subjectType: String(t.subjectType).slice(0, 40),
    subjectId: String(t.subjectId).slice(0, 80), payload: t.payload || {},
    priority: ["low", "normal", "high"].includes(t.priority) ? t.priority : "normal",
    status: "open", resolution: null, resolvedBy: null,
  };
}

const MODERATION_TASK_INSERT_SQL =
  `INSERT INTO moderation_tasks (id, kind, subject_type, subject_id, payload, priority)
   VALUES ($1,$2,$3,$4,$5,$6)`;

async function insertModerationTask(target, row) {
  await target.query(MODERATION_TASK_INSERT_SQL,
    [row.id, row.kind, row.subjectType, row.subjectId, JSON.stringify(row.payload), row.priority]);
}

export async function createModerationTask(t, queryTarget = null) {
  const row = moderationTaskRow(t);
  const p = queryTarget || await getPool();
  if (!p) return push(mem.moderationTasks, { ...row, createdAt: Date.now(), persistent: false });
  await insertModerationTask(p, row);
  return { ...row, persistent: true };
}

export async function listModerationTasks({ status = "open", limit = 100 } = {}) {
  limit = boundedLimit(limit, 100, 500);
  const p = await getPool();
  if (!p) return mem.moderationTasks.filter((t) => !status || t.status === status).slice(-limit).reverse();
  const { rows } = await p.query(
    `SELECT * FROM moderation_tasks WHERE ($1::text IS NULL OR status=$1)
     ORDER BY created_at DESC LIMIT $2`, [status, limit]);
  return rows.map((r) => ({
    id: r.id, kind: r.kind, subjectType: r.subject_type, subjectId: r.subject_id,
    payload: r.payload || {}, priority: r.priority, status: r.status,
    resolution: r.resolution, resolvedBy: r.resolved_by,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function resolveModerationTask(id, { status = "resolved", resolution = null, resolvedBy = null } = {}) {
  if (!["resolved", "dismissed", "in_review"].includes(status)) return null;
  const p = await getPool();
  if (!p) {
    const t = mem.moderationTasks.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, { status, resolution, resolvedBy });
    return t;
  }
  const { rows } = await p.query(
    `UPDATE moderation_tasks SET status=$2, resolution=$3, resolved_by=$4, updated_at=now()
     WHERE id=$1 RETURNING id, status, resolution, resolved_by`, [id, status, resolution, resolvedBy]);
  return rows[0] || null;
}

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

// ---- universal interpretation (schema v13) -----------------------------------
// Server-only domains. unknown_queries is demand-counted with per-identity
// dedupe (one identity cannot vote a query into research); promotion into
// the research pipeline is an ADMIN action recorded with a reviewer id.

const unknownRow = (r) => ({
  id: Number(r.id), normalizedQuery: r.normalized_query,
  demandCount: Number(r.demand_count), distinctIdentities: Number(r.distinct_identities),
  lastMethod: r.last_method, status: r.status, researchFactId: r.research_fact_id,
  firstSeen: new Date(r.first_seen).getTime(), lastSeen: new Date(r.last_seen).getTime(),
  reviewedBy: r.reviewed_by || null,
});

export async function recordUnknownQuery(normalizedQuery, identityHash, lastMethod = "none") {
  const p = await getPool();
  if (!p) {
    let row = mem.unknownQueries.get(normalizedQuery);
    if (!row) {
      row = { id: mem.seq++, normalized_query: normalizedQuery, demand_count: 0,
        distinct_identities: 0, last_method: lastMethod, status: "observed",
        research_fact_id: null, first_seen: Date.now(), last_seen: Date.now(), reviewed_by: null };
      mem.unknownQueries.set(normalizedQuery, row);
    }
    const voteKey = row.id + "|" + identityHash;
    if (!mem.unknownVotes.has(voteKey)) {
      mem.unknownVotes.add(voteKey);
      row.demand_count += 1;
      row.distinct_identities += 1;
    }
    row.last_seen = Date.now();
    row.last_method = lastMethod;
    return unknownRow(row);
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO unknown_queries (normalized_query, last_method)
       VALUES ($1,$2)
       ON CONFLICT (normalized_query) DO UPDATE
         SET last_seen=now(), last_method=EXCLUDED.last_method, updated_at=now()
       RETURNING *`, [normalizedQuery, lastMethod]);
    const vote = await client.query(
      `INSERT INTO unknown_query_votes (query_id, identity_hash) VALUES ($1,$2)
       ON CONFLICT (query_id, identity_hash) DO NOTHING RETURNING query_id`,
      [rows[0].id, identityHash]);
    let row = rows[0];
    if (vote.rowCount) {
      const bumped = await client.query(
        `UPDATE unknown_queries
           SET demand_count = demand_count + 1,
               distinct_identities = distinct_identities + 1,
               updated_at = now()
         WHERE id=$1 AND status='observed' RETURNING *`, [rows[0].id]);
      if (bumped.rows[0]) row = bumped.rows[0];
    }
    await client.query("COMMIT");
    return unknownRow(row);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listUnknownQueries({ status = "observed", limit = 50 } = {}) {
  limit = boundedLimit(limit, 50, 200);
  const p = await getPool();
  if (!p) {
    return [...mem.unknownQueries.values()]
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.demand_count - a.demand_count)
      .slice(0, limit).map(unknownRow);
  }
  const { rows } = await p.query(
    `SELECT * FROM unknown_queries WHERE ($1::text IS NULL OR status=$1)
     ORDER BY demand_count DESC, last_seen DESC LIMIT $2`, [status, limit]);
  return rows.map(unknownRow);
}

export async function updateUnknownQueryStatus(id, status, {
  reviewedBy = null,
  researchFactId = null,
  minimumDistinctIdentities = 0,
  expectedStatus = null,
} = {}) {
  if (!["observed", "research_created", "resolved", "dismissed"].includes(status)) return null;
  const minimum = Math.max(0, Math.trunc(Number(minimumDistinctIdentities)) || 0);
  const p = await getPool();
  if (!p) {
    const row = [...mem.unknownQueries.values()].find((r) => r.id === Number(id));
    if (!row || row.distinct_identities < minimum || (expectedStatus && row.status !== expectedStatus)) return null;
    row.status = status;
    if (reviewedBy) row.reviewed_by = reviewedBy;
    if (researchFactId) row.research_fact_id = researchFactId;
    return unknownRow(row);
  }
  const { rows } = await p.query(
     `UPDATE unknown_queries
       SET status=$2, reviewed_by=COALESCE($3, reviewed_by),
           research_fact_id=COALESCE($4, research_fact_id), updated_at=now()
     WHERE id=$1
       AND distinct_identities >= $5
       AND ($6::text IS NULL OR status=$6)
     RETURNING *`, [id, status, reviewedBy, researchFactId, minimum, expectedStatus]);
  return rows[0] ? unknownRow(rows[0]) : null;
}

const feedbackRow = (r) => ({
  userId: r.user_id, normalizedQuery: r.normalized_query,
  interpretationId: r.interpretation_id, contractVersion: Number(r.contract_version),
  verdict: r.verdict, createdAt: new Date(r.created_at).getTime(),
});

// Returns feedbackRow with an extra `changed` flag: true when this call
// created the row or flipped its verdict, false when the stored verdict was
// already this value. The interpret route trains ONLY on a change (audit #5:
// the pill had no re-click guard, so N identical "meant" clicks stacked N
// times of training — 5 clicks drove a tag 0.00→0.84, 25 saturated to 1.0).
export async function recordInterpretationFeedback({ userId, normalizedQuery, interpretationId, contractVersion, verdict }) {
  const p = await getPool();
  if (!p) {
    const existing = mem.interpretationFeedback.find((f) =>
      f.user_id === userId && f.normalized_query === normalizedQuery && f.interpretation_id === interpretationId);
    if (existing) {
      const changed = existing.verdict !== verdict;
      existing.verdict = verdict;
      return { ...feedbackRow(existing), changed };
    }
    const row = { user_id: userId, normalized_query: normalizedQuery,
      interpretation_id: interpretationId, contract_version: contractVersion,
      verdict, created_at: Date.now() };
    push(mem.interpretationFeedback, row);
    return { ...feedbackRow(row), changed: true };
  }
  // One statement: capture the prior verdict, upsert, and report both. The
  // LEFT JOIN yields old_verdict = null on a fresh insert (→ changed true).
  const { rows } = await p.query(
    `WITH prev AS (
       SELECT verdict AS old_verdict FROM interpretation_feedback
       WHERE user_id=$1 AND normalized_query=$2 AND interpretation_id=$3
     ),
     up AS (
       INSERT INTO interpretation_feedback (user_id, normalized_query, interpretation_id, contract_version, verdict)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, normalized_query, interpretation_id)
         DO UPDATE SET verdict=EXCLUDED.verdict, contract_version=EXCLUDED.contract_version
       RETURNING *
     )
     SELECT up.*, prev.old_verdict FROM up LEFT JOIN prev ON true`,
    [userId, normalizedQuery, interpretationId, contractVersion, verdict]);
  const row = rows[0];
  return { ...feedbackRow(row), changed: row.old_verdict !== verdict };
}

export async function listInterpretationFeedback(userId, normalizedQuery) {
  const p = await getPool();
  if (!p) {
    return mem.interpretationFeedback
      .filter((f) => f.user_id === userId && f.normalized_query === normalizedQuery)
      .map(feedbackRow);
  }
  const { rows } = await p.query(
    `SELECT * FROM interpretation_feedback WHERE user_id=$1 AND normalized_query=$2 LIMIT 50`,
    [userId, normalizedQuery]);
  return rows.map(feedbackRow);
}

// ── Asterisk memory surface (v14 + guidance v20) ───────────────────────────
// asterisk_memory_preferences: the ONLY write domain the memory facade owns
// (ADR-001 rule 3) — section visibility + whether taste may guide surfaces,
// never taste itself. user_follows: brand and user follows graduated from
// localStorage; board follows stay on the profile.

export const MEMORY_FOLLOW_KINDS = new Set(["brand", "user"]);
const FOLLOWS_CAP = 50;
const MEMORY_PREFERENCE_SECTIONS = new Set(["explicit", "inferred", "global", "uncertainty"]);

export async function getMemoryPreferences(userId) {
  const p = await getPool();
  if (!p) {
    const row = mem.memoryPreferences.get(userId);
    return {
      hiddenSections: [...(row?.hiddenSections || [])],
      guidanceEnabled: row?.guidanceEnabled !== false,
    };
  }
  const { rows } = await p.query(
    "SELECT hidden_sections, guidance_enabled FROM asterisk_memory_preferences WHERE user_id=$1", [userId]);
  return {
    hiddenSections: Array.isArray(rows[0]?.hidden_sections) ? rows[0].hidden_sections : [],
    guidanceEnabled: rows[0]?.guidance_enabled !== false,
  };
}

export async function saveMemoryPreferences(userId, settings) {
  if (!userId) throw new TypeError("userId required");
  const patch = Array.isArray(settings) ? { hiddenSections: settings } : settings;
  if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
      (patch.hiddenSections === undefined && patch.guidanceEnabled === undefined)) {
    throw new TypeError("hiddenSections or guidanceEnabled required");
  }
  if (patch.hiddenSections !== undefined &&
      (!Array.isArray(patch.hiddenSections) ||
       patch.hiddenSections.length > MEMORY_PREFERENCE_SECTIONS.size ||
       new Set(patch.hiddenSections).size !== patch.hiddenSections.length ||
       !patch.hiddenSections.every((section) => MEMORY_PREFERENCE_SECTIONS.has(section)))) {
    throw new TypeError("hiddenSections contains an invalid or duplicate section");
  }
  if (patch.guidanceEnabled !== undefined && typeof patch.guidanceEnabled !== "boolean") {
    throw new TypeError("guidanceEnabled must be boolean");
  }
  const p = await getPool();
  if (!p) {
    const current = mem.memoryPreferences.get(userId) || {
      hiddenSections: [], guidanceEnabled: true,
    };
    const next = {
      hiddenSections: patch.hiddenSections === undefined
        ? [...current.hiddenSections] : [...patch.hiddenSections],
      guidanceEnabled: patch.guidanceEnabled === undefined
        ? current.guidanceEnabled !== false : patch.guidanceEnabled,
      updatedAt: Date.now(),
    };
    mem.memoryPreferences.set(userId, next);
    return { hiddenSections: [...next.hiddenSections], guidanceEnabled: next.guidanceEnabled };
  }
  const { rows } = await p.query(
    `INSERT INTO asterisk_memory_preferences
       (user_id,hidden_sections,guidance_enabled,updated_at)
     VALUES ($1,COALESCE($2::jsonb,'[]'::jsonb),COALESCE($3::boolean,true),now())
     ON CONFLICT (user_id) DO UPDATE SET
       hidden_sections=COALESCE($2::jsonb,asterisk_memory_preferences.hidden_sections),
       guidance_enabled=COALESCE($3::boolean,asterisk_memory_preferences.guidance_enabled),
       updated_at=now()
     RETURNING hidden_sections,guidance_enabled`,
    [
      userId,
      patch.hiddenSections === undefined ? null : JSON.stringify(patch.hiddenSections),
      patch.guidanceEnabled === undefined ? null : patch.guidanceEnabled,
    ]);
  return {
    hiddenSections: rows[0].hidden_sections,
    guidanceEnabled: rows[0].guidance_enabled !== false,
  };
}

export async function listFollows(userId) {
  const p = await getPool();
  if (!p) {
    // reverse insertion order first so same-millisecond follows still come
    // back newest-first under the stable sort
    return [...mem.follows].reverse()
      .filter((f) => f.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((f) => ({ kind: f.kind, target: f.target, createdAt: f.createdAt }));
  }
  const { rows } = await p.query(
    "SELECT kind, target, created_at FROM user_follows WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, FOLLOWS_CAP]);
  return rows.map((r) => ({ kind: r.kind, target: r.target, createdAt: new Date(r.created_at).getTime() }));
}

export async function setFollow(userId, kind, target, on = true) {
  if (!userId || !MEMORY_FOLLOW_KINDS.has(kind)) throw new TypeError("userId and kind brand|user required");
  const normalizedTarget = typeof target === "string" ? target.trim() : "";
  if (!normalizedTarget.length || normalizedTarget.length > 120) {
    throw new TypeError("target must be a 1-120 char string");
  }
  const p = await getPool();
  if (!p) {
    return withUserLock(`follow:${userId}`, async () => {
      const match = (f) => f.userId === userId && f.kind === kind && f.target === normalizedTarget;
      if (!on) {
        mem.follows = mem.follows.filter((f) => !match(f));
        return { ok: true };
      }
      if (mem.follows.some(match)) return { ok: true };
      if (mem.follows.filter((f) => f.userId === userId).length >= FOLLOWS_CAP) {
        return { ok: false, error: "follow cap reached" };
      }
      push(mem.follows, { userId, kind, target: normalizedTarget, createdAt: Date.now() });
      return { ok: true };
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`follow-cap:${userId}`]);
    if (!on) {
      await client.query(
        "DELETE FROM user_follows WHERE user_id=$1 AND kind=$2 AND target=$3",
        [userId, kind, normalizedTarget]);
      await client.query("COMMIT");
      return { ok: true };
    }
    const existing = await client.query(
      "SELECT 1 FROM user_follows WHERE user_id=$1 AND kind=$2 AND target=$3",
      [userId, kind, normalizedTarget]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return { ok: true };
    }
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM user_follows WHERE user_id=$1", [userId]);
    if ((rows[0]?.n || 0) >= FOLLOWS_CAP) {
      await client.query("ROLLBACK");
      return { ok: false, error: "follow cap reached" };
    }
    await client.query(
      "INSERT INTO user_follows (user_id,kind,target) VALUES ($1,$2,$3)",
      [userId, kind, normalizedTarget]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ── Wardrobe (v15) ────────────────────────────────────────────────────────
// Explicit ownership only (lib/wardrobe normalizes the sources). Rows are
// private; promotion from tickets/uploads is idempotent via the per-user
// (user_id, source, source_ref) unique index.

function wardrobeRow(r) {
  return {
    id: String(r.id), userId: r.user_id, source: r.source,
    sourceRef: r.source_ref || null, catalogItemId: r.catalog_item_id || null,
    title: r.title, brand: r.brand || null, category: r.category || null,
    sizeLabel: r.size_label || null,
    colors: Array.isArray(r.colors) ? r.colors : [],
    tags: r.tags && typeof r.tags === "object" ? r.tags : {},
    photoPath: r.photo_path || null,
    status: r.status,
    acquiredAt: r.acquired_at ? new Date(r.acquired_at).getTime() : null,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function createWardrobeItem(row) {
  const p = await getPool();
  if (!p) {
    return withUserLock(row.userId, async () => {
      if (row.sourceRef) {
        const existing = mem.wardrobe.find((w) =>
          w.user_id === row.userId && w.source === row.source && w.source_ref === row.sourceRef);
        if (existing) return { item: wardrobeRow(existing), duplicate: true };
      }
      const record = {
        id: String(mem.seq++), user_id: row.userId, source: row.source,
        source_ref: row.sourceRef, catalog_item_id: row.catalogItemId,
        title: row.title, brand: row.brand, category: row.category,
        size_label: row.sizeLabel, colors: row.colors, tags: row.tags,
        photo_path: null, status: "active",
        acquired_at: row.acquiredAt, created_at: new Date(),
      };
      push(mem.wardrobe, record);
      return { item: wardrobeRow(record), duplicate: false };
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // Use the same identity lock as adoption so a promoted piece cannot be
    // deleted or collide midway through a device → account move.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${row.userId}`]);
    const { rows } = await client.query(
      `INSERT INTO wardrobe_items
         (user_id,source,source_ref,catalog_item_id,title,brand,category,size_label,colors,tags,acquired_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
       ON CONFLICT (user_id,source,source_ref) WHERE source_ref IS NOT NULL DO NOTHING
       RETURNING *`,
      [row.userId, row.source, row.sourceRef, row.catalogItemId, row.title, row.brand,
       row.category, row.sizeLabel, JSON.stringify(row.colors || []),
       JSON.stringify(row.tags || {}), row.acquiredAt]);
    if (rows[0]) {
      await client.query("COMMIT");
      return { item: wardrobeRow(rows[0]), duplicate: false };
    }
    const { rows: prior } = await client.query(
      "SELECT * FROM wardrobe_items WHERE user_id=$1 AND source=$2 AND source_ref=$3",
      [row.userId, row.source, row.sourceRef]);
    await client.query("COMMIT");
    return { item: wardrobeRow(prior[0]), duplicate: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listWardrobeItems(userId, { status = "active", limit = 200 } = {}) {
  limit = boundedLimit(limit, 200, 500);
  const p = await getPool();
  if (!p) {
    return [...mem.wardrobe].reverse()
      .filter((w) => w.user_id === userId && (status === "all" || w.status === status))
      .slice(0, limit).map(wardrobeRow);
  }
  const filter = status === "all" ? "" : " AND status=$3";
  const params = status === "all" ? [userId, limit] : [userId, limit, status];
  const { rows } = await p.query(
    `SELECT * FROM wardrobe_items WHERE user_id=$1${filter} ORDER BY created_at DESC LIMIT $2`,
    params);
  return rows.map(wardrobeRow);
}

export async function getWardrobeItem(userId, id, queryTarget = null) {
  const p = queryTarget || await getPool();
  if (!p) {
    const r = mem.wardrobe.find((w) => w.user_id === userId && String(w.id) === String(id));
    return r ? wardrobeRow(r) : null;
  }
  if (!/^\d{1,18}$/.test(String(id))) return null;
  const { rows } = await p.query(
    "SELECT * FROM wardrobe_items WHERE user_id=$1 AND id=$2", [userId, id]);
  return rows[0] ? wardrobeRow(rows[0]) : null;
}

export async function setWardrobeItemStatus(userId, id, status) {
  if (!["active", "retired"].includes(status)) throw new TypeError("status must be active or retired");
  const p = await getPool();
  if (!p) {
    const r = mem.wardrobe.find((w) => w.user_id === userId && String(w.id) === String(id));
    if (!r) return null;
    r.status = status;
    return wardrobeRow(r);
  }
  if (!/^\d{1,18}$/.test(String(id))) return null;
  const { rows } = await p.query(
    "UPDATE wardrobe_items SET status=$3, updated_at=now() WHERE user_id=$1 AND id=$2 RETURNING *",
    [userId, id, status]);
  return rows[0] ? wardrobeRow(rows[0]) : null;
}

export async function deleteWardrobeItem(userId, id, options = {}) {
  const hasExpectedPath = Object.prototype.hasOwnProperty.call(options, "expectedPhotoPath");
  const expectedPhotoPath = options.expectedPhotoPath ?? null;
  const p = options.queryTarget || await getPool();
  if (!p) {
    const before = mem.wardrobe.length;
    mem.wardrobe = mem.wardrobe.filter((w) => !(w.user_id === userId && String(w.id) === String(id) &&
      (!hasExpectedPath || (w.photo_path || null) === expectedPhotoPath)));
    return mem.wardrobe.length < before;
  }
  if (!/^\d{1,18}$/.test(String(id))) return false;
  const expectedClause = hasExpectedPath ? " AND photo_path IS NOT DISTINCT FROM $3" : "";
  const params = hasExpectedPath ? [userId, id, expectedPhotoPath] : [userId, id];
  const r = await p.query(`DELETE FROM wardrobe_items WHERE user_id=$1 AND id=$2${expectedClause}`, params);
  return r.rowCount > 0;
}

// Photo attachment (Phase 3b): path + consent version live on the row; bytes
// live in private Storage (lib/wardrobe/photos.js). Owner-scoped like every
// other wardrobe accessor.
export async function setWardrobePhoto(userId, id, photoPath, consentVersion, options = {}) {
  const hasExpectedPath = Object.prototype.hasOwnProperty.call(options, "expectedPhotoPath");
  const expectedPhotoPath = options.expectedPhotoPath ?? null;
  const paletteColors = Array.isArray(options.colors) ? options.colors.slice(0, 8) : [];
  const p = options.queryTarget || await getPool();
  if (!p) {
    const r = mem.wardrobe.find((w) => w.user_id === userId && String(w.id) === String(id));
    if (!r) return null;
    if (hasExpectedPath && (r.photo_path || null) !== expectedPhotoPath) return null;
    r.photo_path = photoPath;
    r.photo_consent = photoPath ? consentVersion : null;
    if (paletteColors.length && (!Array.isArray(r.colors) || !r.colors.length)) r.colors = paletteColors;
    return wardrobeRow(r);
  }
  if (!/^\d{1,18}$/.test(String(id))) return null;
  const expectedClause = hasExpectedPath ? " AND photo_path IS NOT DISTINCT FROM $6" : "";
  const params = [userId, id, photoPath, photoPath ? consentVersion : null, JSON.stringify(paletteColors)];
  if (hasExpectedPath) params.push(expectedPhotoPath);
  const { rows } = await p.query(
    `UPDATE wardrobe_items SET photo_path=$3, photo_consent=$4,
       colors=CASE WHEN jsonb_array_length(colors)=0 AND jsonb_array_length($5::jsonb)>0
         THEN $5::jsonb ELSE colors END,
       updated_at=now()
     WHERE user_id=$1 AND id=$2${expectedClause} RETURNING *`,
    params);
  return rows[0] ? wardrobeRow(rows[0]) : null;
}

// ── Discover rails (v16) ──────────────────────────────────────────────────
// Registry rows are operator data (seeded in schema-v16); prefs are the only
// per-user writes. Rail CONTENT never lives in the database.

const DEFAULT_RAILS = [
  { id: "screen", kind: "screen", title: "FROM THE SCREEN", position: 10, enabled: true, version: 1 },
  { id: "soundtrack", kind: "soundtrack", title: "THE SOUNDTRACK", position: 20, enabled: true, version: 1 },
  { id: "trend", kind: "trend", title: "RISING NOW", position: 30, enabled: true, version: 1 },
  { id: "exploration", kind: "exploration", title: "FAR FROM YOUR TASTE", position: 40, enabled: true, version: 1 },
];

export async function listDiscoverRails() {
  const p = await getPool();
  if (!p) return DEFAULT_RAILS.map((rail) => ({ ...rail }));
  const { rows } = await p.query(
    "SELECT id, kind, title, position, enabled, version FROM discover_rails ORDER BY position, id");
  return rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title,
    position: r.position, enabled: r.enabled, version: r.version,
  }));
}

export async function getRailPrefs(userId) {
  const p = await getPool();
  if (!p) {
    const out = {};
    for (const [key, pref] of mem.railPrefs) {
      const [uid, railId] = key.split("|");
      if (uid === userId) out[railId] = pref;
    }
    return out;
  }
  const { rows } = await p.query(
    "SELECT rail_id, collapsed, hidden FROM user_rail_prefs WHERE user_id=$1", [userId]);
  return Object.fromEntries(rows.map((r) => [r.rail_id, { collapsed: r.collapsed, hidden: r.hidden }]));
}

export async function setRailPref(userId, railId, { collapsed = null, hidden = null } = {}) {
  if (!userId || typeof railId !== "string" || !/^[a-z0-9-]{2,40}$/.test(railId)) {
    throw new TypeError("userId and a valid railId required");
  }
  const p = await getPool();
  if (!p) {
    if (!DEFAULT_RAILS.some((rail) => rail.id === railId)) return null;
    const key = `${userId}|${railId}`;
    const current = mem.railPrefs.get(key) || { collapsed: false, hidden: false };
    const next = {
      collapsed: collapsed === null ? current.collapsed : !!collapsed,
      hidden: hidden === null ? current.hidden : !!hidden,
    };
    mem.railPrefs.set(key, next);
    return { railId, ...next };
  }
  const { rows } = await p.query(
    `INSERT INTO user_rail_prefs (user_id, rail_id, collapsed, hidden, updated_at)
     SELECT $1, id, COALESCE($3, false), COALESCE($4, false), now() FROM discover_rails WHERE id=$2
     ON CONFLICT (user_id, rail_id) DO UPDATE SET
       collapsed = COALESCE($3, user_rail_prefs.collapsed),
       hidden    = COALESCE($4, user_rail_prefs.hidden),
       updated_at = now()
     RETURNING rail_id, collapsed, hidden`,
    [userId, railId, collapsed, hidden]);
  return rows[0] ? { railId: rows[0].rail_id, collapsed: rows[0].collapsed, hidden: rows[0].hidden } : null;
}

// ── Profile rooms (v17, Feature E) ─────────────────────────────────────────
// Social/trust domain per ADR-002: rows key on the VERIFIED auth uuid.
// profile_themes is operator data (seeded in schema-v17); rooms/modules are
// the only per-account writes. Derived module content (top pieces, brands)
// never lives here — the read facade assembles it live.

const ACCOUNT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROOM_MODERATION_STATUSES = new Set(["visible", "under_review", "hidden"]);
const ROOM_MODULE_IDS = new Set(["statement", "soundtrack", "top-pieces", "brands"]);

const DEFAULT_PROFILE_THEMES = [
  { id: "asilum", name: "HOUSE", tokens: { accent: "#e5342b", ink: "#000000", paper: "#ffffff", rule: "solid" }, position: 10, enabled: true, version: 1 },
  { id: "after-dark", name: "AFTER DARK", tokens: { accent: "#e5342b", ink: "#f2f2f2", paper: "#101013", rule: "solid" }, position: 20, enabled: true, version: 1 },
  { id: "archive-paper", name: "ARCHIVE PAPER", tokens: { accent: "#8a3324", ink: "#2b2016", paper: "#f4ead8", rule: "double" }, position: 30, enabled: true, version: 1 },
  { id: "acid", name: "ACID", tokens: { accent: "#00a651", ink: "#101010", paper: "#fbfff2", rule: "solid" }, position: 40, enabled: true, version: 1 },
  { id: "pageant", name: "PAGEANT", tokens: { accent: "#ff2d78", ink: "#1a1a1a", paper: "#fff5fa", rule: "double" }, position: 50, enabled: true, version: 1 },
];

function requireAccountId(accountId) {
  const id = typeof accountId === "string" ? accountId.toLowerCase() : "";
  if (!ACCOUNT_UUID_RE.test(id)) throw new TypeError("a verified account uuid is required");
  return id;
}

function roomRow(r) {
  return {
    accountId: r.account_id, handle: r.handle, themeId: r.theme_id,
    published: r.published, moderationStatus: r.moderation_status,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function moduleRowOut(r) {
  return {
    accountId: r.account_id, module: r.module, position: r.position,
    visible: r.visible, content: r.content || {}, updatedAt: r.updated_at,
  };
}

export async function listProfileThemes(queryTarget = null) {
  const p = queryTarget || await getPool();
  if (!p) return DEFAULT_PROFILE_THEMES.map((t) => ({ ...t, tokens: { ...t.tokens } }));
  const { rows } = await p.query(
    "SELECT id, name, tokens, position, enabled, version FROM profile_themes ORDER BY position, id");
  return rows.map((r) => ({
    id: r.id, name: r.name, tokens: r.tokens || {},
    position: r.position, enabled: r.enabled, version: r.version,
  }));
}

export async function getProfileRoom(accountId, queryTarget = null) {
  const id = requireAccountId(accountId);
  const p = queryTarget || await getPool();
  if (!p) return mem.profileRooms.get(id) || null;
  const { rows } = await p.query("SELECT * FROM profile_rooms WHERE account_id=$1", [id]);
  return rows[0] ? roomRow(rows[0]) : null;
}

export async function getProfileRoomByHandle(handle) {
  if (typeof handle !== "string" || !handle) return null;
  const key = handle.toLowerCase();
  const p = await getPool();
  if (!p) {
    for (const room of mem.profileRooms.values()) if (room.handle === key) return room;
    return null;
  }
  const { rows } = await p.query("SELECT * FROM profile_rooms WHERE handle=$1", [key]);
  return rows[0] ? roomRow(rows[0]) : null;
}

// Upsert the room root. Handle uniqueness surfaces as the string
// "handle-taken" error so the route can answer 409 without leaking SQL.
export async function upsertProfileRoom(accountId, { handle, themeId, published } = {}, { queryTarget = null } = {}) {
  const id = requireAccountId(accountId);
  const patch = {};
  if (handle !== undefined) patch.handle = handle; // pre-validated by rooms.js
  if (themeId !== undefined) {
    const themes = await listProfileThemes(queryTarget);
    if (!themes.some((t) => t.id === themeId && t.enabled)) throw new TypeError("unknown theme");
    patch.themeId = themeId;
  }
  if (published !== undefined) patch.published = !!published;
  const p = queryTarget || await getPool();
  if (!p) {
    if (patch.handle) {
      for (const [other, room] of mem.profileRooms) {
        if (other !== id && room.handle === patch.handle) throw new Error("handle-taken");
      }
    }
    const current = mem.profileRooms.get(id) || {
      accountId: id, handle: null, themeId: "asilum", published: false,
      moderationStatus: "visible", createdAt: Date.now(), updatedAt: Date.now(),
    };
    if (patch.published && !(patch.handle || current.handle)) throw new Error("handle-required");
    const next = { ...current, ...patch, updatedAt: Date.now() };
    mem.profileRooms.set(id, next);
    return { ...next };
  }
  try {
    if (patch.published && !patch.handle) {
      const current = await getProfileRoom(id, p);
      if (!current?.handle) throw new Error("handle-required");
    }
    const { rows } = await p.query(
      `INSERT INTO profile_rooms (account_id, handle, theme_id, published, updated_at)
       VALUES ($1, $2, COALESCE($3,'asilum'), COALESCE($4,false), now())
       ON CONFLICT (account_id) DO UPDATE SET
         handle     = COALESCE($2, profile_rooms.handle),
         theme_id   = COALESCE($3, profile_rooms.theme_id),
         published  = COALESCE($4, profile_rooms.published),
         updated_at = now()
       RETURNING *`,
      [id, patch.handle ?? null, patch.themeId ?? null,
       patch.published === undefined ? null : patch.published]);
    return roomRow(rows[0]);
  } catch (error) {
    if (error?.code === "23505") throw new Error("handle-taken");
    if (error?.code === "23514" && error?.constraint === "profile_rooms_published_handle") {
      throw new Error("handle-required");
    }
    throw error;
  }
}

export async function setProfileRoomModeration(accountId, status, queryTarget = null) {
  const id = requireAccountId(accountId);
  if (!ROOM_MODERATION_STATUSES.has(status)) throw new TypeError("bad moderation status");
  const p = queryTarget || await getPool();
  if (!p) {
    const room = mem.profileRooms.get(id);
    if (!room) return null;
    room.moderationStatus = status;
    room.updatedAt = Date.now();
    return { ...room };
  }
  const { rows } = await p.query(
    "UPDATE profile_rooms SET moderation_status=$2, updated_at=now() WHERE account_id=$1 RETURNING *",
    [id, status]);
  return rows[0] ? roomRow(rows[0]) : null;
}

export async function listProfileModules(accountId) {
  const id = requireAccountId(accountId);
  const p = await getPool();
  if (!p) {
    const out = [];
    for (const [key, row] of mem.profileModules) if (key.startsWith(id + "|")) out.push({ ...row });
    return out.sort((a, b) => a.position - b.position || a.module.localeCompare(b.module));
  }
  const { rows } = await p.query(
    "SELECT * FROM profile_modules WHERE account_id=$1 ORDER BY position, module", [id]);
  return rows.map(moduleRowOut);
}

// content arrives pre-validated (rooms.js sanitize/validate); the DB layer
// still enforces the module vocabulary and the room-row prerequisite.
export async function setProfileModule(accountId, module, { position, visible, content } = {}, { queryTarget = null } = {}) {
  const id = requireAccountId(accountId);
  if (!ROOM_MODULE_IDS.has(module)) throw new TypeError("unknown module");
  const patch = {};
  if (position !== undefined) {
    const n = Math.trunc(Number(position));
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw new TypeError("position must be 0-1000");
    patch.position = n;
  }
  if (visible !== undefined) patch.visible = !!visible;
  if (content !== undefined) {
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      throw new TypeError("content must be an object");
    }
    patch.content = content;
  }
  const p = queryTarget || await getPool();
  const defaultVisible = module === "statement" || module === "soundtrack";
  if (!p) {
    if (!mem.profileRooms.has(id)) throw new Error("room-required");
    const key = `${id}|${module}`;
    const current = mem.profileModules.get(key) || {
      accountId: id, module, position: 100, visible: defaultVisible, content: {}, updatedAt: Date.now(),
    };
    const next = { ...current, ...patch, updatedAt: Date.now() };
    mem.profileModules.set(key, next);
    return { ...next };
  }
  try {
    const { rows } = await p.query(
      `INSERT INTO profile_modules (account_id, module, position, visible, content, updated_at)
       VALUES ($1, $2, COALESCE($3,100), COALESCE($4::boolean,$6::boolean), COALESCE($5,'{}'::jsonb), now())
       ON CONFLICT (account_id, module) DO UPDATE SET
         position   = COALESCE($3, profile_modules.position),
         visible    = COALESCE($4::boolean, profile_modules.visible),
         content    = COALESCE($5, profile_modules.content),
         updated_at = now()
       RETURNING *`,
      [id, module, patch.position ?? null,
       patch.visible === undefined ? null : patch.visible,
       patch.content === undefined ? null : JSON.stringify(patch.content),
       defaultVisible]);
    return moduleRowOut(rows[0]);
  } catch (error) {
    if (error?.code === "23503") throw new Error("room-required");
    throw error;
  }
}

// Admin surface: list rooms newest-first, optionally by moderation status.
export async function listProfileRooms({ status = null, limit = 100 } = {}) {
  const cap = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 100));
  if (status !== null && !ROOM_MODERATION_STATUSES.has(status)) throw new TypeError("bad moderation status");
  const p = await getPool();
  if (!p) {
    return [...mem.profileRooms.values()]
      .filter((room) => !status || room.moderationStatus === status)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, cap)
      .map((room) => ({ ...room }));
  }
  const { rows } = await p.query(
    `SELECT * FROM profile_rooms
     WHERE ($1::text IS NULL OR moderation_status=$1)
     ORDER BY updated_at DESC LIMIT $2`,
    [status, cap]);
  return rows.map(roomRow);
}

// Operator mutation surface for the rail registry (v16 follow-up flagged on
// PR #37 — edits were SQL-only). Registry rows are operator data; the
// persistent registry is the only real one, so this requires the database.
export async function updateDiscoverRail(railId, { enabled, position, title } = {}) {
  if (typeof railId !== "string" || !/^[a-z0-9-]{2,40}$/.test(railId)) {
    throw new TypeError("valid railId required");
  }
  const patch = {};
  if (enabled !== undefined) patch.enabled = !!enabled;
  if (position !== undefined) {
    const n = Math.trunc(Number(position));
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw new TypeError("position must be 0-1000");
    patch.position = n;
  }
  if (title !== undefined) {
    const t = typeof title === "string" ? title.trim() : "";
    if (!t.length || t.length > 80) throw new TypeError("title must be a 1-80 char string");
    patch.title = t;
  }
  if (!Object.keys(patch).length) throw new TypeError("enabled, position, or title required");
  const p = await getPool();
  if (!p) return null; // registry edits are persistent-only operator actions
  const { rows } = await p.query(
    `UPDATE discover_rails SET
       enabled    = COALESCE($2, enabled),
       position   = COALESCE($3, position),
       title      = COALESCE($4, title),
       updated_at = now()
     WHERE id=$1
     RETURNING id, kind, title, position, enabled, version`,
    [railId, patch.enabled ?? null, patch.position ?? null, patch.title ?? null]);
  return rows[0] || null;
}

// ── Brand cases (v18, Feature G groundwork) ────────────────────────────────
// Case rows + an APPEND-ONLY transition ledger. lib/brands/cases.js owns
// the state machine and validation; this layer owns atomicity: every move
// is CAS-guarded on the caller's expectedStatus and writes its ledger row
// in the same transaction (competing reviewers race safely — the
// updateLearnedFactStatus lesson).

import { randomUUID as _brandCaseUUID } from "node:crypto";

function brandCaseRow(r) {
  return {
    id: r.id, kind: r.kind, brandName: r.brand_name,
    subjectType: r.subject_type, subjectId: r.subject_id,
    status: r.status, openedBy: r.opened_by, evidence: r.evidence || {},
    resolution: r.resolution, resolvedBy: r.resolved_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// input arrives pre-validated by lib/brands/cases.js validateOpenCase
export async function insertBrandCase(v) {
  const id = "bc-" + _brandCaseUUID();
  const p = await getPool();
  if (!p) {
    const row = {
      id, kind: v.kind, brandName: v.brandName, subjectType: v.subjectType,
      subjectId: v.subjectId, status: "open", openedBy: v.openedBy,
      evidence: v.evidence, resolution: null, resolvedBy: null,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    mem.brandCases.set(id, row);
    mem.brandCaseEvents.push({ caseId: id, fromStatus: "open", toStatus: "open", actor: v.openedBy, note: "opened", at: Date.now() });
    return { ...row };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO brand_cases (id, kind, brand_name, subject_type, subject_id, opened_by, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, v.kind, v.brandName, v.subjectType, v.subjectId, v.openedBy, JSON.stringify(v.evidence)]);
    await client.query(
      "INSERT INTO brand_case_events (case_id, from_status, to_status, actor, note) VALUES ($1,'open','open',$2,'opened')",
      [id, v.openedBy]);
    await client.query("COMMIT");
    return brandCaseRow(rows[0]);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function getBrandCase(id) {
  if (typeof id !== "string" || !id.startsWith("bc-")) return null;
  const p = await getPool();
  if (!p) return mem.brandCases.get(id) ? { ...mem.brandCases.get(id) } : null;
  const { rows } = await p.query("SELECT * FROM brand_cases WHERE id=$1", [id]);
  return rows[0] ? brandCaseRow(rows[0]) : null;
}

// CAS-guarded move: UPDATE ... WHERE status=expectedStatus. Zero rows means
// another reviewer moved first — surfaced as "case-moved", never a silent
// overwrite. Ledger row rides the same transaction.
export async function applyBrandCaseTransition(id, expectedStatus, t) {
  if (typeof expectedStatus !== "string" || !expectedStatus) {
    throw new TypeError("expectedStatus required");
  }
  const p = await getPool();
  if (!p) {
    const row = mem.brandCases.get(id);
    if (!row) return null;
    if (row.status !== expectedStatus) throw new Error("case-moved");
    row.status = t.to;
    if (t.evidence !== undefined) row.evidence = t.evidence;
    if (t.resolution !== undefined) { row.resolution = t.resolution; row.resolvedBy = t.actor; }
    row.updatedAt = Date.now();
    mem.brandCaseEvents.push({ caseId: id, fromStatus: expectedStatus, toStatus: t.to, actor: t.actor, note: t.note || null, at: Date.now() });
    return { ...row };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE brand_cases SET
         status=$3,
         evidence=COALESCE($4, evidence),
         resolution=COALESCE($5, resolution),
         resolved_by=CASE WHEN $5::text IS NOT NULL THEN $6 ELSE resolved_by END,
         updated_at=now()
       WHERE id=$1 AND status=$2 RETURNING *`,
      [id, expectedStatus, t.to,
       t.evidence === undefined ? null : JSON.stringify(t.evidence),
       t.resolution === undefined ? null : t.resolution, t.actor]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      const exists = await client.query("SELECT 1 FROM brand_cases WHERE id=$1", [id]);
      if (!exists.rows[0]) return null;
      throw new Error("case-moved");
    }
    await client.query(
      "INSERT INTO brand_case_events (case_id, from_status, to_status, actor, note) VALUES ($1,$2,$3,$4,$5)",
      [id, expectedStatus, t.to, t.actor, t.note || null]);
    await client.query("COMMIT");
    return brandCaseRow(rows[0]);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function listBrandCases({ status = null, kind = null, brandName = null, limit = 100 } = {}) {
  const cap = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 100));
  const p = await getPool();
  if (!p) {
    return [...mem.brandCases.values()]
      .filter((c) => (!status || c.status === status) && (!kind || c.kind === kind)
        && (!brandName || c.brandName.toLowerCase() === String(brandName).toLowerCase()))
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, cap).map((c) => ({ ...c }));
  }
  const { rows } = await p.query(
    `SELECT * FROM brand_cases
     WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR kind=$2)
       AND ($3::text IS NULL OR lower(brand_name)=lower($3))
     ORDER BY updated_at DESC LIMIT $4`,
    [status, kind, brandName, cap]);
  return rows.map(brandCaseRow);
}

// ---- business accounts (v26; owner law, Aug 13) --------------------------
// A PASSPORT account becomes a BUSINESS account through a human-reviewed
// brand_cases verification case — the case machine is the trust decision
// (no machine path to business), this table is the account's current
// state and the booth roster's fast read. One row per account; history
// lives in the linked case + its events.

function businessRow(r) {
  return {
    accountId: r.account_id, brandName: r.brand_name, websiteUrl: r.website_url,
    shopifyDomain: r.shopify_domain, statement: r.statement, status: r.status,
    caseId: r.case_id, reviewNote: r.review_note,
    sourceName: r.source_name || null,
    hotlistMember: Boolean(r.hotlist_member),
    hotlistPaidThrough: r.hotlist_paid_through
      ? String(r.hotlist_paid_through).slice(0, 10) : null,
    submittedAt: r.submitted_at ? new Date(r.submitted_at).getTime() : null,
    decidedAt: r.decided_at ? new Date(r.decided_at).getTime() : null,
    persistent: true,
  };
}

// The inventory link (v32): a VERIFIED business claims its source slug —
// the same namespace items carry — exactly once. UNIQUE index (pg) / scan
// (mem) refuses a slug another business holds.
export async function setBusinessSourceName(accountId, sourceName) {
  const row = await getBusinessAccount(accountId);
  if (!row) throw new Error("no business account");
  if (row.status !== "business") throw new Error("only a verified business links inventory");
  const p = await getPool();
  if (!p) {
    for (const [otherId, other] of mem.businessAccounts) {
      if (otherId !== accountId && other.sourceName === sourceName) {
        throw new Error("source name already linked to another business");
      }
    }
    const next = { ...mem.businessAccounts.get(accountId), sourceName };
    mem.businessAccounts.set(accountId, next);
    return { ...next };
  }
  try {
    const { rows } = await p.query(
      `UPDATE business_accounts SET source_name=$2, updated_at=now()
       WHERE account_id=$1 AND status='business' RETURNING *`,
      [accountId, sourceName]);
    if (!rows[0]) throw new Error("only a verified business links inventory");
    return businessRow(rows[0]);
  } catch (err) {
    if (err && err.code === "23505") throw new Error("source name already linked to another business");
    throw err;
  }
}

// Duplicate-brand screen (gap 2, 18 Aug): normalized-exact and near
// (levenshtein ≤ 2, names ≥ 5 chars — short names near-match everything)
// collisions against every non-rejected application and verified business.
// A FLAG for the reviewer, never a refusal: the reviewer decides which of
// two claimants is the brand. The applicant is told nothing — "that name is
// taken" would leak who applied and teach an impersonator how to probe.
export function normalizeBrandName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function findBrandNameCollisions(brandName, excludeAccountId = null) {
  const { distance } = await import("fastest-levenshtein");
  const norm = normalizeBrandName(brandName);
  if (!norm) return [];
  const p = await getPool();
  let rows;
  if (!p) {
    rows = [...mem.businessAccounts.values()].map((r) => ({
      accountId: r.accountId, brandName: r.brandName, status: r.status,
    }));
  } else {
    const r = await p.query(
      `SELECT account_id, brand_name, status FROM business_accounts
       WHERE status <> 'rejected' LIMIT 5000`);
    rows = r.rows.map((x) => ({ accountId: x.account_id, brandName: x.brand_name, status: x.status }));
  }
  const hits = [];
  for (const row of rows) {
    if (row.status === "rejected") continue;
    if (excludeAccountId && row.accountId === excludeAccountId) continue;
    const other = normalizeBrandName(row.brandName);
    if (!other) continue;
    const exact = other === norm;
    const near = !exact && norm.length >= 5 && other.length >= 5 && distance(norm, other) <= 2;
    if (exact || near) {
      hits.push({ accountId: row.accountId, brandName: row.brandName, status: row.status, match: exact ? "exact" : "near" });
    }
  }
  return hits;
}

// Public impersonation report (gap 1, 18 Aug): opens a REAL v18 case in the
// impersonation track and files the moderation task a human works through.
// The reporter is a named opener on the ledger; evidence URLs are https-only
// by the case validator. Adjudication (upheld/dismissed/enforced) stays
// entirely human — this only opens the door.
export async function openImpersonationReport({ reporterAccountId, brandName, subjectType = "brand", subjectId, evidenceUrls, note }) {
  const opened = await insertBrandCase(validateOpenCase({
    kind: "impersonation",
    brandName,
    subjectType,
    subjectId: subjectId || normalizeBrandName(brandName).slice(0, 80) || "unnamed",
    openedBy: "account:" + reporterAccountId,
    evidence: { urls: evidenceUrls, note },
  }));
  const t = validateTransition(opened, { to: "under_review", actor: "account:" + reporterAccountId });
  await applyBrandCaseTransition(opened.id, "open", t);
  await createModerationTask({
    kind: "impersonation-report",
    subjectType: "brand_case",
    subjectId: opened.id,
    payload: { brandName, reporter: reporterAccountId },
    priority: 2,
  });
  return { caseId: opened.id };
}

export async function getBusinessBySourceName(sourceName) {
  if (!sourceName) return null;
  const p = await getPool();
  if (!p) {
    for (const row of mem.businessAccounts.values()) {
      if (row.sourceName === sourceName) return { ...row };
    }
    return null;
  }
  const { rows } = await p.query("SELECT * FROM business_accounts WHERE source_name=$1", [sourceName]);
  return rows[0] ? businessRow(rows[0]) : null;
}

export async function getBusinessAccount(accountId) {
  const p = await getPool();
  if (!p) {
    const row = mem.businessAccounts.get(accountId);
    return row ? { ...row } : null;
  }
  const { rows } = await p.query("SELECT * FROM business_accounts WHERE account_id=$1", [accountId]);
  return rows[0] ? businessRow(rows[0]) : null;
}

// Submit (or resubmit) the application. A verified business never
// downgrades here — resubmitting while status='business' throws; while
// under review it refreshes the fields on the same case; after a
// rejection it opens a FRESH verification case (the old one stays in
// the ledger) and returns to review.
export async function submitBusinessApplication({ accountId, brandName, websiteUrl, shopifyDomain, statement }) {
  const existing = await getBusinessAccount(accountId);
  if (existing && existing.status === "business") {
    throw new Error("already a business account");
  }
  let caseId = existing && existing.status === "under_review" ? existing.caseId : null;
  if (!caseId) {
    const opened = await insertBrandCase(validateOpenCase({
      kind: "verification", brandName, openedBy: "account:" + accountId,
      subjectType: "profile_room", subjectId: accountId,
      evidence: { urls: [websiteUrl, "https://" + shopifyDomain], note: "business-account application" },
    }));
    const t = validateTransition(opened, { to: "under_review", actor: "account:" + accountId });
    await applyBrandCaseTransition(opened.id, "open", t);
    caseId = opened.id;
  }
  const now = Date.now();
  const p = await getPool();
  if (!p) {
    const row = {
      accountId, brandName, websiteUrl, shopifyDomain,
      statement: statement || null, status: "under_review", caseId,
      reviewNote: null, submittedAt: existing?.submittedAt || now,
      decidedAt: null, persistent: false,
    };
    mem.businessAccounts.set(accountId, row);
    return { ...row };
  }
  const { rows } = await p.query(
    `INSERT INTO business_accounts (account_id, brand_name, website_url, shopify_domain, statement, status, case_id)
     VALUES ($1,$2,$3,$4,$5,'under_review',$6)
     ON CONFLICT (account_id) DO UPDATE SET
       brand_name=$2, website_url=$3, shopify_domain=$4, statement=$5,
       status='under_review', case_id=$6, review_note=NULL, decided_at=NULL,
       updated_at=now()
     RETURNING *`,
    [accountId, brandName, websiteUrl, shopifyDomain, statement || null, caseId]);
  return businessRow(rows[0]);
}

// The human decision: drives the linked case under_review → verified |
// rejected (CAS-guarded, evidence enforced by the machine), then lands
// the account state. If a prior decide moved the case but failed before
// the row update, re-deciding completes idempotently instead of
// double-moving.
export async function decideBusinessApplication({ accountId, approve, note, actor }) {
  const row = await getBusinessAccount(accountId);
  if (!row) throw new Error("no application for that account");
  if (row.status !== "under_review") throw new Error("application is not under review");
  const kase = await getBrandCase(row.caseId);
  if (!kase) throw new Error("application case missing");
  const target = approve ? "verified" : "rejected";
  if (kase.status === "under_review") {
    const t = validateTransition(kase, {
      to: target, actor, note: note || null,
      evidence: approve ? kase.evidence : undefined,
    });
    await applyBrandCaseTransition(kase.id, "under_review", t);
  } else if (kase.status !== target) {
    throw new Error("case is not under review");
  }
  const status = approve ? "business" : "rejected";
  const now = Date.now();
  const p = await getPool();
  if (!p) {
    const next = { ...row, status, reviewNote: note || null, decidedAt: now };
    mem.businessAccounts.set(accountId, next);
    return { ...next };
  }
  const { rows } = await p.query(
    `UPDATE business_accounts
     SET status=$2, review_note=$3, decided_at=now(), updated_at=now()
     WHERE account_id=$1 RETURNING *`,
    [accountId, status, note || null]);
  return businessRow(rows[0]);
}

// The booth roster: verified businesses in verification order — first
// verified, first booth. Public callers strip account ids.
export async function listVerifiedBusinesses(limit = 10) {
  const cap = Math.max(1, Math.min(50, Math.trunc(Number(limit)) || 10));
  const p = await getPool();
  if (!p) {
    return [...mem.businessAccounts.values()]
      .filter((r) => r.status === "business")
      .sort((a, b) => (a.decidedAt || 0) - (b.decidedAt || 0))
      .slice(0, cap).map((r) => ({ ...r }));
  }
  const { rows } = await p.query(
    "SELECT * FROM business_accounts WHERE status='business' ORDER BY decided_at ASC LIMIT $1",
    [cap]);
  return rows.map(businessRow);
}

// ---- The hotlist program (P2–P4, owner build order 20 Aug 2026) ------------
// Membership + rent-paid-through ride business_accounts (v36); rent payments
// are an append-only ledger the admin desk writes (P3 is MANUAL first
// cohort — these functions are its state, not a billing engine). A booth is
// PLACEABLE while member && paid_through covers today && a source is linked.

function addOneMonthUTC(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + 1, d));
  return next.toISOString().slice(0, 10);
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function programState(row) {
  const paidThrough = row.hotlistPaidThrough || null;
  return {
    member: Boolean(row.hotlistMember),
    paidThrough,
    active: Boolean(row.hotlistMember && paidThrough && paidThrough >= todayUTC()),
  };
}

export async function hotlistProgramState(accountId) {
  const row = await getBusinessAccount(accountId);
  if (!row) return null;
  return programState(row);
}

export async function setHotlistMembership(accountId, member) {
  const row = await getBusinessAccount(accountId);
  if (!row) throw new Error("no business account");
  if (member && row.status !== "business") throw new Error("only a verified business can enroll");
  const p = await getPool();
  if (!p) {
    const next = { ...mem.businessAccounts.get(accountId), hotlistMember: Boolean(member) };
    mem.businessAccounts.set(accountId, next);
    return programState(next);
  }
  const { rows } = await p.query(
    `UPDATE business_accounts SET hotlist_member=$2, updated_at=now()
     WHERE account_id=$1 RETURNING hotlist_member, hotlist_paid_through`,
    [accountId, Boolean(member)]
  );
  return programState({
    hotlistMember: rows[0].hotlist_member,
    hotlistPaidThrough: rows[0].hotlist_paid_through
      ? String(rows[0].hotlist_paid_through).slice(0, 10) : null,
  });
}

// One rent payment = one month of coverage, in advance, appended to the
// ledger. Coverage extends from max(today, current paid-through).
export async function recordHotlistRent(accountId, { amountCents, actor = null, note = null }) {
  const row = await getBusinessAccount(accountId);
  if (!row) throw new Error("no business account");
  if (!row.hotlistMember) throw new Error("not enrolled in the hotlist program");
  const cents = Math.trunc(Number(amountCents));
  if (!(cents > 0)) throw new Error("amount_cents must be positive");
  const today = todayUTC();
  const start = row.hotlistPaidThrough && row.hotlistPaidThrough >= today
    ? row.hotlistPaidThrough
    : today;
  const end = addOneMonthUTC(start);
  const p = await getPool();
  if (!p) {
    mem.hotlistRent = mem.hotlistRent || [];
    mem.hotlistRent.push({
      accountId, amountCents: cents, periodStart: start, periodEnd: end,
      actor, note, at: Date.now(),
    });
    const next = { ...mem.businessAccounts.get(accountId), hotlistPaidThrough: end };
    mem.businessAccounts.set(accountId, next);
    return { ...programState(next), periodStart: start, periodEnd: end };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO hotlist_rent_payments (account_id, amount_cents, period_start, period_end, actor, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [accountId, cents, start, end, actor, note]
    );
    const { rows } = await client.query(
      `UPDATE business_accounts SET hotlist_paid_through=$2, updated_at=now()
       WHERE account_id=$1 RETURNING hotlist_member, hotlist_paid_through`,
      [accountId, end]
    );
    await client.query("COMMIT");
    return {
      ...programState({
        hotlistMember: rows[0].hotlist_member,
        hotlistPaidThrough: String(rows[0].hotlist_paid_through).slice(0, 10),
      }),
      periodStart: start,
      periodEnd: end,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Placeable paid booths: enrolled, rent covering today, inventory linked.
// Below-floor taste matches are filtered by the CALLER (lib/hotlist.js) —
// this is the money/state gate only.
export async function listPaidBooths() {
  const today = todayUTC();
  const p = await getPool();
  if (!p) {
    return [...mem.businessAccounts.values()]
      .filter((r) => r.status === "business" && r.hotlistMember &&
        r.hotlistPaidThrough && r.hotlistPaidThrough >= today && r.sourceName)
      .map((r) => ({
        brandName: r.brandName, websiteUrl: r.websiteUrl,
        sourceName: r.sourceName, paidThrough: r.hotlistPaidThrough,
      }));
  }
  const { rows } = await p.query(
    `SELECT brand_name, website_url, source_name, hotlist_paid_through
     FROM business_accounts
     WHERE status='business' AND hotlist_member
       AND hotlist_paid_through >= CURRENT_DATE AND source_name IS NOT NULL
     ORDER BY decided_at ASC LIMIT 10`
  );
  return rows.map((r) => ({
    brandName: r.brand_name, websiteUrl: r.website_url,
    sourceName: r.source_name, paidThrough: String(r.hotlist_paid_through).slice(0, 10),
  }));
}

export async function listBusinessApplications({ status = "under_review", limit = 50 } = {}) {
  const cap = Math.max(1, Math.min(200, Math.trunc(Number(limit)) || 50));
  const p = await getPool();
  if (!p) {
    return [...mem.businessAccounts.values()]
      .filter((r) => !status || r.status === status)
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
      .slice(0, cap).map((r) => ({ ...r }));
  }
  const { rows } = await p.query(
    `SELECT * FROM business_accounts WHERE ($1::text IS NULL OR status=$1)
     ORDER BY submitted_at DESC LIMIT $2`,
    [status, cap]);
  return rows.map(businessRow);
}

export async function listBrandCaseEvents(caseId, limit = 100) {
  const cap = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 100));
  const p = await getPool();
  if (!p) {
    return mem.brandCaseEvents.filter((e) => e.caseId === caseId).slice(-cap);
  }
  const { rows } = await p.query(
    `SELECT case_id, from_status, to_status, actor, note, at
     FROM (
       SELECT id, case_id, from_status, to_status, actor, note, at
       FROM brand_case_events
       WHERE case_id=$1
       ORDER BY at DESC, id DESC
       LIMIT $2
     ) AS recent
     ORDER BY at, id`,
    [caseId, cap]);
  return rows.map((r) => ({
    caseId: r.case_id, fromStatus: r.from_status, toStatus: r.to_status,
    actor: r.actor, note: r.note, at: r.at,
  }));
}
