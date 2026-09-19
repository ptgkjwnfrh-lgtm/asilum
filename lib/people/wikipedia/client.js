import { extractWikipediaLead } from "./extract.js";
import {
  MISSING_RETRY_MS, POSITIVE_CACHE_MS, TEMPORARY_RETRY_MS, WIKIPEDIA_TEXT_LICENSE,
  WIKIPEDIA_TEXT_LICENSE_URL, entityIdFor, foldEntityName,
} from "./contract.js";
import { WIKIMEDIA_LANGUAGES } from "./registry.js";

const HOST_CHAINS = new Map();
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_USER_AGENT = "ASILUM/2.0 (https://www.asilummagazine.com; Wikipedia overview connector)";

export class WikimediaError extends Error {
  constructor(code, message, { retryable = false, status = null } = {}) {
    super(message);
    this.name = "WikimediaError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

const languageCode = (value) => {
  const language = String(value || "en").toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,19}$/.test(language)) throw new WikimediaError("language_invalid", "invalid Wikimedia language");
  return language;
};

const apiUrl = (language) => `https://${languageCode(language)}.wikipedia.org/w/api.php`;

async function serialized(host, fn) {
  const previous = HOST_CHAINS.get(host) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => current);
  HOST_CHAINS.set(host, tail);
  await previous.catch(() => {});
  try { return await fn(); }
  finally {
    release();
    if (HOST_CHAINS.get(host) === tail) HOST_CHAINS.delete(host);
  }
}

const retryDelay = (response, attempt) => {
  const header = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(30_000, header * 1000);
  return Math.min(5000, 300 * (2 ** attempt));
};

export async function wikimediaFetchJson(url, { attempts = 3, timeoutMs = 15_000, fetchImpl = fetch } = {}) {
  const parsed = new URL(url);
  parsed.searchParams.set("maxlag", parsed.searchParams.get("maxlag") || "5");
  return serialized(parsed.host, async () => {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(parsed, {
          headers: {
            "User-Agent": process.env.WIKIMEDIA_USER_AGENT || DEFAULT_USER_AGENT,
            "Api-User-Agent": process.env.WIKIMEDIA_USER_AGENT || DEFAULT_USER_AGENT,
            "Accept": "application/json",
          },
          signal: controller.signal,
          redirect: "error",
        });
        if ([429, 502, 503, 504].includes(response.status)) {
          lastError = new WikimediaError("source_temporary", `Wikimedia HTTP ${response.status}`, { retryable: true, status: response.status });
          if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
          continue;
        }
        if (!response.ok) throw new WikimediaError("source_http", `Wikimedia HTTP ${response.status}`, { status: response.status });
        const length = Number(response.headers.get("content-length"));
        if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new WikimediaError("source_too_large", "Wikimedia response exceeded the connector budget");
        const text = await response.text();
        if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new WikimediaError("source_too_large", "Wikimedia response exceeded the connector budget");
        const body = JSON.parse(text);
        if (body?.error?.code === "maxlag") {
          lastError = new WikimediaError("source_maxlag", "Wikimedia asked the connector to retry", { retryable: true });
          if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
          continue;
        }
        if (body?.error) throw new WikimediaError(`source_${body.error.code || "api"}`, body.error.info || "Wikimedia API error");
        return body;
      } catch (error) {
        if (error instanceof WikimediaError && !error.retryable) throw error;
        lastError = error instanceof WikimediaError
          ? error
          : new WikimediaError("source_temporary", error?.name === "AbortError" ? "Wikimedia request timed out" : "Wikimedia request failed", { retryable: true });
        if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** attempt)));
      } finally { clearTimeout(timer); }
    }
    throw lastError || new WikimediaError("source_temporary", "Wikimedia request failed", { retryable: true });
  });
}

