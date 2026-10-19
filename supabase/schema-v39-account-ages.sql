-- schema-v39-account-ages.sql
--
-- OWNER DECISION #2 (23 Aug 2026): minimum age 13, self-declared at account
-- creation. Recorded in docs/OWNER-DECISIONS.md. This table is the assertion.
-- The constitution makes an age policy a precondition for DMs (§4, and
-- OWNER-DECISIONS #2 "blocks Feature F with #3"), so this ships before the
-- messaging engine rather than beside it.
--
-- WHY THE DATE AND NOT A BOOLEAN. Someone who is 12 today is 13 next year. A
-- "confirmed 13+" flag written at signup freezes the answer and silently never
-- re-evaluates: a refused 12-year-old stays refused forever, and an accepted
-- answer can never be re-checked against a raised minimum or a stricter launch
-- region. The date is the only thing that stays true. lib/age.js computes; this
-- table only remembers.
--
-- RETENTION, stated rather than assumed. This is personal data, so it appears
-- in the §6 export. It is deliberately NOT in purgePersonalizationData: an age
-- gate a person can erase is not a gate, and the assertion is safety data
-- rather than personalization. Full account deletion still removes it, via the
-- auth.users FK below. ⚖ Whether an age assertion may be retained through a
-- personalization erasure is a counsel question, flagged in OWNER-DECISIONS #2.
--
-- NOT STORED: anything beyond the date. No age band, no derived "is_minor"
-- column. A derived column is a second copy of the answer that can disagree
-- with the first one after a birthday.

CREATE TABLE IF NOT EXISTS account_ages (
  account_id UUID PRIMARY KEY,
  birth_date DATE NOT NULL,
  -- A person may correct a typo; the newest assertion wins and the previous
  -- one is not kept. This is deliberately NOT an append-only ledger: a history
  -- of birth-date guesses is a richer profile of a minor than the single
  -- current answer, and keeping less is the safer failure.
  asserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE account_ages ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE account_ages FROM PUBLIC;

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE account_ages FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asilum_app') THEN
    -- No DELETE: the app may record and correct an assertion, never remove
    -- one. Removal is account deletion, which the FK below performs.
    GRANT SELECT, INSERT, UPDATE ON TABLE account_ages TO asilum_app;
    DROP POLICY IF EXISTS asilum_app_server_access ON account_ages;
    CREATE POLICY asilum_app_server_access ON account_ages
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  END IF;
END $$;

-- auth.users exists on Supabase, not on plain CI Postgres — the v17 pattern.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_ages_account_fk'
  ) THEN
    ALTER TABLE account_ages ADD CONSTRAINT account_ages_account_fk
      FOREIGN KEY (account_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
VALUES (39, 'account-ages')
ON CONFLICT (version) DO NOTHING;
