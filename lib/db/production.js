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
import { facetOf } from "../tagging/vocabulary.js";
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


// THE SHARED STORE AND THE CATALOG TABLES NOW LIVE BESIDE THIS FILE.
//
// production.js was 4,502 lines — the largest file in the repository and the
// one a newcomer was least able to hold in their head. It is being split by
// TABLE GROUP, one group at a time, each step verified by the full Postgres
// integration suite rather than by reading.
//
// The domain modules are re-exported here, so this module stays the single
// import point and not one caller anywhere changed. The STORE is imported but
// NOT re-exported: mem and the helpers were private before the split and stay
// private, or the split would have widened the public surface by five.
import { mem, MEM_CAP, push, boundedLimit, withOrderedUserLocks } from "./production/store.js";
export * from "./production/catalog.js";
// IMPORTED AS WELL AS RE-EXPORTED. `export *` publishes a name; it does not
// bring it into this module's scope, and the §6 export below CALLS this one.
// Re-exporting alone left it undefined at runtime while every import of it
// from outside kept working — green build, twelve red tests.
import { getUserMeasurements } from "./production/catalog.js";
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
// export did not know the subsystem existed: no dm_* table was deleted, none
// was exported, and the retention disclosure did not mention them either.
// Silence read as "erased".
//
// They are now EXPORTED (owner ruling: two people should have records) and
// still RETAINED, and those two facts are not in tension — they are the same
// fact seen from both ends. A message is also the OTHER person's record of a
// conversation they took part in: deleting one side's copy destroys somebody
// else's history, and handing one side a copy destroys nothing. So the export
// gives it to you and erasure leaves it alone, and this list says so rather
// than letting you infer it.
export const RETAINED_AFTER_ERASURE = Object.freeze([
  "purchase tickets",
  "deidentified raw event counters (eng/imp, no identity column)",
  "auth account",
  "direct messages, which are also the other person's record of a conversation they were in — retained, AND included in your export (owner ruling, 23 Aug: two people should have records)",
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

// THE MAIL DESK IS IN THE EXPORT, AND IT IS NOT IN ERASURE. BOTH ON PURPOSE.
//
// OWNER RULING, 23 August: **two people should have records.** #395 left one
// question open — whether a DM export ships at all, given that a conversation
// is two people's record and one side asking for a copy is asking for words
// the other side wrote. The answer is that both sides are IN it, so both sides
// get it. A person's own conversation is theirs to keep; the alternative is a
// record only the company holds.
//
// That breaks an assumption this file was built on. EXPORT_MANIFEST means
// "erased AND exported", and E2 enforces the second half of that biconditional
// — a manifest table that erasure never touches fails the test, because until
// now such a table could only be a mistake. A two-party record is the first
// thing that is genuinely EXPORTED AND RETAINED: erasing it would delete
// somebody else's history of a conversation they were in.
//
// So the asymmetry gets its own name rather than a hole in E2. Every dm_*
// table appears in exactly one of three places — EXPORT_MANIFEST,
// EXPORTED_BUT_RETAINED, or DM_EXPORT_STATUS — and the tests fail on a table
// in none of them, or in more than one.
export const EXPORTED_BUT_RETAINED = Object.freeze({
  dm_conversations: "the conversation itself — the other person was in it too",
  dm_participants: "your side of it: folder, read position, mute, media consent",
  dm_messages: "what was said, by both people, through the SAME visibility rule the thread renders by",
  dm_reactions: "the marks left on those messages",
  dm_blocks: "who you blocked and why — erasing it would silently reopen a door you closed",
  dm_settings: "your door and your activity signals — both DEFAULT TO OPEN, so erasing the row is not neutral: it silently reopens what you closed",
});

// Still absent, and still with a reason.
export const DM_EXPORT_STATUS = Object.freeze({
  dm_typing: "presence with a six-second expiry — it says nothing about what was said, and it is gone before an export could read it",
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
  // The mail desk. Conversations and blocks are small; messages are the only
  // list here that a heavy user can genuinely fill, so it gets the largest cap
  // in the export — and, like every other one, it reports when it hits it.
  dmConversations: 500,
  dmMessages: 5000,
  dmBlocks: 500,
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
    // The other half of the profileRoom domain the manifest has always
    // declared — see the read below.
    profileAccount: null,
    // The mail desk (owner ruling: two people should have records). Filled in
    // below — `store` says which of the three answers this is, because "no
    // messages" and "the store could not be read" are different facts and the
    // desk itself already refuses to conflate them.
    messages: { store: "none", conversations: bounded([], EXPORT_CAPS.dmConversations),
      items: bounded([], EXPORT_CAPS.dmMessages), blocks: bounded([], EXPORT_CAPS.dmBlocks),
      settings: null },
  };

  const counts = { corroboration: { edges: 0, popularity: 0, researchVotes: 0 },
    internal: { operations: 0, adoptions: 0 } };

  if (!p) {
    // MEM MODE HAS NO MESSAGING AT ALL — lib/db/dm.js refuses rather than
    // mirroring the laws in JS, which is the whole reason that module exists.
    // Reporting an empty inbox here would be the exact mem-vs-Postgres lie it
    // was built to prevent, so the export says the store is unavailable.
    data.messages.store = "unavailable";
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
    const [searches, requests, aiEvents, editorial, interp, room, account, corro, internal] = await Promise.all([
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
      // DECLARED IN THE MANIFEST SINCE THE MANIFEST EXISTED, AND NEVER READ.
      // `user_profiles` maps to the profileRoom domain and only profile_rooms
      // was ever selected — so the export claimed a table it did not deliver,
      // and E1/E2 could not see it: both diff purge's DELETE list against the
      // manifest, and neither compares the manifest against what the export
      // actually READS. Found while adding the mail desk to the same file.
      // It keys on `id`, not account_id (supabase/schema.sql:15-16) — which is
      // also how purge addresses it.
      accountId
        ? q("SELECT * FROM user_profiles WHERE id=$1::uuid", [accountId])
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
    // Both halves of the profileRoom domain, which is what the manifest has
    // always claimed: the room is the published page, the account row is the
    // handle and display name behind it.
    data.profileRoom = room.rows[0] || null;
    data.profileAccount = account.rows[0] || null;
    counts.corroboration = {
      edges: corro.rows[0].edges, popularity: corro.rows[0].popularity,
      researchVotes: corro.rows[0].votes,
    };
    counts.internal = {
      operations: internal.rows[0].operations, adoptions: internal.rows[0].adoptions,
    };

    // THE MAIL DESK. Only an ACCOUNT can hold a conversation — the DM tables
    // key on the bare auth uuid (ADR-002) and a device identity can never own
    // one, so a device export says "none" rather than reporting a failure it
    // did not have.
    if (accountId) {
      try {
        const { exportMessagesFor } = await import("./dm.js");
        // NOT gated on messagingEnabled(). An access right is not a feature:
        // the flag decides whether the desk is open, not whether a person may
        // have the record of what was already said there. Stated because it is
        // the kind of omission that reads as an oversight.
        const desk = await exportMessagesFor(accountId, {
          conversations: EXPORT_CAPS.dmConversations,
          messages: EXPORT_CAPS.dmMessages,
          blocks: EXPORT_CAPS.dmBlocks,
        }, { queryTarget });
        // `bounded()` computes truncation as `rows.length >= cap`, which is
        // right for a list fed by ONE cap. The mail desk has two: conversations
        // are limited first, and messages are read only for the survivors — so
        // an account past the conversation cap loses whole conversations' worth
        // of messages while the message list sits far below its own cap, and
        // `rows.length >= cap` reported `false`. The store now says WHICH cap
        // bit, and that answer is used instead of re-deriving it here.
        const cut = desk.truncated;
        data.messages = {
          store: "read",
          conversations: { ...bounded(desk.conversations, EXPORT_CAPS.dmConversations),
            truncated: cut.conversations },
          items: { ...bounded(desk.messages, EXPORT_CAPS.dmMessages),
            truncated: cut.messages },
          blocks: { ...bounded(desk.blocks, EXPORT_CAPS.dmBlocks), truncated: cut.blocks },
          settings: desk.settings,
          // Which end of the history a truncation took, not merely that one
          // happened — the cap is global and newest-first.
          oldestExportedMessageId: desk.oldestExportedMessageId,
        };
      } catch {
        // A read that FAILS must not render as empty. That rule is already
        // written on the mail desk itself ("A read that FAILS shows a fault
        // marker, never 0"), and an export is the one place a false empty
        // would read as "you have no messages" to somebody exercising an
        // access right.
        data.messages.store = "unreadable";
      }
    }
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

export * from "./production/editorial.js";
// Imported as well as re-exported: `export *` publishes these names but
// does not bind them here, and the code still in this file CALLS them.
import { listMoodBoardUploads, listStylistOutfits } from "./production/editorial.js";
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

export { createModerationTask, listModerationTasks, resolveModerationTask } from "./production/moderation.js";
import { createModerationTask, insertModerationTask, moderationTaskRow } from "./production/moderation.js";

export * from "./production/corrections.js";
// Imported as well as re-exported: `export *` publishes these names but
// does not bind them here, and the code still in this file CALLS them.
import { listUserCorrections } from "./production/corrections.js";
export * from "./production/interpretation.js";
// Imported as well as re-exported: `export *` publishes these names but
// does not bind them here, and the code still in this file CALLS them.
import { applyBrandCaseTransition, getBrandCase, getMemoryPreferences, getRailPrefs, insertBrandCase, listFollows, listWardrobeItems } from "./production/interpretation.js";
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
