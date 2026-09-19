import { createHash, randomUUID } from "node:crypto";
import {
  claimWikipediaJobs, createWikipediaReview, enqueueWikipediaJob, finishWikipediaJob,
  getFashionEntity, getWikipediaOverview, markWikipediaFailure,
  queueExpiredWikipediaRefreshes, upsertDiscoveryEvidence, upsertFashionEntity,
  upsertWikipediaOverview,
} from "../../db/production.js";
import { entityIdFor, foldEntityName } from "./contract.js";
import {
  discoverWikidataClass, discoverWikipediaCategory, fetchWikipediaOverview,
  resolveNameCandidate, retryAtFor,
} from "./client.js";
import { discoverySource, WIKIPEDIA_DISCOVERY_SOURCES } from "./registry.js";

const jobDigest = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 24);

export async function queueWikipediaResolution({
  name, kind = null, requestedBy = "search", candidate = null, evidence = null,
}) {
  const canonicalName = String(candidate?.canonicalName || name || "").trim().slice(0, 200);
  const folded = foldEntityName(canonicalName);
  if (!folded || folded.length < 2) throw new TypeError("a candidate name is required");
  if (kind !== null && !["designer", "house"].includes(kind)) throw new TypeError("invalid candidate kind");
  const retryWindow = new Date().toISOString().slice(0, 10);
  const identity = candidate?.wikidataQid || (candidate?.pageId
    ? `${candidate.language || "en"}:${candidate.pageId}`
    : folded);
  return enqueueWikipediaJob({
    jobKey: `resolve:${kind || "unknown"}:${jobDigest(identity)}:${retryWindow}`,
    kind: "resolve",
    entityId: candidate?.id || null,
    payload: { canonicalName, kind, requestedBy, candidate, evidence },
  });
}

async function attachEvidence(entityId, evidence) {
  if (!evidence?.sourceKey || !evidence?.evidenceUrl) return null;
  return upsertDiscoveryEvidence({ ...evidence, entityId });
}

async function resolveCandidate(payload) {
  const kinds = payload.kind ? [payload.kind] : ["designer", "house"];
  const found = payload.candidate ? [{
    ...payload.candidate,
    id: payload.candidate.id || entityIdFor(payload.canonicalName, payload.kind),
    kind: payload.kind,
    canonicalName: payload.canonicalName,
    aliases: payload.candidate.aliases || [],
  }] : [];
  const statuses = [];
  if (!payload.candidate) {
    for (const kind of kinds) {
      const result = await resolveNameCandidate(payload.canonicalName, kind);
      if (result.candidate) found.push(result.candidate);
      else statuses.push(result.status);
    }
  }
  if (found.length !== 1 || statuses.includes("ambiguous")) {
    const status = found.length > 1 || statuses.includes("ambiguous")
      ? "ambiguous"
      : statuses.includes("temporary_failure") ? "temporary_failure"
        : statuses.includes("wikidata_only") ? "wikidata_only" : "no_article";
    const kind = payload.kind || "designer";
    const entity = await upsertFashionEntity({
      id: entityIdFor(payload.canonicalName, kind), kind,
      canonicalName: payload.canonicalName, aliases: [], wikidataQid: null,
      matchStatus: status, publicStatus: "unpublished", preferredLanguage: null,
      reviewReason: found.length > 1 ? "name resolved as both a designer and a house" : "no qualifying Wikidata identity with a Wikipedia sitelink",
    });
    await attachEvidence(entity.id, payload.evidence);
    if (status === "ambiguous") await createWikipediaReview({
      entityId: entity.id,
      reason: "Wikipedia identity mapping is ambiguous",
      candidate: { canonicalName: payload.canonicalName, kind: payload.kind, matches: found, statuses },
    });
    return { status, entityId: entity.id };
  }
  const result = await fetchWikipediaOverview(found[0]);
  if (!result.overview) {
    const entity = await upsertFashionEntity({
      ...found[0], matchStatus: result.article.status, publicStatus: "unpublished",
      preferredLanguage: found[0].language || null, reviewReason: result.article.status,
    });
    await attachEvidence(entity.id, payload.evidence);
    return { status: result.article.status, entityId: entity.id };
  }
  const stored = await upsertWikipediaOverview(result.entity, result.overview);
  await attachEvidence(stored.entity.id, payload.evidence);
  if (result.overview.status === "review") await createWikipediaReview({
    entityId: stored.entity.id,
    reason: "discovery candidate requires identity review",
    candidate: result.overview,
  });
  return { status: result.overview.status, entityId: stored.entity.id, revisionId: result.overview.revisionId };
}

