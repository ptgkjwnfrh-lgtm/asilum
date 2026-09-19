# ASILUM V.2: Claude backend handoff

Prepared September 19, 2026. Target: Sunday, September 20, 2026. Planning timezone: America/New_York.

**Claude owns ASTERISK and the backend. Codex owns UI design and client interactions.** This replaces the earlier combined design/ASTERISK handoff. These assignments come from the owner's latest instruction. They allocate work; they do not claim either model is universally better at a domain.

Start with [COORDINATION.md](COORDINATION.md), then [CONTRACTS.md](CONTRACTS.md). The API shapes there are a proposed integration contract, not a claim that new endpoints exist. Acknowledge or amend them in the coordination issue before making incompatible changes. Read AGENTS.md, the opening owner directive in CONSTITUTION.md, docs/OWNER-DECISIONS.md, and docs/INVISIBLE-MACHINERY.md. The owner wants a sourced fashion operating system, not a chatbot or speculative biography generator.

## Ownership

| Owner | Work and files |
|---|---|
| Codex | Layouts, typography, glass, glowing roads, animation, responsive behavior, accessibility, search/overview/carousel presentation, map interactions, upload/connect surfaces, messaging screens, fit presentation, purchase screens. `app/**` components/pages/styles and presentation assets, excluding server routes. |
| Claude | ASTERISK reasoning/ranking/memory, search interpretation/retrieval, designer/house records, fit engine, DM delivery, purchase/order/ticket aggregation, authentication and authorization, data sourcing, provider adapters, persistence, backend tests. `lib/brain/**`, `lib/asterisk/**`, `lib/search/**`, `lib/people/**`, `lib/db/**`, engine libraries, `app/api/**`, backend scripts/tests. |
| Coordinate first | Shared client/server libraries, package changes, schema/migrations, new response contracts, route renames, deployment configuration, and changes to payment policy. Name exact files in the issue before touching another lane. |

Claude should not redesign components, global CSS, brand language, map controls, or page layouts. Give Codex data and states to render. Codex should not silently change ranking, financial state transitions, or authorization while integrating screens.

## Actual starting point

Use the production-source `ui/live-launch-v2` branch. The audited base is `67a016f33da6cda20b4e9be00bf90716cdc92e19`, not the separate Sites prototype. The repo already includes substantial backend systems. Extend those systems rather than introducing parallel stores or replacing working contracts.

| Area | Existing implementation | What must survive |
|---|---|---|
| Ranking | `lib/brain/index.js`, `bridges.js`, `chunk.js`, `tuning.js` | Existing attribution, diversity/allocation, floors, sponsorship disclosure, repeat control. |
| Memory | `lib/asterisk/memory.js`, `lib/brain/memory.js`, `lib/asterisk/margin.js` | `MEMORY_CONTRACT_VERSION=2` facade; explicit, inferred, global, and uncertainty sections. Raw body measurements stay outside the general memory facade. |
| Search | `lib/search/index.js`, `designers.js`, `denseQuery.js`, constraint modules | Hard constraints; existing results/interpreted/note/total contract; honest catalog limits. |
| Fit | `lib/brain/sizing.js`, `measurements.js`, `/api/measurements` | Inputs/display can use inches or centimetres; stored/comparison units currently inches. Private measurements and comparison evidence. |
| DM | `lib/dm.js`, `lib/db/dm/*`, `/api/dm` | Account-only, PostgreSQL-only, flag-gated delivery; request/accept/block laws, locks, rate limits, cursor pagination. |
| Purchases | `lib/orders.js`, `lib/tickets.js`, `lib/db/orders.js`, `lib/db/production/tickets.js` | Separate actual payment orders and source purchase tickets, signed webhook reconciliation, consent, idempotency, settlement validation. |

Docs contain stale schema/version references: v25, v49, and v50 appear in different files. Verify migrations and the authorized test database before any schema work. `package.json` currently pins Next 16.2.10 and requires Node >=22. Do not follow old Next 14 or v1-v10 migration instructions as a current runbook.

## ASTERISK: restructure the learning bridges without losing their meaning