export async function resolveWikipediaArticle({ title = null, pageId = null, language = "en", expectedQid = null, fetchImpl = fetch }) {
  const url = new URL(apiUrl(language));
  for (const [key, value] of Object.entries({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "info|pageprops|revisions|langlinks", inprop: "url", rvprop: "ids|timestamp", lllimit: "max",
  })) url.searchParams.set(key, value);
  if (pageId) url.searchParams.set("pageids", String(pageId));
  else url.searchParams.set("titles", String(title || ""));
  const body = await wikimediaFetchJson(url, { fetchImpl });
  const page = body?.query?.pages?.[0];
  if (!page || page.missing || page.invalid) return { status: "no_article", language, checkedAt: new Date().toISOString() };
  if (page.ns !== 0 || Object.hasOwn(page.pageprops || {}, "disambiguation")) {
    return { status: "ambiguous", language, pageId: page.pageid || null, title: page.title || title, checkedAt: new Date().toISOString() };
  }
  const qid = page.pageprops?.wikibase_item || null;
  if (expectedQid && qid !== expectedQid) {
    return { status: "ambiguous", language, pageId: page.pageid, title: page.title, qid, expectedQid, checkedAt: new Date().toISOString() };
  }
  const revision = page.revisions?.[0];
  if (!revision?.revid || !revision?.timestamp) throw new WikimediaError("revision_missing", "resolved page has no readable revision");
  return {
    status: "matched",
    language,
    pageId: page.pageid,
    title: page.title,
    canonicalUrl: page.canonicalurl || page.fullurl,
    qid,
    revisionId: revision.revid,
    revisionTimestamp: revision.timestamp,
    redirects: (body.query.redirects || []).map((redirect) => ({ from: redirect.from, to: redirect.to })),
    langlinks: page.langlinks || [],
    checkedAt: new Date().toISOString(),
  };
}

export async function parseWikipediaRevision(article, { fetchImpl = fetch } = {}) {
  const url = new URL(apiUrl(article.language));
  for (const [key, value] of Object.entries({
    action: "parse", format: "json", formatversion: "2", oldid: String(article.revisionId),
    prop: "text|revid|displaytitle", disableeditsection: "1", disablelimitreport: "1",
  })) url.searchParams.set(key, value);
  const body = await wikimediaFetchJson(url, { fetchImpl });
  if (Number(body?.parse?.revid) !== Number(article.revisionId)) {
    throw new WikimediaError("revision_mismatch", "parsed text does not match the resolved revision");
  }
  const extracted = extractWikipediaLead(body.parse.text);
  if (!extracted.ok) throw new WikimediaError("paragraph_unusable", `Wikipedia lead could not be used: ${extracted.reason}`);
  return extracted;
}

const RELEVANCE = Object.freeze({
  en: {
    designer: /\b(fashion designer|clothing designer|couturier|designer\s+(?:best\s+)?known\s+for\s+(?:his|her|their)\s+fashion|designer of (?:clothing|fashion|ready-to-wear))\b/i,
    house: /\b(fashion house|fashion label|fashion company|clothing (?:brand|company|label)|apparel (?:brand|company|label)|luxury (?:fashion|goods) (?:house|brand|company)|leather goods (?:house|brand|company|maker)|ready-to-wear (?:brand|label|house))\b/i,
  },
  fr: {
    designer: /\b(styliste|couturier|couturière|créateur de mode|créatrice de mode|designer de mode)\b/i,
    house: /\b(maison de couture|maison de mode|marque de vêtements|entreprise de mode|marque de luxe)\b/i,
  },
});

/** The lead itself must describe this fashion identity; a structured class or
 * category cannot turn an unrelated biography into a fashion overview. */
export function paragraphDescribesKind(text, kind, language = "en") {
  const rules = RELEVANCE[languageCode(language)] || RELEVANCE.en;
  return Boolean(rules?.[kind]?.test(String(text || "")));
}

