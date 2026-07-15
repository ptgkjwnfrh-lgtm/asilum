# Feature Flags & Kill-Switch Register

Convention (existing, now codified): every optional or externally-dependent
capability is env-gated, defaults OFF/deny, and degrades to an HONEST
unavailable state — never a fake success. `describeAiConfig()` /
`adapterStatuses()` expose live gate state to the admin surface.

## Live flags today

| Flag | Gates | Default | Honest-off behavior |
|---|---|---|---|
| `AI_FEATURES_ENABLED` + `AI_PROVIDER` + `AI_API_KEY` | master model seam | off | local deterministic paths |
| `AI_MOOD_BOARD_ENABLED` | model moodboard analysis | off | palette-v0 + filename rules |
| `AI_STYLIST_ENABLED` (+ per-request `aiConsent`) | model stylist | off | local trend+taste engine, notice shown |
| `AI_TAG_AUDIT_ENABLED` | model tag audit | off | local rules, conf-capped 0.6 |
| `AI_RESEARCH_ENABLED` | model research drafting | off | `notImplemented` |
| `AI_USER_HOURLY_LIMIT` / `AI_GLOBAL_HOURLY_LIMIT` | paid-call ceilings | 12 / 200 | 429-style refusal |
| `INGEST_ALLOWED_HOSTS` | research/in-app fetch allowlist | deny-all | fetch refused with named reason |
| `EBAY_CLIENT_ID/SECRET` (+ approval) | eBay adapter | unset | adapter reports disabled |
| `WOOCOMMERCE_STORE_APPROVED` + `WOOCOMMERCE_STORE_URL` | WooCommerce adapter | off | adapter reports disabled |
| `DEVICE_COOKIE_SECRET` | identity issuing | required (503 if unset in prod) | honest 503 |
| `ADMIN_TOKEN` | admin surface | disabled if unset | honest 503 |
| `DATABASE_EXPECTED_ROLE` / prod default `asilum_app` | least-privilege runtime | enforced in prod | fail-closed boot |
| `WARDROBE_ENABLED` | private owned-piece collection + stylist anchors | on (`0` is the kill switch) | wardrobe API refuses with 503; wardrobe anchors refuse instead of silently dropping |

## Roadmap flags (reserve now, one per phase-1+ surface)

| Flag | Feature | Kill behavior |
|---|---|---|
| `ASTERISK_ORCHESTRATOR_ENABLED` | A: multi-resolver interpretation | fall back to deterministic router (current behavior) |
| `ASTERISK_UNKNOWN_QUERIES_ENABLED` | A: aggregation + research queueing | queries still answered; nothing recorded |
| `ASTERISK_NOTIFICATIONS_ENABLED` | A: learning notices | silent |
| `ASTERISK_DRAWER_ENABLED` / `ASTERISK_PAGE_ENABLED` | B | nav item hidden |
| `WARDROBE_UPLOADS_ENABLED` | C photo uploads + private Storage | upload surface absent; core wardrobe remains available |
| `DISCOVER_RAILS_ENABLED` (+ per-rail registry rows) | D | strip-only Discover (current) |
| `PROFILE_THEMES_ENABLED` | E | default profile skin |
| `MESSAGING_ENABLED` | F | feature absent (not "coming soon" fake states in API responses) |
| `BRAND_VERIFICATION_ENABLED` | G | no badge surfaces |

Rules:
1. A kill switch must be flippable by env change + restart alone — no
   migration, no data loss.
2. Flags gate SURFACES; data written while a flag was on must survive the
   flag going off.
3. Every new external adapter adds its row here + in RIGHTS-REGISTER.md in
   the same PR.
