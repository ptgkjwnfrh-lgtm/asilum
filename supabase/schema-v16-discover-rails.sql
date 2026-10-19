-- ASILUM schema v16 — cultural Discover rails (handoff Feature D).
-- Idempotent and additive. Apply after schema-v15-wardrobe.sql.
--
-- Two SERVER-ONLY domains (no anon/authenticated exposure; the app reaches
-- them as asilum_app through DATABASE_URL):
--   discover_rails  — the rail REGISTRY: which rails exist, their order,
--                     whether they're on, and a versioned config blob. Rail
--                     CONTENT is never stored here — it derives at read time
--                     from the live culture catalog (lib/asterisk/culture),
--                     the single trend authority (lib/asterisk/trends), and
--                     the product pool, so rails can never drift from the
--                     reviewed sources they cite.
--   user_rail_prefs — per-user collapsed/hidden state. Preferences only —
--                     no taste, no content.
--
-- Seed rows use ON CONFLICT DO NOTHING so operator edits (reordering,
-- disabling) survive re-applies. Verification queries at the bottom.
-- Rollback/forward-fix: additive; DROP both tables + revert
-- REQUIRED_SCHEMA_VERSION. Retention: prefs live with the identity, erased
-- by /api/privacy; the registry is operator data, not personal data.

CREATE TABLE IF NOT EXISTS discover_rails (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  kind TEXT NOT NULL CHECK (kind IN ('screen','soundtrack','trend','exploration')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  position INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_rail_prefs (
  user_id TEXT NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 80),
  rail_id TEXT NOT NULL REFERENCES discover_rails(id) ON DELETE CASCADE,
  collapsed BOOLEAN NOT NULL DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rail_id)
);

INSERT INTO discover_rails (id, kind, title, position) VALUES
  ('screen',      'screen',      'FROM THE SCREEN',        10),
  ('soundtrack',  'soundtrack',  'THE SOUNDTRACK',         20),
  ('trend',       'trend',       'RISING NOW',             30),
  ('exploration', 'exploration', 'FAR FROM YOUR TASTE',    40)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE discover_rails ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rail_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE discover_rails, user_rail_prefs FROM PUBLIC;

-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE discover_rails, user_rail_prefs FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE discover_rails, user_rail_prefs TO asilum_app;

DROP POLICY IF EXISTS asilum_app_server_access ON discover_rails;
CREATE POLICY asilum_app_server_access ON discover_rails
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS asilum_app_server_access ON user_rail_prefs;
CREATE POLICY asilum_app_server_access ON user_rail_prefs
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);

INSERT INTO app_schema_migrations (version,name)
VALUES (16,'discover-rails')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;                    -- = 16
--   SELECT count(*) FROM discover_rails;                               -- >= 4
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname IN ('discover_rails','user_rail_prefs');           -- t,t
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name IN ('discover_rails','user_rail_prefs')
--       AND grantee IN ('anon','authenticated');                       -- 0
-- EXPLAIN notes: registry reads are tiny full scans (<=dozens of rows);
--   user_rail_prefs reads are primary-key lookups per (user, rail).