export async function fetchWikipediaOverview(candidate, { fetchImpl = fetch, now = new Date() } = {}) {
  const article = await resolveWikipediaArticle({
    title: candidate.wikipediaTitle || candidate.canonicalName,
    pageId: candidate.pageId || null,
    language: candidate.language || "en",
    expectedQid: candidate.wikidataQid || null,
    fetchImpl,
  });
  if (article.status !== "matched") return { entity: { ...candidate, matchStatus: article.status }, article };
  const extracted = await parseWikipediaRevision(article, { fetchImpl });
  if (!paragraphDescribesKind(extracted.renderedText, candidate.kind, article.language)) {
    throw new WikimediaError("paragraph_irrelevant", `Wikipedia lead does not describe the matched subject as a fashion ${candidate.kind}`);
  }
  const fetchedAt = now.toISOString();
  return {
    entity: {
      id: candidate.id || entityIdFor(candidate.canonicalName, candidate.kind),
      kind: candidate.kind,
      canonicalName: candidate.canonicalName,
      aliases: [...new Set([candidate.canonicalName, ...(candidate.aliases || []), ...article.redirects.map((r) => r.from)])],
      wikidataQid: article.qid,
      matchStatus: article.language === "en" ? "matched" : "language_only",
      publicStatus: candidate.autoPublish === false ? "review" : "published",
      preferredLanguage: article.language,
      reviewReason: candidate.autoPublish === false ? "candidate requires identity review" : null,
    },
    overview: {
      entityId: candidate.id || entityIdFor(candidate.canonicalName, candidate.kind),
      language: article.language,
      pageId: article.pageId,
      canonicalTitle: article.title,
      canonicalUrl: article.canonicalUrl,
      redirectFrom: article.redirects,
      revisionId: article.revisionId,
      revisionTimestamp: article.revisionTimestamp,
      sourceParagraph: extracted.sourceParagraph,
      renderedText: extracted.renderedText,
      paragraphSelector: extracted.selector,
      extractorVersion: extracted.extractorVersion,
      contentHash: extracted.contentHash,
      attributionLabel: "Wikipedia contributors",
      textLicense: WIKIPEDIA_TEXT_LICENSE,
      textLicenseUrl: WIKIPEDIA_TEXT_LICENSE_URL,
      editorialModifications: extracted.editorialModifications,
      image: candidate.image || null,
      status: candidate.autoPublish === false ? "review" : "published",
      checkedAt: article.checkedAt,
      fetchedAt,
      expiresAt: new Date(now.getTime() + POSITIVE_CACHE_MS).toISOString(),
    },
    article,
  };
}

export async function getWikidataEntity(qid, { languages = WIKIMEDIA_LANGUAGES, fetchImpl = fetch } = {}) {
  if (!/^Q[1-9][0-9]*$/.test(String(qid || ""))) throw new WikimediaError("qid_invalid", "invalid Wikidata item id");
  const url = new URL("https://www.wikidata.org/w/api.php");
  for (const [key, value] of Object.entries({
    action: "wbgetentities", format: "json", formatversion: "2", ids: qid,
    props: "labels|aliases|descriptions|sitelinks", languages: languages.join("|"),
    languagefallback: "1",
  })) url.searchParams.set(key, value);
  const body = await wikimediaFetchJson(url, { fetchImpl });
  return body?.entities?.[qid] || null;
}

/**
 * Bounded candidate discovery through one configured Wikidata class. The
 * class is qualification evidence, not overview prose. Results include an
 * English sitelink so the later revision-aware article resolver remains the
 * authority for page identity and usable text.
 */
