-- schema-v50-steward-ledger.sql
--
-- THE STEWARD GETS HANDS, AND EVERY THING THE HANDS DO IS WRITTEN DOWN FIRST.
--
-- Until now the steward only read (lib/steward/checks.js) and a person did
-- every repair from the admin desk. The owner has set the constitution's
-- read-only rule aside for it (3 Sep 2026): the steward may now ACT on its own
-- findings inside a declared boundary (lib/steward/decisions.js) — reversible
-- repairs, capped per run, and each one recorded BEFORE it is made.
--
-- Two tables, both APPEND-ONLY for the runtime role. `asilum_app` gets SELECT
-- and INSERT and nothing else: a ledger the writer can edit is a diary, not a
-- ledger. A revert is a NEW row whose `reverts` names the row it undoes; a
-- failure is a row that never commits, because the row and the mutation share
-- one transaction and the row goes first — so "a row with no effect" cannot
-- exist and "an effect with no row" cannot either.
--
--   steward_runs      one row per run that was allowed to write (act, revert,
--                     or an explicitly recorded read). The board as data, so
--                     movement between runs can be read back.
--   steward_actions   one row per repair. `targets` is what was touched,
--                     `inverse` is EXACTLY what a revert re-does — not a
--                     description of it, the rows themselves.
--
-- ROLLBACK: DROP TABLE IF EXISTS steward_actions; DROP TABLE IF EXISTS
-- steward_runs; DELETE FROM app_schema_migrations WHERE version = 50;
-- Dropping the ledger loses the record of repairs, not the repairs — every
-- action's inverse is also printed by the run that made it.

CREATE TABLE IF NOT EXISTS steward_runs (
  id          UUID PRIMARY KEY,
  ran_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  fired_by    TEXT NOT NULL,            -- cli | cron | desk | actions
  mode        TEXT NOT NULL CHECK (mode IN ('read', 'act', 'revert')),
  actor       TEXT NOT NULL,
  summary     JSONB NOT NULL,           -- {blocker, warn, note, unmeasurable, ok}
  findings    JSONB NOT NULL,           -- the board, as runSteward returned it
  exit_code   INT NOT NULL,
  instruments JSONB                     -- null unless the seven instruments ran
);

CREATE TABLE IF NOT EXISTS steward_actions (
  id         UUID PRIMARY KEY,
  run_id     UUID REFERENCES steward_runs(id),
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  action_id  TEXT NOT NULL,             -- lib/steward/actions.js id
  check_id   TEXT NOT NULL,             -- the finding it answered
  tier       TEXT NOT NULL CHECK (tier IN ('delegated', 'confirm')),
  state      TEXT NOT NULL CHECK (state IN ('applied', 'reverted')),
  actor      TEXT NOT NULL,
  count      INT NOT NULL DEFAULT 0,
  targets    JSONB NOT NULL DEFAULT '[]'::jsonb,
  inverse    JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence   TEXT NOT NULL,
  reverts    UUID REFERENCES steward_actions(id),
  CHECK ((state = 'reverted') = (reverts IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS steward_actions_at ON steward_actions (at DESC);
CREATE INDEX IF NOT EXISTS steward_actions_reverts ON steward_actions (reverts) WHERE reverts IS NOT NULL;
CREATE INDEX IF NOT EXISTS steward_runs_ran_at ON steward_runs (ran_at DESC);

-- Same lockdown every table since v11 gets, in the same file that creates the
-- table (tests/rls-app-policy.test.js): RLS on, PUBLIC/anon/authenticated
-- revoked, the app role given a policy — a GRANT without one is default-deny.
DO $$
DECLARE t TEXT; role_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['steward_runs', 'steward_actions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', t);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', t, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
    -- Append-only: SELECT and INSERT. No UPDATE, no DELETE, on purpose.
    GRANT SELECT, INSERT ON steward_runs TO asilum_app;
    GRANT SELECT, INSERT ON steward_actions TO asilum_app;
    DROP POLICY IF EXISTS asilum_app_server_access ON steward_runs;
    CREATE POLICY asilum_app_server_access ON steward_runs
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS asilum_app_server_access ON steward_actions;
    CREATE POLICY asilum_app_server_access ON steward_actions
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
VALUES (50, 'steward-ledger')
ON CONFLICT (version) DO NOTHING;
