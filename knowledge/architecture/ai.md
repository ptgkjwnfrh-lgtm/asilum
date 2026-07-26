# AI seams (what is real, mocked, or gated)

REAL today: six-bridge brain, palette v0, taste graph v0 (profile cosine),
search v1, stylist rules engine, memory decay, cross-user candidates.
GATED (env, honest 503/coming-soon until keyed): eBay Browse
(EBAY_CLIENT_ID/SECRET), embeddings v1, vision, Pinterest OAuth, Shopify.
NEVER: fake partnerships, simulated imports presented as real, generative
content. lib/ingest/adapters is the 6-source contract; normalize.js is THE
product normalizer; sync via /api/admin (ADMIN_TOKEN 16+ chars else 503).