export async function discoverWikidataClass({ classQid, kind, language = "en", requireNoEnglish = false, limit = 40 }, { fetchImpl = fetch } = {}) {
  if (!/^Q[1-9][0-9]*$/.test(String(classQid || ""))) throw new WikimediaError("qid_invalid", "invalid Wikidata class id");
  if (!["designer", "house"].includes(kind)) throw new WikimediaError("kind_invalid", "invalid fashion entity kind");
  const cap = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 40));
  const predicate = kind === "designer" ? "wdt:P106" : "wdt:P31";
  const lang = languageCode(language);
  const site = `https://${lang}.wikipedia.org/`;
  const noEnglish = requireNoEnglish
    ? "FILTER NOT EXISTS { ?english schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }"
    : "";
  const query = `SELECT DISTINCT ?item ?article WHERE {
    ?item ${predicate} wd:${classQid} .
    ?article schema:about ?item ; schema:isPartOf <${site}> .
    ${noEnglish}
  } LIMIT ${cap}`;
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("format", "json");
  url.searchParams.set("query", query);
  const body = await wikimediaFetchJson(url, { fetchImpl, timeoutMs: 30_000 });
  return (body?.results?.bindings || []).map((row) => ({
    wikidataQid: String(row.item?.value || "").split("/").pop(),
    canonicalName: decodeURIComponent(String(row.article?.value || "").split("/wiki/").pop() || "").replace(/_/g, " "),
    language: lang,
    wikipediaTitle: decodeURIComponent(String(row.article?.value || "").split("/wiki/").pop() || "").replace(/_/g, " "),
    kind,
  })).filter((row) => /^Q[1-9][0-9]*$/.test(row.wikidataQid) && row.canonicalName && row.wikipediaTitle);
}

/** Bounded Wikipedia category traversal. Category membership creates a
 * review candidate only; it does not by itself prove identity or entity kind. */
export async function discoverWikipediaCategory({ category, language = "en", kind, limit = 40 }, { fetchImpl = fetch } = {}) {
  if (!["designer", "house"].includes(kind)) throw new WikimediaError("kind_invalid", "invalid fashion entity kind");
  const cap = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 40));
  const url = new URL(apiUrl(language));
  for (const [key, value] of Object.entries({
    action: "query", format: "json", formatversion: "2", list: "categorymembers",
    cmtitle: category, cmnamespace: "0", cmtype: "page", cmlimit: String(cap), cmsort: "sortkey",
  })) url.searchParams.set(key, value);
  const body = await wikimediaFetchJson(url, { fetchImpl });
  return (body?.query?.categorymembers || []).map((page) => ({
    canonicalName: page.title,
    wikipediaTitle: page.title,
    pageId: page.pageid,
    language,
    kind,
  }));
}

const descriptionFits = (description, kind) => {
  const text = String(description || "").toLowerCase();
  return kind === "designer"
    ? /fashion designer|couturier|clothing designer/.test(text)
    : /fashion house|fashion label|clothing brand|luxury brand/.test(text);
};

/** Bounded on-demand identity lookup. Ambiguity is a result, never a guess. */
export async function resolveNameCandidate(name, kind, { fetchImpl = fetch, languages = WIKIMEDIA_LANGUAGES } = {}) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  for (const [key, value] of Object.entries({
    action: "wbsearchentities", format: "json", language: "en", type: "item",
    limit: "8", search: String(name || "").slice(0, 300),
  })) url.searchParams.set(key, value);
  const body = await wikimediaFetchJson(url, { fetchImpl });
  const exact = (body.search || []).filter((row) => foldEntityName(row.label) === foldEntityName(name) && descriptionFits(row.description, kind));
  if (exact.length !== 1) return { status: exact.length ? "ambiguous" : "no_article", candidates: exact.map((row) => row.id) };
  const item = await getWikidataEntity(exact[0].id, { languages, fetchImpl });
  if (!item) return { status: "temporary_failure" };
  const sitelinks = item.sitelinks || {};
  const language = languages.find((lang) => sitelinks[`${lang}wiki`]?.title);
  if (!language) return { status: "wikidata_only", qid: exact[0].id };
  return {
    status: language === "en" ? "matched" : "language_only",
    candidate: {
      id: entityIdFor(name, kind), kind, canonicalName: item.labels?.en?.value || name,
      aliases: Object.values(item.aliases || {}).flat().map((alias) => alias.value),
      wikidataQid: exact[0].id, language, wikipediaTitle: sitelinks[`${language}wiki`].title,
      autoPublish: true,
    },
  };
}

export function retryAtFor(status, now = Date.now()) {
  const delay = status === "no_article" || status === "wikidata_only"
    ? MISSING_RETRY_MS
    : status === "temporary_failure" ? TEMPORARY_RETRY_MS : POSITIVE_CACHE_MS;
  return new Date(now + delay).toISOString();
}
