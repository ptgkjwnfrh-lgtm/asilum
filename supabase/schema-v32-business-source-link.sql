-- schema-v32-business-source-link.sql
-- Links a VERIFIED business account to its inventory (owner directive,
-- 18 Aug): items already carry `source_name` (the intake/import namespace),
-- business_accounts now carries the same slug, so a booth and its real
-- pieces are one join. Nullable — a business without linked inventory is
-- legal; UNIQUE — two businesses can never claim one source.
--
-- No RLS/policy work needed: the table's RLS + asilum_app_server_access
-- policy shipped in v26/v30; a new column inherits them.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS business_accounts_source_name_key;
--   ALTER TABLE business_accounts DROP COLUMN IF EXISTS source_name;
--   DELETE FROM app_schema_migrations WHERE version = 32;

ALTER TABLE business_accounts ADD COLUMN IF NOT EXISTS source_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_accounts_source_name_shape'
  ) THEN
    ALTER TABLE business_accounts ADD CONSTRAINT business_accounts_source_name_shape
      CHECK (source_name IS NULL OR source_name ~ '^[a-z0-9-]{2,40}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS business_accounts_source_name_key
  ON business_accounts (source_name) WHERE source_name IS NOT NULL;

INSERT INTO app_schema_migrations (version, name)
  VALUES (32, 'business-source-link')
  ON CONFLICT (version) DO NOTHING;
