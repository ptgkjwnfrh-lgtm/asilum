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
| Demand-count inflation (one attacker "voting" a query into research) | per-identity dedupe within window + rate limits + admin-only promotion |
| Feedback poisoning another user's interpretations | feedback rows are per-identity; only influence THAT user's ordering; global change only via reviewed research |
| Reflected XSS via echoed queries | responses JSON-only; UI renders text nodes (React escaping); eval case adv-3 asserts no markup reflection |
| Cross-user reads | RLS-equivalent server-side scoping via resolveRequestUser; adversarial tests in suite (security-boundaries + new tests) |

## Standing assumptions to re-verify each phase

- Codex co-authors migrations: coordinate schema numbers (v13 next) to
  avoid collisions — check remote before every migration PR.
- `service_role` never in client bundles (grep gate in CI is a candidate).
- All new tables default server-only until a client operation is proven
  necessary (handoff §5 rule 4).
