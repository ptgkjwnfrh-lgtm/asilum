-- ASILUM schema v6 — request hardening, idempotency, and hot-path indexes.
-- Additive/idempotent. Apply before deploying the matching application code:
--   node scripts/apply-schema.mjs supabase/schema-v6-hardening.sql

CREATE TABLE IF NOT EXISTS api_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (scope, subject_hash, window_start)
);
CREATE INDEX IF NOT EXISTS api_rate_limits_window ON api_rate_limits (window_start);

CREATE TABLE IF NOT EXISTS processed_operations (
  scope TEXT NOT NULL,
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, user_id, operation_id),
  CHECK (char_length(scope) BETWEEN 1 AND 80),
  CHECK (char_length(user_id) BETWEEN 1 AND 80),
  CHECK (char_length(operation_id) BETWEEN 8 AND 80)
);
CREATE INDEX IF NOT EXISTS processed_operations_created ON processed_operations (created_at);

-- "Add to bag" was previously mislabeled as a completed purchase. No real
-- checkout existed, so historical records are corrected to intent semantics.
UPDATE user_events SET type='USER_ADDED_TO_BAG' WHERE type='USER_BOUGHT_ITEM';

CREATE INDEX IF NOT EXISTS interactions_user_action_created
  ON interactions (user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS board_items_board_created
  ON board_items (board_id, created_at);
CREATE INDEX IF NOT EXISTS items_visibility_created
  ON items (moderation_status, is_available, created_at DESC);

ALTER TABLE purchase_tickets ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_tickets_idempotency
  ON purchase_tickets (user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Avoid accumulating duplicate image rows on repeated source syncs.
DELETE FROM product_images older USING product_images newer
WHERE older.product_id=newer.product_id
  AND older.image_url=newer.image_url
  AND older.id < newer.id;
CREATE UNIQUE INDEX IF NOT EXISTS product_images_identity
  ON product_images (product_id, image_url);

-- Server-only tables: the application reaches them through DATABASE_URL.
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_operations ENABLE ROW LEVEL SECURITY;
