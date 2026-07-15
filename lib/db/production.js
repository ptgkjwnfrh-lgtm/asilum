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
  purgeMemoryUserData, adoptMemoryCoreData,
} from "./index.js";
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
  memoryPreferences: new Map(), // userId -> {hiddenSections, updatedAt} (v14)
  follows: [], // {userId, kind, target, createdAt} (v14; brand/user only)
  wardrobe: [], // wardrobe_items rows, snake_case (v15)
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

export async function isPersistent() {
  return !!(await getPool());
}

// Delete user-linked personalization records while retaining purchase tickets
// and consent records. Aggregate popularity/edge weights are deidentified and
// cannot be reliably subtracted, so they remain. The return value is explicit
// about both categories instead of promising impossible total erasure.
export async function purgePersonalizationData(userId) {
  if (!userId) throw new TypeError("userId required");
  const p = await getPool();
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
    return { persistent: false, retained: ["purchase tickets", "deidentified aggregate item statistics", "auth account"] };
  }
  const client = await p.connect();
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
    await client.query("DELETE FROM profiles WHERE user_id=$1", [userId]);
    // The app namespaces authenticated identities as `sb-<auth uuid>` in its
    // server-owned tables. The original MVP profile uses the raw auth UUID and
    // cascades to legacy saved_items, so remove that row explicitly as well.
    if (/^sb-[0-9a-f-]{36}$/i.test(userId)) {
      await client.query("DELETE FROM user_profiles WHERE id=$1::uuid", [userId.slice(3)]);
    }
    await client.query("COMMIT");
    return { persistent: true, retained: ["purchase tickets", "deidentified aggregate item statistics", "auth account"] };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
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

export async function logSearch({ userId = null, query, interpreted = {}, resultCount = 0 }) {
  if (!query) return;
  const p = await getPool();
  if (!p) { push(mem.searchLogs, { userId, query, interpreted, resultCount, at: Date.now() }); return; }
  await p.query(
    "INSERT INTO search_logs (user_id, query, interpreted, result_count) VALUES ($1,$2,$3,$4)",
    [userId, String(query).slice(0, 200), JSON.stringify(interpreted), resultCount]
  );
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
    if (existing) return { ...existing, duplicate: true };
    return push(mem.tickets, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false, duplicate: false });
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
    return t;
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
    return ticket;
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
    return { ticket, duplicate };
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
  if (!p) return mem.tickets.filter((t) => t.userId === userId).slice(-limit).reverse();
  const { rows } = await p.query(
    "SELECT * FROM purchase_tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map(ticketRow);
}

export async function getTicket(id) {
  const p = await getPool();
  if (!p) return mem.tickets.find((t) => t.id === Number(id)) || null;
  const { rows } = await p.query("SELECT * FROM purchase_tickets WHERE id=$1", [id]);
  return rows[0] ? ticketRow(rows[0]) : null;
}

// ---- editorial posts -------------------------------------------------------------

