-- supabase/schema-v5-corrections.sql
-- Asterisk AI Day 11: structured user corrections.
-- Corrections are first-class taste + data-quality signals, never chat noise.
-- Additive only. Apply:
--   node --experimental-default-type=module scripts/apply-schema.mjs supabase/schema-v5-corrections.sql

CREATE TABLE IF NOT EXISTS user_corrections (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  product_id TEXT,
  brand      TEXT,
  code       TEXT NOT NULL,
    -- recommendation feedback: not-my-style | less-like-this | more-like-this |
    --              right-vibe-wrong-product | already-own |
    --              dont-recommend-brand | dont-recommend-silhouette |
    --              too-literal | too-abstract
    -- data-report codes (route to moderation, not taste):
    --              wrong-brand | wrong-color | wrong-category |
    --              wrong-material | wrong-era
  tags       JSONB NOT NULL DEFAULT '[]',  -- product's dominant tags at correction time
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep direct database writes inside the same contract enforced by the API.
-- Named checks are added idempotently for environments that created the table
-- from an earlier preview of this migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_corrections_user_length'
    AND conrelid = 'user_corrections'::regclass) THEN
    ALTER TABLE user_corrections ADD CONSTRAINT user_corrections_user_length
      CHECK (char_length(user_id) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_corrections_product_length'
    AND conrelid = 'user_corrections'::regclass) THEN
    ALTER TABLE user_corrections ADD CONSTRAINT user_corrections_product_length
      CHECK (product_id IS NULL OR char_length(product_id) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_corrections_brand_length'
    AND conrelid = 'user_corrections'::regclass) THEN
    ALTER TABLE user_corrections ADD CONSTRAINT user_corrections_brand_length
      CHECK (brand IS NULL OR char_length(brand) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_corrections_code_valid'
    AND conrelid = 'user_corrections'::regclass) THEN
    ALTER TABLE user_corrections ADD CONSTRAINT user_corrections_code_valid CHECK (code IN (
      'not-my-style', 'less-like-this', 'more-like-this', 'right-vibe-wrong-product',
      'already-own', 'dont-recommend-brand', 'dont-recommend-silhouette',
      'too-literal', 'too-abstract', 'wrong-brand', 'wrong-color',
      'wrong-category', 'wrong-material', 'wrong-era'
    ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_corrections_tags_valid'
    AND conrelid = 'user_corrections'::regclass) THEN
    ALTER TABLE user_corrections ADD CONSTRAINT user_corrections_tags_valid
      CHECK (jsonb_typeof(tags) = 'array' AND jsonb_array_length(tags) <= 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_corrections_note_length'
    AND conrelid = 'user_corrections'::regclass) THEN
    ALTER TABLE user_corrections ADD CONSTRAINT user_corrections_note_length
      CHECK (note IS NULL OR char_length(note) <= 300);
  END IF;
END $$;

-- Collapse exact repeats from preview environments before enforcing the API's
-- idempotency contract. The newest correction remains authoritative.
DELETE FROM user_corrections older
USING user_corrections newer
WHERE older.user_id = newer.user_id
  AND older.product_id = newer.product_id
  AND older.code = newer.code
  AND older.id < newer.id;

CREATE UNIQUE INDEX IF NOT EXISTS user_corrections_identity
  ON user_corrections (user_id, product_id, code)
  WHERE product_id IS NOT NULL;

-- Matches the history query's equality + ordering shape and avoids a sort.
CREATE INDEX IF NOT EXISTS user_corrections_user_created
  ON user_corrections (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_corrections_user_product
  ON user_corrections (user_id, product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_corrections_user_brand_exclusion
  ON user_corrections (user_id, lower(brand))
  WHERE code = 'dont-recommend-brand' AND brand IS NOT NULL;

-- Server-only table: no Data API grants or public policies by design.
ALTER TABLE user_corrections ENABLE ROW LEVEL SECURITY;
