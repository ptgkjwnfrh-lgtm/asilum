# Wikipedia designer and house overviews

Implemented September 19, 2026. This system displays one existing introductory paragraph from a resolved Wikipedia article. It does not ask a model to write, summarize, translate, expand, or repair overview prose.

## Public contract

`GET /api/discover` and `GET /api/search` return the same nullable `overview`, `entities`, `related`, and canonical query IDs. A publishable entity includes a stable ASILUM ID, entity kind, aliases, Wikidata QID, and a revision-pinned overview. The overview carries page ID, canonical article URL/title, language, exact revision and timestamp, source paragraph, safe rendered text, extractor version/hash, retrieval/check/expiry timestamps, attribution, license, and recorded formatting cleanup.

The UI shows a four-line collapsed paragraph, accessible expansion, “Wikipedia contributors · Read article · License,” revision/history details, and chronological relationship nameplates. Missing Wikipedia text never removes valid clothing results or sourced career relationships. A missing or uncleared image produces a typographic card; image rights never inherit the text license.

## Resolution and extraction

The connector resolves a page through `action=query`, checks namespace, disambiguation and expected Wikidata identity, records the current revision, then calls `action=parse&oldid=...`. A response whose parse revision differs is rejected. DOM extraction examines direct lead paragraphs, skips non-prose boilerplate, removes citation/display nodes, normalizes whitespace, and stores plain text. The first substantive paragraph must itself describe the subject as a fashion designer or fashion house; a Wikidata class or category cannot publish an unrelated biography.

English is preferred. A verified article in another configured language may publish with its language visible when no English sitelink exists. It is never automatically translated.

## Population and operations

Run from the repository root:

```sh
npm run wikipedia:canary
npm run wikipedia:populate -- --limit=3000 --enrich-limit=450 --per-source=40
npm run wikipedia:report
```

Add `--database` to the population command only after v54 is applied to the intended authorized database. Without it, the command writes the reviewable `data/wikipedia-overviews.json` artifact used by memory-mode development and preview. The runner starts with the sourced ASILUM career registry, then scans bounded Wikidata class/sitelink queries, a non-English coverage path, and configured Wikipedia categories. Official fashion-week archives and boutique directories are registered as reviewed manual discovery paths; they provide qualification evidence, never biography text.

Committed searches with no paragraph may enqueue a deduplicated resolution job at `POST /api/knowledge/wikipedia/resolve`. It requires a signed device and is rate limited. It never fetches Wikimedia in the search request. Vercel Cron calls `GET /api/knowledge/wikipedia/run` every six hours using `CRON_SECRET`; each run leases at most five jobs. One enabled automated source rotates into a bounded discovery job per UTC day, which checkpoints the scan and queues separately leased resolution jobs. Positive records revalidate after seven days. Missing items retry sooner. Transient errors retain the last-known-good paragraph, while page identity changes and sharp lead changes enter `wikipedia_reviews` without replacing it.

Set `WIKIMEDIA_USER_AGENT` to a descriptive, contact-bearing value for production. The default identifies ASILUM and its website. Requests are serialized per Wikimedia host, bounded in size/time, send `maxlag`, and honor retry/backoff signals.

## Coverage and limits

`data/wikipedia-overviews.json` records the generated timestamp, each configured source and scan result, discovery evidence, entities, reviews, and the corpus denominator. The report counts candidates, matched designers/houses (including verified language-only matches), published overviews, missing/ambiguous/rejected/error states, pending jobs, languages, and every candidate's coverage region. These are counts for the discovered corpus—not a claim that Wikipedia, Wikidata, the industry directories, or ASILUM enumerate every designer or house.

The checked-in September 19, 2026 population contains 2,819 candidates: 246 matched designers, 48 matched houses, and 255 published overviews (252 English, 3 French). It records 35 missing articles, 4 ambiguous matches, 27 rejected matches, 0 source errors, and 2,466 deduplicated candidates awaiting bounded enrichment. A reviewed 269-name global ledger provides a deterministic major-name audit; 224 currently publish and every one of the 38 required launch anchors passes the identity and paragraph gates. Remaining ledger gaps stay visible with an explicit status rather than disappearing or accepting an unsafe match.

| Region | Candidates | Published overviews |
|---|---:|---:|
| North America | 872 | 41 |
| Europe | 1,139 | 99 |
| Africa | 121 | 22 |
| East Asia | 139 | 27 |
| South Asia | 125 | 20 |
| Southeast Asia | 72 | 0 |
| Latin America and the Caribbean | 107 | 21 |
| Middle East | 91 | 7 |
| Oceania | 117 | 6 |

Discovery starts with the ASILUM career registry and reviewed global major-name ledger. It then parses the revision-recorded English Wikipedia nationality list, scans Wikidata designer/house classes and the French-without-English path, and samples general plus country/region Wikipedia categories. The nationality list contributes the broad denominator even when a candidate falls outside the current enrichment budget; the pending record preserves its country, region, exact article title, list revision, and evidence for later jobs.

Official CFDA, FHCM, Camera Nazionale della Moda Italiana, Tokyo, Shanghai, Lakmé × FDCI, South African, Lagos, and São Paulo sources are registered as reviewed manual discovery paths. They are not falsely reported as automated scans and cannot supply biography prose; publication still requires a resolved, revision-pinned Wikipedia paragraph.

The source registry is extensible in `lib/people/wikipedia/registry.js`; country-to-region normalization is isolated in `lib/people/wikipedia/regions.js`, and the reviewed name ledger is `data/fashion-coverage-registry.json`. New external directories require a reviewed access basis, precise discovery URLs, region/season metadata, and evidence semantics that distinguish designer stockists from resale, shows from attendance, and fashion houses from parent corporations or retailers.

## Corrections and rollback

Preview an exact operator mapping without writing:

```sh
npm run wikipedia:map -- --kind=designer --name="Name" --qid=Q123 --language=en --title="Exact Wikipedia title"
```

After reviewing the resolved QID, page, revision and exact paragraph, repeat with `--database --approve` in an authorized environment. The write verifies the QID and relevance again, records `operator_mapping` evidence, and emits an `operator_mapping_applied` audit row. It can intentionally accept a suspicious page/lead change; the explicit `--approve` is therefore required. Never silently edit imported prose or relabel another source as Wikipedia.

To roll back the feature, remove the Wikipedia UI/API/job wiring before dropping v54 tables; export audit/review/overview records first. The exact destructive rollback statements are documented at the top of `supabase/schema-v54-wikipedia-overviews.sql` and are not run automatically.
