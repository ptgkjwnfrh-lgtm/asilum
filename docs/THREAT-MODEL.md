# Threat Model (Phase 0) — research, uploads, messaging, brand enforcement

Format: threat → existing mitigation (real, in code today) or planned gate.
Scope: the four handoff-named risk surfaces plus the new Phase-1 domains.

## 1. Research / knowledge pipeline

| Threat | Mitigation |
|---|---|
| Poisoned proposal becomes trusted knowledge | Staged lifecycle, no queue-jumping, approval needs named reviewer + sources; compile fail-closed; loader re-validates (cultureSchema) and THROWS on bad records |
| Model output writes to trusted stores | Model path lands `discovered` only (gated `AI_RESEARCH_ENABLED`, currently notImplemented); certainty vocabulary caps (validate.js) |
| SSRF / private-network fetch | exact-host allowlist (default-deny), https-only, no redirects, content-type gate, streaming byte cap (readBytes), safeExternalUrl blocks localhost/private |
| Self-collision / compile corruption | selfFactId idempotency + refuse-partial-output compile |
| Adversarial query triggers auto-learning | Phase 1: unknown-query recording is flag-gated, bounded, deduped, demand-thresholded; promotion is an ADMIN action into the reviewed pipeline — never automatic |
| Fact laundering via payload/entity mismatch | payload.name must equal fact.entityId; provenance + factId required on compiled records |

## 2. Uploads (moodboard today; wardrobe/profile media in Phase 3/5)

| Threat | Mitigation |
|---|---|
| Client-supplied labels poison taste | server derives palette from raw swatches; labels never trusted; atomic 400s |
| Duplicate/replay writes | uploadId required, per-user idempotency, txn event+record |
| Oversized/malformed payloads | strict shape validation, byte-capped payloads (8 KiB facts), readJsonRequest limits, rate limits |
| PLANNED (image bytes, Phase 3): EXIF/location leakage, decompression bombs, hostile SVG, malware, cross-user reads | private owner-scoped bucket + content-sniffed type checks + dimension/decompression limits + metadata strip + short-lived signed URLs + no face/biometric processing — exit-gate tests specified in handoff §Phase 3 |

## 3. Messaging (Feature F — NOT BUILT, blocked on owner decisions)

Pre-committed invariants for whenever it is approved: authenticated
account_id only (ADR-002); message requests; block/mute/report; no delivery
after effective block (concurrency-tested); per-user+per-recipient rate
limits; retention/deletion + legal hold; moderator access logged and
purpose-limited; no E2E-encryption claims without an audited protocol.
Threats (spam, harassment, block races, forged conversation ids, deleted
accounts, attachment abuse) each map to a required pre-launch test in the
handoff — none are mitigated today because the surface does not exist,
which is itself the mitigation.

## 4. Brand enforcement (Feature G — NOT BUILT, blocked on Shopify approval)

Pre-committed invariants: OAuth state/HMAC/webhook signature verification;
tokens encrypted at rest, never client-visible; perceptual similarity is a
REVIEW SIGNAL never proof; human review before permanent enforcement;
accused users' private identifiers never shared with brands; appeals +
audit history; no permanent IP bans (IPs weak evidence; hash/truncate,
short retention).

## 5. Phase-1 domains (unknown_queries, interpretation_feedback)

| Threat | Mitigation (built with the feature) |
|---|---|
| Query-log privacy leakage | normalized text only, bounded length/charset, server-only tables (no anon/authenticated grants), DRAFT 180-day retention, flag-gated recording |
| Demand-count inflation (one attacker "voting" a query into research) | one lifetime vote per identity/query + rate limits + enforced distinct-identity threshold + admin-only promotion |
| Feedback poisoning another user's interpretations | feedback rows are per-identity; only influence THAT user's ordering; global change only via reviewed research |
| Reflected XSS via echoed queries | responses JSON-only; UI renders text nodes (React escaping); eval case adv-3 asserts no markup reflection |
| Cross-user reads | RLS-equivalent server-side scoping via resolveRequestUser; adversarial tests in suite (security-boundaries + new tests) |

## 6. Anonymous abuse boundary (Restructure Handoff Phase 0, finding 4)

Three layers, outermost first. Layers 2–3 are BUILT (PR 0A slice 2);
layer 1 is a DEPLOYMENT control that must land with the first public
deploy — it cannot exist meaningfully in app code.

**Layer 1 — edge/WAF (deploy checklist, not yet deployed):**

- managed WAF or equivalent edge rules in front of the app (hosting
  platform native, e.g. Vercel WAF / Cloudflare): IP/ASN reputation,
  request-rate rules per IP well above app quotas, bot-score challenge
  on `/api/auth` GET (identity issuance) and search surfaces;
- challenge (managed challenge / turnstile-style) is the correct
  response at the edge; the app deliberately has NO CAPTCHA of its own —
  per the platform constitution, bot-detection bypass and homegrown
  challenges are both out of scope;
- static-asset and page routes stay unchallenged; only mutation and
  expensive read APIs carry edge rules;
- alerting when edge rules fire at sustained volume.

**Layer 2 — identity-issuance throttling (BUILT):** `/api/auth` GET
issues anonymous device identities; issuance (not verification) is
throttled per requesting subject (30/hour) AND draws from a global
issuance budget (300/min default, `GLOBAL_BUDGET_IDENTITY_ISSUE`).
Every issued identity seeds per-subject quotas everywhere else, so
unthrottled minting would let a flood outrun every other limit.

**Layer 3 — global cost circuit breakers (BUILT):** each expensive
surface (search, interpret, discover, feed) draws from one global
per-minute budget in addition to per-subject quotas
(`consumeGlobalBudget` in lib/security/rateLimit.js; env-tunable via
`GLOBAL_BUDGET_<SCOPE>`, 0 disables). Exhaustion fails closed with
429 + Retry-After. Budgets are generous multiples of legitimate peak so
real users never see them before an attack does; they bound worst-case
database/compute cost, they do not replace layer 1.

| Threat | Mitigation |
|---|---|
| Anonymous identity flood outrunning per-subject quotas | issuance throttle (L2) + global budgets (L3) + edge challenge (L1) |
| Cost-of-goods attack on expensive queries (search/interpret) | global per-scope budgets fail closed at bounded spend |
| Distributed low-and-slow scraping under every per-IP limit | edge bot scoring (L1); app-level budgets bound aggregate cost |
| Rate-limit table growth as attack surface | subjects hashed; windows cleaned hourly (2-day horizon, existing) |

## Standing assumptions to re-verify each phase

- Codex co-authors migrations: coordinate schema numbers (v13 next) to
  avoid collisions — check remote before every migration PR.
- `service_role` never in client bundles (grep gate in CI is a candidate).
- All new tables default server-only until a client operation is proven
  necessary (handoff §5 rule 4).