export async function createEditorialPost(post) {
  const row = {
    authorId: post.authorId || null,
    authorHandle: String(post.authorHandle || "anonymous").slice(0, 80),
    kind: ["user", "asilum", "article"].includes(post.kind) ? post.kind : "user",
    title: post.title ? String(post.title).slice(0, 200) : null,
    body: post.body ? String(post.body).slice(0, 2000) : null,
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
       (author_id, author_handle, kind, title, body, excerpt, image_url, external_url, tags, designer_refs, product_refs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
    [row.authorId, row.authorHandle, row.kind, row.title, row.body, row.excerpt, row.imageUrl,
     row.externalUrl, JSON.stringify(row.tags), JSON.stringify(row.designerRefs), JSON.stringify(row.productRefs)]
  );
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

export async function listEditorialPosts({ kind = null, limit = 60 } = {}) {
  limit = boundedLimit(limit, 60, 200);
  const p = await getPool();
  if (!p) {
    return mem.posts.filter((x) => (!kind || x.kind === kind)).slice(-limit).reverse();
  }
  const { rows } = await p.query(
    `SELECT * FROM editorial_posts
     WHERE moderation_status='visible' AND ($1::text IS NULL OR kind=$1)
     ORDER BY created_at DESC LIMIT $2`,
    [kind, limit]
  );
  return rows.map((r) => ({
    id: r.id, authorId: r.author_id, authorHandle: r.author_handle, kind: r.kind,
    title: r.title, body: r.body, excerpt: r.excerpt, imageUrl: r.image_url,
    externalUrl: r.external_url, tags: r.tags || [], designerRefs: r.designer_refs || [],
    productRefs: r.product_refs || [], createdAt: new Date(r.created_at).getTime(), persistent: true,
  }));
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

export async function createModerationTask(t) {
  const row = moderationTaskRow(t);
  const p = await getPool();
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

function mergeTasteProfiles(targetRaw, sourceRaw) {
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
      if (Number.isFinite(a) && Number.isFinite(b)) merged[key] = Math.max(-1, Math.min(1, (a + b) / 2));
      else if (Number.isFinite(a)) merged[key] = a;
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
  return {
    long: mergeVector(target.long, source.long),
    session: mergeVector(target.session, source.session),
    _meta: {
      ...source._meta, ...target._meta,
      recent: mergeRing("recent", 30), seen: mergeRing("seen", 200),
      activity: mergeRing("activity", 30), looksSeen: mergeRing("looksSeen", 300),
      follows: mergeRing("follows", 100),
      lastActive: Math.max(Number(target._meta.lastActive) || 0, Number(source._meta.lastActive) || 0) || undefined,
    },
  };
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
        await saveProfile(toUserId, mergeTasteProfiles(targetProfile, sourceProfile));
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
        (SELECT count(*) FROM purchase_tickets WHERE user_id=$1)
      )::int AS n`,
      [fromUserId]
    );
    const newSignals = sourceProfile.rowCount > 0 || sourceBoards.rowCount > 0 ||
      (correctionCount.rows[0]?.n || 0) > 0 || (linkedCount.rows[0]?.n || 0) > 0;
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
      const merged = mergeTasteProfiles(targetProfile.rows[0]?.vec || {}, sourceProfile.rows[0].vec);
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
      `INSERT INTO asterisk_memory_preferences (user_id,hidden_sections,updated_at)
       SELECT $2,hidden_sections,updated_at FROM asterisk_memory_preferences WHERE user_id=$1
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

export async function recordInterpretationFeedback({ userId, normalizedQuery, interpretationId, contractVersion, verdict }) {
  const p = await getPool();
  if (!p) {
    const existing = mem.interpretationFeedback.find((f) =>
      f.user_id === userId && f.normalized_query === normalizedQuery && f.interpretation_id === interpretationId);
    if (existing) { existing.verdict = verdict; return feedbackRow(existing); }
    const row = { user_id: userId, normalized_query: normalizedQuery,
      interpretation_id: interpretationId, contract_version: contractVersion,
      verdict, created_at: Date.now() };
    push(mem.interpretationFeedback, row);
    return feedbackRow(row);
  }
  const { rows } = await p.query(
    `INSERT INTO interpretation_feedback (user_id, normalized_query, interpretation_id, contract_version, verdict)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, normalized_query, interpretation_id)
       DO UPDATE SET verdict=EXCLUDED.verdict, contract_version=EXCLUDED.contract_version
     RETURNING *`,
    [userId, normalizedQuery, interpretationId, contractVersion, verdict]);
  return feedbackRow(rows[0]);
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

// ── Asterisk memory surface (v14) ─────────────────────────────────────────
// asterisk_memory_preferences: the ONLY write domain the memory facade owns
// (ADR-001 rule 3) — section visibility, never taste. user_follows: brand and
// user follows graduated from localStorage; board follows stay on the profile.

export const MEMORY_FOLLOW_KINDS = new Set(["brand", "user"]);
const FOLLOWS_CAP = 50;
const MEMORY_PREFERENCE_SECTIONS = new Set(["explicit", "inferred", "global", "uncertainty"]);

export async function getMemoryPreferences(userId) {
  const p = await getPool();
  if (!p) return { hiddenSections: [...(mem.memoryPreferences.get(userId)?.hiddenSections || [])] };
  const { rows } = await p.query(
    "SELECT hidden_sections FROM asterisk_memory_preferences WHERE user_id=$1", [userId]);
  return { hiddenSections: Array.isArray(rows[0]?.hidden_sections) ? rows[0].hidden_sections : [] };
}

export async function saveMemoryPreferences(userId, hiddenSections) {
  if (!userId || !Array.isArray(hiddenSections)) throw new TypeError("userId and hiddenSections[] required");
  if (hiddenSections.length > MEMORY_PREFERENCE_SECTIONS.size ||
      new Set(hiddenSections).size !== hiddenSections.length ||
      !hiddenSections.every((section) => MEMORY_PREFERENCE_SECTIONS.has(section))) {
    throw new TypeError("hiddenSections contains an invalid or duplicate section");
  }
  const p = await getPool();
  if (!p) {
    mem.memoryPreferences.set(userId, { hiddenSections: [...hiddenSections], updatedAt: Date.now() });
    return { hiddenSections: [...hiddenSections] };
  }
  const { rows } = await p.query(
    `INSERT INTO asterisk_memory_preferences (user_id,hidden_sections,updated_at)
     VALUES ($1,$2::jsonb,now())
     ON CONFLICT (user_id) DO UPDATE SET hidden_sections=EXCLUDED.hidden_sections, updated_at=now()
     RETURNING hidden_sections`,
    [userId, JSON.stringify(hiddenSections)]);
  return { hiddenSections: rows[0].hidden_sections };
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

export async function getWardrobeItem(userId, id) {
  const p = await getPool();
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

export async function deleteWardrobeItem(userId, id) {
  const p = await getPool();
  if (!p) {
    const before = mem.wardrobe.length;
    mem.wardrobe = mem.wardrobe.filter((w) => !(w.user_id === userId && String(w.id) === String(id)));
    return mem.wardrobe.length < before;
  }
  if (!/^\d{1,18}$/.test(String(id))) return false;
  const r = await p.query("DELETE FROM wardrobe_items WHERE user_id=$1 AND id=$2", [userId, id]);
  return r.rowCount > 0;
}
