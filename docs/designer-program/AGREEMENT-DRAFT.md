# Founding designer agreement — DRAFT FOR COUNSEL REVIEW

**Status: DRAFT. Not legal advice, not executed, not sent.** ⚖ Route through
the counsel contact (EU-AI-TRANSPARENCY.md) with the refund-policy draft —
they interlock. Terms below implement ruling D1 (domestic designer-ships,
US+CA, 18 Aug 2026) and the owner's economics ruling of 20 Aug 2026
(founders fee + hotlist program — supersedes the flat 15%; ruling record:
`../hotlist-program-spec-2026-08-20.md`).

## Parties & structure
ASILUM [LLC — entity name/state pending, arrives ~25 Aug] ("ASILUM") and the
designer ("Designer"). Marketplace agreement, not consignment, not
employment: Designer sells to the buyer; ASILUM provides the marketplace,
checkout, and support channel. [Counsel: reconcile with the
merchant-of-record question in the refund draft — the answer must be the
same in both documents.]

## Commercial terms
1. Founders fee: ASILUM adds a service fee of 1% of the item sale price
   (minimum US$0.50) to the buyer's checkout total on every completed
   order. The fee is paid by the buyer, is never deducted from Designer,
   and applies to every sale without exception. [Counsel: buyer-paid
   checkout fee — see open question E.]
2. Base sales: Designer receives 100% of the item sale price; no
   commission and no listing, membership, or per-item fees. Shipping
   charged to the buyer (if any) passes through to Designer
   uncommissioned. Payment processing costs are ASILUM's.
3. Hotlist booth (optional program). If Designer opts in:
   a. Booth rent of US$150 per month (the hotlist runs in monthly
      cycles), payable in advance; non-payment unlists the booth at the
      end of the paid cycle.
   b. Commission of 15% of the item sale price on hotlist-attributed
      completed orders only — orders where the buyer reached Designer via
      Designer's booth on the buyer's hotlist within the attribution
      window (definition and window per the attribution spec; ASILUM
      maintains a dedicated tracking channel and reports attribution with
      every statement). No attribution record, no commission.
   c. Booth placement is taste-matched: the booth is shown only to
      readers whose taste profile matches Designer's product tags. No
      impression or placement volume is guaranteed.
   d. Fee integrity: suspicious behaviour relating to the hotlist fee —
      attribution tampering, fee circumvention, manufactured traffic —
      results in account suspension and PERMANENT exclusion from the
      hotlist program. Determinations are made by named-human review on
      the order ledger's evidence. [Counsel: align cure/notice rights, if
      any, with §14's termination terms.]
4. Payouts: monthly, net of refunds issued that month, to Designer's named
   account — 100% of price on base orders, 85% on attributed orders. A
   statement accompanies every payout (order ids, amounts, attribution,
   refunds).
5. Taxes: each party responsible for its own; sales-tax collection per
   counsel's answer to the refund draft's open question 2.

## Designer obligations
6. Accuracy: listings (price, materials, sizing, photos) are true; the live
   product URL on Designer's own site is required for every listed piece.
7. Availability truth: "available" only while in stock and shippable within
   5 business days; sold-out reported same day. [This mirrors the intake
   system's enforcement — the catalog refuses stale listings mechanically.]
8. Fulfillment: ship within 5 business days of order notice, domestic
   (US/CA), tracked; tracking number provided to ASILUM.
9. Authenticity: everything sold is Designer's own authentic work or work
   they are licensed to sell. Counterfeits are immediate termination.
10. Returns: Designer honors the published return policy; damaged or
    misdescribed items are refunded in full with return shipping on
    ASILUM/Designer per the policy.

## ASILUM obligations
11. Run catalog, checkout (Stripe-hosted; ASILUM never handles card data),
    order notifications, and first-line buyer support.
12. Pay out per §4 with statements.
13. Present Designer's work truthfully — no invented scarcity, no fake
    engagement, no synthetic reviews (house policy, stated contractually).

## Content & IP
14. Designer grants ASILUM a non-exclusive, revocable license to display
    provided names, photos, and descriptions for listing, editorial context,
    and the designer's booth. Ownership stays with Designer.
15. Non-exclusive relationship both ways; either party may end with 14 days'
    notice; open orders complete under these terms (booth rent already paid
    is not refunded for the balance of the cycle unless counsel says
    otherwise — question F).

## Boilerplate for counsel
16. Liability caps, indemnities (authenticity/IP infringement flowing from
    Designer; platform operation from ASILUM), governing law [owner's
    province/state], dispute resolution, privacy addendum (buyer data used
    only for fulfillment — mirrors SOURCE-POLICY and the privacy stack).

## Open questions for counsel
A. Same MoR question as the refund draft — one answer, two documents.
B. Whether §7/§8 SLAs need liquidated-damages language or stay soft at
   ten-orders scale.
C. GST/HST + US state nexus for a CA-based marketplace paying US designers.
D. Payout rail (Interac/ACH/Stripe transfers) and any money-transmission
   implication before Stripe Connect replaces manual payouts.
E. The buyer-paid founders fee (§1): classification (platform service fee
   vs card surcharge), jurisdiction-specific checkout disclosure, and
   whether any launch state/province caps or forbids it.
F. Booth rent (§3a): auto-renewal/recurring-fee disclosure requirements
   for a monthly business subscription; notice requirements for price
   changes; mid-cycle termination treatment.
G. Attribution (§3b): audit/dispute clause — what Designer may inspect
   when contesting an attributed commission.
H. Buyer-side credentials-on-file: the checkout saves the buyer's card by
   default (Stripe-held; disclosed at entry and removable in Settings) so
   returning purchases are one press. Confirm this disclosure meets
   card-network credential-on-file consent standards and any regional
   explicit-consent requirement in the launch jurisdictions.
