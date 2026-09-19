#!/usr/bin/env node

// Repeatable, bounded population and canary runner for Wikipedia overviews.
// This script stores an existing article paragraph exactly as extracted. It
// never invokes a model, summarizes, translates, or manufactures prose.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import CAREERS from "../lib/people/careers.data.json" with { type: "json" };
import COVERAGE_REGISTRY from "../data/fashion-coverage-registry.json" with { type: "json" };
import {
  discoverWikidataClass, discoverWikipediaCategory, discoverWikipediaList,
  fetchWikipediaOverview, resolveNameCandidate,
} from "../lib/people/wikipedia/client.js";
import { entityIdFor, validateOverviewRecord } from "../lib/people/wikipedia/contract.js";
import { WIKIPEDIA_DISCOVERY_SOURCES } from "../lib/people/wikipedia/registry.js";
import { coverageRegionForCountry } from "../lib/people/wikipedia/regions.js";
import { queueWikipediaResolution } from "../lib/people/wikipedia/jobs.js";
import {
  createWikipediaReview, importedWikipediaDataset, upsertDiscoveryEvidence,
  upsertFashionEntity, upsertFashionRelationship, upsertWikipediaOverview,
  wikipediaCoverageReport,
} from "../lib/db/production.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT = path.join(ROOT, "data", "wikipedia-overviews.json");
const argv = process.argv.slice(2);
const command = argv.find((arg) => !arg.startsWith("--")) || "report";
const option = (name, fallback = null) => {
  const raw = argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};
const limit = Math.max(1, Math.min(5000, Number.parseInt(option("limit", "3000"), 10) || 3000));
const enrichLimit = Math.max(1, Math.min(limit, Number.parseInt(option("enrich-limit", "450"), 10) || 450));
const perSource = Math.max(1, Math.min(100, Number.parseInt(option("per-source", "40"), 10) || 40));
const persistDatabase = argv.includes("--database");

if (persistDatabase && !process.env.DATABASE_URL) {
  throw new Error("--database requires DATABASE_URL; no in-memory substitute is allowed for an operator write");
}

// Display-name collisions need an article title, never a guessed identity.
// These are mappings only; the API still verifies page/QID/revision before
// the candidate can publish.
const ARTICLE_TITLES = Object.freeze({
  "tom-ford-house": "Tom Ford (brand)",
  "saint-laurent": "Yves Saint Laurent (fashion house)",
  "celine": "Celine (brand)",
  "dior": "Dior",
  "balmain": "Balmain (fashion house)",
  "valentino": "Valentino (fashion house)",
  "loewe": "Loewe (fashion house)",
  "givenchy": "Givenchy",
  "maison-margiela": "Maison Margiela",
  "jil-sander": "Jil Sander (brand)",
  "calvin-klein": "Calvin Klein (fashion house)",
  "prada": "Prada",
  "chloe": "Chloé",
  "polo-ralph-lauren": "Ralph Lauren Corporation",
  "versus-versace": "Versus (Versace)",
  "jw-anderson": "JW Anderson",
  "phoebe-philo-house": "Phoebe Philo (brand)",
  "zegna": "Zegna",
  "demna": "Demna (designer)",
  "kim-jones": "Kim Jones (designer)",
  "michael-rider": "Michael Rider (fashion designer)",
});

const nowIso = () => new Date().toISOString();
const sourceRecord = (source, retrievedAt, extra = {}) => ({
  key: source.key, label: source.label, type: source.type, url: source.url,
  region: source.region, seasonOrDate: source.seasonOrDate,
  retrievedAt, ...extra,
});

function careerCandidates() {
  return CAREERS.entities.map((row) => ({
    id: row.id,
    kind: row.kind,
    canonicalName: row.name,
    aliases: row.aliases || [],
    language: "en",
    wikipediaTitle: ARTICLE_TITLES[row.id] || row.name,
    autoPublish: true,
    discovery: [{
      sourceKey: "asilum-career-registry",
      evidenceUrl: "internal://lib/people/careers.data.json",
      evidenceType: "existing_catalog",
      qualification: { existingEntity: true, sourceIds: [...new Set([
        ...(row.summary?.sourceIds || []),
        ...(row.facts || []).flatMap((fact) => fact.claim?.sourceIds || []),
      ])] },
    }],
  }));
}

