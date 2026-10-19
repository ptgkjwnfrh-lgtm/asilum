-- ASILUM schema v9 — scalable discovery, explicit ad gating, and user-reported
-- post-handoff outcomes. Idempotent. Apply after schema-v8-lockdown.sql.

ALTER TABLE items ADD COLUMN IF NOT EXISTS search_document TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category, '') || ' ' || coalesce(subcategory, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(material, '') || ' ' || coalesce(color, '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS items_search_document_gin ON items USING GIN (search_document);
CREATE INDEX IF NOT EXISTS items_brand_lower ON items (lower(brand)) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_tags_tag_product ON product_tags (tag, product_id);

ALTER TABLE items ADD COLUMN IF NOT EXISTS sponsored BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS sponsorship_status TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE items ADD COLUMN IF NOT EXISTS sponsor_disclosure TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='items_sponsorship_status_valid' AND conrelid='items'::regclass
  ) THEN
    ALTER TABLE items ADD CONSTRAINT items_sponsorship_status_valid
      CHECK (sponsorship_status IN ('inactive','scheduled','active','paused','ended')) NOT VALID;
  END IF;
END $$;
ALTER TABLE items VALIDATE CONSTRAINT items_sponsorship_status_valid;

ALTER TABLE purchase_tickets ADD COLUMN IF NOT EXISTS user_reported_outcome TEXT;
ALTER TABLE purchase_tickets ADD COLUMN IF NOT EXISTS outcome_reported_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='purchase_tickets_user_outcome_valid'
      AND conrelid='purchase_tickets'::regclass
  ) THEN
    ALTER TABLE purchase_tickets ADD CONSTRAINT purchase_tickets_user_outcome_valid
      CHECK (user_reported_outcome IS NULL OR user_reported_outcome IN ('bought','kept','returned','not-bought')) NOT VALID;
  END IF;
END $$;
ALTER TABLE purchase_tickets VALIDATE CONSTRAINT purchase_tickets_user_outcome_valid;

CREATE INDEX IF NOT EXISTS search_logs_user_created
  ON search_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS editorial_posts_author_created
  ON editorial_posts (author_id, created_at DESC) WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_model_events_user_created
  ON ai_model_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS processed_operations_user_created
  ON processed_operations (user_id, created_at DESC);

INSERT INTO app_schema_migrations (version,name)
VALUES (9,'discovery')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;
