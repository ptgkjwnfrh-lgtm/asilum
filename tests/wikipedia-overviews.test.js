import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import DATASET from "../data/wikipedia-overviews.json" with { type: "json" };
import {
  extractWikipediaLead,
} from "../lib/people/wikipedia/extract.js";
import {
  fetchWikipediaOverview, paragraphDescribesKind, resolveWikipediaArticle, wikimediaFetchJson,
} from "../lib/people/wikipedia/client.js";
import {
  paragraphHash, validateOverviewRecord, wikipediaEntityDto,
} from "../lib/people/wikipedia/contract.js";
import {
  getWikipediaOverview, registerFashionCandidate, upsertFashionEntity, upsertWikipediaOverview,
  enqueueWikipediaJob,
} from "../lib/db/production.js";
import { queueWikipediaDiscoveryCycle } from "../lib/people/wikipedia/jobs.js";
import { WIKIPEDIA_DISCOVERY_SOURCES } from "../lib/people/wikipedia/registry.js";

const fixtureDir = path.join(process.cwd(), "tests", "fixtures", "wikipedia");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function articleFetch(queryFixture, parseFixture) {
  return async (input) => {
    const url = new URL(input);
    if (url.searchParams.get("action") === "query") return response(fixture(queryFixture));
    if (url.searchParams.get("action") === "parse") return response(fixture(parseFixture));
    throw new Error(`unexpected fixture URL: ${url}`);
  };
}

test("revision-pinned person and eponymous house are distinct subjects with exact source paragraphs", async () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const person = await fetchWikipediaOverview({
    id: "fixture-tom-ford", kind: "designer", canonicalName: "Tom Ford",
    wikidataQid: "Q318149", language: "en", wikipediaTitle: "Tom Ford", autoPublish: true,
  }, { fetchImpl: articleFetch("query-person.json", "parse-person.json"), now });
  const house = await fetchWikipediaOverview({
    id: "fixture-tom-ford-house", kind: "house", canonicalName: "Tom Ford",
    wikidataQid: "Q1531596", language: "en", wikipediaTitle: "Tom Ford label", autoPublish: true,
  }, { fetchImpl: articleFetch("query-house.json", "parse-house.json"), now });
  assert.ok(validateOverviewRecord(person).ok);
  assert.ok(validateOverviewRecord(house).ok);
  assert.notEqual(person.entity.id, house.entity.id);
  assert.notEqual(person.entity.wikidataQid, house.entity.wikidataQid);
  assert.match(person.overview.renderedText, /^Thomas Carlyle Ford/);
  assert.match(house.overview.renderedText, /^Tom Ford is an American luxury fashion house/);
  assert.equal(person.overview.sourceParagraph, person.overview.renderedText);
  assert.equal(house.overview.sourceParagraph, house.overview.renderedText);
  assert.deepEqual(house.overview.redirectFrom, [{ from: "Tom Ford label", to: "Tom Ford (brand)" }]);
});

test("DOM extraction skips boilerplate and removes only recorded display markup", () => {
  const parsed = extractWikipediaLead(fixture("parse-person.json").parse.text);
  assert.equal(parsed.ok, true);
  assert.doesNotMatch(parsed.renderedText, /For other uses|alert|\[1\]/);
  assert.match(parsed.renderedText, /born August 27, 1961/);
  assert.ok(parsed.editorialModifications.includes("citation markers removed"));
  assert.equal(parsed.contentHash, paragraphHash(parsed.sourceParagraph));
});

test("structured discovery evidence cannot publish an unrelated lead", () => {
  assert.equal(paragraphDescribesKind("Anna Example is a former intelligence agent and media personality.", "designer", "en"), false);
  assert.equal(paragraphDescribesKind("Example is a French fashion designer known for independent collections.", "designer", "en"), true);
  assert.equal(paragraphDescribesKind("Example is a restaurant that once hosted a boutique.", "house", "en"), false);
});

