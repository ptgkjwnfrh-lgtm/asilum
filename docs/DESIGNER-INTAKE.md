# Designer intake runbook — real inventory (phase L1)

The operator path that takes a designer's actual pieces and lands them as
purchasable catalog rows. The checkout engine's honesty gate
(`refusalReason`, lib/orders.js) validates every item **before anything is
written** — the same rule that refuses demo items at checkout admits real
ones here, so the two can never disagree.

## Prerequisites

- The designer has said yes to the ruled terms (D1 domestic designer-ships,
  18 Aug 2026; economics re-ruled 20 Aug 2026 — 1% buyer-paid founders
  fee, no base commission, optional paid hotlist booth; the offer lives in
  `designer-program/OFFER.md`, the flow in `designer-program/ONBOARDING.md`).
- Their pieces have live product pages (the `source_product_url` of each item
  must be a real, public URL — loopback/private hosts are refused).
- `ADMIN_TOKEN` (the operator holds it; never in code).

## The item template (one JSON object per piece)

```json
{
  "title": "Wool column coat",
  "brand": "Atelier Example",
  "description": "Structured shoulder, bonded wool, made in Toronto.",
  "price": 240,
  "currency": "USD",
  "source_product_id": "coat-001",
  "source_product_url": "https://atelier-example.com/shop/coat-001",
  "availability_status": "available",
  "images": ["https://atelier-example.com/img/coat-001-front.jpg"],
  "category": "outerwear",
  "material": "wool",
  "size": { "label": "M", "system": "US" }
}
```

Required to pass the gate: `title`, `price` > 0, `source_product_id`
(the designer's own SKU — uniqueness key with the source), a **live**
`source_product_url`, and `availability_status: "available"`. Everything
else improves matching (tags are inferred from title/brand/description by
the same lexicon the brain uses) but is optional — **absent is absent; never
invent a field** (normalizer law).

## The call

```bash
curl -s -X POST https://www.asilummagazine.com/api/admin \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "action": "inventory.upsert",
    "sourceName": "atelier-example",
    "items": [ { ...item }, { ...item } ]
  }'
```

- `sourceName`: the designer's slug, `a-z0-9-`, 2–40 chars. Anything reading
  as demo/test (`seed`, `demo`, `sample`, `test`, `e2e`) is refused outright.
- Batch is 1–50 items and **atomic**: one bad item → `409` with per-index
  reasons and NOTHING written. Fix, resend whole batch (upsert is idempotent
  by item id, which is `<sourceName>-<source_product_id>`).
- Success echoes each item's id/price/availability for eyeball confirmation.

## After intake, verify (two minutes)

1. `/piece/<id>` renders the piece (safe read surface).
2. A checkout session opens for it: the item now PASSES the gate, so
   `POST /api/checkout {itemId}` returns a Stripe URL instead of the 409.
3. The piece participates in search/discover (tags landed).

## The Shopify fast path (preferred when the designer has a store)

Manual intake above is for designers without a Shopify store. When they have
one, use the business-account flow instead — apply → domain-check → approve →
`business.link-source` → `inventory.import-shopify {accountId, currency}` —
which pulls their public `products.json` through the SAME gate (skips
reported loudly; sold-out variants land as skips). Full steps:
`designer-program/ONBOARDING.md` §4. Re-running the import refreshes
availability and prices from their store — that is also the interim
availability-sync answer.

## Standing rules

- **Availability is the designer's truth.** `sold` means tell us the same
  day; until source sync exists (eBay-style adapters, post-LLC), the
  operator updates it by re-running intake with the new status. A stale
  "available" is risk F15 — the exact lie the campaign forbids.
- Demo items and real items never share a source. The 915 synthetic pieces
  stay `seed`-sourced and unpurchasable until retired.
- Card data never enters this flow anywhere — intake is catalog only.
