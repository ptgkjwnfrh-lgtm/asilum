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
import { getPool, normalizeEvent, memRecordEvent, EVENT_INSERT_SQL } from "./index.js";

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
  seq: 1,
};
const MEM_CAP = 2000;
function push(arr, row) { arr.push(row); if (arr.length > MEM_CAP) arr.splice(0, arr.length - MEM_CAP); return row; }

export async function isPersistent() {
  return !!(await getPool());
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
  for (const t of clean) {
    await p.query(
      `INSERT INTO product_tags (product_id, tag, tag_type, confidence, source)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (product_id, tag, tag_type)
       DO UPDATE SET confidence = GREATEST(product_tags.confidence, EXCLUDED.confidence)`,
      [productId, t.tag, t.tagType, t.confidence, t.source]
    );
  }
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
  for (const im of clean) {
    await p.query(
      `INSERT INTO product_images (product_id, image_url, alt_text, position, source_image_url)
       VALUES ($1,$2,$3,$4,$5)`,
      [productId, im.imageUrl, im.altText, im.position, im.sourceImageUrl]
    );
  }
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
    shippingName: t.shippingName || null,
    notes: t.notes || null,
  };
  const p = await getPool();
  if (!p) return push(mem.tickets, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  const { rows } = await p.query(
    `INSERT INTO purchase_tickets
       (user_id, product_id, source_name, source_product_id, source_product_url,
        status, item_price_at_request, availability_status, shipping_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, created_at`,
    [row.userId, row.productId, row.sourceName, row.sourceProductId, row.sourceProductUrl,
     row.status, row.itemPriceAtRequest, row.availabilityStatus, row.shippingName, row.notes]
  );
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
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

function ticketRow(r) {
  return {
    id: r.id, userId: r.user_id, productId: r.product_id, sourceName: r.source_name,
    sourceProductUrl: r.source_product_url, status: r.status,
    itemPriceAtRequest: r.item_price_at_request == null ? null : Number(r.item_price_at_request),
    currentPriceChecked: r.current_price_checked == null ? null : Number(r.current_price_checked),
    availabilityStatus: r.availability_status,
    consented: !!r.user_consent_timestamp,
    createdAt: new Date(r.created_at).getTime(),
    persistent: true,
  };
}

export async function listTickets(userId, limit = 50) {
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
   ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
   RETURNING id, created_at`;

const uploadParams = (row, idemKey = null) =>
  [row.userId, row.boardId, row.imageUrl, row.caption, row.source,
   JSON.stringify(row.colors), JSON.stringify(row.tags), row.styleNotes, row.analyzedBy, idemKey];

// The idempotency column postdates the applied schema-v2 — ensure it lazily
// (idempotent DDL, memoized per process; also in schema-v2.sql for fresh DBs).
let idemColumnReady = null;
function ensureIdemColumn(p) {
  if (!idemColumnReady) {
    idemColumnReady = p
      .query("ALTER TABLE mood_board_uploads ADD COLUMN IF NOT EXISTS idempotency_key TEXT")
      .then(() => p.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS mood_board_uploads_idem
           ON mood_board_uploads (idempotency_key) WHERE idempotency_key IS NOT NULL`))
      .catch((e) => { idemColumnReady = null; throw e; });
  }
  return idemColumnReady;
}

export async function createMoodBoardUpload(u) {
  const row = buildUploadRow(u);
  const p = await getPool();
  if (!p) return push(mem.uploads, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  await ensureIdemColumn(p);
  const { rows } = await p.query(UPLOAD_INSERT_SQL, uploadParams(row));
  return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
}

// Upload + its canonical event in ONE transaction (a failed write leaves
// neither behind), and IDEMPOTENT under client retries: when `idemKey` is
// supplied and a commit already succeeded but the response was lost, the
// retry conflicts on the unique key, writes nothing (no duplicate event),
// and returns the ORIGINAL upload marked duplicate:true. Memory mode mirrors
// the same dedupe. (Codex re-review of #13.)
export async function createMoodBoardUploadWithEvent(u, evt, idemKey = null) {
  const row = buildUploadRow(u);
  const n = normalizeEvent(evt);
  const p = await getPool();
  if (!p) {
    if (idemKey) {
      const existing = mem.uploads.find((x) => x.idempotencyKey === idemKey);
      if (existing) return { ...existing, duplicate: true };
    }
    memRecordEvent(n);
    return push(mem.uploads, {
      id: mem.seq++, ...row, idempotencyKey: idemKey || null,
      createdAt: Date.now(), persistent: false,
    });
  }
  await ensureIdemColumn(p);
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // Upload first: with an idempotency conflict nothing is written, so the
    // event insert below is reached only for genuinely new uploads.
    const { rows } = await client.query(UPLOAD_INSERT_SQL, uploadParams(row, idemKey));
    if (!rows.length) {
      await client.query("ROLLBACK");
      const prior = await p.query(
        "SELECT id, created_at FROM mood_board_uploads WHERE idempotency_key = $1", [idemKey]);
      if (!prior.rows.length) throw new Error("idempotency conflict without prior row");
      return {
        id: prior.rows[0].id, ...row, duplicate: true,
        createdAt: new Date(prior.rows[0].created_at).getTime(), persistent: true,
      };
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
  const p = await getPool();
  if (!p) return mem.uploads.filter((x) => x.userId === userId).slice(-limit).reverse();
  const { rows } = await p.query(
    "SELECT * FROM mood_board_uploads WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, boardId: r.board_id, imageUrl: r.image_url,
    caption: r.caption, source: r.source, colors: r.colors || [], tags: r.tags || [],
    styleNotes: r.style_notes, analyzedBy: r.analyzed_by,
    createdAt: new Date(r.created_at).getTime(), persistent: true,
  }));
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

export async function updateLearnedFactStatus(id, status, reviewedBy = null) {
  const p = await getPool();
  if (!p) {
    const f = mem.facts.find((x) => x.id === id);
    if (!f) return null;
    f.verificationStatus = status;
    if (reviewedBy) f.reviewedBy = reviewedBy;
    return f;
  }
  const { rows } = await p.query(
    `UPDATE learned_facts SET verification_status=$2,
       reviewed_by=COALESCE($3, reviewed_by), updated_at=now()
     WHERE id=$1 RETURNING *`, [id, status, reviewedBy]);
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
});

