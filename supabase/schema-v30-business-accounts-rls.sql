-- schema-v30-business-accounts-rls.sql
-- The business-account feature has never worked in production.
--
-- v26 created `business_accounts`, enabled RLS, revoked from PUBLIC/anon/
-- authenticated, and GRANTed SELECT/INSERT/UPDATE/DELETE to `asilum_app`. It
-- never created the policy. **With RLS enabled and no policy, a GRANT is not
-- access** — Postgres default-denies, and `asilum_app` does not have
-- `rolbypassrls`. Every read returns zero rows and every write is refused.
--
-- Demonstrated as the real app role before writing this, inside a transaction
-- that was rolled back:
--
--   connected as: asilum_app | row_security_active: true
--   control  items              -> 915 rows readable
--   INSERT   business_accounts  -> DENIED: new row violates row-level
--                                  security policy for table "business_accounts"
--
-- Nobody noticed because the table is empty and an empty booth list is exactly
-- what the hotlist is supposed to show until brands verify. The failure state
-- and the correct state are the same picture.
--
-- WHY IT HAPPENED. `schema-v11-application-role.sql` back-fills
-- `asilum_app_server_access` across every table that existed AT v11, so any
-- table created later has to add it itself. v12 does this explicitly for
-- `user_measurements`. v26 did the RLS half and missed the policy half.
-- 58 of 59 RLS-enabled tables carry the policy; `business_accounts` was the one.
--
-- This adds nothing that the other 58 tables do not already have: the same
-- policy, the same name, the same shape.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS asilum_app_server_access ON business_accounts;
--   DELETE FROM app_schema_migrations WHERE version = 30;
-- (Rolling back restores the default-deny, i.e. the broken state.)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
    -- Idempotent: DROP first, so re-applying is a no-op rather than an error.
    DROP POLICY IF EXISTS asilum_app_server_access ON business_accounts;
    CREATE POLICY asilum_app_server_access ON business_accounts
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
  VALUES (30, 'business-accounts-rls')
  ON CONFLICT (version) DO NOTHING;