The goal is a system that knows which evidence is reliable, which preferences apply now, and what new evidence would improve its next selection. More autonomous agents or more model calls are not the primary improvement.

The existing scoring bridges are:

| Bridge | Meaning in current code | Base allocation |
|---|---|---:|
| Alpha | Direct tag-vector cosine | 30% |
| Beta | Strongest shared trait | 15% |
| Gamma | Co-engagement plus discounted text/image neighbors | 20% |
| Delta | Popularity | 10% |
| Epsilon | Exploration | 15% |
| Ad | Eligible, disclosed sponsorship | 10% |

The long/session taste blend is a separate **60/40** calculation; the chunk allocator also has a fixed 25% catalog lane. Do not add those percentages together. Earlier descriptions of Alpha as intentional taste and Beta as behavior do not describe this implementation. Preserve names/metrics or explicitly version and migrate them.

### Proposed evidence flow

1. **Understand the request.** Resolve intent, canonical entities, exclusions, budget, category, availability, and requested context. The user's current explicit sentence wins over passive behavior. Do not turn a search into a permanent preference automatically.
2. **Retrieve evidence.** Read existing explicit preferences, session behavior, authorized pins/connections, sourced catalog facts, fit evidence, and archive relationships. Each fact retains origin, time, scope, and confidence. A derived similarity never becomes independent proof of another relationship.
3. **Keep multiple taste contexts.** Someone can like tailoring, archive sportswear, and minimal daywear. First ship bounded, interpretable context profiles over existing storage. Avoid collapsing every interaction into one permanent average. A query can activate a context without erasing the others.
4. **Generate candidates broadly.** Combine exact/entity matching, lexical retrieval, visual/content similarity, and existing behavioral neighbors. Deduplicate canonical items/variants. Constrain eligible results before and after approximate retrieval so a hard constraint cannot be relaxed accidentally.
5. **Rank with separate reasons.** Keep relevance, taste, fit certainty, price constraints, recency, and exploration attributable. Unknown fit means unknown, not a perfect fit or automatic rejection. The owner's policy forbids demoting an item merely for an unverified marketplace origin. Label provenance without inventing a new penalty.
6. **Diversify with bounded exploration.** Use current repeat/diversity laws. Exploration must still satisfy constraints. A new bandit policy stays behind a flag until logging, reward definitions, bias handling, and replay gates are ready.
7. **Learn from corrections precisely.** “Too expensive” changes price handling; “too small” changes fit; “dislike shine” changes finish preference. Do not punish the designer, material, and silhouette for an unrelated reason. Explicit corrections outrank ambiguous dwell or skips and are reversible.
8. **Explain only what is supported.** Return short evidence-backed reasons to Codex, not raw chain-of-thought. Keep model internals out of normal product copy. Ask an optional targeted question only when its answer would materially change selection; otherwise show honest uncertainty quietly.

Preserve `citableTags` and the single evidence floor in `lib/asterisk/margin.js`. Explicit evidence, statistical similarity, and hypotheses are different types. Do not let repeated inference launder a guess into a fact. Never train the taste model on private DMs by default. Connected-source access requires the actual approved scope and disconnect/deletion behavior.

### Immediate learning work

- Add reason-specific feedback events with deduplication, context, impression attribution, version, and undo support through existing memory stores.
- Review `applyTimeDecay`: the same six-idle-day half-life currently affects long and session vectors. Explicit user choices should not silently disappear because the user was away. Choose decay by evidence class and validate it.
- Review search's equal addition of long/session vectors against `tasteVector`'s 60/40 blend. Document an intentional surface difference or remove the drift with regression tests.
- Preserve tuning safeguards: 120 attributed impressions and 8 weighted engagements before tuning, bounded weight lift, protected floors/caps, and no ad self-tuning. Any change needs before/after replay evidence.
- Version the new behavior behind a flag. Keep a rollback to the current ranker. Do not retrain a foundation model for Sunday's delivery or activate paid inference without the required authorization.

## Search and the designer/house knowledge model

