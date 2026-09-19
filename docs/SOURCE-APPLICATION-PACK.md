# Source application pack (prepared, not submitted)

Owner-only business identity, binding terms, spend and provider-account fields
are intentionally blank. Complete them in the provider portal; never paste
credentials into an issue or chat.

## ASILUM use case

ASILUM is a source-labeled fashion discovery service. A result identifies the
original listing and sends the shopper to the original merchant or a separately
approved purchasing route. Merchant-installed Shopify inventory is synchronized
only after the merchant authorizes ASILUM. ASILUM does not claim seller or
garment authentication from a catalog connection.

Requested catalog facts: immutable listing/variant ids, canonical destination,
original title, explicit brand/condition/category, variant options, original
price/currency, stock/tombstone state, source update time and permitted image
URLs. Customer, order, payment and merchant-cost data are not requested.

## Data flow to attach

```text
provider API or merchant OAuth
  -> source-specific grant check and bounded fetch
  -> versioned listing validation / reason-coded quarantine
  -> durable path only when storage is allowed
  -> source-labeled ASILUM discovery and original-site clickout

live-only source
  -> source-specific grant check and budget
  -> no-store response
  -> no database, image cache, embedding, prompt or training write
```

Merchant credentials are encrypted server-side with key-versioned AES-256-GCM,
never returned to the browser, and revoked on disconnect/uninstall. Durable
inventory has completed-snapshot reconciliation; interrupted pages cannot
declare unseen products deleted. Safe webhook-dedupe metadata expires after
seven days. Quarantine retains only reason codes and a digest for 24 hours.

Expected query volume, launch countries, catalog size and peak requests must be
filled from a measured development-store/source canary, not guessed:

- launch countries: **TBD by owner/provider approval**
- expected requests/day and peak requests/second: **TBD after canary**
- expected stored offers for durable feeds: **TBD after canary**
- refresh target and provider quota: **TBD per approved contract**

## Questions every provider must answer in writing

1. Which countries, categories, seller types and environments are approved?
2. May ASILUM display, retain and lexically index listing metadata? For how long?
3. May ASILUM display remote images or cache them? Must links/attribution follow
   a prescribed form?
4. Are personalized ranking, embeddings, external model processing or training
   separately restricted? A broad API approval is not treated as model approval.
5. What quotas, pagination limits, Retry-After rules and commercial costs apply?
6. What is the authoritative sold/deleted signal and required deletion period?
7. Are affiliate/campaign links separate from catalog access?
8. Provide a sandbox/sample clothing payload including variant stock and a
   tombstone, plus escalation and compliance contacts.

## Provider-specific request

- **Shopify:** public distribution for unrelated merchants; scopes
  `read_products,read_inventory`; callback and mandatory privacy/product/
  inventory/uninstall/scope webhooks from `config/shopify.app.toml.example`.
  Complete a development-store lifecycle before review submission.
- **eBay:** production Browse eligibility for each requested marketplace and
  destination; exact display/link/image, retention and personalization terms.
  Feed API and checkout are separate requests. Model/training use remains denied.
- **Yahoo! Shopping Japan:** Shopping v3 `itemSearch` for used, in-stock,
  cross-border-eligible apparel. Confirm the current one-query-per-second rule,
  display/image retention and whether ValueCommerce attribution is separate.
- **Rakuten Ichiba:** current Item Search access with application id/access key;
  ASILUM will include only reviewed secondhand merchants. Confirm image/display,
  paging/quota and affiliate requirements. This request does not claim Rakuma.
- **Closed marketplaces, affiliate feeds and proxies:** request the five
  capabilities separately—inventory search, item/stock lookup, landed-cost
  quote, order placement, and tracking/cancellation. Consumer paste-a-URL
  service is recorded only as a manual handoff, never as catalog permission.

Submission evidence belongs in `catalog_source_registry.evidence_links` with
the stage and review date. Until then the source remains researching or
application-prepared and its network gate stays off.
