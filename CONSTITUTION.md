# *ASILUM Constitution v2 — PROPOSED

Binding rules for all work on this app. v2 drafted July 19, 2026 per the
owner's Restructure Handoff; it supersedes v1 (July 7, 2026 — preserved in
git history) **upon owner approval, which is the owner's merge of the PR
that carries this file**. Until that merge, v1 remains in force. Newly
allowed product domains (§4) may not be implemented before that approval.

## 1. Mission

ASiLUM becomes the place where fashion is discovered, interpreted,
discussed, styled, and purchased across the internet — one compounding
journey across six prongs, not five disconnected features:

1. **The Market** — a federated, source-labelled fashion marketplace.
2. **The Press** — every verified user can become an editor.
3. **Passport + *ASTERISK** — the user-owned taste map and the travel
   agent that reads it.
4. **The Community** — a fashion social and editorial network.
5. **The Stylist** — owned wardrobe + market + exploration, as an
   Asterisk mode.
6. **Trust, rights, and operations** — the prong the first five cannot
   scale without.

The moat is the lawful combination of catalog, explainable taste graph,
consented first-party signals, creator/editorial graph, relationships,
and provenance history. Raw personal data is never described as a moat.

North-star metric: **Weekly Completed Fashion Journeys** (two connected
high-intent actions across different prongs in seven days). Raw screen
time is never optimized as the mission.

## 2. Unchanged cores (carried from v1, still highest priority)

- **UI is LOCKED.** No redesign, simplification, or genericization of the
  magazine visual identity. Navigation/flow restructures only after an
  approved information-architecture spec with before/after screenshots.
- **No faking.** No pretend partnerships, fake OAuth, simulated data
  presented as real, invented products/sizes/purchases/celebrity
  looks/runway references, or claimed AI capability that does not exist.
  Unconnected features say so honestly and stay behind kill switches.
- **Working rules.** Inspect first; smallest reversible changes; no
  duplicate routes/stores/components (no second wardrobe, no second
  Asterisk memory, no parallel taste store); no rewrites of working
  domains; `npm run build` and the test suite pass before anything ships.
- **Git.** Never work on `main`. Branch → focused PR → Codex review →
  merge only at the owner's explicit word. Every report: summary, files
  changed, build/test status, remaining issues, manual tests, Codex focus.
- **Secrets.** Env only; never client-side; `service_role` never in
  bundles; DB runtime as least-privilege `asilum_app`.
- **Stability bar.** Every page loads with no runtime errors; no crash on
  missing keys, empty DB, missing images, or incomplete metadata.

## 3. Allowed scope (phase-gated)

Delivery follows the Restructure Handoff §9. A phase's product surface may
be built only when its predecessor's exit gate passed and its own listed
owner/legal gates are met. One phase = multiple reviewed PRs.

- **Phase 0** — stabilization (findings 1–5) + this Constitution. DONE
  pending this PR's approval.
- **Phase 1** — editorial publishing spine (ADR-004). Drafting is open to
  every account; public publishing requires the §7 gates.
- **Phase 2** — unified Today/Editorial feeds (ADR-005), chronological
  mode from launch, no DMs.
- **Phase 3** — Passport v2 provenance/visibility + Asterisk travel-agent
  drawer and typed tools (ADR-006, ADR-007).
- **Phase 4** — community without DMs: follows, reactions, saves,
  reports, blocks, mutes, notifications; comments only if moderation ops
  are ready.
- **Phase 5** — market scale: canonical product/source-listing split,
  dedup, freshness/cursor search, affiliate attribution, verified
  independent-designer onboarding.
- **Phase 6** — Stylist v2 + creator loop.
- **Phase 7** — DMs and further monetization, only after the owner
  decisions and staffing listed in the handoff exist.

## 4. Blocked (regardless of phase, until the named gate)

- **DMs** — blocked until Phase 7 owner approval + the full safety stack
  (requests, block/report, retention, legal holds, staffing). Never claim
  end-to-end encryption without an audited protocol.
- **Direct checkout / merchant of record** — a separately governed
  company decision. Checkout stays external.
- **Spotify-derived profiling** — blocked by Spotify Developer Policy.
  Manual, user-declared music inspiration through curated first-party
  mapping is the only music path. Never labelled "Spotify connected."
- **Scraping; unapproved platform integrations** — Pinterest, Shopify,
  Apple Music, TikTok, affiliates stay behind kill switches with honest
  unavailable states until real approvals exist.
- **Homegrown CAPTCHA / bot-detection** — bot challenge lives at the edge
  layer (THREAT-MODEL §6), never in app code.
- **Ads from sensitive data; buying interpretation confidence** —
  sponsored placement can never alter Asterisk confidence or editorial
  relevance, and sensitive traits are never ad inputs.
- **Sending accused users' private data to brands; permanent IP bans;
  perceptual similarity as proof** — trust-prong rules from the handoff.

## 5. *ASTERISK doctrine

