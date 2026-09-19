// Revision-pinned Wikipedia overview persistence (v54).
//
// Memory mode is seeded by the checked-in population artifact. PostgreSQL is
// the operational source once DATABASE_URL is present. Both paths expose the
// same DTOs, preserve a last-known-good paragraph through transient failures,
// and use leased jobs for resumable discovery/refresh work.

import { getPool } from "../core/pool.js";
import { mem, boundedLimit, push } from "./store.js";
import IMPORTED from "../../../data/wikipedia-overviews.json" with { type: "json" };
import {
  foldEntityName, normalizeEntityRow, normalizeOverviewRow, validateOverviewRecord,
} from "../../people/wikipedia/contract.js";

let memorySeeded = false;
const overviewKey = (entityId, language) => `${entityId}|${language}`;
const evidenceKey = (entityId, sourceKey, url) => `${entityId}|${sourceKey}|${url}`;

function seedMemory() {
  if (memorySeeded) return;
  memorySeeded = true;
  for (const raw of IMPORTED.entities || []) {
    const entity = normalizeEntityRow(raw);
    if (entity?.id) mem.fashionEntities.set(entity.id, entity);
  }
  for (const raw of IMPORTED.overviews || []) {
    const overview = normalizeOverviewRow(raw);
    if (overview?.entityId && overview?.language) mem.wikipediaOverviews.set(overviewKey(overview.entityId, overview.language), overview);
  }
  for (const edge of IMPORTED.relationships || []) if (edge?.id) mem.fashionRelationships.set(edge.id, { ...edge });
  for (const review of IMPORTED.reviews || []) if (review?.id) mem.wikipediaReviews.set(String(review.id), { ...review });
}

function aliasesOf(entity) {
  return [...new Set([entity.canonicalName, ...(entity.aliases || [])].map(String).map((value) => value.trim()).filter(Boolean))];
}

function entityDbRow(entity) {
  return {
    id: entity.id, kind: entity.kind, canonical_name: entity.canonicalName,
    aliases: entity.aliases || [], wikidata_qid: entity.wikidataQid,
    match_status: entity.matchStatus, public_status: entity.publicStatus,
    preferred_language: entity.preferredLanguage, review_reason: entity.reviewReason,
    created_at: entity.createdAt, updated_at: entity.updatedAt,
  };
}

