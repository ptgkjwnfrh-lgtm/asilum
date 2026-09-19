# Source & Platform Rights Register

Constitution v2 §4 binds this register: blocked rows stay blocked
regardless of phase until their named approval exists, and every new
external adapter adds its row here + FEATURE-FLAGS.md in the same PR.

Per-integration policy state. Every row has an owner (the human accountable
for the decision), a last-reviewed date, and a kill switch. **No integration
ships, or pretends to ship, without its row being green.**
Engineering notes are not legal advice; counsel columns are owner-gated.

| Source / platform | Use we want | Current lawful basis | Status | Kill switch | Owner decision needed | Last reviewed |
|---|---|---|---|---|---|---|
| eBay Browse API | request-time resale discovery | official API, written approval and keys env-gated | CODE READY, LIVE-ONLY; metadata/image storage and model use denied until a written grant changes policy | `EBAY_PARTNERSHIP_APPROVED` + credentials | obtain production/display approval; keep storage/model use off | 2026-09-19 |
| WooCommerce Store API | merchant inventory | documented API + explicit merchant approval | READY (gated `WOOCOMMERCE_STORE_APPROVED=1`) | env unset | per-merchant approval | 2026-07-15 |
| Shopify merchant OAuth | owner-authorized resale catalog | merchant installation, expiring offline tokens, read-only products/inventory, signed webhooks | CODE READY; blocked only on external app registration/review and deployment secrets | missing app env keeps start route at 503; disconnect/uninstall withdraws catalog | register app, configure mandatory privacy webhooks, run development-store canary | 2026-09-19 |
| Yahoo! Shopping Japan v3 | request-time used inventory | official itemSearch API; used + in-stock + cross-border filters | CODE READY, LIVE-ONLY; disabled pending app/source-policy approval; no durable storage/model use | `YAHOO_SHOPPING_APPROVED` + app id | register app and approve display terms | 2026-09-19 |
| Rakuten Ichiba | request-time reviewed used-merchant inventory | official API; Ichiba is general retail, so only reviewed used-shop allowlist qualifies | CODE READY, LIVE-ONLY; disabled pending credentials/approval/merchant allowlist | `RAKUTEN_ICHIBA_APPROVED` + credentials + `RAKUTEN_USED_SHOP_CODES` | register app and review each used merchant | 2026-09-19 |
| Spotify | soundtrack→fashion | Developer Policy restricts analysis/profiling/ML use of content | BLOCKED for automatic profiling. Manual selection path (user picks artist/genre; curated `lib/music-mapping`) uses NO Spotify data and is allowed today | feature flag | decide: abandon / manual-only / pursue written approval | 2026-07-15 |
| Apple Music (MusicKit) | soundtrack rail | explicit user authorization + permitted purpose; artwork/metadata restrictions | BLOCKED pending terms review | n/a | pursue or drop | 2026-07-15 |
| TikTok | trend signals | requires approved app + use case; Research API ≠ commercial personalization | BLOCKED | n/a | wait for partnership or drop | 2026-07-15 |
| Fashion press (WWD, Vogue, Who What Wear, etc.) | sourced trend/culture SUMMARIES with links | factual summaries + citation; never copying articles/image sets | ACTIVE — this is the research pipeline's current basis (all 40 pipeline entities + trend snapshot cite press URLs) | `INGEST_ALLOWED_HOSTS` default-deny for in-app fetch | none (keep summaries thin, links out) | 2026-07-15 |
| Wikipedia / Aesthetics Wiki | cultural reference summaries | open licenses, factual summaries + attribution links | ACTIVE (same basis) | same | none | 2026-07-15 |
| Runway/editorial imagery | rail visuals | NOT licensed | BLOCKED — text summaries + product matches only, no stills | n/a | license feeds or stay text-only | 2026-07-15 |
| Celebrity/event facts | verified-event rails | reliable-source verification, dated, rumor-labeled | NOT BUILT — policy pre-written: no rail without ≥2 reliable sources + event date; rumor never phrased as fact | rail registry flag | approve event-rail sourcing standard | 2026-07-15 |
| Buyee (Tenso Co.) | inventory ingestion + proxy purchase for Yahoo! JAPAN Auctions / Mercari / Rakuma | affiliate programme — NOT YET APPLIED FOR. Terms must cover display, caching, aggregation and source labelling | BLOCKED — adapter registered and disabled, states its blocker | `BUYEE_AFFILIATE_APPROVED` unset | apply; approve terms | 2026-08-27 |
| ZenMarket | same, as a second proxy partner | affiliate programme — NOT YET APPLIED FOR | BLOCKED — adapter registered and disabled | `ZENMARKET_AFFILIATE_APPROVED` unset | apply after Buyee proves the shape | 2026-08-27 |
| Yahoo! JAPAN Auctions / Mercari / Rakuma (direct) | inventory ingestion | NONE for these C2C surfaces. Yahoo Shopping's separate official API is handled above | BLOCKED BY DESIGN — reached through a licensed proxy instead, never scraped | n/a (nothing built) | none — do not pursue direct scraping | 2026-09-19 |
| Taobao / Alibaba | inventory ingestion + proxy purchase | open platform / affiliate — NOT YET APPLIED FOR | BLOCKED. Owner ruled the policy (§11): ingest, label `unverified-origin`, never hide | nothing built | apply; confirm replica-listing posture with counsel | 2026-08-27 |
| Anthropic API | model-assisted drafting/analysis | provider seam (`lib/ai/adapter.js`), all features consent- and env-gated, no measurements/PII in prompts (enforced by payload builders) | READY, OFF (no key set) | `AI_FEATURES_ENABLED` + per-feature flags | approve provider + retention terms (owner decision #5) | 2026-07-15 |

## Standing source policy (already enforced in code)

- No scraping of retailers or social platforms (`lib/ingest` policy header,
  #19 source policy, `docs/SOURCE-POLICY.md`).
- In-app research fetches: exact-host allowlist, https-only, no redirects,
  bounded bytes, HTML/text only (`fetchResearchSource`).
- Every cultural fact carries source URLs + review state; unapproved facts
  cannot compile (fail-closed).