Asterisk is ASiLUM's personal fashion editor and travel agent: one
orchestrator over bounded, typed tools (ADR-007) — never one omnipotent
model with database access. Its laws:

- **Boundary law.** Typed, least-privilege application services only. No
  arbitrary SQL, no `service_role`. Model output may draft or rank; it
  cannot publish knowledge, verify brands, ban accounts, or change
  legal/moderation state. Separated confidence (entity resolution /
  interpretation / evidence coverage / inventory representation /
  ranking) is never averaged into one number.
- **Freshness law.** Trend and cultural-currency layers carry
  `lastReviewed` and a review-by clock enforced in CI
  (`check-trend-freshness`); the review cadence is **at most 60 days**.
  Research batches use dated, citable sources; every record that cites a
  current event, show, or trend carries source and freshness data. New
  entities enter only through the reviewed research pipeline
  (staged fact lifecycle, ≥1 source URL, human sign-off) — never
  directly from model output.
- **Search-accuracy law.** `eval/universal-queries.json` is the accuracy
  benchmark. No search/interpretation PR may regress it; PRs that add
  interpretive capability must extend it with cases that would have
  failed before. Every interpretation states its method and confidence;
  unknown queries fall through honestly to the research queue — a
  fabricated reading is a constitution violation, not a UX improvement.
- **Tagging law.** The typed dense-tag system derives from real item
  fields only. Coverage target: ≥20 typed tags per item **where the
  fields support it** — sparse items stay honestly sparse, never padded.
  The base tag layer is read-only to models; `product_ai_tags` is
  append-only per audit; brand/category/material conflicts at confidence
  ≥0.5 route to moderation. Tag audits sweep on a schedule once a live
  model key exists (owner decision 5).
- **OFF contract.** Asterisk OFF/paused means no Passport or behavioral
  personalization on any surface (search, Discover, home, rails, ads,
  Stylist). Hard filters and the current request still apply; stale
  personalized responses can never overwrite OFF results (guarded in
  code since PR #77); OFF does not erase data — erase/export are
  separate controls.
- **Disclosure.** Conversational surfaces and Privacy/About disclose the
  AI-assisted system (EU-AI-TRANSPARENCY.md); AI-assisted public
  editorial carries labels and human-review state.

## 6. Data doctrine

- Passport is **private by default**; public profile and public Passport
  are different things; purchase history never becomes public
  automatically; publishing any Passport/wardrobe item is an explicit
  per-item action.
- Every signal exposes source, kind (explicit/inferred/imported/global),
  last use, affected surfaces, visibility, retention, and
  edit/disconnect/forget/export/delete controls (ADR-006).
- Never public and never in external-model payloads: raw measurements,
  private images, search history, connected-account tokens, inferred
  sensitivities, precise identity.
- Supabase rules (handoff §6): additive migrations through the repo's
  schema-vN process with runtime version assertion; RLS on exposed
  schemas; server-only by default; ownership predicates in policies
  (`TO authenticated` is not authorization); UPDATE policies carry USING
  + WITH CHECK; private Storage with bounded files and short-lived
  signed URLs; security/performance advisors + negative cross-account
  tests before merge.
- No silent caps: any bounded retrieval (top-N, sampling, candidate
  limits) reports its truncation (`candidatesTruncated` pattern).

## 7. Trust prong — launch dependencies

Before public **publishing**: ToS + community guidelines, content
licence, DMCA agent + operational inbox, copyright/impersonation/
harassment/defamation workflows, corrections + appeals, disclosure UI.
Before public **social**: report flow + taxonomy + appeals, block/mute,
minor/age policy, non-personalized feed, ad-targeting restrictions,
moderation staffing with response targets. Before **Asterisk
conversational/public generation**: AI disclosure, content labelling,
human review for public-interest editorial, vendor data-flow inventory +
kill switches, forbidden-field payload tests. These are gates, not
aspirations — a launch that skips one violates this constitution.

## 8. Owner decisions

Engineering never decides: launch regions; age policy; DMs; wardrobe
visibility default; AI provider/retention; licensed sources; Spotify
path; TikTok; brand-verification staffing; retention periods;
Constitution approvals; merchant of record; creator monetization;
DMCA/counsel workflow (docs/OWNER-DECISIONS.md + handoff §11). Safe
defaults apply while unanswered: nothing ships publicly anywhere.

## 9. PR quality standard

Every PR: objective + user journey; exists-vs-new; schema/API/event
changes; privacy/security/moderation/rights/commercial impact; flag +
rollback; migration/backfill notes; tests with exact results;
screenshots for UI changes; manual test instructions; known limitations;
doc updates; explicit Codex review focus. Required gates: unit/contract
tests, Postgres integration (constraints, concurrency, RLS, Storage),
cross-account negatives, accessibility + browser flows, load/cursor
tests for feeds/search, production build, dependency review, Supabase
advisors after DB changes, no unresolved P1/P2, and **no fake
partnership, connection, purchase, trend, verification, or AI
capability**.
