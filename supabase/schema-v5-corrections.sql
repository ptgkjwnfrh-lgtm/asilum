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
    -- taste codes: not-my-style | less-like-this | more-like-this |
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
CREATE INDEX IF NOT EXISTS user_corrections_user ON user_corrections (user_id);
CREATE INDEX IF NOT EXISTS user_corrections_product ON user_corrections (product_id);

ALTER TABLE user_corrections ENABLE ROW LEVEL SECURITY;