test("ambiguity, wrong QID, no article, non-English text, and transient failure remain distinct", async () => {
  const disambiguation = await resolveWikipediaArticle({
    title: "Alex Smith", language: "en",
    fetchImpl: async () => response(fixture("query-disambiguation.json")),
  });
  assert.equal(disambiguation.status, "ambiguous");
  const wrong = await resolveWikipediaArticle({
    title: "Tom Ford", language: "en", expectedQid: "Q999",
    fetchImpl: async () => response(fixture("query-person.json")),
  });
  assert.equal(wrong.status, "ambiguous");
  const missing = await resolveWikipediaArticle({
    title: "No Such Designer", language: "en",
    fetchImpl: async () => response(fixture("query-missing.json")),
  });
  assert.equal(missing.status, "no_article");
  const french = await fetchWikipediaOverview({
    id: "fixture-creatrice", kind: "designer", canonicalName: "Créatrice Exemple",
    wikidataQid: "Q404404", language: "fr", wikipediaTitle: "Créatrice Exemple", autoPublish: true,
  }, { fetchImpl: articleFetch("query-french.json", "parse-french.json"), now: new Date("2026-09-19T12:00:00Z") });
  assert.equal(french.entity.matchStatus, "language_only");
  assert.equal(french.overview.language, "fr");
  assert.match(french.overview.renderedText, /styliste française/);
  await assert.rejects(
    wikimediaFetchJson("https://en.wikipedia.org/w/api.php?action=query&format=json", {
      attempts: 1, fetchImpl: async () => response({ error: "down" }, 503),
    }),
    (error) => error.code === "source_temporary" && error.retryable === true,
  );
});

test("discovery paths are independently sufficient and the registry is extensible", async () => {
  const types = new Set(WIKIPEDIA_DISCOVERY_SOURCES.map((source) => source.type));
  for (const type of ["wikidata", "wikipedia_category", "fashion_week", "boutique_directory"]) assert.ok(types.has(type), type);
  for (const [suffix, evidenceType] of [["boutique", "stockist"], ["week", "fashion_week"], ["runway", "runway"]]) {
    const result = await registerFashionCandidate({
      entity: { id: `fixture-${suffix}`, kind: "designer", canonicalName: `Fixture ${suffix}`, aliases: [], wikidataQid: null },
      evidence: { sourceKey: evidenceType === "stockist" ? "boutique-directories" : "fashion-week-official", evidenceUrl: `https://example.invalid/${suffix}`, evidenceType, qualification: { independentlyQualifies: true } },
    });
    assert.equal(result.evidence.evidenceType, evidenceType);
    assert.equal(result.entity.matchStatus, "candidate");
  }
});

test("the checked-in population is broad, traceable, and includes external and historical records", () => {
  assert.ok(DATASET.coverage.candidates >= 60, `candidates ${DATASET.coverage.candidates}`);
  assert.ok(DATASET.coverage.publishedOverviews >= 50, `published ${DATASET.coverage.publishedOverviews}`);
  assert.ok(DATASET.sources.filter((source) => source.scanned).length >= 3);
  const seedIds = new Set(["tom-ford", "hedi-slimane", "yves-saint-laurent", "gucci"]);
  const external = DATASET.evidence?.find((row) => row.sourceKey === "wikidata-fashion-designers" && !seedIds.has(row.entityId));
  assert.ok(external, "a designer outside the career seed arrived through general Wikidata discovery");
  const historical = DATASET.entities.find((row) => /Callot Soeurs|Schiaparelli/i.test(row.canonicalName));
  assert.ok(historical, "historical or defunct fashion house retained");
  assert.ok(DATASET.overviews.some((row) => row.language !== "en"), "non-English-only article retained without translation");
});

test("public DTO keeps text and image rights separate and never invents fallback prose", () => {
  const entity = { id: "rights-fixture", kind: "designer", canonicalName: "Rights Fixture", aliases: [], wikidataQid: "Q42", matchStatus: "matched", publicStatus: "published", preferredLanguage: "en" };
  const overview = {
    entityId: entity.id, language: "en", pageId: 1, canonicalTitle: "Rights Fixture",
    canonicalUrl: "https://en.wikipedia.org/wiki/Rights_Fixture", redirectFrom: [],
    revisionId: 2, revisionTimestamp: "2026-01-01T00:00:00Z", sourceParagraph: "A valid paragraph with enough words to represent an existing Wikipedia introduction without any generated replacement prose.",
    renderedText: "A valid paragraph with enough words to represent an existing Wikipedia introduction without any generated replacement prose.",
    paragraphSelector: ".mw-parser-output > p:nth-of-type(1)", extractorVersion: "lead-paragraph-dom-v1",
    contentHash: paragraphHash("A valid paragraph with enough words to represent an existing Wikipedia introduction without any generated replacement prose."),
    attributionLabel: "Wikipedia contributors", textLicense: "CC BY-SA 4.0", textLicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    editorialModifications: [], image: { url: "https://example.invalid/image.jpg", rightsVerified: false }, status: "published",
    checkedAt: "2026-09-19T00:00:00Z", fetchedAt: "2026-09-19T00:00:00Z", expiresAt: "2026-09-26T00:00:00Z",
  };
  const dto = wikipediaEntityDto(entity, overview);
  assert.equal(dto.overview.paragraph, overview.sourceParagraph);
  assert.equal(dto.image, null, "an unverified image is suppressed without suppressing licensed text");
  assert.equal(dto.sources[0].publisher, "Wikipedia contributors");
  assert.equal(wikipediaEntityDto({ ...entity, publicStatus: "unpublished" }, null).overview, null);
  for (const file of ["lib/people/resolve.js", "lib/people/wikipedia/client.js", "lib/people/wikipedia/jobs.js"]) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /runModel|lib\/ai|\/api\/ai/, `${file} must not call a generative path`);
  }
});

