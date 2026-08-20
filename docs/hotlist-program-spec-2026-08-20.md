# The founders fee & the hotlist program — economics ruling + build spec

**Ruled by the owner 20 Aug 2026** (in-session, answering the Gate 0
booth-fee question — the answer was a whole model, not one word). This
supersedes D2's flat 15% (risk campaign §8, annotated there). Canonical
terms home for designer-facing numbers remains
`designer-program/OFFER.md`, rewritten the same day.

**Status:** TERMS are ruled and binding. Of the build pieces below, **P1
(founders fee at checkout) implements a non-negotiable ruled term inside
the already-unlocked checkout (D3) and ships immediately**; P2–P4 are
specified here and await the owner's build-order approval.

---

## 1. The ruling (owner's words, normalized)

- **1% "founders fee", buyer-paid, every piece sold, non-negotiable.**
  The business foots no extra cost on a base sale. Example: a $100 piece →
  the buyer pays $100 + $1 (1%) + shipping/handling + tax *(S&H and tax as
  those exist in checkout — today neither is charged; the fee does not wait
  for them)*.
- **Base sale: no commission.** The designer receives 100% of the item
  price. ASILUM's revenue on a base sale is the buyer's 1%.
- **The hotlist is the paid program (opt-in).** A business that wants a
  spot on the hotlist pays:
  - **$150/month booth rent** — the hotlist runs in monthly cycles;
  - **15% of the item price on hotlist-ATTRIBUTED completed sales only** —
    a reader reaches the business via its booth on their hotlist, then
    buys. A $100 attributed sale: designer nets $85; the buyer still pays
    $100 + $1 + S&H + tax.
- **Attribution is a precondition.** "A separate channel for tracking user
  traffic" must prove hotlist provenance; **no attribution record, no
  15%.**
- **Placement is taste-gated.** A paid booth appears only on the hotlists
  of passport users whose taste profile statistically matches the
  business's product tags — "a Rick Owens-adjacent booth never lands on a
  Jeremy Scott-adjacent hotlist." Rent cannot buy the wrong audience.

## 2. Recorded flags (facts on the record, not relitigation)

- **Processing arithmetic.** The ruling keeps processing costs off the
  business ("no extra cost"), so Stripe's ≈2.9% + 30¢ is ASILUM's. On a
  $100 base sale: founders-fee revenue $1.00 vs processing ≈$3.20 →
  **base sales run ≈ −$2.20 each**. Program sales are strongly positive
  (+$16 gross on the same order). Base volume is therefore priced as a
  cost of supply + taste data until L3 measures real numbers; C3's metric
  definition now says so explicitly (it will print negative, honestly).
- **The 15%'s scope.** The ruling's opening sentence ("15% of revenue of
  every piece sold") is narrowed by its own later clause ("ONLY users that
  discover business accounts via paid hotlist") and by the owner's worked
  example. **Recorded meaning: 15% is attributed-only.**
- **The $5 booth fee is dead** — replaced by the $150/month rent inside
  the opt-in program. (Closes the 18 Aug "unaffirmed, flagged" note.)
- **Rounding:** `fee_cents = round(item_price_cents × 0.01)` — cent
  precision, standard rounding.
- **Disclosure:** `/terms` must name the founders fee before any live
  sale (Gate 3 owner UI round); the checkout itself itemizes it (Stripe-
  hosted line item), so the buyer sees it before paying either way.

## 3. What already exists to build on

- **Checkout engine** — `startCheckout` (`lib/orders.js`) is the single
  money seam; append-only order ledger (schema v31/v33); full-amount
  refunds (a refunded buyer gets the fee back too — correct by default).
- **Booths** — `/api/business?booths=1` public roster, ten booths per the
  hotlist law, `/hotlist` (THE WIRE) renders them, `lib/business.js`.
  Today's roster is the honest-OPEN demo cohort; when the program opens,
  hotlist booth spots belong to paying businesses only.
- **Taste machinery** — alpha-bridge tag-space similarity + the ruling-8
  match floor (`floor:check`, 25th percentile) — P4 reuses this gate
  rather than inventing a second matcher.
- **Metric register** — C1–C4 defined-before-measured; attribution gets
  the same treatment (C5 below) before anything prints.

## 4. Build pieces

### P1 — Founders fee at checkout (ships now)
- `startCheckout` computes `feeCents`; the Stripe session carries **two
  line items**: the piece at list price + "Founders fee (1%)".
- Ledger: `orders.fee_cents` (schema v34, append migration, default 0).
  `amount_cents` keeps its existing meaning — **the item price snapshot**
  — so payout math survives later price edits; total charged =
  `amount_cents + fee_cents`.
- Order API/pages expose the fee and total so `/orders` never
  under-reports what the buyer was charged.
- Tests: fee math, line items, ledger row, mem + pg parity; keyed
  live-Stripe assertion that `amount_total` = 101% (rounded) of price.

### P2 — Attribution channel (precondition of any 15%; build with the first booth)
- Booth click-through on the hotlist → provenance event
  (`USER_VISITED_BOOTH {source_name}`) via a dedicated route —
  `/api/interaction`'s action set is frozen by architecture law and stays
  untouched.
- `startCheckout` stamps attribution at order creation: the caller's most
  recent booth visit for the item's `source_name` inside the window →
  `orders.attribution = 'hotlist'` (+ booth ref; schema v35 when built).
- **Window: RECOMMEND 7 days** (owner rules the number). Reported to the
  designer on every statement; disputes get the audit trail (counsel
  question G).
- **C5 (defined before measured):** attributed paid orders per booth per
  cycle; `—` until real data exists, same register rules as C1–C4.

### P3 — Booth rent billing (with the first paying booth)
- First cohort: **manual monthly invoice** (Stripe invoice/payment link),
  recorded on the admin desk — mirrors the manual-payouts pattern;
  automated Stripe Billing subscription when volume earns it.
- Cycle = the hotlist's monthly cycle, rent in advance; non-payment
  unlists the booth at cycle end (no mid-cycle clawbacks).
- ⚖ Auto-renew/subscription disclosure is counsel question F.

### P4 — Taste-gated placement (law from day one of the program)
- A paid booth renders on a given passport user's hotlist **only when**
  match(business tag profile, user profile) clears the ruling-8 floor.
  Business tag profile = weighted aggregate of the booth's
  `product_tags`.
- Below the floor → not shown, rent notwithstanding: the program sells
  **qualified placement, not impressions** (OFFER says this in plain
  words; no impression guarantees anywhere).
- Fixture test: rick-owens-tagged booth × jeremy-scott-tagged passport →
  absent from that hotlist.

**Sequencing:** P1 now → P2 + P4 must both be live before ANY paying
booth is (attribution + the taste gate are preconditions of charging) →
P3 manual at the first booth.

## 5. What needs the owner

- Approve the P2–P4 build order + the attribution window (7-day
  recommendation) + rent-lapse behavior (unlist at cycle end).
- Voice pass on every buyer/designer-facing word (unchanged law — the
  designer docs are rewritten but still parked).
