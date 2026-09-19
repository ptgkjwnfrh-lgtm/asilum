import { createHash } from "node:crypto";

export const WIKIPEDIA_OVERVIEW_CONTRACT = 1;
export const WIKIPEDIA_EXTRACTOR_VERSION = "lead-paragraph-dom-v1";
export const WIKIPEDIA_TEXT_LICENSE = "CC BY-SA 4.0";
export const WIKIPEDIA_TEXT_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";
export const POSITIVE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const MISSING_RETRY_MS = 24 * 60 * 60 * 1000;
export const TEMPORARY_RETRY_MS = 15 * 60 * 1000;

export const MATCH_STATUSES = Object.freeze([
  "candidate", "matched", "ambiguous", "rejected", "wikidata_only",
  "no_article", "language_only", "temporary_failure",
]);
export const OVERVIEW_STATUSES = Object.freeze([
  "published", "review", "withdrawn", "unusable", "temporary_failure",
]);

export function foldEntityName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function entityIdFor(name, kind) {
  const slug = foldEntityName(name).replace(/\s+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "entity";
  return kind === "house" ? `${slug}-house` : slug;
}

export function paragraphHash(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

const at = (value) => value ? new Date(value).toISOString() : null;
const pick = (row, snake, camel = snake) => row?.[snake] ?? row?.[camel] ?? null;

export function normalizeEntityRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    canonicalName: pick(row, "canonical_name", "canonicalName"),
    aliases: Array.isArray(row.aliases) ? [...row.aliases] : [],
    wikidataQid: pick(row, "wikidata_qid", "wikidataQid"),
    matchStatus: pick(row, "match_status", "matchStatus") || "candidate",
    publicStatus: pick(row, "public_status", "publicStatus") || "unpublished",
    preferredLanguage: pick(row, "preferred_language", "preferredLanguage"),
    reviewReason: pick(row, "review_reason", "reviewReason"),
    createdAt: at(pick(row, "created_at", "createdAt")),
    updatedAt: at(pick(row, "updated_at", "updatedAt")),
  };
}

export function normalizeOverviewRow(row) {
  if (!row) return null;
  return {
    entityId: pick(row, "entity_id", "entityId"),
    language: row.language,
    pageId: Number(pick(row, "page_id", "pageId")),
    canonicalTitle: pick(row, "canonical_title", "canonicalTitle"),
    canonicalUrl: pick(row, "canonical_url", "canonicalUrl"),
    redirectFrom: pick(row, "redirect_from", "redirectFrom") || [],
    revisionId: Number(pick(row, "revision_id", "revisionId")),
    revisionTimestamp: at(pick(row, "revision_timestamp", "revisionTimestamp")),
    sourceParagraph: pick(row, "source_paragraph", "sourceParagraph"),
    renderedText: pick(row, "rendered_text", "renderedText"),
    paragraphSelector: pick(row, "paragraph_selector", "paragraphSelector"),
    extractorVersion: pick(row, "extractor_version", "extractorVersion"),
    contentHash: pick(row, "content_hash", "contentHash"),
    attributionLabel: pick(row, "attribution_label", "attributionLabel") || "Wikipedia contributors",
    textLicense: pick(row, "text_license", "textLicense") || WIKIPEDIA_TEXT_LICENSE,
    textLicenseUrl: pick(row, "text_license_url", "textLicenseUrl") || WIKIPEDIA_TEXT_LICENSE_URL,
    editorialModifications: pick(row, "editorial_modifications", "editorialModifications") || [],
    image: row.image || null,
    status: row.status,
    checkedAt: at(pick(row, "checked_at", "checkedAt")),
    fetchedAt: at(pick(row, "fetched_at", "fetchedAt")),
    expiresAt: at(pick(row, "expires_at", "expiresAt")),
  };
}