export async function listLearnedFacts({ id = null, entityType = null, entityId = null,
                                         status = null, limit = 100 } = {}) {
  const p = await getPool();
  if (!p) {
    return mem.facts.filter((f) =>
      (!id || f.id === id) && (!entityType || f.entityType === entityType) &&
      (!entityId || f.entityId === entityId) &&
      (!status || f.verificationStatus === status)).slice(-limit).reverse();
  }
  const { rows } = await p.query(
    `SELECT * FROM learned_facts
     WHERE ($1::text IS NULL OR id=$1) AND ($2::text IS NULL OR entity_type=$2)
       AND ($3::text IS NULL OR entity_id=$3) AND ($4::text IS NULL OR verification_status=$4)
     ORDER BY created_at DESC LIMIT $5`, [id, entityType, entityId, status, limit]);
  return rows.map(factRow);
}

export async function createModerationTask(t) {
  const row = {
    id: "mod-" + randomUUID(),
    kind: String(t.kind).slice(0, 40), subjectType: String(t.subjectType).slice(0, 40),
    subjectId: String(t.subjectId).slice(0, 80), payload: t.payload || {},
    priority: ["low", "normal", "high"].includes(t.priority) ? t.priority : "normal",
    status: "open", resolution: null, resolvedBy: null,
  };
  const p = await getPool();
  if (!p) return push(mem.moderationTasks, { ...row, createdAt: Date.now(), persistent: false });
  await p.query(
    `INSERT INTO moderation_tasks (id, kind, subject_type, subject_id, payload, priority)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.id, row.kind, row.subjectType, row.subjectId, JSON.stringify(row.payload), row.priority]
  );
  return { ...row, persistent: true };
}

export async function listModerationTasks({ status = "open", limit = 100 } = {}) {
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

export async function createUserCorrectionWithEvent(c, evt) {
  const row = {
    userId: String(c.userId).slice(0, 80),
    productId: c.productId ? String(c.productId).slice(0, 80) : null,
    brand: c.brand ? String(c.brand).slice(0, 120) : null,
    code: String(c.code).slice(0, 40),
    tags: (c.tags || []).map(String).slice(0, 8),
    note: c.note ? String(c.note).slice(0, 300) : null,
  };
  const n = normalizeEvent(evt);
  const p = await getPool();
  if (!p) {
    memRecordEvent(n);
    return push(mem.corrections, { id: mem.seq++, ...row, createdAt: Date.now(), persistent: false });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(EVENT_INSERT_SQL, [n.userId, n.type, n.payloadJson, n.at]);
    const { rows } = await client.query(
      `INSERT INTO user_corrections (user_id, product_id, brand, code, tags, note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
      [row.userId, row.productId, row.brand, row.code, JSON.stringify(row.tags), row.note]
    );
    await client.query("COMMIT");
    return { id: rows[0].id, ...row, createdAt: new Date(rows[0].created_at).getTime(), persistent: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function listUserCorrections(userId, limit = 200) {
  const p = await getPool();
  if (!p) return mem.corrections.filter((x) => x.userId === userId).slice(-limit).reverse();
  const { rows } = await p.query(
    `SELECT * FROM user_corrections WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]);
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, productId: r.product_id, brand: r.brand,
    code: r.code, tags: r.tags || [], note: r.note,
    createdAt: new Date(r.created_at).getTime(),
  }));
}