async function discoverCandidates(payload) {
  const source = discoverySource(payload.sourceKey);
  if (!source?.enabled || !["wikidata", "wikipedia_category"].includes(source.type)) {
    throw new TypeError("unknown or disabled automated discovery source");
  }
  const limit = Math.max(1, Math.min(25, Number.parseInt(payload.limit, 10) || 20));
  const kind = source.key.includes("houses") ? "house" : "designer";
  const found = source.type === "wikidata"
    ? await discoverWikidataClass({
      classQid: source.classQid, kind, language: source.language || "en",
      requireNoEnglish: source.requireNoEnglish === true, limit,
    })
    : await discoverWikipediaCategory({
      category: source.category, language: source.language || "en", kind, limit,
    });
  const jobs = [];
  for (const row of found) {
    const evidence = {
      sourceKey: source.key,
      evidenceUrl: source.url,
      evidenceType: source.type === "wikidata" ? "wikidata_statement" : "category",
      qualification: source.type === "wikidata"
        ? { classQid: source.classQid, entityQid: row.wikidataQid }
        : { category: source.category, requiresIdentityReview: true },
      retrievedAt: new Date().toISOString(),
    };
    const candidate = {
      ...row,
      id: entityIdFor(row.canonicalName, kind),
      aliases: [],
      matchStatus: "candidate",
      publicStatus: "unpublished",
      preferredLanguage: row.language || null,
      autoPublish: source.type === "wikidata",
    };
    const saved = await upsertFashionEntity(candidate);
    await attachEvidence(saved.id, evidence);
    jobs.push(await queueWikipediaResolution({
      name: row.canonicalName,
      kind,
      requestedBy: `discovery:${source.key}`,
      candidate: { ...candidate, id: saved.id },
      evidence,
    }));
  }
  return {
    status: "discovered",
    sourceKey: source.key,
    candidatesFound: found.length,
    resolutionJobsQueued: jobs.length,
    completedAt: new Date().toISOString(),
  };
}

/** Queue one rotating, bounded source scan per UTC day. With the six-hour
 * worker cadence this leaves capacity for the resulting resolution jobs and
 * revisits every enabled automated source without an unbounded crawl. */
export async function queueWikipediaDiscoveryCycle({ now = new Date(), limit = 20 } = {}) {
  const sources = WIKIPEDIA_DISCOVERY_SOURCES.filter((source) =>
    source.enabled && ["wikidata", "wikipedia_category"].includes(source.type));
  if (!sources.length) return [];
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000;
  const source = sources[((day % sources.length) + sources.length) % sources.length];
  const window = now.toISOString().slice(0, 10);
  return [await enqueueWikipediaJob({
    jobKey: `discover:${source.key}:${window}`,
    kind: "discover",
    payload: { sourceKey: source.key, limit: Math.max(1, Math.min(25, Number.parseInt(limit, 10) || 20)) },
  })];
}

async function refreshCandidate(entityId) {
  const entity = await getFashionEntity(entityId);
  if (!entity) return { status: "missing_entity", entityId };
  const prior = await getWikipediaOverview(entityId, entity.preferredLanguage);
  const result = await fetchWikipediaOverview({
    ...entity,
    language: prior?.language || entity.preferredLanguage || "en",
    wikipediaTitle: prior?.canonicalTitle || entity.canonicalName,
    pageId: prior?.pageId || null,
    autoPublish: true,
  });
  if (!result.overview) {
    await markWikipediaFailure(entityId, result.article.status, `refresh returned ${result.article.status}`, { confirmed: false });
    return { status: result.article.status, entityId, lastKnownGoodPreserved: true };
  }
  await upsertWikipediaOverview(result.entity, result.overview);
  return { status: result.overview.status, entityId, revisionId: result.overview.revisionId };
}

async function processJob(job) {
  if (job.kind === "discover") return discoverCandidates(job.payload);
  if (job.kind === "resolve") return resolveCandidate(job.payload);
  if (["refresh", "withdrawal_check"].includes(job.kind)) return refreshCandidate(job.entityId);
  return { status: "unsupported", kind: job.kind };
}

export async function runWikipediaJobs({ limit = 5, workerId = `wikipedia-${randomUUID()}` } = {}) {
  await queueExpiredWikipediaRefreshes({ limit: 25 });
  await queueWikipediaDiscoveryCycle({ limit: 20 });
  const jobs = await claimWikipediaJobs(workerId, { limit, leaseMs: 55_000 });
  const results = [];
  for (const job of jobs) {
    try {
      const result = await processJob(job);
      await finishWikipediaJob(job.id, workerId, { status: "completed", checkpoint: result });
      results.push({ jobId: job.id, jobKey: job.jobKey, ok: true, ...result });
    } catch (error) {
      const retryable = error?.retryable === true;
      const retryAt = retryable ? retryAtFor("temporary_failure") : null;
      await finishWikipediaJob(job.id, workerId, {
        status: retryable ? "retry" : "dead",
        checkpoint: { code: error?.code || "worker_error" },
        error: String(error?.message || error).slice(0, 1000),
        retryAt,
      });
      if (job.entityId) await markWikipediaFailure(
        job.entityId,
        retryable ? "temporary_failure" : "rejected",
        String(error?.message || error),
        { confirmed: false },
      );
      results.push({ jobId: job.id, jobKey: job.jobKey, ok: false, retryable, error: String(error?.message || error) });
    }
  }
  return { workerId, claimed: jobs.length, results };
}