function coverageCandidates() {
  return COVERAGE_REGISTRY.entities.map((row) => ({
    id: entityIdFor(row.name, row.kind),
    kind: row.kind,
    canonicalName: row.name,
    aliases: row.aliases || [],
    language: row.language || "en",
    wikipediaTitle: row.wikipediaTitle,
    autoPublish: true,
    discovery: [{
      sourceKey: "global-major-names-registry",
      evidenceUrl: "internal://data/fashion-coverage-registry.json",
      evidenceType: "existing_catalog",
      qualification: {
        coverageRegion: row.region,
        country: row.country,
        priority: "major-name-ledger",
        required: row.required === true,
        curatedArticleMapping: true,
      },
    }],
  }));
}

function relationshipRows() {
  return (CAREERS.edges || []).map((edge, index) => ({
    id: `${edge.designerId}|${edge.houseId}|${edge.start || "unknown"}|${index + 1}`,
    designerId: edge.designerId,
    houseId: edge.houseId,
    role: edge.role,
    start: edge.start || null,
    end: edge.end || null,
    datePrecision: edge.datePrecision || "unknown",
    sourceIds: edge.sourceIds || [],
    note: edge.note || null,
  }));
}

async function discoverCandidates(budget) {
  const retrievedAt = nowIso();
  const careers = careerCandidates();
  const coverage = coverageCandidates();
  const candidates = [...careers, ...coverage];
  const sources = [];
  for (const source of WIKIPEDIA_DISCOVERY_SOURCES.filter((row) => row.enabled)) {
    if (source.type === "internal_registry") {
      const candidateCount = source.key === "asilum-career-registry" ? careers.length
        : source.key === "global-major-names-registry" ? coverage.length : 0;
      sources.push(sourceRecord(source, retrievedAt, { scanned: true, candidateCount }));
      continue;
    }
    try {
      let found = [];
      if (source.type === "wikidata") {
        found = await discoverWikidataClass({
          classQid: source.classQid,
          kind: source.key.includes("houses") ? "house" : "designer",
          language: source.language || "en",
          requireNoEnglish: source.requireNoEnglish === true,
          limit: perSource,
        });
      } else if (source.type === "wikipedia_category") {
        found = await discoverWikipediaCategory({
          category: source.category, language: source.language,
          kind: source.key.includes("houses") ? "house" : "designer",
          limit: perSource,
        });
      } else if (source.type === "wikipedia_list") {
        found = await discoverWikipediaList({
          title: source.title, language: source.language,
          kind: source.key.includes("houses") ? "house" : "designer",
          limit: Math.min(5000, budget),
        });
      }
      for (const row of found) candidates.push({
        ...row,
        id: entityIdFor(row.canonicalName, row.kind),
        aliases: [],
        autoPublish: source.type === "wikidata",
        discovery: [{
          sourceKey: source.key, evidenceUrl: source.url,
          evidenceType: source.type === "wikidata" ? "wikidata_statement"
            : source.type === "wikipedia_list" ? "list" : "category",
          qualification: source.type === "wikidata"
            ? { classQid: source.classQid, entityQid: row.wikidataQid, coverageRegion: source.region }
            : source.type === "wikipedia_list"
              ? { listTitle: source.title, listRevisionId: row.listRevisionId, country: row.country, coverageRegion: coverageRegionForCountry(row.country), requiresIdentityReview: true }
              : { category: source.category, coverageRegion: source.region, requiresIdentityReview: true },
        }],
      });
      sources.push(sourceRecord(source, retrievedAt, { scanned: true, candidateCount: found.length }));
    } catch (error) {
      sources.push(sourceRecord(source, retrievedAt, { scanned: false, candidateCount: 0, error: String(error?.message || error) }));
    }
  }
  const deduped = new Map();
  for (const candidate of candidates) {
    const key = candidate.wikidataQid || `${candidate.kind}:${candidate.id}`;
    const previous = deduped.get(key);
    if (!previous) deduped.set(key, candidate);
    else deduped.set(key, {
      ...previous,
      aliases: [...new Set([...(previous.aliases || []), ...(candidate.aliases || [])])],
      discovery: [...(previous.discovery || []), ...(candidate.discovery || [])],
      autoPublish: previous.autoPublish || candidate.autoPublish,
    });
  }
  return { candidates: [...deduped.values()].slice(0, budget), sources };
}

