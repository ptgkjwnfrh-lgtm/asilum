-- schema-v31-orders.sql
-- Real-money order ledger for the Stripe checkout engine (risk campaign §2,
-- phase L2; owner unlocked checkout 18 Aug — "stripe is setup, go forth").
--
-- MODEL. `order_events` is the truth and it is APPEND-ONLY (the brand_cases
-- pattern from v18/v19): the app role can INSERT and SELECT but never UPDATE
-- or DELETE an event. `orders` is the queryable projection of that stream —
-- status/updated_at move, rows are never deleted by the app role.
--
-- `order_events.stripe_event_id` is UNIQUE so a redelivered Stripe webhook
-- (they retry on any non-2xx) inserts nothing the second time: idempotency
-- lives in the schema, not in handler memory.
--
-- Card data NEVER lands here — checkout is Stripe-hosted (SAQ-A posture).
-- The only Stripe identifiers stored are session/event ids.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS order_events; DROP TABLE IF EXISTS orders;
--   DELETE FROM app_schema_migrations WHERE version = 31;

CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,              -- ord_<uuid>
  user_id           TEXT NOT NULL,
  item_id           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created','awaiting_payment','paid',
                                      'expired','failed','refunded')),
  amount_cents      INTEGER NOT NULL CHECK (amount_cents > 0),
  currency          TEXT NOT NULL DEFAULT 'usd',
  stripe_session_id TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_events (
  id              BIGSERIAL PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id),
  type            TEXT NOT NULL,                   -- created|checkout_opened|paid|expired|failed|refunded
  source          TEXT NOT NULL,                   -- api|webhook|reconcile
  stripe_event_id TEXT UNIQUE,                     -- NULL for non-webhook events
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_idx        ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, id);

ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON orders       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON order_events FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
    -- v30's lesson enforced by tests/rls-app-policy.test.js: the policy ships
    -- in the SAME file that enables RLS, or the grant below buys nothing.
    DROP POLICY IF EXISTS asilum_app_server_access ON orders;
    CREATE POLICY asilum_app_server_access ON orders
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS asilum_app_server_access ON order_events;
    CREATE POLICY asilum_app_server_access ON order_events
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);

    GRANT SELECT, INSERT, UPDATE ON orders TO asilum_app;         -- no DELETE
    GRANT SELECT, INSERT        ON order_events TO asilum_app;    -- append-only
    GRANT USAGE, SELECT ON SEQUENCE order_events_id_seq TO asilum_app;
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
  VALUES (31, 'orders')
  ON CONFLICT (version) DO NOTHING;