export async function upsertFashionEntity(input) {
  const entity = normalizeEntityRow(input);
  if (!entity?.id || !["designer", "house"].includes(entity.kind) || !entity.canonicalName) throw new TypeError("valid fashion entity required");
  if (entity.wikidataQid && !/^Q[1-9][0-9]*$/.test(entity.wikidataQid)) throw new TypeError("invalid Wikidata QID");
  const now = new Date().toISOString();
  let next = { ...entity, aliases: aliasesOf(entity), createdAt: entity.createdAt || now, updatedAt: now };
  const p = await getPool();
  if (!p) {
    seedMemory();
    const existing = next.wikidataQid
      ? [...mem.fashionEntities.values()].find((row) => row.kind === next.kind && row.wikidataQid === next.wikidataQid)
      : null;
    if (existing) next = { ...next, id: existing.id, aliases: [...new Set([...existing.aliases, ...next.aliases])] };
    mem.fashionEntities.set(next.id, next);
    return { ...next, aliases: [...next.aliases] };
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    if (next.wikidataQid) {
      const existing = await client.query("SELECT id FROM fashion_entities WHERE kind=$1 AND wikidata_qid=$2 FOR UPDATE", [next.kind,next.wikidataQid]);
      if (existing.rows[0]?.id) next = { ...next, id: existing.rows[0].id };
    }
    const { rows } = await client.query(
      `INSERT INTO fashion_entities
        (id,kind,canonical_name,wikidata_qid,match_status,public_status,preferred_language,review_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,canonical_name=EXCLUDED.canonical_name,
         wikidata_qid=EXCLUDED.wikidata_qid,match_status=EXCLUDED.match_status,
         public_status=EXCLUDED.public_status,preferred_language=EXCLUDED.preferred_language,
         review_reason=EXCLUDED.review_reason,updated_at=now()
       RETURNING *`,
      [next.id,next.kind,next.canonicalName,next.wikidataQid,next.matchStatus,next.publicStatus,next.preferredLanguage,next.reviewReason]
    );
    for (const alias of next.aliases) {
      await client.query(
        `INSERT INTO fashion_entity_aliases (entity_id,alias,alias_folded,language,source)
         VALUES ($1,$2,$3,$4,'wikipedia-import')
         ON CONFLICT (entity_id,alias_folded) DO UPDATE SET alias=EXCLUDED.alias,language=EXCLUDED.language`,
        [next.id, alias, foldEntityName(alias), next.preferredLanguage]
      );
    }
    await client.query("COMMIT");
    return normalizeEntityRow({ ...rows[0], aliases: next.aliases });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function getFashionEntity(id) {
  const p = await getPool();
  if (!p) { seedMemory(); const row = mem.fashionEntities.get(id); return row ? { ...row, aliases: [...row.aliases] } : null; }
  const { rows } = await p.query(
    `SELECT e.*,COALESCE(jsonb_agg(a.alias ORDER BY a.alias) FILTER (WHERE a.id IS NOT NULL),'[]'::jsonb) AS aliases
     FROM fashion_entities e LEFT JOIN fashion_entity_aliases a ON a.entity_id=e.id
     WHERE e.id=$1 GROUP BY e.id`, [id]
  );
  return normalizeEntityRow(rows[0]);
}

export async function findFashionEntityByName(name, kind = null) {
  const folded = foldEntityName(name);
  if (!folded) return null;
  const p = await getPool();
  if (!p) {
    seedMemory();
    const matches = [...mem.fashionEntities.values()].filter((row) =>
      (!kind || row.kind === kind) && aliasesOf(row).some((alias) => foldEntityName(alias) === folded));
    return matches.length === 1 ? { ...matches[0], aliases: [...matches[0].aliases] } : null;
  }
  const { rows } = await p.query(
    `SELECT e.*,jsonb_agg(DISTINCT all_alias.alias) AS aliases
     FROM fashion_entities e
     JOIN fashion_entity_aliases matched ON matched.entity_id=e.id AND matched.alias_folded=$1
     LEFT JOIN fashion_entity_aliases all_alias ON all_alias.entity_id=e.id
     WHERE ($2::text IS NULL OR e.kind=$2)
     GROUP BY e.id ORDER BY e.id LIMIT 2`, [folded, kind]
  );
  return rows.length === 1 ? normalizeEntityRow(rows[0]) : null;
}

export async function getWikipediaOverview(entityId, language = null) {
  const entity = await getFashionEntity(entityId);
  if (!entity) return null;
  const preferred = language || entity.preferredLanguage || "en";
  const p = await getPool();
  if (!p) {
    seedMemory();
    const exact = mem.wikipediaOverviews.get(overviewKey(entityId, preferred));
    const any = exact?.status === "published"
      ? exact
      : [...mem.wikipediaOverviews.values()].find((row) => row.entityId === entityId && row.status === "published") || exact;
    return any ? normalizeOverviewRow(any) : null;
  }
  const { rows } = await p.query(
    `SELECT * FROM wikipedia_overviews WHERE entity_id=$1
     ORDER BY (status='published') DESC,(language=$2) DESC,checked_at DESC LIMIT 1`, [entityId, preferred]
  );
  return normalizeOverviewRow(rows[0]);
}

function suspiciousChange(previous, next) {
  if (!previous) return null;
  if (previous.pageId !== next.pageId) return "page identity changed";
  const ratio = next.renderedText.length / Math.max(1, previous.renderedText.length);
  if (ratio > 3 || ratio < 0.34) return "lead paragraph length changed sharply";
  return null;
}

export async function upsertWikipediaOverview(entityInput, overviewInput, {
  forceReview = false, operatorApproved = false, auditDetails = {},
} = {}) {
  const validated = validateOverviewRecord({ entity: entityInput, overview: overviewInput });
  if (!validated.ok) { const error = new TypeError(`invalid Wikipedia overview: ${validated.reasons.join(", ")}`); error.reasons = validated.reasons; throw error; }
  // Resolve a pre-existing (kind,QID) identity before looking for its prior
  // paragraph. Otherwise an alternate slug can miss the last-known-good row
  // and bypass suspicious-change quarantine.
  let entity = await upsertFashionEntity(validated.entity);
  let overview = { ...validated.overview, entityId: entity.id };
  const previous = await getWikipediaOverview(entity.id, overview.language);
  const reviewReason = forceReview
    ? "operator requested review"
    : operatorApproved ? null : suspiciousChange(previous, overview);
  if (reviewReason) {
    entity = { ...entity, publicStatus: previous?.status === "published" ? "published" : "review", reviewReason };
    overview = { ...overview, status: "review" };
    // A suspicious refresh is evidence for an operator, not permission to
    // replace the public record. Keep serving the last known good paragraph.
    if (previous?.status === "published") {
      entity = await upsertFashionEntity(entity);
      await createWikipediaReview({ entityId: entity.id, reason: reviewReason, candidate: overview });
      await recordWikipediaAudit({ entityId: entity.id, action: "overview_update_quarantined", previousRevisionId: previous.revisionId, nextRevisionId: overview.revisionId, details: { reviewReason } });
      return { entity, overview: previous, candidate: overview, previous, quarantined: true };
    }
  }
  if (reviewReason) entity = await upsertFashionEntity(entity);
  if (reviewReason) await createWikipediaReview({ entityId: entity.id, reason: reviewReason, candidate: overview });
  const p = await getPool();
  if (!p) {
    seedMemory();
    mem.wikipediaOverviews.set(overviewKey(entity.id, overview.language), { ...overview });
    await recordWikipediaAudit({
      entityId: entity.id,
      action: operatorApproved ? "operator_mapping_applied" : previous ? "overview_updated" : "overview_imported",
      previousRevisionId: previous?.revisionId,
      nextRevisionId: overview.revisionId,
      details: { reviewReason, operatorApproved, ...auditDetails },
    });
    return { entity, overview: { ...overview }, previous };
  }
  const { rows } = await p.query(
    `INSERT INTO wikipedia_overviews
      (entity_id,language,page_id,canonical_title,canonical_url,redirect_from,revision_id,revision_timestamp,
       source_paragraph,rendered_text,paragraph_selector,extractor_version,content_hash,attribution_label,
       text_license,text_license_url,editorial_modifications,image,status,checked_at,fetched_at,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20,$21,$22)
     ON CONFLICT (entity_id,language) DO UPDATE SET
       page_id=EXCLUDED.page_id,canonical_title=EXCLUDED.canonical_title,canonical_url=EXCLUDED.canonical_url,
       redirect_from=EXCLUDED.redirect_from,revision_id=EXCLUDED.revision_id,revision_timestamp=EXCLUDED.revision_timestamp,
       source_paragraph=EXCLUDED.source_paragraph,rendered_text=EXCLUDED.rendered_text,
       paragraph_selector=EXCLUDED.paragraph_selector,extractor_version=EXCLUDED.extractor_version,
       content_hash=EXCLUDED.content_hash,attribution_label=EXCLUDED.attribution_label,
       text_license=EXCLUDED.text_license,text_license_url=EXCLUDED.text_license_url,
       editorial_modifications=EXCLUDED.editorial_modifications,image=EXCLUDED.image,status=EXCLUDED.status,
       checked_at=EXCLUDED.checked_at,fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at,updated_at=now()
     RETURNING *`,
    [entity.id,overview.language,overview.pageId,overview.canonicalTitle,overview.canonicalUrl,
      JSON.stringify(overview.redirectFrom || []),overview.revisionId,overview.revisionTimestamp,
      overview.sourceParagraph,overview.renderedText,overview.paragraphSelector,overview.extractorVersion,
      overview.contentHash,overview.attributionLabel,overview.textLicense,overview.textLicenseUrl,
      JSON.stringify(overview.editorialModifications || []),JSON.stringify(overview.image),overview.status,
      overview.checkedAt,overview.fetchedAt,overview.expiresAt]
  );
  await recordWikipediaAudit({
    entityId: entity.id,
    action: operatorApproved ? "operator_mapping_applied" : previous ? "overview_updated" : "overview_imported",
    previousRevisionId: previous?.revisionId,
    nextRevisionId: overview.revisionId,
    details: { reviewReason, operatorApproved, ...auditDetails },
  });
  return { entity, overview: normalizeOverviewRow(rows[0]), previous };
}

export async function markWikipediaFailure(entityId, status, message, { confirmed = false } = {}) {
  const entity = await getFashionEntity(entityId);
  if (!entity) return null;
  const withdraw = confirmed && status === "no_article";
  const next = await upsertFashionEntity({
    ...entity, matchStatus: status,
    publicStatus: withdraw ? "withdrawn" : entity.publicStatus,
    reviewReason: message || null,
  });
  const p = await getPool();
  if (withdraw) {
    if (!p) {
      seedMemory();
      for (const row of mem.wikipediaOverviews.values()) if (row.entityId === entityId) row.status = "withdrawn";
    } else await p.query("UPDATE wikipedia_overviews SET status='withdrawn',checked_at=now(),updated_at=now() WHERE entity_id=$1", [entityId]);
  }
  await recordWikipediaAudit({ entityId, action: withdraw ? "overview_withdrawn" : "overview_check_failed", details: { status, message, lastKnownGoodPreserved: !withdraw } });
  return next;
}

export async function upsertDiscoveryEvidence(input) {
  const row = { ...input, retrievedAt: input.retrievedAt || new Date().toISOString() };
  const p = await getPool();
  if (!p) { seedMemory(); mem.fashionDiscoveryEvidence.set(evidenceKey(row.entityId,row.sourceKey,row.evidenceUrl), row); return { ...row }; }
  await p.query(
    `INSERT INTO fashion_discovery_evidence
      (entity_id,source_key,evidence_url,evidence_type,relevant_date,qualification,retrieved_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     ON CONFLICT (entity_id,source_key,evidence_url) DO UPDATE SET
       evidence_type=EXCLUDED.evidence_type,relevant_date=EXCLUDED.relevant_date,
       qualification=EXCLUDED.qualification,retrieved_at=EXCLUDED.retrieved_at`,
    [row.entityId,row.sourceKey,row.evidenceUrl,row.evidenceType,row.relevantDate || null,JSON.stringify(row.qualification || {}),row.retrievedAt]
  );
  return row;
}

/** Add a candidate from one independently sufficient discovery path. */
export async function registerFashionCandidate({ entity, evidence }) {
  const saved = await upsertFashionEntity({
    ...entity,
    matchStatus: entity.matchStatus || "candidate",
    publicStatus: entity.publicStatus || "unpublished",
  });
  const proof = await upsertDiscoveryEvidence({ ...evidence, entityId: saved.id });
  return { entity: saved, evidence: proof };
}

export async function upsertFashionRelationship(input) {
  if (!input?.id || !input.designerId || !input.houseId || !input.role) throw new TypeError("valid fashion relationship required");
  const row = { ...input, sourceIds: [...(input.sourceIds || [])] };
  const p = await getPool();
  if (!p) { seedMemory(); mem.fashionRelationships.set(row.id, row); return { ...row }; }
  await p.query(
    `INSERT INTO fashion_relationships
      (id,designer_id,house_id,role,start_value,end_value,date_precision,evidence,review_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'reviewed')
     ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role,start_value=EXCLUDED.start_value,
       end_value=EXCLUDED.end_value,date_precision=EXCLUDED.date_precision,
       evidence=EXCLUDED.evidence,review_status='reviewed',updated_at=now()`,
    [row.id,row.designerId,row.houseId,row.role,row.start || null,row.end || null,
      row.datePrecision || "unknown",JSON.stringify({ sourceIds: row.sourceIds, note: row.note || null })]
  );
  return row;
}

export async function enqueueWikipediaJob({ jobKey, kind, entityId = null, payload = {}, runAfter = new Date().toISOString(), maxAttempts = 5 }) {
  if (!jobKey || !["discover","resolve","refresh","withdrawal_check"].includes(kind)) throw new TypeError("valid Wikipedia job required");
  const p = await getPool();
  if (!p) {
    seedMemory();
    const existing = mem.wikipediaJobs.get(jobKey);
    if (existing && !["dead","cancelled"].includes(existing.status)) return { ...existing, payload: { ...existing.payload } };
    const row = { id: mem.seq++, jobKey, kind, entityId, payload: { ...payload }, checkpoint: {}, status: "queued", attempts: 0, maxAttempts, runAfter, leaseOwner: null, leaseUntil: null, lastError: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    mem.wikipediaJobs.set(jobKey, row); return { ...row, payload: { ...row.payload } };
  }
  const { rows } = await p.query(
    `INSERT INTO wikipedia_jobs (job_key,kind,entity_id,payload,run_after,max_attempts)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)
     ON CONFLICT (job_key) DO UPDATE SET updated_at=now()
     RETURNING *`, [jobKey,kind,entityId,JSON.stringify(payload),runAfter,maxAttempts]
  );
  return jobRow(rows[0]);
}

export async function queueExpiredWikipediaRefreshes({ limit = 25, now = new Date() } = {}) {
  const cap = boundedLimit(limit, 25, 100);
  const p = await getPool();
  let rows;
  if (!p) {
    seedMemory();
    rows = [...mem.wikipediaOverviews.values()]
      .filter((row) => row.status === "published" && new Date(row.expiresAt).getTime() <= now.getTime())
      .sort((a,b) => new Date(a.expiresAt)-new Date(b.expiresAt)).slice(0,cap);
  } else {
    const result = await p.query(
      `SELECT entity_id,language,revision_id,expires_at FROM wikipedia_overviews
       WHERE status='published' AND expires_at<= $1 ORDER BY expires_at,entity_id LIMIT $2`, [now.toISOString(),cap]
    );
    rows = result.rows.map(normalizeOverviewRow);
  }
  const jobs = [];
  for (const row of rows) {
    const entityId = row.entityId ?? row.entity_id;
    const language = row.language;
    const expiry = new Date(row.expiresAt ?? row.expires_at).toISOString().slice(0,10);
    jobs.push(await enqueueWikipediaJob({
      jobKey: `refresh:${entityId}:${language}:${expiry}`,
      kind: "refresh", entityId, payload: { language },
    }));
  }
  return jobs;
}

const jobRow = (row) => row ? ({
  id: Number(row.id), jobKey: row.job_key ?? row.jobKey, kind: row.kind,
  entityId: row.entity_id ?? row.entityId, payload: row.payload || {}, checkpoint: row.checkpoint || {},
  status: row.status, attempts: Number(row.attempts), maxAttempts: Number(row.max_attempts ?? row.maxAttempts),
  runAfter: new Date(row.run_after ?? row.runAfter).toISOString(), leaseOwner: row.lease_owner ?? row.leaseOwner,
  leaseUntil: row.lease_until ? new Date(row.lease_until).toISOString() : row.leaseUntil || null,
  lastError: row.last_error ?? row.lastError,
}) : null;

export async function claimWikipediaJobs(workerId, { limit = 5, leaseMs = 60_000 } = {}) {
  const cap = boundedLimit(limit, 5, 25);
  const until = new Date(Date.now() + leaseMs).toISOString();
  const p = await getPool();
  if (!p) {
    seedMemory();
    const due = [...mem.wikipediaJobs.values()].filter((row) =>
      (["queued","retry"].includes(row.status) && new Date(row.runAfter).getTime() <= Date.now()) ||
      (row.status === "running" && row.leaseUntil && new Date(row.leaseUntil).getTime() <= Date.now()))
      .sort((a,b) => new Date(a.runAfter)-new Date(b.runAfter) || a.id-b.id).slice(0,cap);
    for (const row of due) Object.assign(row, { status:"running", leaseOwner:workerId, leaseUntil:until, attempts:row.attempts+1, updatedAt:new Date().toISOString() });
    return due.map((row) => jobRow(row));
  }
  const { rows } = await p.query(
    `WITH picked AS (
       SELECT id FROM wikipedia_jobs
       WHERE ((status IN ('queued','retry') AND run_after<=now()) OR
              (status='running' AND lease_until<now()))
       ORDER BY run_after,id LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE wikipedia_jobs j SET status='running',lease_owner=$2,lease_until=$3,
       attempts=j.attempts+1,updated_at=now()
     FROM picked WHERE j.id=picked.id RETURNING j.*`, [cap,workerId,until]
  );
  return rows.map(jobRow);
}

export async function finishWikipediaJob(id, workerId, { status = "completed", checkpoint = {}, error = null, retryAt = null } = {}) {
  const p = await getPool();
  if (!p) {
    seedMemory(); const row = [...mem.wikipediaJobs.values()].find((job) => job.id === Number(id));
    if (!row || row.leaseOwner !== workerId) return false;
    const finalStatus = status === "retry" && row.attempts >= row.maxAttempts ? "dead" : status;
    Object.assign(row, { status:finalStatus, checkpoint:{...checkpoint}, lastError:error, runAfter:retryAt || row.runAfter, leaseOwner:null, leaseUntil:null, updatedAt:new Date().toISOString() });
    return true;
  }
  const result = await p.query(
    `UPDATE wikipedia_jobs SET
       status=CASE WHEN $3='retry' AND attempts>=max_attempts THEN 'dead' ELSE $3 END,
       checkpoint=$4::jsonb,last_error=$5,run_after=COALESCE($6,run_after),
       lease_owner=NULL,lease_until=NULL,updated_at=now()
     WHERE id=$1 AND lease_owner=$2 AND status='running'`,
    [id,workerId,status,JSON.stringify(checkpoint),error,retryAt]
  );
  return result.rowCount > 0;
}

export async function recordWikipediaAudit({ entityId = null, action, previousRevisionId = null, nextRevisionId = null, details = {} }) {
  const row = { id: mem.seq++, entityId, action, previousRevisionId, nextRevisionId, details: { ...details }, createdAt: new Date().toISOString() };
  const p = await getPool();
  if (!p) { seedMemory(); push(mem.wikipediaAudit, row); return row; }
  const { rows } = await p.query(
    `INSERT INTO wikipedia_audit (entity_id,action,previous_revision_id,next_revision_id,details)
     VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
    [entityId,action,previousRevisionId,nextRevisionId,JSON.stringify(details)]
  );
  return rows[0];
}

export async function createWikipediaReview({ entityId = null, reason, candidate = {} }) {
  const p = await getPool();
  if (!p) {
    seedMemory(); const id = String(mem.seq++);
    const row = { id, entityId, reason, candidate: { ...candidate }, status:"open", createdAt:new Date().toISOString() };
    mem.wikipediaReviews.set(id,row); return { ...row };
  }
  const { rows } = await p.query(
    `INSERT INTO wikipedia_reviews (entity_id,reason,candidate) VALUES ($1,$2,$3::jsonb) RETURNING *`,
    [entityId,reason,JSON.stringify(candidate)]
  );
  return rows[0];
}

export async function wikipediaCoverageReport() {
  const p = await getPool();
  if (!p) {
    seedMemory();
    const entities = [...mem.fashionEntities.values()];
    const overviews = [...mem.wikipediaOverviews.values()];
    const languages = {};
    for (const row of overviews.filter((o) => o.status === "published")) languages[row.language] = (languages[row.language] || 0) + 1;
    return {
      candidates: entities.length,
      matchedDesigners: entities.filter((e) => e.kind === "designer" && ["matched","language_only"].includes(e.matchStatus)).length,
      matchedHouses: entities.filter((e) => e.kind === "house" && ["matched","language_only"].includes(e.matchStatus)).length,
      publishedOverviews: overviews.filter((o) => o.status === "published").length,
      missingArticles: entities.filter((e) => ["no_article","wikidata_only"].includes(e.matchStatus)).length,
      ambiguousMatches: entities.filter((e) => e.matchStatus === "ambiguous").length,
      rejectedMatches: entities.filter((e) => e.matchStatus === "rejected").length,
      errors: entities.filter((e) => e.matchStatus === "temporary_failure").length,
      pendingJobs: [...mem.wikipediaJobs.values()].filter((j) => ["queued","retry","running"].includes(j.status)).length,
      languages,
    };
  }
  const { rows } = await p.query(
    `SELECT
       (SELECT count(*)::int FROM fashion_entities) candidates,
       (SELECT count(*)::int FROM fashion_entities WHERE kind='designer' AND match_status IN ('matched','language_only')) matched_designers,
       (SELECT count(*)::int FROM fashion_entities WHERE kind='house' AND match_status IN ('matched','language_only')) matched_houses,
       (SELECT count(*)::int FROM wikipedia_overviews WHERE status='published') published_overviews,
       (SELECT count(*)::int FROM fashion_entities WHERE match_status IN ('no_article','wikidata_only')) missing_articles,
       (SELECT count(*)::int FROM fashion_entities WHERE match_status='ambiguous') ambiguous_matches,
       (SELECT count(*)::int FROM fashion_entities WHERE match_status='rejected') rejected_matches,
       (SELECT count(*)::int FROM fashion_entities WHERE match_status='temporary_failure') errors,
       (SELECT count(*)::int FROM wikipedia_jobs WHERE status IN ('queued','retry','running')) pending_jobs`
  );
  const langs = await p.query("SELECT language,count(*)::int n FROM wikipedia_overviews WHERE status='published' GROUP BY language ORDER BY language");
  const r = rows[0];
  return { candidates:r.candidates,matchedDesigners:r.matched_designers,matchedHouses:r.matched_houses,
    publishedOverviews:r.published_overviews,missingArticles:r.missing_articles,ambiguousMatches:r.ambiguous_matches,rejectedMatches:r.rejected_matches,
    errors:r.errors,pendingJobs:r.pending_jobs,languages:Object.fromEntries(langs.rows.map((row)=>[row.language,row.n])) };
}

export function importedWikipediaDataset() {
  return JSON.parse(JSON.stringify(IMPORTED));
}
