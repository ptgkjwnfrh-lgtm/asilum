# Catalog connections

Schema v51 adds one provider-neutral listing contract and owner-scoped merchant
installations. It must be applied before deploying this code; no live database
was changed by this branch.

## Shopify lifecycle

1. A verified business enters its exact `*.myshopify.com` domain in Studio.
2. `POST /api/connections/shopify/start` binds a one-use, expiring OAuth state
   to that account and domain.
3. The callback verifies Shopify's query HMAC before exchanging the code for
   expiring offline access/refresh tokens. Tokens are AES-256-GCM encrypted;
   associated data binds each ciphertext to the immutable Shopify shop id.
4. The leased queue paginates every product and every variant. Only active,
   published products explicitly tagged `asilum:resale` are durable catalog
   items. A completed snapshot alone may tombstone unseen inventory.
5. Raw-body HMAC-verified webhooks dedupe by Shopify webhook id. Product and
   inventory changes enqueue reconciliation; deletes tombstone one listing;
   uninstall and shop-redact revoke credentials and withdraw the catalog.
6. Disconnect is owner-scoped and does not touch Passport saves.

The app retains no Shopify customer/order data. Mandatory customer data-request
and redaction webhooks acknowledge that fact without persisting customer ids.

## Deployment contract

- Apply `supabase/schema-v51-catalog-connections.sql`.
- Configure the Shopify values in `.env.example`, including a base64 32-byte
  token key and a 16+ character `CRON_SECRET`.
- Register the callback and `/api/webhooks/shopify` endpoint in the Shopify app.
- Run a development-store canary covering install, first sync, variant paging,
  product removal, reinstall, token refresh, uninstall and privacy webhooks.
- External app registration/review and provider credentials remain honest
  blockers; unset configuration produces disabled/503 states, never success.

Yahoo Shopping Japan, Rakuten Ichiba and eBay are request-time, `no-store`
search paths. Their policies deny durable storage, image caching, embeddings,
external model processing and training until a written grant changes those
individual operations.
