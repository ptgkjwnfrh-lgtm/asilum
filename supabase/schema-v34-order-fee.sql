-- schema-v34-order-fee.sql
-- The founders fee (owner economics ruling, 20 Aug 2026 —
-- docs/hotlist-program-spec-2026-08-20.md): a buyer-paid 1% of the item
-- price, snapshotted per order at creation. amount_cents KEEPS its meaning
-- (the item-price snapshot, the payout basis); the buyer's total charge is
-- amount_cents + fee_cents. Existing rows default 0 truthfully — no fee was
-- charged before this column existed.
--
-- Rollback: ALTER TABLE orders DROP COLUMN fee_cents;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fee_cents INTEGER NOT NULL DEFAULT 0
  CHECK (fee_cents >= 0);