test("suspicious refreshes quarantine the candidate and preserve the last-known-good paragraph", async () => {
  const refreshFetch = async (input) => {
    const url = new URL(input);
    if (url.searchParams.get("action") === "parse") return response(fixture("parse-person.json"));
    const query = fixture("query-person.json");
    query.query.pages[0].pageprops.wikibase_item = "Q777777";
    return response(query);
  };
  const fetched = await fetchWikipediaOverview({
    id: "fixture-refresh", kind: "designer", canonicalName: "Tom Ford",
    wikidataQid: "Q777777", language: "en", wikipediaTitle: "Tom Ford", autoPublish: true,
  }, { fetchImpl: refreshFetch, now: new Date("2026-09-19T12:00:00Z") });
  await upsertWikipediaOverview(fetched.entity, fetched.overview);
  const changedText = `${fetched.overview.renderedText} `.repeat(5).trim();
  const changed = { ...fetched.overview, revisionId: 9005, sourceParagraph: changedText, renderedText: changedText, contentHash: paragraphHash(changedText) };
  const result = await upsertWikipediaOverview(fetched.entity, changed);
  assert.equal(result.quarantined, true);
  assert.equal((await getWikipediaOverview(fetched.entity.id, "en")).revisionId, 9001);
  const approved = await upsertWikipediaOverview(fetched.entity, changed, {
    operatorApproved: true,
    auditDetails: { source: "fixture-operator" },
  });
  assert.equal(approved.quarantined, undefined);
  assert.equal((await getWikipediaOverview(fetched.entity.id, "en")).revisionId, 9005);
});

test("stable Wikidata identity deduplicates alternate slugs", async () => {
  const first = await upsertFashionEntity({ id: "fixture-stable-a", kind: "house", canonicalName: "Fixture House", aliases: [], wikidataQid: "Q888888", matchStatus: "matched", publicStatus: "published", preferredLanguage: "en" });
  const second = await upsertFashionEntity({ id: "fixture-stable-b", kind: "house", canonicalName: "Fixture House International", aliases: ["Fixture House"], wikidataQid: "Q888888", matchStatus: "matched", publicStatus: "published", preferredLanguage: "en" });
  assert.equal(second.id, first.id);
  assert.ok(second.aliases.includes("Fixture House"));
});

test("resolve jobs deduplicate and the UI contract contains four-line accessible expansion and attribution", async () => {
  const first = await enqueueWikipediaJob({ jobKey: "fixture-resolve-job", kind: "resolve", payload: { canonicalName: "Fixture" } });
  const second = await enqueueWikipediaJob({ jobKey: "fixture-resolve-job", kind: "resolve", payload: { canonicalName: "Fixture" } });
  assert.equal(first.id, second.id);
  const component = fs.readFileSync(path.join(process.cwd(), "app", "components", "PersonOverview.jsx"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "app", "components", "person-overview.css"), "utf8");
  assert.match(component, /aria-expanded/);
  assert.match(component, /Wikipedia contributors/);
  assert.match(component, /edge\.queryText/);
  assert.match(css, /-webkit-line-clamp:\s*4/);
});

test("automated discovery rotates through bounded, idempotent leased jobs", async () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const [first] = await queueWikipediaDiscoveryCycle({ now, limit: 500 });
  const [second] = await queueWikipediaDiscoveryCycle({ now, limit: 500 });
  assert.equal(first.id, second.id);
  assert.equal(first.kind, "discover");
  assert.equal(first.payload.limit, 25);
  assert.match(first.jobKey, /^discover:[a-z0-9-]+:2026-09-19$/);
  const script = fs.readFileSync(path.join(process.cwd(), "scripts", "wikimedia-overviews.mjs"), "utf8");
  assert.match(script, /operator_mapping_applied/);
  assert.match(script, /--database --approve/);
});
