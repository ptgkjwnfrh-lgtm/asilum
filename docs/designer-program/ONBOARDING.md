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

### 4. Presence (owner call, per current product law)
- [ ] Business account: if the designer wants a booth/hotlist presence,
      they create an account and apply; approve via `/admin`
      (`business.approve`). Booth presence is optional for selling —
      items sell by taste routing regardless.

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
