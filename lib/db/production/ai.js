// lib/db/production/ai.js — THE MACHINE'S OWN RECORDS.
//
// Two adjacent layers, split out of production.js unchanged:
//
//   AI foundation (schema-v3)      what a model was asked and what it said —
//                                  analyses, style profiles, the stylist flow,
//                                  and the model-event log that makes any of
//                                  it auditable after the fact.
//   Asterisk foundation (schema-v4) what the SYSTEM believes — canonical
//                                  ontology, the dual-tag audit layer,
//                                  reconciliations, learned facts.
//
// They live together because they are the same posture from two ends: neither
// is allowed to overwrite its own history. product_ai_tags is APPEND-ONLY, and
// a learned fact carries a verification_status rather than a truth value.
// ASTERISK does not get to quietly become right about something it was wrong
// about — the earlier reading stays on the record beside the later one.
//
// Their original section banners and reasoning follow.

import { randomUUID } from "node:crypto";

import { getPool } from "../index.js";
import { mem, push, boundedLimit } from "./store.js";

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
