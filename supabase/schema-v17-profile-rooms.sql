-- ASILUM schema v17 — MySpace-inspired profile rooms (handoff Feature E).
-- Idempotent and additive. Apply after schema-v16-discover-rails.sql.
--
-- Three domains, all SERVER-ONLY (no anon/authenticated exposure; the app
-- reaches them as asilum_app through DATABASE_URL):
--   profile_themes  — the theme REGISTRY: operator data, bounded visual
--                     tokens (accent/ink/paper/rule) applied ONLY inside the
--                     room wrapper — the magazine shell never re-themes.
--   profile_rooms   — one row per ACCOUNT: claimed handle, theme choice,
--                     published flag, moderation status. Per ADR-002 this is
--                     a social/trust domain: account_id is the VERIFIED auth
--                     uuid; device (u-) identities can never hold rows here.
--   profile_modules — the room's sections. Only `statement` (sanitized
--                     text) and `soundtrack` (culture-catalog anthem picks)
--                     STORE content; `top-pieces` and `brands` derive live
--                     at read time from taste/follow data, so modules cannot
--                     drift from the real signals they cite (rails doctrine).
--
-- auth.users exists on Supabase but not on plain CI Postgres — the FK is
-- added conditionally below (same class as the anon/authenticated role
-- guard). Seeds use ON CONFLICT DO NOTHING so operator edits survive
-- re-applies. Retention: rooms/modules are personal content — erased by
-- /api/privacy (sb- identities) and cascaded when the auth user is deleted.
-- Rollback/forward-fix: additive; DROP the three tables + revert
-- REQUIRED_SCHEMA_VERSION.

CREATE TABLE IF NOT EXISTS profile_themes (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  tokens JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tokens) = 'object'),
  position INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_rooms (
  account_id UUID PRIMARY KEY,
  handle TEXT UNIQUE CHECK (handle ~ '^[a-z0-9-]{3,24}$'),
  theme_id TEXT NOT NULL DEFAULT 'asilum' REFERENCES profile_themes(id),
  published BOOLEAN NOT NULL DEFAULT false,
  moderation_status TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_status IN ('visible','under_review','hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_modules (
  account_id UUID NOT NULL REFERENCES profile_rooms(account_id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('statement','soundtrack','top-pieces','brands')),
  position INTEGER NOT NULL DEFAULT 100,
  visible BOOLEAN NOT NULL DEFAULT true,
  content JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(content) = 'object' AND pg_column_size(content) <= 8192),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, module)
);

-- auth.users exists on Supabase, not on plain CI Postgres — add the FK only
-- where the auth schema is present (live). CI exercises the same tables
-- without the cross-schema constraint.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profile_rooms_account_fk'
  ) THEN
    ALTER TABLE profile_rooms ADD CONSTRAINT profile_rooms_account_fk
      FOREIGN KEY (account_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

INSERT INTO profile_themes (id, name, tokens, position) VALUES
  ('asilum',        'HOUSE',         '{"accent":"#e5342b","ink":"#000000","paper":"#ffffff","rule":"solid"}', 10),
  ('after-dark',    'AFTER DARK',    '{"accent":"#e5342b","ink":"#f2f2f2","paper":"#101013","rule":"solid"}', 20),
  ('archive-paper', 'ARCHIVE PAPER', '{"accent":"#8a3324","ink":"#2b2016","paper":"#f4ead8","rule":"double"}', 30),
  ('acid',          'ACID',          '{"accent":"#00a651","ink":"#101010","paper":"#fbfff2","rule":"solid"}', 40),
  ('pageant',       'PAGEANT',       '{"accent":"#ff2d78","ink":"#1a1a1a","paper":"#fff5fa","rule":"double"}', 50)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE profile_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_modules ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE profile_themes, profile_rooms, profile_modules FROM PUBLIC;

-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE profile_themes, profile_rooms, profile_modules FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profile_themes, profile_rooms, profile_modules TO asilum_app;

DROP POLICY IF EXISTS asilum_app_server_access ON profile_themes;
CREATE POLICY asilum_app_server_access ON profile_themes
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS asilum_app_server_access ON profile_rooms;
CREATE POLICY asilum_app_server_access ON profile_rooms
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS asilum_app_server_access ON profile_modules;
CREATE POLICY asilum_app_server_access ON profile_modules
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);

INSERT INTO app_schema_migrations (version,name)
VALUES (17,'profile-rooms')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;                    -- = 17
--   SELECT count(*) FROM profile_themes;                               -- >= 5
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname IN ('profile_themes','profile_rooms','profile_modules'); -- t,t,t
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name IN ('profile_themes','profile_rooms','profile_modules')
--       AND grantee IN ('anon','authenticated');                       -- 0
--   SELECT conname FROM pg_constraint WHERE conname='profile_rooms_account_fk';
--     -- present on Supabase, absent on plain CI Postgres (documented gap)
-- EXPLAIN notes: theme reads are tiny full scans; room lookups are PK or
--   unique-handle index; module reads are PK-prefix scans per account.
