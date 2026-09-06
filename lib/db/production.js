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

export * from "./production/privacy.js";
// Imported as well as re-exported: `export *` publishes these names but
// does not bind them here, and the code still in this file CALLS them.
import { RETAINED_AFTER_ERASURE } from "./production/privacy.js";

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
export * from "./production/ai.js";

export { createModerationTask, listModerationTasks, resolveModerationTask } from "./production/moderation.js";
import { createModerationTask, listModerationTasks, resolveModerationTask, insertModerationTask, moderationTaskRow } from "./production/moderation.js";

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