function coverageOf(dataset) {
  const published = dataset.overviews.filter((row) => row.status === "published");
  const publishedIds = new Set(published.map((row) => row.entityId));
  const entitiesById = new Map(dataset.entities.map((row) => [row.id, row]));
  const languages = {};
  for (const row of published) languages[row.language] = (languages[row.language] || 0) + 1;
  const regionIds = new Map();
  const majorIds = new Set();
  for (const evidence of dataset.evidence) {
    const region = evidence.qualification?.coverageRegion;
    if (region && region !== "global") {
      if (!regionIds.has(region)) regionIds.set(region, new Set());
      regionIds.get(region).add(evidence.entityId);
    }
    if (evidence.qualification?.priority === "major-name-ledger") majorIds.add(evidence.entityId);
  }
  const regions = Object.fromEntries([...regionIds.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([region, ids]) => {
    const entities = [...ids].map((id) => entitiesById.get(id)).filter(Boolean);
    return [region, {
      candidates: entities.length,
      matchedDesigners: entities.filter((row) => row.kind === "designer" && ["matched", "language_only"].includes(row.matchStatus)).length,
      matchedHouses: entities.filter((row) => row.kind === "house" && ["matched", "language_only"].includes(row.matchStatus)).length,
      publishedOverviews: entities.filter((row) => publishedIds.has(row.id)).length,
      gaps: entities.filter((row) => !publishedIds.has(row.id)).length,
    }];
  }));
  const majorEntities = [...majorIds].map((id) => entitiesById.get(id)).filter(Boolean);
  return {
    candidates: dataset.entities.length,
    matchedDesigners: dataset.entities.filter((row) => row.kind === "designer" && ["matched", "language_only"].includes(row.matchStatus)).length,
    matchedHouses: dataset.entities.filter((row) => row.kind === "house" && ["matched", "language_only"].includes(row.matchStatus)).length,
    publishedOverviews: published.length,
    missingArticles: dataset.entities.filter((row) => ["no_article", "wikidata_only"].includes(row.matchStatus)).length,
    ambiguousMatches: dataset.entities.filter((row) => row.matchStatus === "ambiguous").length,
    rejectedMatches: dataset.entities.filter((row) => row.matchStatus === "rejected").length,
    errors: dataset.entities.filter((row) => row.matchStatus === "temporary_failure").length,
    pendingJobs: dataset.pending?.length || 0,
    languages,
    regions,
    majorNames: {
      candidates: majorEntities.length,
      publishedOverviews: majorEntities.filter((row) => publishedIds.has(row.id)).length,
      gaps: majorEntities.filter((row) => !publishedIds.has(row.id)).map((row) => ({ id: row.id, name: row.canonicalName, kind: row.kind, status: row.matchStatus })),
    },
  };
}