**Priority: implement an explicit `designer: house` intersection.** The current generic interpreter checks designer credits only for text intent; house recognition can win first. A designer who is also a brand makes this more ambiguous. Parse the pair before generic interpretation and resolve canonical IDs. Matching Gucci alone is not proof a garment was designed by Tom Ford.

The owner expects both directions:

- Designer overview -> all verified houses/roles -> `TOM FORD: GUCCI` -> credited inventory personalized within that intersection.
- House overview -> designers in chronology -> `HEDI SLIMANE: SAINT LAURENT PARIS` -> the same search structure.
- Search results contain the overview, quick selections, then clothing. Expanded overviews expose the related entities and relevant clothing groups. Codex builds these layouts.

Build sourced, dated designer-house relationships independently of current inventory. `creditFootprint` derives current houses from item credits and sorts by inventory count; it cannot establish a complete career or chronological succession. Preserve role distinctions, multiple tenures, collections, and name/brand-era aliases. Do not merge founder and house entities because they share a name. Unknown dates stay unknown; overlapping roles are not forced into a false single succession.

Seed Tom Ford, Hedi Slimane, Gucci, Saint Laurent/Yves Saint Laurent, Dior, Celine, and the related designers only after checking authoritative sources. The user's examples describe desired navigation, not a complete historical dataset. A house with no matching stock still belongs in a verified career record and returns an honest empty rack. Never fill it with unrelated clothes.

**Overview prose must be Vogue-sourced**, as requested. Write brief original summaries with specific article/show URLs and retrieval dates. Do not substitute a homepage as evidence, reproduce whole articles, or assume image display/training rights from article access. The current Olivier record has other publishers and is not evidence that the Vogue requirement is complete. Use separately licensed/approved images with credits; report missing coverage.

Add stable search snapshot/cursor pagination. Current `searchProducts` uses `slice(offset, offset + limit)`, discover exposes offsets, and `/api/search` takes a fixed 48. Bind cursors to query, filters, eligibility context, ranking version/snapshot, and a stable tie-breaker. Invalid/expired cursors return an explicit error or restart instruction. Do not silently re-rank midway and skip/duplicate results.

## Sizing: fix truthfulness before extending coverage

Two primitive-level bugs were reproduced locally without a database:

1. `normalizeMeasurementProfile({usualSize:"M",unit:"in"})` stores null dimensions, but `measurementProfileForDisplay` returns zeroes because `Number(null) === 0`. Preserve absent values on display/resave and test both units.
2. `sizeRecord("M",{category:"tops",measurementSource:"merchant"})` can attach merchant provenance to estimated table values; a fit assessment can then report `exact:true`. Require actual supplied evidence, ideally per dimension. This finding does not establish that every adapter currently mislabels data.

Use typed distinctions: actual garment measurement, brand size-chart estimate, user body measurement, listing label, and unknown. Record unit, measurement method (flat width versus circumference), source URL/record, collection/variant where relevant, and timestamp. Do not double a circumference or compare flat width directly with body circumference. A generic chart is not a measurement of the secondhand garment in front of the user. Fit compatibility is not a guarantee.

Current coverage is chest/waist/hips/inseam/height storage with a narrower fit comparison. Shoulder, sleeve, garment length, stretch, alterations, footwear, and intended fit need explicit support and evidence. Do not advertise those as solved by Sunday. Return missing fields and confidence without exposing raw body data in search telemetry or generic model prompts.

## Direct messages

Reuse the existing operations: summary, inbox, thread, find, activity, blocks; send, accept, decline, read, block, unblock, consent, react, unsend, mute, typing, settings. Audit actual behavior rather than relying on old “open finding” paragraphs that now conflict with a closed findings register.

Prove account A/account B delivery, stranger request acceptance, block enforcement, nonparticipant rejection, pagination, retry deduplication, concurrent sends, reconnect recovery, and deletion/export in an isolated PostgreSQL environment. Realtime notifications are transport hints; the durable thread is authoritative. Supabase Realtime authorization does not replace server-side membership checks for reads/writes. Media consent exists but a media pipeline is a separate dependency; do not enable imaginary attachments. Codex owns thread/inbox presentation and client pending/failed states.

## Purchase and order hub

