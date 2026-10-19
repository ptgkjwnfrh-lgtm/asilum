-- schema-v35-buyer-vault.sql
-- The buyer vault (owner ruling 20 Aug 2026, the §6 build): personal
-- information — name, address, and saved-card REFERENCES (Stripe
-- customer/payment-method ids plus brand/last4 display metadata; never a
-- card number — Stripe holds the card) — lives in its own schema, apart
-- from the app's tables, reachable only by the server role. Exactly two
-- access paths exist by law — SETTINGS and the first purchase — enforced
-- in code by tests/vault-access.test.js.
-- Also: orders learn the referral lane (kind, payment intent) and
-- purchase_tickets link back to the fee order that paid for them.
--
-- Rollback:
--   ALTER TABLE purchase_tickets DROP COLUMN fee_order_id;
--   ALTER TABLE orders DROP COLUMN stripe_payment_intent_id;
--   ALTER TABLE orders DROP COLUMN kind;
--   DROP TABLE IF EXISTS buyer_vault.buyer_profiles; DROP SCHEMA IF EXISTS buyer_vault;
--   DELETE FROM app_schema_migrations WHERE version = 35;

CREATE SCHEMA IF NOT EXISTS buyer_vault;

CREATE TABLE IF NOT EXISTS buyer_vault.buyer_profiles (
  user_id                TEXT PRIMARY KEY,
  full_name              TEXT,
  address_line1          TEXT,
  address_line2          TEXT,
  city                   TEXT,
  region                 TEXT,
  postal_code            TEXT,
  country                TEXT,
  stripe_customer_id     TEXT,
  default_payment_method TEXT,
  card_brand             TEXT,
  card_last4             TEXT,
  consent_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE buyer_vault.buyer_profiles ENABLE ROW LEVEL SECURITY;
-- The vault schema is not exposed to PostgREST and anon/authenticated hold
-- no grants here; the server role is the only reader by construction.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
    GRANT USAGE ON SCHEMA buyer_vault TO asilum_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON buyer_vault.buyer_profiles TO asilum_app;
    DROP POLICY IF EXISTS asilum_app_server_access ON buyer_vault.buyer_profiles;
    CREATE POLICY asilum_app_server_access ON buyer_vault.buyer_profiles
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sale'
  CHECK (kind IN ('sale','ticket_fee'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS orders_payment_intent
  ON orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE purchase_tickets
  ADD COLUMN IF NOT EXISTS fee_order_id TEXT REFERENCES orders(id);

INSERT INTO app_schema_migrations (version, name)
  VALUES (35, 'buyer-vault')
  ON CONFLICT (version) DO NOTHING;
