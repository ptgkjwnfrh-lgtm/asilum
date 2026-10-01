# eBay-first catalog launch

The owner wants substantial eBay clothing supply before recruiting stores in
person, followed by proxy shopping. Existing Browse search only retrieves one
page (at most 50 items). Repeated search calls are not a complete catalog mirror.

## What this change actually delivers

`npm run ebay:feed -- --status` reports configuration without network calls or
secret values. It does not claim that eBay has verified the entitlement.

`npm run ebay:feed -- --category 11450 --marketplace EBAY_US --scope ALL_ACTIVE --output /durable/ebay`

The worker downloads an approved Feed Beta category archive with sequential
byte ranges, checks range continuity, total length and revision consistency,
verifies gzip integrity, then atomically promotes an archive and manifest.
It streams to disk rather than loading the category into memory. Failed runs
remove partial files and can be restarted; byte-level resume is not implemented.
Completed runs have distinct directories and do not overwrite each other.

Daily new-listing files use `--scope NEWLY_LISTED --date YYYY-MM-DD`.
Default safety limits are 10 GiB compressed and 100 GiB expanded per file; a
larger file fails explicitly. The library options allow deliberate adjustments.
Run on durable worker storage, not a short-lived Vercel request.

The existing OAuth helper now caches separately for scope, environment and
credentials. Browse still defaults to its original scope; Feed requests
`https://api.ebay.com/oauth/api_scope/buy.item.feed`.

## Access needed

Configure production credentials securely, `EBAY_ENV=PRODUCTION`, the existing
`EBAY_PARTNERSHIP_APPROVED=1` attestation and **separate**
`EBAY_FEED_APPROVED=1` only after eBay grants the relevant entitlement.
These flags do not create permissions or authorize AI processing. No flags
or credentials were set by this change.

## Deliberate publication boundary

Downloaded data is **staged, not published**. No database rows are written, no
photos are fetched, and no tags, model training, embeddings or ASTERISK calls
are run. Current catalog normalization invokes tag inference and the shared
sync path invokes image-color analysis. Do not route large eBay feeds through
that path until the permitted processing is established. This change does not
claim to have resolved those permissions for the existing Browse path.

Next implementation gates, once actual access/schema are available:

1. Validate an actual authorized feed schema and variation identifiers. Reuse
   `normalizeEbayItem` / shared source identity where the processing is approved;
   never fabricate title-derived brands or missing availability.
2. Add a transactional, bounded publisher using existing `items`,
   `product_images`, source IDs and sync logs. Persist per-source checkpoints
   and prevent older files overwriting newer listings. Do not create a parallel
   public catalog or load every item into the existing in-memory seed array.
3. Apply daily catch-up from the bootstrap Last-Modified date, then hourly
   snapshots including ended items and changed variations. This downloader
   currently supports bootstrap and daily files, not snapshot processing.
4. Recheck availability before purchase handoff. Measure usable active items,
   refresh lag, gaps, removed inventory and API quota failures.
5. Keep proxy ordering disabled until an actual partner grants the necessary
   catalog/order access and the fees, warehouse and shipping flow are defined.

## Review and rollback

Declared test criteria: no network without attestations, correct file bytes,
scope/environment cache isolation, rejection of corrupt/partial/changing feeds,
and no promoted output after failure. Tests use synthetic gzip fixtures explicitly
as fixtures, never as catalog inventory. No live API, DB or proxy testing is
claimed. Disable the new worker by leaving EBAY_FEED_APPROVED unset; existing
Browse routes remain unchanged. No migration or production backfill occurs.

## Primary references checked October 1, 2026

- https://developer.ebay.com/api-docs/buy/buy-requirements.html
- https://developer.ebay.com/develop/guides/buy/inventory-discovery-and-refresh-guide
- https://developer.ebay.com/api-docs/buy/static/api-feed_beta.html
- https://www.ebay.co.jp/developer/api/feed_beta_api_buy/documentation
- https://github.com/eBay/FeedSDK
- https://partnernetwork.ebay.com/page/network-agreement

Bulk feeds cover eligible items in approved marketplaces/categories, not a
guarantee of every worldwide clothing listing.
