-- ASILUM schema v18 — brand verification & impersonation case machinery
-- (handoff Feature G groundwork). Idempotent and additive. Apply after
-- schema-v17-profile-rooms.sql.
--
-- The UNBLOCKED half of Feature G: Shopify OAuth / store control is
-- externally gated (partner app + review, RIGHTS-REGISTER), but the case
-- machinery that any verification or impersonation claim must pass through
-- is pure engineering. Two SERVER-ONLY tables:
--   brand_cases       — one row per case. kind verification|impersonation,
--                       an enforced status machine (lib/brands/cases.js owns
--                       TRANSITIONS; the columns only pin the vocabulary),
--                       evidence as https-only URLs + notes.
--   brand_case_events — APPEND-ONLY transition ledger: every status move
--                       records from/to/actor/note in the same transaction
--                       as the move itself. Cases can be audited end to end.
--
-- Honesty rules (mirrors learned_facts): a case reaches `verified` or
-- `upheld` ONLY with at least one https evidence URL and a named actor —
-- there is no machine path to a verified badge. BRAND_VERIFICATION_ENABLED
-- stays OFF: no public badge surfaces ship here; this is operator tooling.
-- Retention: cases are operational/trust records, not personalization —
-- NOT purged by /api/privacy (documented in DATA-INVENTORY).
-- Rollback/forward-fix: additive; DROP both tables + revert
-- REQUIRED_SCHEMA_VERSION.

CREATE TABLE IF NOT EXISTS brand_cases (
  id TEXT PRIMARY KEY CHECK (id ~ '^bc-[0-9a-f-]{36}$'),
  kind TEXT NOT NULL CHECK (kind IN ('verification','impersonation')),
  brand_name TEXT NOT NULL CHECK (char_length(brand_name) BETWEEN 1 AND 120),
  subject_type TEXT CHECK (subject_type IN ('brand','product','profile_room','source')),
  subject_id TEXT CHECK (char_length(subject_id) <= 80),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN
    ('open','under_review','verified','rejected','upheld','dismissed','appealed','enforced','revoked','archived')),
  opened_by TEXT NOT NULL CHECK (char_length(opened_by) BETWEEN 1 AND 80),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object' AND pg_column_size(evidence) <= 8192),
  resolution TEXT CHECK (char_length(resolution) <= 500),
  resolved_by TEXT CHECK (char_length(resolved_by) <= 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_cases_status ON brand_cases (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS brand_cases_brand ON brand_cases (lower(brand_name));

CREATE TABLE IF NOT EXISTS brand_case_events (
  id BIGSERIAL PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES brand_cases(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 80),
  note TEXT CHECK (char_length(note) <= 500),
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_case_events_case ON brand_case_events (case_id, at);

ALTER TABLE brand_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_case_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE brand_cases, brand_case_events FROM PUBLIC;

-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE brand_cases, brand_case_events FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE brand_cases, brand_case_events TO asilum_app;
GRANT USAGE, SELECT ON SEQUENCE brand_case_events_id_seq TO asilum_app;

DROP POLICY IF EXISTS asilum_app_server_access ON brand_cases;
CREATE POLICY asilum_app_server_access ON brand_cases
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS asilum_app_server_access ON brand_case_events;
CREATE POLICY asilum_app_server_access ON brand_case_events
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);

INSERT INTO app_schema_migrations (version,name)
VALUES (18,'brand-cases')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;                    -- = 18
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname IN ('brand_cases','brand_case_events');            -- t,t
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name IN ('brand_cases','brand_case_events')
--       AND grantee IN ('anon','authenticated');                       -- 0
-- EXPLAIN notes: status/brand lookups ride the two indexes; event reads are
--   (case_id, at) range scans.
