-- ASILUM schema v13 — universal interpretation (handoff Feature A, Phase 1).
-- Idempotent and additive. Apply after schema-v12-color-and-measurements.sql.
--
-- Two SERVER-ONLY domains (no anon/authenticated exposure; the app reaches
-- them as asilum_app through DATABASE_URL):
--   unknown_queries          — normalized unresolved/low-confidence queries,
--                              demand-counted, admin-promoted into the
--                              reviewed research pipeline. Never auto-trust.
--   interpretation_feedback  — per-user "is this what you meant?" verdicts,
--                              bound to a contract version + interpretation id.
--                              Influences ONLY that user's ordering.
--
-- Verification: see queries at the bottom. Rollback/forward-fix: both tables
-- are additive; a forward fix is DROP TABLE (no other object depends on
-- them) plus reverting REQUIRED_SCHEMA_VERSION. Retention: unknown_queries
-- rows are DRAFT-capped at 180 days (docs/DATA-INVENTORY.md) — cleanup job
-- ships with the owner's retention decision.

CREATE TABLE IF NOT EXISTS unknown_queries (
  id BIGSERIAL PRIMARY KEY,
  normalized_query TEXT NOT NULL UNIQUE CHECK (char_length(normalized_query) BETWEEN 3 AND 200),
  -- Start at zero: the transactional vote insert below is the single source
  -- of the first count. A default of one would double-count every new query.
  demand_count INTEGER NOT NULL DEFAULT 0 CHECK (demand_count >= 0),
  distinct_identities INTEGER NOT NULL DEFAULT 0 CHECK (distinct_identities >= 0),
  last_method TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'observed'
    CHECK (status IN ('observed','research_created','resolved','dismissed')),
  research_fact_id TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Repair an early v13 application that used DEFAULT 1 / CHECK (> 0).
-- These ALTERs make a rerun converge on the corrected definition instead of
-- letting CREATE TABLE IF NOT EXISTS silently preserve the bad defaults.
ALTER TABLE unknown_queries ALTER COLUMN demand_count SET DEFAULT 0;
ALTER TABLE unknown_queries ALTER COLUMN distinct_identities SET DEFAULT 0;
ALTER TABLE unknown_queries DROP CONSTRAINT IF EXISTS unknown_queries_demand_count_check;
ALTER TABLE unknown_queries ADD CONSTRAINT unknown_queries_demand_count_check CHECK (demand_count >= 0);
ALTER TABLE unknown_queries DROP CONSTRAINT IF EXISTS unknown_queries_distinct_identities_check;
ALTER TABLE unknown_queries ADD CONSTRAINT unknown_queries_distinct_identities_check CHECK (distinct_identities >= 0);
-- open-queue reads: highest demand first among observed
CREATE INDEX IF NOT EXISTS unknown_queries_open
  ON unknown_queries (demand_count DESC, last_seen DESC) WHERE status = 'observed';

-- one lifetime vote per identity/query so one identity cannot inflate demand
CREATE TABLE IF NOT EXISTS unknown_query_votes (
  query_id BIGINT NOT NULL REFERENCES unknown_queries(id) ON DELETE CASCADE,
  identity_hash TEXT NOT NULL,
  last_voted TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (query_id, identity_hash)
);

CREATE TABLE IF NOT EXISTS interpretation_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL CHECK (char_length(user_id) <= 80),
  normalized_query TEXT NOT NULL CHECK (char_length(normalized_query) BETWEEN 1 AND 200),
  interpretation_id TEXT NOT NULL CHECK (char_length(interpretation_id) <= 120),
  contract_version INTEGER NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('meant','not-meant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, normalized_query, interpretation_id)
);
-- interpret-time lookup: this user's verdicts for this query
CREATE INDEX IF NOT EXISTS interpretation_feedback_user_query
  ON interpretation_feedback (user_id, normalized_query);

-- Server-only lockdown (house pattern: RLS on, zero client grants,
-- asilum_app policy-scoped full access).
ALTER TABLE unknown_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE unknown_query_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE interpretation_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON unknown_queries, unknown_query_votes, interpretation_feedback FROM PUBLIC;
-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE unknown_queries, unknown_query_votes, interpretation_feedback FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE unknown_queries, unknown_query_votes, interpretation_feedback TO asilum_app;
GRANT USAGE, SELECT ON SEQUENCE unknown_queries_id_seq, interpretation_feedback_id_seq TO asilum_app;

DROP POLICY IF EXISTS asilum_app_server_access ON unknown_queries;
CREATE POLICY asilum_app_server_access ON unknown_queries
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS asilum_app_server_access ON unknown_query_votes;
CREATE POLICY asilum_app_server_access ON unknown_query_votes
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS asilum_app_server_access ON interpretation_feedback;
CREATE POLICY asilum_app_server_access ON interpretation_feedback
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);

INSERT INTO app_schema_migrations (version,name)
VALUES (13,'interpretation')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;              -- = 13
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname IN ('unknown_queries','interpretation_feedback');  -- t,t
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name='unknown_queries' AND grantee IN ('anon','authenticated');  -- 0
-- EXPLAIN notes: unknown_queries_open serves the admin queue
--   (status='observed' ORDER BY demand_count DESC) as an index scan;
--   interpretation_feedback_user_query serves the per-request lookup
--   (user_id=$1 AND normalized_query=$2) as an index scan.
