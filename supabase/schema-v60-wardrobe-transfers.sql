-- schema-v60-wardrobe-transfers.sql
--
-- WARDROBE GIFTING (V.2 brief §8, owner, 1 Oct 2026). A gift is a PENDING
-- DIGITAL TRANSFER of one wardrobe card to one resolved passenger. The
-- recipient must accept; acceptance atomically moves the ACTIVE wardrobe row
-- to them and writes a transfer event. Decline, cancel and expiry leave
-- ownership exactly where it was. This is a database ownership record — not
-- a legal title, not proof of delivery; both parties see the sentence
-- (lib/wardrobe/gifts.js TRANSFER_DISCLAIMER). No blockchain.
--
-- THE PENDING-TRANSFER LOCK is the partial unique index: ONE pending
-- transfer per item, so two offers of the same card cannot both stand, and
-- the acceptance path takes FOR UPDATE on the transfer AND the item, so two
-- concurrent accepts resolve to one winner and one "no longer pending"
-- (tests/postgres-integration.test.js "wardrobe gift: …").
--
--   wardrobe_transfers       the offer, its state, who to (by resolved
--                            account AND by identity string, since wardrobe
--                            rows key on the identity string), a snapshot of
--                            the card at offer time (the sender's receipt
--                            survives the recipient later deleting the row),
--                            an idempotency key per sender, an expiry.
--   wardrobe_transfer_events append-only: offered / accepted / declined /
--                            cancelled / expired, with the actor.
--   wardrobe_items           + provenance (purchase | self | transferred —
--                            how THIS owner came by it; the origin `source`
--                            is kept), transferred_from, transfer_id.
--   notifications            gains 'wardrobe-gift'.
--
-- Numbered 60 after v59 on this branch (v59 = DM stage C).
--
-- ROLLBACK: DROP TABLE IF EXISTS wardrobe_transfer_events, wardrobe_transfers;
-- ALTER TABLE wardrobe_items DROP COLUMN IF EXISTS provenance, DROP COLUMN IF
-- EXISTS transferred_from, DROP COLUMN IF EXISTS transfer_id; (restore the v59
-- notifications kinds check by hand); DELETE FROM app_schema_migrations WHERE
-- version = 60;
-- VERIFY: SELECT state, count(*) FROM wardrobe_transfers GROUP BY 1;
--         SELECT provenance, count(*) FROM wardrobe_items GROUP BY 1;

ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'self';
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS transferred_from TEXT;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS transfer_id BIGINT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wardrobe_items_provenance_check') THEN
    ALTER TABLE wardrobe_items ADD CONSTRAINT wardrobe_items_provenance_check
      CHECK (provenance IN ('purchase', 'self', 'transferred'));
  END IF;
END $$;
-- existing rows: a ticket promotion is a purchase record; everything else is self-added
UPDATE wardrobe_items SET provenance = 'purchase' WHERE source = 'ticket' AND provenance = 'self' AND transfer_id IS NULL;

CREATE TABLE IF NOT EXISTS wardrobe_transfers (
  id              BIGSERIAL PRIMARY KEY,
  item_id         BIGINT NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  from_user_id    TEXT NOT NULL CHECK (char_length(from_user_id) BETWEEN 1 AND 80),
  to_user_id      TEXT NOT NULL CHECK (char_length(to_user_id) BETWEEN 1 AND 80),
  to_account_id   UUID NOT NULL,
  from_handle     TEXT,
  to_handle       TEXT,
  state           TEXT NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  note            TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  item_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(item_snapshot) = 'object'),
  idempotency_key TEXT CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  decided_at      TIMESTAMPTZ,
  CHECK (from_user_id <> to_user_id)
);
-- THE PENDING-TRANSFER LOCK: one open offer per card
CREATE UNIQUE INDEX IF NOT EXISTS wardrobe_transfers_one_pending
  ON wardrobe_transfers (item_id) WHERE state = 'pending';
-- a retried offer is the same offer
CREATE UNIQUE INDEX IF NOT EXISTS wardrobe_transfers_idempotent
  ON wardrobe_transfers (from_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS wardrobe_transfers_to ON wardrobe_transfers (to_user_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS wardrobe_transfers_from ON wardrobe_transfers (from_user_id, state, created_at DESC);

CREATE TABLE IF NOT EXISTS wardrobe_transfer_events (
  id            BIGSERIAL PRIMARY KEY,
  transfer_id   BIGINT NOT NULL REFERENCES wardrobe_transfers(id) ON DELETE CASCADE,
  item_id       BIGINT NOT NULL,
  event         TEXT NOT NULL CHECK (event IN ('offered', 'accepted', 'declined', 'cancelled', 'expired')),
  actor_user_id TEXT,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wardrobe_transfer_events_transfer ON wardrobe_transfer_events (transfer_id, at);

-- the notification kinds grow (v59 named three)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('liked-sold', 'dm-cleared', 'profile-shared', 'wardrobe-gift'));

DO $$ DECLARE t TEXT; role_name TEXT;
BEGIN FOREACH t IN ARRAY ARRAY['wardrobe_transfers', 'wardrobe_transfer_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', t);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', t, role_name); END IF;
  END LOOP; END LOOP; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
  GRANT SELECT, INSERT, UPDATE ON wardrobe_transfers TO asilum_app;
  GRANT SELECT, INSERT ON wardrobe_transfer_events TO asilum_app;
  GRANT USAGE, SELECT ON SEQUENCE wardrobe_transfers_id_seq, wardrobe_transfer_events_id_seq TO asilum_app;
  DROP POLICY IF EXISTS asilum_app_server_access ON wardrobe_transfers;
  CREATE POLICY asilum_app_server_access ON wardrobe_transfers FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS asilum_app_server_access ON wardrobe_transfer_events;
  CREATE POLICY asilum_app_server_access ON wardrobe_transfer_events FOR ALL TO asilum_app USING (true) WITH CHECK (true);
END IF; END $$;

INSERT INTO app_schema_migrations (version, name) VALUES (60, 'wardrobe-transfers')
ON CONFLICT (version) DO NOTHING;
