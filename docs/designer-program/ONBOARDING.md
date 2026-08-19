# Designer onboarding — from "yes" to live (operator runbook)

The mechanical path once a designer accepts the offer. Target: **same-day
live.** Companion docs: OFFER.md (the deal), AGREEMENT-DRAFT.md (counsel
pass pending), ../DESIGNER-INTAKE.md (the intake call itself).

## 0. Before the first designer ever goes live (one-time, owner)
- [ ] Counsel pass on AGREEMENT-DRAFT.md + refund-policy draft (one MoR
      answer across both).
- [ ] Refund policy published to `/terms` (owner UI round — copy exists in
      the draft; L2 entry criterion).
- [ ] Stripe: business verification done (post-LLC), LIVE key + webhook
      secret in Vercel per SETUP-KEYS.md §5.
- [ ] `SENDGRID_API_KEY` (Mail Send) + `ORDER_NOTIFY_EMAIL` in Vercel so
      paid orders tap the operator.
- [ ] Decide the payout rail for the first cohort (manual e-transfer/ACH,
      monthly, with statements — counsel question D).

## Per designer

### 1. The yes (owner)
- [ ] Signed agreement (or the counsel-approved lightweight version).
- [ ] Collect: brand name, payout details, contact, ship-from region.
- [ ] Choose their `sourceName` slug (a-z0-9-, e.g. `atelier-example`) —
      permanent, it namespaces their item ids.

### 2. The pieces (owner + designer)
- [ ] 3–10 pieces to start; for each, the intake template fields
      (DESIGNER-INTAKE.md): title, price, currency, their SKU as
      `source_product_id`, the LIVE product URL on their site, honest
      `availability_status`, photos, material/size.
- [ ] Sanity: every URL opens publicly; prices match their site.

### 3. Intake (operator, 2 minutes)
- [ ] `inventory.upsert` call per DESIGNER-INTAKE.md. Atomic: fix any
      per-index refusals and resend the whole batch.
- [ ] Verify: `/piece/<id>` renders each piece; a checkout session opens
      (`POST /api/checkout` returns a Stripe URL, not the demo 409).

### 4. Business account, verification, and the Shopify fast path
The business account is the designer's home when they want one (booth,
inventory link, store import). Selling still works without it — items sell
by taste routing regardless — but the fast path for a Shopify designer is:

- [ ] Designer signs in and applies (brand name, `their-shop.myshopify.com`,
      their website) — this opens a REAL verification case (v18 machinery).
- [ ] **Anti-impersonation proof:** they place their verify token — shown to
      them on their business panel — as
      `<meta name="asilum-verify" content="TOKEN">` on their site (or
      `/.well-known/asilum-verify.txt`). Run `business.domain-check
      {accountId}` from the admin desk; attach the report as evidence when
      deciding. **A named human still decides — there is no machine path to
      verified.**
- [ ] Approve: `business.approve {accountId, note}`.
- [ ] Link inventory: `business.link-source {accountId, sourceName}` — the
      slug becomes theirs exclusively.
- [ ] **Import their store:** `inventory.import-shopify {accountId,
      currency}` pulls their public `products.json`, runs every piece
      through the checkout honesty gate, lands what passes, and reports
      what didn't (sold-out variants land as skips, by design). Set
      `currency` explicitly — Shopify's payload doesn't carry it.
- [ ] Verify per §3 (piece pages render, checkout opens on one of theirs).

### 5. First order drill (once per cohort, strongly recommended)
- [ ] Owner places ONE real low-value order end to end in live mode:
      pay → operator notification arrives → designer ships with tracking →
      delivered → payout statement issued. Ten minutes of rehearsal before
      a stranger's money is involved. (In test mode this whole loop is
      already proven; this drills the HUMAN half.)

### 6. Standing duties (weekly until source sync exists)
- [ ] Availability check-in with each designer; `sold` → re-run intake with
      the new status same day (stale "available" is risk F15 — the lie the
      campaign forbids).
- [ ] Paid orders: confirm designer shipped within 5 business days;
      tracking recorded.

## What is deliberately NOT here
- No exclusivity asks, no inventory holding, no cross-border, no proxy
  buying (ruled out, D1).
- No automated payouts yet — manual with statements until volume earns
  Stripe Connect.
- No new UI — the catalog, piece pages, checkout, and admin desk already
  carry the whole flow.
