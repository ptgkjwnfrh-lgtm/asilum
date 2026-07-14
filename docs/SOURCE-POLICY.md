# Product source policy

ASILUM ingests products only through an official API or a merchant/affiliate
feed whose terms authorize the intended display. A public product page is not
treated as permission to scrape, copy, cache, or combine its content.

## Activation gates

- **eBay:** stays disabled until both API credentials and
  `EBAY_PARTNERSHIP_APPROVED=1` are present. Approval must cover ASILUM's
  intended display, caching, source labeling, and multi-source experience.
- **Shopify:** stays disabled until each merchant grants Storefront access.
- **WooCommerce:** may connect through the documented public Store API only
  after that store's owner approves ASILUM and its exact HTTPS origin is set in
  `WOOCOMMERCE_STORE_URL`; `WOOCOMMERCE_STORE_APPROVED=1` is the audit gate.
- **Merchant JSON feeds:** require an exact allowlisted hostname and a feed
  provided for ASILUM/affiliate use.
- **Etsy:** do not enable without Etsy commercial API access.
- **Mercado Libre:** do not enable without written confirmation that ASILUM's
  cross-marketplace aggregation model is permitted.
- **Grailed, Depop, Farfetch, SSENSE, StockX and similar sites:** no scraping or
  reverse-engineered APIs. Keep adapters absent or disabled until authorized.

Every product must retain its source name, source product identifier, canonical
checkout URL, availability timestamp, and any source-specific display rules.
ASILUM does not claim seller verification, authenticity, fulfillment, shipping,
returns, or marketplace partnership unless the source contract says otherwise.