Interpret “purchase housing” as the user's purchase/order/ticket hub. It does not authorize inventory warehousing, stock reservations, or a new payment policy.

- `/api/orders` normally represents bag-intent history, not paid purchases.
- `/api/checkout?mine=1` provides payment orders and pending reconciliation.
- `/api/tickets` provides source tickets, consent, and user-reported outcomes.
- `/api/orders?places=1` aggregates paid sale orders plus self-reported ticket outcomes, which remain different evidence classes.

Provide one read facade over these records for Codex. Separate direct sale payment, ASILUM fee payment, merchant checkout handoff, user-reported purchase, and verified merchant fulfillment. Payment of a fee is not proof a garment was purchased. A return/refund of one financial lane must not imply the other lane was refunded. Preserve the current 1% founders fee with its USD 50-cent floor unless the owner changes policy explicitly.

Use provider signatures, server-derived ownership/amounts, idempotency, deduplicated webhooks, reconciliation, and typed recoverable errors. A browser return URL is not proof of payment. Do not collect card details or merchant passwords in application state. Existing code refuses demo inventory; keep that protection. External checkout and actual merchant integrations must be labeled accurately. Provider accounts, authorized scopes, stock, and webhook setup remain real launch dependencies.

## Source adapters and persistence

Claude owns catalog ingestion, consent/OAuth services, image metadata, source freshness, and map/store/event data APIs. Codex owns the presentation and provider map integration on the client. Return supported capability flags and unavailable states; never paint a mock connection as connected. Precise user location is private by default and requires explicit sharing scope/consent. Public map records need bounded viewport queries/clustering, not a download of every user's location.

Validate IDs, URLs, money/currency, timestamps, optional values, deduplication, and source provenance at ingestion. Treat retrieved text as data, not execution instructions. Separate permission to link/display from permission to scrape, cache, embed, or train. Add source adapters only with permitted access. Never upload private pins, measurements, or messages to model providers just because an API exists.

Preserve mem/PG parity where the repo requires it; DM's intentional PG-only path should remain explicit. New user-linked tables must participate in identity adoption, export, and erasure. Follow `.claude/skills/database-safety/SKILL.md` before database work. Do not run tests against production or source `.env.local` into the unit-test shell.

## Sunday order of work and evidence of completion

1. Acknowledge contracts and exact ownership in the coordination issue. Audit active branches before editing.
2. Fix the confirmed measurement and failure-state bugs. `/api/search` and `/api/tickets` currently turn some errors into empty results; empty and unavailable need different outcomes.
3. Deliver designer-house resolution, sourced relationship records, Vogue overview coverage, and cursor/snapshot search. Give Codex a working vertical slice early.
4. Add bounded reason-specific learning and regression/replay evidence. Keep unvalidated ranker experiments behind flags.
5. Verify existing DM with two test accounts and the purchase facade with test-mode provider events.
6. Integrate Codex's UI, run the actual journey matrix, publish blockers, and prepare owner-reviewed release evidence.

Required repo gates before a PR: `npm test` and `npm run build`. For changed engine behavior, also run relevant `search:snapshot`, `feed:chunks`, `feed:rotation`, and targeted regression tests. Put database integration tests in `tests/postgres-integration.test.js`, the CI file provisioned with TEST_DATABASE_URL. Include authorization failures and concurrency where they are the risk.

Measure constraint violations, entity/intersection precision, duplicate/skip rate, catalog coverage, sourced-claim coverage, fit abstention/error rate, blocked-message leakage, payment reconciliation correctness, and p50/p95 search latency. Declare thresholds against the existing baseline before tuning. Do not claim CTR gains from offline replay or from a tiny launch sample. Relevance, corrections honored, privacy, and trustworthy failure states are launch gates, not optional polish.

Sunday readiness requires functioning end-to-end flows against the authorized backend. Unit tests, disabled buttons, fixtures, or provider SDK imports alone do not make a feature live. Record every remaining dependency with an owner and next action; surface scope decisions before the deadline. No automatic merge to main or production deployment is granted by this handoff.

Research and implementation references: [RESOURCES.md](RESOURCES.md).
