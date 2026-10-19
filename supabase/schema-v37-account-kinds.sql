-- schema-v37-account-kinds.sql
-- What kind of account this is: a passport (a reader) or a business (a
-- storefront). The kind re-shapes navigation, six routes, the profile layout
-- and the DM rules, so it is account state, not a profile preference — a
-- preference blob is the wrong home for something a route guard reads.
--
-- TWO TABLES ON PURPOSE. `account_kinds` is the current answer, read on every
-- request and therefore a single indexed row. `account_kind_events` is the
-- append-only trail of how it got there. A kind change re-shapes someone's
-- entire app; "why is this account a business?" must be answerable later, and
-- an UPDATE that overwrites its own history cannot answer it.
--
-- The ledger follows the house pattern (brand_cases, order_events): insert
-- only, no UPDATE or DELETE grant to the app role, so the trail cannot be
-- tidied by the code that writes it.

CREATE TABLE IF NOT EXISTS account_kinds (
  account_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('passport','business')),
  chosen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_kind_events (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  from_kind TEXT CHECK (from_kind IN ('passport','business')),
  to_kind TEXT NOT NULL CHECK (to_kind IN ('passport','business')),
  -- who caused it: 'signup' (the person chose at creation), 'admin' (the desk
  -- changed it), 'migration'. Not free text — an audit trail whose actor field
  -- is a sentence cannot be counted.
  actor TEXT NOT NULL CHECK (actor IN ('signup','admin','migration')),
  note TEXT CHECK (char_length(note) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_kind_events_account
  ON account_kind_events (account_id, created_at DESC);

-- The admin terminal splits the roster by kind and wants counts per kind
-- without a sequential scan once there are many accounts.
CREATE INDEX IF NOT EXISTS account_kinds_by_kind
  ON account_kinds (kind, chosen_at DESC);

ALTER TABLE account_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_kind_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE account_kinds FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE account_kind_events FROM PUBLIC;

-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard,
-- exactly as schema-v26 does.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE account_kinds FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE account_kind_events FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asilum_app') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE account_kinds TO asilum_app;
    -- INSERT and SELECT only. The ledger is append-only BY GRANT, not by
    -- convention: v19 taught that a REVOKE is the enforcement and the code
    -- comment is only a description of it.
    GRANT SELECT, INSERT ON TABLE account_kind_events TO asilum_app;
    GRANT USAGE, SELECT ON SEQUENCE account_kind_events_id_seq TO asilum_app;

    -- RLS is ENABLED above, so without a policy the app role reads nothing and
    -- every account silently reads as the default kind — a failure that looks
    -- exactly like "nobody has chosen yet". v36's pattern, for that reason.
    DROP POLICY IF EXISTS asilum_app_server_access ON account_kinds;
    CREATE POLICY asilum_app_server_access ON account_kinds
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS asilum_app_server_access ON account_kind_events;
    CREATE POLICY asilum_app_server_access ON account_kind_events
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
VALUES (37, 'account-kinds')
ON CONFLICT (version) DO NOTHING;
