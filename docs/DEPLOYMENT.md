# Deployment Runbook — asilummagazine.com

First production deploy target: **July 23, 2026**. Host: **Vercel**
(native Next.js App Router; the repo's CI already proves `npm ci` +
`next build` on Node 22). Domain: asilummagazine.com — registered at
**Squarespace Domains** (July 8, 2026), DNS on Squarespace nameservers,
currently parked on Squarespace's site IPs.

Constitution v2 note: "Default while undecided: nothing ships publicly
anywhere" (owner decision 1). Completing this runbook through step 5 is
the owner's decision to launch in the deployed regions.

## 1. Owner steps (cannot be done by an agent — accounts and credentials)

1. Create/log into a Vercel account (Hobby is enough to start) and
   **Import Git Repository** → `ptgkjwnfrh-lgtm/asilum`. Framework
   auto-detects Next.js; no build overrides needed.
2. In Project → Settings → Environment Variables (Production), paste
   every variable from the local, gitignored `.env.vercel.local`
   (generated July 19; fresh production `DEVICE_COOKIE_SECRET` and
   `ADMIN_TOKEN`, `DATABASE_URL` as `asilum_app`, `DATABASE_SSL_CA` as
   inline PEM — the inline form avoids any filesystem dependency in the
   serverless bundle).
3. Deploy. First deploy comes up on `<project>.vercel.app` for
   verification BEFORE any DNS change.
4. Project → Settings → Domains → add `asilummagazine.com` and
   `www.asilummagazine.com`. Then in **Squarespace → Domains → DNS**:
   - A record, host `@`, value `76.76.21.21` (Vercel)
   - CNAME, host `www`, value `cname.vercel-dns.com`
   - remove the Squarespace-site A/CNAME records the parking page uses.
   Propagation: minutes to a few hours; Vercel issues TLS automatically.
5. Edge protection (THREAT-MODEL §6 layer 1 — the deploy gate):
   - Vercel → Project → Firewall: enable the managed WAF ruleset;
   - add a challenge rule for `/api/auth` (GET) and elevated-rate rules
     for `/api/search`, `/api/interpret`, `/api/discover`, `/api/feed`
     set WELL ABOVE the app's own budgets (the app fails closed first);
   - leave pages/static unchallenged.

## 2. Environment contract (names only — values live in .env.vercel.local)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | auth + client session |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server-only (Storage REST, auth verification); never client |
| `DATABASE_URL` | yes | session-pooler URI as `asilum_app` — the runtime role check fails closed on any other role |
| `DATABASE_SSL_CA` | yes | inline PEM (Supabase Root 2021 CA); strict verification stays on |
| `DEVICE_COOKIE_SECRET` | yes | ≥32 chars; identity issuance 503s without it |
| `ADMIN_TOKEN` | yes | admin API bearer; 503 if unset |
| `GLOBAL_BUDGET_<SCOPE>` | no | breaker overrides; defaults in lib/security/rateLimit.js |
| `DATABASE_ADMIN_URL` | **never in prod runtime** | owner/DDL connection stays local/CI |
| `AI_*`, `EBAY_*`, `WOOCOMMERCE_*`, connector vars | no | stay unset until their owner/rights gates (FEATURE-FLAGS.md) |

## 3. Post-deploy verification (agent-runnable against the deploy URL)

1. `/api/stats` → `persistent: true` (Postgres reached as `asilum_app`;
   the boot-time schema assertion demands v20 — a version mismatch fails
   the function loudly, which is correct).
2. Home, Discover, Editorial, Stylist, Profile render; 0 console errors.
3. `GET /api/auth` sets the HttpOnly device cookie (secure, strict).
4. Search canon: "mohair sweater" → all-mohair top results;
   `sort=new` → newest inventory first.
5. `/api/interpret?q=minimal` → separated confidence incl.
   `inventoryRepresentation`.
6. Rate-limit rows appear (`api_rate_limits`, incl. `global:*` scopes).
7. Wardrobe photo upload/erase against the private bucket (signed URLs).
8. HSTS/CSP headers present (next.config.mjs) — spot-check with curl.

## 4. Rollback

Vercel → Deployments → promote the previous deployment (instant).
Schema rollbacks do not exist — migrations are additive by constitution;
an app rollback never needs a schema rollback.

## 5. Known launch gaps (tracked, not blockers for a soft launch)

- Owner decisions 1 (regions) and 10 (retention; unbounded search_logs)
  — needed before public announcement, not before a quiet deploy.
- Privacy policy / ToS / accessibility pages: DRAFTED v1.0 and live at
  /privacy, /terms, /accessibility (day33) — counsel sign-off still
  required before public announcement; governing-law venue flagged.
  Owner action: set up email forwarding for legal@asilummagazine.com
  (Squarespace domain email forwarding) — the pages name that address.
- eBay/WooCommerce keys unset → marketplace shows seed inventory
  labelled honestly; tickets refuse demo purchases by design.
