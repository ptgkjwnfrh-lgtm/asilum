-- ASILUM schema v14 — Asterisk memory surface (handoff Feature B, Phase 2).
-- Idempotent and additive. Apply after schema-v13-interpretation.sql.
--
-- Two SERVER-ONLY domains (no anon/authenticated exposure; the app reaches
-- them as asilum_app through DATABASE_URL):
--   asterisk_memory_preferences — per-user visibility toggles for the memory
--                                 drawer/page sections. The ONLY new write
--                                 domain the memory facade introduces
--                                 (ADR-001 rule 3); taste stays in the
--                                 existing stores.
--   user_follows                — brand/user follows graduated from
--                                 localStorage (ADR-001 consequence: follows
--                                 get a server table in the phase the drawer
--                                 ships). Board follows stay on the profile
--                                 (_meta.follows) — the feed reads them there.
--
-- Verification: see queries at the bottom. Rollback/forward-fix: both tables
-- are additive; a forward fix is DROP TABLE (no other object depends on
-- them) plus reverting REQUIRED_SCHEMA_VERSION. Retention: rows live with
-- the identity and are erased by /api/privacy (DATA-INVENTORY draft).

CREATE TABLE IF NOT EXISTS asterisk_memory_preferences (
  user_id TEXT PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 80),
  hidden_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_follows (
  user_id TEXT NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('brand','user')),
  target TEXT NOT NULL CHECK (char_length(target) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, target)
);
-- facade reads all of one user's follows newest-first
CREATE INDEX IF NOT EXISTS user_follows_by_user
  ON user_follows (user_id, created_at DESC);

ALTER TABLE asterisk_memory_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE asterisk_memory_preferences, user_follows FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE asterisk_memory_preferences, user_follows TO asilum_app;

DROP POLICY IF EXISTS asilum_app_server_access ON asterisk_memory_preferences;
CREATE POLICY asilum_app_server_access ON asterisk_memory_preferences
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS asilum_app_server_access ON user_follows;
CREATE POLICY asilum_app_server_access ON user_follows
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);

INSERT INTO app_schema_migrations (version,name)
VALUES (14,'asterisk-memory')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;              -- = 14
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname IN ('asterisk_memory_preferences','user_follows'); -- t,t
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name='user_follows' AND grantee IN ('anon','authenticated'); -- 0
-- EXPLAIN notes: user_follows_by_user serves the facade read
--   (user_id=$1 ORDER BY created_at DESC) as an index scan; preferences
--   reads are primary-key lookups.
