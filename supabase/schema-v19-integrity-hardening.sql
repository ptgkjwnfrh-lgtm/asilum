-- ASILUM schema v19 — integrity and least-privilege hardening.
-- Idempotent forward fix after schema-v18-brand-cases.sql.
--
-- 1. A published profile room must be addressable by a claimed handle.
-- 2. Brand case subjects are paired and statuses stay inside their kind's
--    state machine even if a future caller bypasses application validation.
-- 3. The brand transition ledger is append-only to the runtime role.

UPDATE profile_rooms
SET published=false, updated_at=now()
WHERE published AND handle IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.profile_rooms'::regclass
      AND conname='profile_rooms_published_handle'
  ) THEN
    ALTER TABLE profile_rooms
      ADD CONSTRAINT profile_rooms_published_handle
      CHECK (NOT published OR handle IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profile_rooms_moderation_updated
  ON profile_rooms (moderation_status, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.brand_cases'::regclass
      AND conname='brand_cases_subject_pair'
  ) THEN
    ALTER TABLE brand_cases
      ADD CONSTRAINT brand_cases_subject_pair
      CHECK ((subject_type IS NULL) = (subject_id IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.brand_cases'::regclass
      AND conname='brand_cases_kind_status'
  ) THEN
    ALTER TABLE brand_cases
      ADD CONSTRAINT brand_cases_kind_status
      CHECK (
        (kind='verification' AND status IN
          ('open','under_review','verified','rejected','appealed','revoked','archived'))
        OR
        (kind='impersonation' AND status IN
          ('open','under_review','upheld','dismissed','appealed','enforced','archived'))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.brand_case_events'::regclass
      AND conname='brand_case_events_from_status'
  ) THEN
    ALTER TABLE brand_case_events
      ADD CONSTRAINT brand_case_events_from_status
      CHECK (from_status IN
        ('open','under_review','verified','rejected','upheld','dismissed',
         'appealed','enforced','revoked','archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.brand_case_events'::regclass
      AND conname='brand_case_events_to_status'
  ) THEN
    ALTER TABLE brand_case_events
      ADD CONSTRAINT brand_case_events_to_status
      CHECK (to_status IN
        ('open','under_review','verified','rejected','upheld','dismissed',
         'appealed','enforced','revoked','archived'));
  END IF;
END $$;

REVOKE DELETE ON TABLE brand_cases FROM asilum_app;
REVOKE UPDATE, DELETE ON TABLE brand_case_events FROM asilum_app;

DROP POLICY IF EXISTS asilum_app_server_access ON brand_cases;
DROP POLICY IF EXISTS asilum_app_brand_cases_select ON brand_cases;
DROP POLICY IF EXISTS asilum_app_brand_cases_insert ON brand_cases;
DROP POLICY IF EXISTS asilum_app_brand_cases_update ON brand_cases;
CREATE POLICY asilum_app_brand_cases_select ON brand_cases
  FOR SELECT TO asilum_app USING (true);
CREATE POLICY asilum_app_brand_cases_insert ON brand_cases
  FOR INSERT TO asilum_app WITH CHECK (true);
CREATE POLICY asilum_app_brand_cases_update ON brand_cases
  FOR UPDATE TO asilum_app USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS asilum_app_server_access ON brand_case_events;
DROP POLICY IF EXISTS asilum_app_brand_case_events_select ON brand_case_events;
DROP POLICY IF EXISTS asilum_app_brand_case_events_insert ON brand_case_events;
CREATE POLICY asilum_app_brand_case_events_select ON brand_case_events
  FOR SELECT TO asilum_app USING (true);
CREATE POLICY asilum_app_brand_case_events_insert ON brand_case_events
  FOR INSERT TO asilum_app WITH CHECK (true);

INSERT INTO app_schema_migrations (version,name)
VALUES (19,'integrity-hardening')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification:
--   SELECT max(version) FROM app_schema_migrations;                    -- = 19
--   SELECT has_table_privilege('asilum_app','brand_cases','DELETE');   -- f
--   SELECT has_table_privilege(
--     'asilum_app','brand_case_events','UPDATE,DELETE');               -- f