export function validateOverviewRecord(input) {
  const entity = normalizeEntityRow(input?.entity || input);
  const overview = normalizeOverviewRow(input?.overview || input);
  const reasons = [];
  if (!entity?.id || !["designer", "house"].includes(entity.kind) || !entity.canonicalName) reasons.push("entity identity");
  if (!/^Q[1-9][0-9]*$/.test(entity?.wikidataQid || "")) reasons.push("wikidata qid");
  if (!/^[a-z][a-z0-9-]{1,19}$/.test(overview?.language || "")) reasons.push("language");
  if (!Number.isSafeInteger(overview?.pageId) || overview.pageId < 1) reasons.push("page id");
  if (!Number.isSafeInteger(overview?.revisionId) || overview.revisionId < 1) reasons.push("revision id");
  if (!overview?.canonicalTitle || !/^https:\/\//.test(overview?.canonicalUrl || "")) reasons.push("canonical article");
  if (!overview?.sourceParagraph || overview.sourceParagraph !== overview.renderedText) reasons.push("verbatim paragraph");
  if (overview?.contentHash !== paragraphHash(overview?.sourceParagraph)) reasons.push("content hash");
  if (overview?.extractorVersion !== WIKIPEDIA_EXTRACTOR_VERSION) reasons.push("extractor version");
  if (!OVERVIEW_STATUSES.includes(overview?.status)) reasons.push("overview status");
  if (!overview?.revisionTimestamp || !overview?.fetchedAt || !overview?.checkedAt || !overview?.expiresAt) reasons.push("freshness timestamps");
  return { ok: reasons.length === 0, reasons, entity, overview };
}

function revisionLinks(overview) {
  try {
    const url = new URL(overview.canonicalUrl);
    return {
      revisionUrl: `${url.origin}/w/index.php?oldid=${overview.revisionId}`,
      historyUrl: `${overview.canonicalUrl}?action=history`,
    };
  } catch {
    return { revisionUrl: null, historyUrl: null };
  }
}

function clearedImage(image) {
  if (!image || image.rightsVerified !== true || !image.url || !image.filePage || !image.creator || !image.license) return null;
  return {
    url: image.url,
    alt: image.alt || "",
    credit: image.creator,
    rights: image.license,
    sourceUrl: image.filePage,
    modifications: Array.isArray(image.modifications) ? image.modifications : [],
  };
}

const LANGUAGE_LABELS = Object.freeze({
  en: "English", fr: "French", it: "Italian", de: "German", es: "Spanish",
  pt: "Portuguese", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
});

export function wikipediaEntityDto(entityInput, overviewInput = null) {
  const entity = normalizeEntityRow(entityInput);
  const overview = normalizeOverviewRow(overviewInput);
  if (!entity) return null;
  const publishable = entity.publicStatus === "published" && overview?.status === "published";
  const links = overview ? revisionLinks(overview) : { revisionUrl: null, historyUrl: null };
  const source = publishable ? {
    id: `wikipedia-${overview.language}-${overview.pageId}-${overview.revisionId}`,
    publisher: "Wikipedia contributors",
    url: overview.canonicalUrl,
    articleUrl: overview.canonicalUrl,
    revisionUrl: links.revisionUrl,
    historyUrl: links.historyUrl,
    retrievedAt: overview.fetchedAt,
    revisionId: overview.revisionId,
    revisionTimestamp: overview.revisionTimestamp,
    license: overview.textLicense,
    licenseUrl: overview.textLicenseUrl,
  } : null;
  return {
    contractVersion: WIKIPEDIA_OVERVIEW_CONTRACT,
    id: entity.id,
    kind: entity.kind,
    name: entity.canonicalName,
    aliases: [...entity.aliases],
    wikidataQid: entity.wikidataQid,
    overviewStatus: entity.matchStatus,
    overview: publishable ? {
      paragraph: overview.renderedText,
      summary: { text: overview.renderedText, sourceIds: [source.id] },
      paragraphs: [{ text: overview.renderedText, sourceIds: [source.id] }],
      language: overview.language,
      languageLabel: LANGUAGE_LABELS[overview.language] || overview.language,
      pageId: overview.pageId,
      title: overview.canonicalTitle,
      revisionId: overview.revisionId,
      revisionTimestamp: overview.revisionTimestamp,
      selector: overview.paragraphSelector,
      extractorVersion: overview.extractorVersion,
      contentHash: overview.contentHash,
      editorialModifications: [...overview.editorialModifications],
      fetchedAt: overview.fetchedAt,
      checkedAt: overview.checkedAt,
      expiresAt: overview.expiresAt,
    } : null,
    image: clearedImage(overview?.image),
    sources: source ? [source] : [],
    facts: [],
    reference: false,
  };
}
