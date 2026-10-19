-- schema-v38-account-kinds-rekey.sql
--
-- v37 keyed account_kinds on the RAW identity string. That was wrong, and
-- ADR-002 had already said so: social/trust domains key on
-- `account_id uuid NOT NULL REFERENCES auth.users(id)` — the bare uuid from
-- accountIdFromIdentity() — and "device identities can NEVER hold social/trust
-- rows" (ADR-002 §2-3). An account's KIND decides whether it has a storefront,
-- a customer ledger and always-open DMs; that is a trust domain by any reading.
--
-- THE LIVE CONSEQUENCE, which is why this is a fix and not a tidy-up.
-- The signup chooser posted the identity it had to hand, which at that moment
-- is the DEVICE id `u-<uuid>` — adoption to `sb-<uuid>` happens afterwards in
-- the shell's auth listener. So a business chosen at signup was WRITTEN under
-- one id and READ BACK under another. It read as `passport`, and the storefront
-- silently never appeared. No error, no log line: the reader simply got the
-- default, which is exactly the downgrade v37's own comments were written to
-- prevent. Caught by the DM design pass against ADR-002, not by a test.
--
-- SAFE TO RE-KEY IN PLACE: production account_kinds held ZERO rows when this
-- was written (verified against the live database as the app role), so there is
-- no data to migrate — only a column type to correct before the first business
-- signs up. The DELETE below is therefore a no-op in production; it exists
-- because a row that is not a bare uuid was never readable by anyone and
-- cannot be re-keyed into one. It runs as the migration OWNER, which is the
-- only role permitted to remove from an append-only ledger.

DO $$
BEGIN
  -- Idempotent: only convert while the column is still text.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'account_kinds'
      AND column_name = 'account_id' AND data_type <> 'uuid'
  ) THEN
    DELETE FROM account_kind_events
      WHERE account_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    DELETE FROM account_kinds
      WHERE account_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    ALTER TABLE account_kinds
      ALTER COLUMN account_id TYPE UUID USING account_id::uuid;
    ALTER TABLE account_kind_events
      ALTER COLUMN account_id TYPE UUID USING account_id::uuid;
  END IF;
END $$;

-- auth.users exists on Supabase, not on plain CI Postgres — add the FK only
-- where the auth schema is present (the v17 pattern). With it, deleting the
-- auth user takes the kind and its ledger with it, which is the erasure
-- posture the rest of the social domain already has.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_kinds_account_fk'
  ) THEN
    ALTER TABLE account_kinds ADD CONSTRAINT account_kinds_account_fk
      FOREIGN KEY (account_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_kind_events_account_fk'
  ) THEN
    ALTER TABLE account_kind_events ADD CONSTRAINT account_kind_events_account_fk
      FOREIGN KEY (account_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
VALUES (38, 'account-kinds-rekey')
ON CONFLICT (version) DO NOTHING;
