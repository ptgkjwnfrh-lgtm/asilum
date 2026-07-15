-- ASILUM schema v15 — wardrobe ownership model (handoff Feature C, Phase 3).
-- Idempotent and additive. Apply after schema-v14-asterisk-memory.sql.
--
-- One SERVER-ONLY domain (no anon/authenticated exposure; the app reaches it
-- as asilum_app through DATABASE_URL):
--   wardrobe_items — pieces the user actually OWNS. Ownership is explicit:
--     rows come from a user action (manual add, "I bought it" ticket
--     outcome, or a promoted upload) — never inferred from bag/favorites
--     (bag = intent, not ownership; standing invariant). Everything is
--     PRIVATE by default; there is no sharing surface in this phase
--     (owner decision #4 pending — visibility stays server-only until then).
--
-- photo_path references a PRIVATE Supabase Storage object (bucket
-- "wardrobe"); the DB never stores image bytes or public URLs. photo_consent
-- records the explicit upload consent version (DATA-INVENTORY: wardrobe
-- photo upload requires per-feature consent).
--
-- Verification: see queries at the bottom. Rollback/forward-fix: additive;
-- forward fix is DROP TABLE + reverting REQUIRED_SCHEMA_VERSION. Retention:
-- rows live with the identity, erased by /api/privacy.

CREATE TABLE IF NOT EXISTS wardrobe_items (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (source IN ('manual','ticket','catalog','upload')),
  source_ref TEXT CHECK (source_ref IS NULL OR char_length(source_ref) <= 80),
  catalog_item_id TEXT CHECK (catalog_item_id IS NULL OR char_length(catalog_item_id) <= 80),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  brand TEXT CHECK (brand IS NULL OR char_length(brand) <= 120),
  category TEXT CHECK (category IS NULL OR char_length(category) <= 40),
  size_label TEXT CHECK (size_label IS NULL OR char_length(size_label) <= 40),
  colors JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(colors) = 'array'),
  tags JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tags) = 'object'),
  photo_path TEXT CHECK (photo_path IS NULL OR char_length(photo_path) <= 300),
  photo_consent TEXT CHECK (photo_consent IS NULL OR char_length(photo_consent) <= 40),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  acquired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- the wardrobe read: one user's active pieces, newest first
CREATE INDEX IF NOT EXISTS wardrobe_items_by_user
  ON wardrobe_items (user_id, status, created_at DESC);
-- idempotent promotion: one wardrobe row per originating ticket/upload
CREATE UNIQUE INDEX IF NOT EXISTS wardrobe_items_source_ref
  ON wardrobe_items (user_id, source, source_ref) WHERE source_ref IS NOT NULL;

ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE wardrobe_items FROM PUBLIC;

-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE wardrobe_items FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wardrobe_items TO asilum_app;
GRANT USAGE, SELECT ON SEQUENCE wardrobe_items_id_seq TO asilum_app;

DROP POLICY IF EXISTS asilum_app_server_access ON wardrobe_items;
CREATE POLICY asilum_app_server_access ON wardrobe_items
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);

INSERT INTO app_schema_migrations (version,name)
VALUES (15,'wardrobe')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;      -- = 15
--   SELECT relrowsecurity FROM pg_class WHERE relname='wardrobe_items'; -- t
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name='wardrobe_items' AND grantee IN ('anon','authenticated'); -- 0
-- EXPLAIN notes: wardrobe_items_by_user serves the wardrobe page and the
--   stylist anchor pool (user_id=$1 AND status='active' ORDER BY created_at
--   DESC) as an index scan; wardrobe_items_source_ref makes ticket/upload
--   promotion idempotent.
