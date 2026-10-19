-- schema-v33-image-fingerprints.sql
-- Perceptual fingerprints (dHash, 64-bit hex) of each real item's identity
-- image — the stolen-image screen (anti-impersonation directive, 18 Aug).
-- One row per item (the first/identity image, v1). Intake and Shopify
-- import compute the hash, compare against OTHER sources' rows, and flag
-- collisions to the operator; nothing is auto-judged (Feature G's law).
-- Demo/seed items are never fingerprinted — only real inventory enters.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS image_fingerprints;
--   DELETE FROM app_schema_migrations WHERE version = 33;

CREATE TABLE IF NOT EXISTS image_fingerprints (
  item_id     TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  image_url   TEXT NOT NULL,
  dhash       TEXT NOT NULL CHECK (dhash ~ '^[0-9a-f]{16}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS image_fingerprints_source_idx
  ON image_fingerprints (source_name);

ALTER TABLE image_fingerprints ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON image_fingerprints FROM PUBLIC;

-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE image_fingerprints FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
    DROP POLICY IF EXISTS asilum_app_server_access ON image_fingerprints;
    CREATE POLICY asilum_app_server_access ON image_fingerprints
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON image_fingerprints TO asilum_app; -- no DELETE
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
  VALUES (33, 'image-fingerprints')
  ON CONFLICT (version) DO NOTHING;
