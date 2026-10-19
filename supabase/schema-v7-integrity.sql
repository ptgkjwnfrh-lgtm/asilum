-- ASILUM schema v7 — concurrency, state-machine, and migration integrity.
-- Idempotent and additive. Apply after schema-v6-hardening.sql.

CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Existing behavior treated the oldest board as the implicit default. Preserve
-- that behavior once, then enforce exactly zero-or-one defaults per user.
WITH missing_default AS (
  SELECT user_id FROM boards GROUP BY user_id HAVING NOT bool_or(is_default)
), ranked AS (
  SELECT board.id,
    row_number() OVER (PARTITION BY board.user_id ORDER BY board.created_at,board.id) AS position
  FROM boards AS board
  JOIN missing_default USING (user_id)
)
UPDATE boards AS board
SET is_default=true
FROM ranked
WHERE board.id=ranked.id AND ranked.position=1;

CREATE UNIQUE INDEX IF NOT EXISTS boards_one_default_per_user
  ON boards (user_id) WHERE is_default=true;
CREATE INDEX IF NOT EXISTS boards_user_created
  ON boards (user_id,is_default DESC,created_at,id);

CREATE TABLE IF NOT EXISTS identity_adoptions (
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  moved_profile BOOLEAN NOT NULL DEFAULT false,
  moved_boards INTEGER NOT NULL DEFAULT 0 CHECK (moved_boards >= 0),
  moved_corrections INTEGER NOT NULL DEFAULT 0 CHECK (moved_corrections >= 0),
  adopted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_user_id,to_user_id),
  CHECK (from_user_id <> to_user_id),
  CHECK (char_length(from_user_id) BETWEEN 1 AND 80),
  CHECK (char_length(to_user_id) BETWEEN 1 AND 80)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='purchase_tickets_status_valid'
      AND conrelid='purchase_tickets'::regclass
  ) THEN
    ALTER TABLE purchase_tickets ADD CONSTRAINT purchase_tickets_status_valid
      CHECK (status IN (
        'requested','checking_availability','available','unavailable',
        'awaiting_user_consent','awaiting_payment_or_checkout','checkout_started',
        'checkout_completed_on_source','canceled','failed','completed'
      )) NOT VALID;
  END IF;
END $$;
ALTER TABLE purchase_tickets VALIDATE CONSTRAINT purchase_tickets_status_valid;

ALTER TABLE app_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_adoptions ENABLE ROW LEVEL SECURITY;

INSERT INTO app_schema_migrations (version,name)
VALUES (7,'integrity')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;
