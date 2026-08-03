# Key setup runbook — embeddings + catalog sources

Owner-only steps. Every value below is a SECRET: it goes into Vercel →
Project → Settings → Environment Variables (and `.env.local` for local dev),
never into code, chat, or a commit. After adding env vars, redeploy.

## 1. Embeddings v1 (semantic search recall)

Code is live and env-gated: with no key, nothing changes; with a key, search
gains a "semantic match" recall channel and the backfill script works.

**Recommended: Voyage AI** (purpose-built embeddings, generous free tier)
1. Create an account at https://dash.voyageai.com (owner action — accounts
   and payment details are yours alone).
2. Dashboard → API keys → Create key.
3. Set env vars:
   - `EMBEDDINGS_PROVIDER=voyage`
   - `EMBEDDINGS_API_KEY=<the key>`
   - optional `EMBEDDINGS_MODEL=voyage-3.5-lite` (the default)
   OpenAI works identically: `EMBEDDINGS_PROVIDER=openai` (default model
   `text-embedding-3-small`, key from https://platform.openai.com/api-keys).
4. Backfill the catalog once (local, with DATABASE_URL set so vectors persist):
   `EMBEDDINGS_PROVIDER=voyage EMBEDDINGS_API_KEY=... node scripts/embed-catalog.mjs`
   (use `~/.local/node-v20.18.1-darwin-arm64/bin/node`; idempotent; `--force`
   re-embeds after a model change).
5. Honesty note: embeddings retrieve, they do not generate — the /settings
   "no LLM produces content" statement remains true. If you ever want that
   statement to mention the retrieval provider, say the word.

## 2. eBay Browse API (live marketplace listings)

1. Register at https://developer.ebay.com → create an application →
   production keyset. eBay approves Browse API access — note the use case as
   product search/display with affiliate-style linking out.
2. Set env vars: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_ENV=PRODUCTION`
   (unset = sandbox), and flip `EBAY_PARTNERSHIP_APPROVED=1` only when you
   are comfortable presenting the integration as live.
3. Sync runs through `/api/admin` (needs `ADMIN_TOKEN`, 16+ chars). Rate
   guards already exist (`EBAY_USER_MINUTE_LIMIT` / `EBAY_GLOBAL_MINUTE_LIMIT`).

## 3. Shopify Storefront (brand/boutique catalogs)

1. On the store's admin: Settings → Apps and sales channels → Develop apps →
   create an app with Storefront API scopes (`unauthenticated_read_product_*`).
2. Set `SHOPIFY_STORE_DOMAIN=<store>.myshopify.com` and
   `SHOPIFY_STOREFRONT_TOKEN=<storefront access token>`.

## 4. Pinterest OAuth (board import)

1. https://developers.pinterest.com → create app → note client id/secret;
   add the deployed origin to allowed redirect URIs.
2. Set `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`.

Until each key lands, its surface stays an honest 503/coming-soon — that is
the contract, not a bug.