async function populate() {
  const { candidates, sources } = await discoverCandidates(limit);
  const dataset = {
    schemaVersion: 2,
    generatedAt: nowIso(),
    sources,
    entities: [],
    overviews: [],
    evidence: [],
    relationships: relationshipRows(),
    reviews: [],
    pending: [],
    coverage: {},
  };
  const entityIndex = new Map();
  const qidIndex = new Map();
  const overviewIndex = new Map();
  const evidenceIndex = new Set();
  const storeEntity = (row) => {
    const qidKey = row.wikidataQid ? `${row.kind}:${row.wikidataQid}` : null;
    const existingIndex = entityIndex.get(row.id) ?? (qidKey ? qidIndex.get(qidKey) : undefined);
    if (existingIndex !== undefined) {
      const previous = dataset.entities[existingIndex];
      const incomingWins = row.publicStatus === "published" && previous.publicStatus !== "published";
      dataset.entities[existingIndex] = {
        ...(incomingWins ? row : previous),
        id: previous.id,
        aliases: [...new Set([...(previous.aliases || []), ...(row.aliases || []), row.canonicalName].filter(Boolean))],
      };
      entityIndex.set(row.id, existingIndex);
      if (qidKey) qidIndex.set(qidKey, existingIndex);
      return previous.id;
    }
    const index = dataset.entities.push(row) - 1;
    entityIndex.set(row.id, index);
    if (qidKey) qidIndex.set(qidKey, index);
    return row.id;
  };
  const storeOverview = (row) => {
    const key = `${row.entityId}|${row.language}`;
    if (overviewIndex.has(key)) return;
    overviewIndex.set(key, dataset.overviews.length);
    dataset.overviews.push(row);
  };
  const storeEvidence = (row) => {
    const key = `${row.entityId}|${row.sourceKey}|${row.evidenceUrl}`;
    if (evidenceIndex.has(key)) return;
    evidenceIndex.add(key);
    dataset.evidence.push(row);
  };
  const storeCandidateEvidence = (candidate, entityId) => {
    for (const evidence of candidate.discovery || []) storeEvidence({ entityId, ...evidence, retrievedAt: nowIso() });
  };
  for (let index = 0; index < candidates.length; index++) {
    let candidate = candidates[index];
    if (index >= enrichLimit) {
      const storedId = storeEntity({
        id: candidate.id, kind: candidate.kind, canonicalName: candidate.canonicalName,
        aliases: candidate.aliases || [], wikidataQid: candidate.wikidataQid || null,
        matchStatus: "candidate", publicStatus: "unpublished",
        preferredLanguage: candidate.language || null,
        reviewReason: "awaiting bounded Wikipedia enrichment",
      });
      storeCandidateEvidence(candidate, storedId);
      dataset.pending.push({
        entityId: storedId, kind: candidate.kind, canonicalName: candidate.canonicalName,
        language: candidate.language || "en", wikipediaTitle: candidate.wikipediaTitle || null,
        wikidataQid: candidate.wikidataQid || null,
        autoPublish: candidate.autoPublish === true,
        evidence: candidate.discovery?.[0] || null,
      });
      continue;
    }
    process.stderr.write(`[${index + 1}/${candidates.length}] ${candidate.kind}: ${candidate.canonicalName}\n`);
    try {
      // Names without a vetted title get the bounded Wikidata identity path.
      if (!candidate.wikipediaTitle) {
        const resolved = await resolveNameCandidate(candidate.canonicalName, candidate.kind);
        if (!resolved.candidate) {
          const storedId = storeEntity({ ...candidate, matchStatus: resolved.status, publicStatus: "unpublished", preferredLanguage: null, reviewReason: resolved.status });
          storeCandidateEvidence(candidate, storedId);
          continue;
        }
        candidate = { ...candidate, ...resolved.candidate };
      }
      const result = await fetchWikipediaOverview(candidate);
      if (!result.overview) {
        const storedId = storeEntity({
          id: candidate.id, kind: candidate.kind, canonicalName: candidate.canonicalName,
          aliases: candidate.aliases || [], wikidataQid: candidate.wikidataQid || result.article?.qid || null,
          matchStatus: result.article?.status || "temporary_failure", publicStatus: "unpublished",
          preferredLanguage: candidate.language || null,
          reviewReason: result.article?.status || "article resolution failed",
        });
        storeCandidateEvidence(candidate, storedId);
        if (result.article?.status === "ambiguous") dataset.reviews.push({
          id: `import-${dataset.reviews.length + 1}`, entityId: storedId,
          reason: "Wikipedia identity mapping is ambiguous", candidate: result.article,
          status: "open",
        });
        continue;
      }
      const checked = validateOverviewRecord(result);
      if (!checked.ok) throw new Error(`contract rejected: ${checked.reasons.join(", ")}`);
      const storedId = storeEntity(result.entity);
      storeOverview({ ...result.overview, entityId: storedId });
      storeCandidateEvidence(candidate, storedId);
      if (result.overview.status === "review") dataset.reviews.push({
        id: `import-${dataset.reviews.length + 1}`,
        entityId: storedId,
        reason: "category candidate requires identity review",
        candidate: result.overview,
        status: "open",
      });
    } catch (error) {
      const storedId = storeEntity({
        id: candidate.id, kind: candidate.kind, canonicalName: candidate.canonicalName,
        aliases: candidate.aliases || [], wikidataQid: candidate.wikidataQid || null,
        matchStatus: error?.retryable ? "temporary_failure" : "rejected",
        publicStatus: "unpublished", preferredLanguage: candidate.language || null,
        reviewReason: String(error?.message || error).slice(0, 500),
      });
      storeCandidateEvidence(candidate, storedId);
    }
  }
  const pendingByEntity = new Map();
  for (const row of dataset.pending) {
    const previous = pendingByEntity.get(row.entityId);
    // QID reconciliation can collapse differently named discovery candidates
    // into one entity. Keep exactly one resumable job, preferring an exact
    // article title when only one candidate supplies it.
    if (!previous || (!previous.wikipediaTitle && row.wikipediaTitle)) pendingByEntity.set(row.entityId, row);
  }
  dataset.pending = [...pendingByEntity.values()];
  dataset.coverage = coverageOf(dataset);
  if (persistDatabase) {
    for (const entity of dataset.entities) await upsertFashionEntity(entity);
    for (const overview of dataset.overviews.filter((row) => row.status === "published")) {
      const entity = dataset.entities.find((row) => row.id === overview.entityId);
      if (entity) await upsertWikipediaOverview(entity, overview);
    }
    for (const evidence of dataset.evidence) await upsertDiscoveryEvidence(evidence);
    for (const relationship of dataset.relationships) await upsertFashionRelationship(relationship);
    for (const review of dataset.reviews) await createWikipediaReview(review);
    for (const pending of dataset.pending) await queueWikipediaResolution({
      name: pending.canonicalName,
      kind: pending.kind,
      requestedBy: "population-backlog",
      candidate: {
        id: pending.entityId, kind: pending.kind, canonicalName: pending.canonicalName,
        aliases: [], wikidataQid: pending.wikidataQid, language: pending.language,
        wikipediaTitle: pending.wikipediaTitle, autoPublish: pending.autoPublish,
      },
      evidence: pending.evidence,
    });
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(dataset, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({ output: OUTPUT, ...dataset.coverage, sources: dataset.sources }, null, 2) + "\n");
}

async function canary() {
  const result = await fetchWikipediaOverview({
    id: "tom-ford", kind: "designer", canonicalName: "Tom Ford",
    aliases: ["Thomas Carlyle Ford"], language: "en", wikipediaTitle: "Tom Ford", autoPublish: true,
  });
  const checked = validateOverviewRecord(result);
  if (!checked.ok) throw new Error(`canary contract rejected: ${checked.reasons.join(", ")}`);
  process.stdout.write(JSON.stringify({
    live: true,
    pageId: result.overview.pageId,
    revisionId: result.overview.revisionId,
    revisionTimestamp: result.overview.revisionTimestamp,
    contentHash: result.overview.contentHash,
    paragraph: result.overview.renderedText,
  }, null, 2) + "\n");
}

async function mapOperator() {
  const kind = option("kind");
  const canonicalName = String(option("name", "")).trim();
  const wikidataQid = String(option("qid", "")).trim();
  const language = String(option("language", "en")).trim().toLowerCase();
  const wikipediaTitle = String(option("title", "")).trim();
  if (!["designer", "house"].includes(kind)) throw new Error("map requires --kind=designer or --kind=house");
  if (!canonicalName) throw new Error("map requires --name=<canonical name>");
  if (!/^Q[1-9][0-9]*$/.test(wikidataQid)) throw new Error("map requires --qid=Q…");
  if (!wikipediaTitle) throw new Error("map requires --title=<exact Wikipedia title>");
  if (!/^[a-z][a-z0-9-]{1,19}$/.test(language)) throw new Error("map received an invalid --language");
  const requestedId = String(option("id", entityIdFor(canonicalName, kind))).trim();
  const candidate = {
    id: requestedId, kind, canonicalName, aliases: [], wikidataQid,
    language, wikipediaTitle, autoPublish: true,
  };
  const result = await fetchWikipediaOverview(candidate);
  const checked = validateOverviewRecord(result);
  if (!checked.ok) throw new Error(`mapping contract rejected: ${checked.reasons.join(", ")}`);
  if (!persistDatabase) {
    process.stdout.write(JSON.stringify({
      persisted: false,
      instruction: "Review this exact identity/revision, then repeat with --database --approve to write it.",
      entity: result.entity,
      overview: result.overview,
    }, null, 2) + "\n");
    return;
  }
  if (!argv.includes("--approve")) {
    throw new Error("a database mapping requires explicit --approve after reviewing the dry-run output");
  }
  const stored = await upsertWikipediaOverview(result.entity, result.overview, {
    operatorApproved: true,
    auditDetails: {
      requestedId, canonicalName, kind, wikidataQid, language, wikipediaTitle,
      source: "wikipedia:map",
    },
  });
  await upsertDiscoveryEvidence({
    entityId: stored.entity.id,
    sourceKey: "operator-wikipedia-mapping",
    evidenceUrl: result.overview.canonicalUrl,
    evidenceType: "operator_mapping",
    qualification: {
      requestedId, kind, wikidataQid, language, wikipediaTitle,
      pageId: result.overview.pageId, revisionId: result.overview.revisionId,
    },
    retrievedAt: nowIso(),
  });
  process.stdout.write(JSON.stringify({
    persisted: true,
    entityId: stored.entity.id,
    pageId: result.overview.pageId,
    revisionId: result.overview.revisionId,
    canonicalUrl: result.overview.canonicalUrl,
    auditAction: "operator_mapping_applied",
  }, null, 2) + "\n");
}

if (command === "populate") await populate();
else if (command === "canary") await canary();
else if (command === "map") await mapOperator();
else if (command === "report") process.stdout.write(JSON.stringify(persistDatabase ? await wikipediaCoverageReport() : importedWikipediaDataset().coverage, null, 2) + "\n");
else throw new Error(`unknown command: ${command}`);
