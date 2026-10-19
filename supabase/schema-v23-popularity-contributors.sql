-- ASILUM schema v23 — popularity counts PEOPLE (Aug 6, 2026).
-- Idempotent and additive. Apply after schema-v22-edge-corroboration.sql.
--
-- WHY. The delta bridge's counters were global, monotone and unauthenticated,
-- in BOTH directions:
--   UPWARD  — POST /api/interaction added eng+1 per positive action with no
--     per-identity dedup; 120 favourites/min from one cookie put an item's
--     volume term (eng/(eng+8)) at 0.94 for every user in the system.
--   DOWNWARD, and worse — GET /api/feed wrote imp+1 for all 60 served items on
--     EVERY serve while caller-controlled category/maxPrice/fit filters chose
--     WHICH items received them: ~3600 aimed impressions/minute. novelty =
--     25/(imp+25) then collapses to 0.007, permanently removing a targeted
--     item from every user's exploration and reach zones. A READ endpoint
--     mutating global ranking state. Exploration floors cannot protect a
--     specific ITEM, which is why suppression is the asymmetric direction.
--
-- popularity_contributors is the per-(item, identity) ledger: the primary key
-- IS the bound, so one identity is one engager and one viewer for an item,
-- forever, and no explicit per-identity cap is needed. Identity is stored as a
-- SHA-256 hash (the unknown_query_votes / edge_contributors precedent) — still
-- pseudonymous personal data, so account deletion erases it and recomputes the
-- affected items.
--
-- DELIBERATELY NO CAP ON viewers. edge_contributors caps at CONTRIB_CAP=8
-- because gamma is a max over a SATURATING weight. Novelty is monotone
-- DECREASING, so a cap would install a permanent novelty FLOOR beneath the
-- most-exposed items — manufacturing exactly the monoculture epsilon exists to
-- prevent. The 915-item catalog already bounds one identity to 915 rows.
--
-- HISTORICAL ROWS ARE NOT GRANDFATHERED (the v22 precedent): eng/imp are
-- retained as diagnostics — and as an abuse fingerprint, since an eng-to-
-- engagers ratio of 120:1 is a signature — while engagers/viewers start at 0.
-- Inferring people from event counts would fabricate history the system never
-- recorded, and because the attack inflates those counts it would assign the
-- highest trust to the most-likely-forged rows.
--
-- Rollback / forward fix: BRAIN_POPULARITY_DEDUP=0 restores raw-event scoring
-- AND the feed-side impression write as one coupled behaviour, without a
-- deploy. A hard revert is DROP TABLE popularity_contributors, ALTER TABLE
-- popularity DROP COLUMN engagers, viewers, and reverting
-- REQUIRED_SCHEMA_VERSION.

ALTER TABLE popularity ADD COLUMN IF NOT EXISTS engagers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE popularity ADD COLUMN IF NOT EXISTS viewers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE popularity DROP CONSTRAINT IF EXISTS popularity_engagers_check;
ALTER TABLE popularity ADD CONSTRAINT popularity_engagers_check CHECK (engagers >= 0);
ALTER TABLE popularity DROP CONSTRAINT IF EXISTS popularity_viewers_check;
ALTER TABLE popularity ADD CONSTRAINT popularity_viewers_check CHECK (viewers >= 0);

COMMENT ON COLUMN popularity.eng IS
  'DIAGNOSTIC ONLY since v23: raw engagement events, deliberately not deduplicated. Ranking reads engagers. A high eng:engagers ratio is an abuse fingerprint.';
COMMENT ON COLUMN popularity.imp IS
  'DIAGNOSTIC ONLY since v23: raw serve-counted impressions. Ranking reads viewers, which counts distinct examined identities.';

CREATE TABLE IF NOT EXISTS popularity_contributors (
  item_id TEXT NOT NULL,
  identity_hash TEXT NOT NULL CHECK (char_length(identity_hash) = 64),
  engaged BOOLEAN NOT NULL DEFAULT false,
  viewed BOOLEAN NOT NULL DEFAULT false,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, identity_hash)
);
-- Erasure: delete every row for one identity.
CREATE INDEX IF NOT EXISTS popularity_contributors_identity
  ON popularity_contributors (identity_hash);

ALTER TABLE popularity_contributors ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE popularity_contributors FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE popularity_contributors TO asilum_app';
    DROP POLICY IF EXISTS asilum_app_server_access ON popularity_contributors;
    CREATE POLICY asilum_app_server_access ON popularity_contributors
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO app_schema_migrations (version,name)
VALUES (23,'popularity-contributors')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;                       -- >= 23
--   SELECT count(*) FROM popularity WHERE engagers > 0 OR viewers > 0;    -- 0 at first
--   SELECT relrowsecurity FROM pg_class WHERE relname='popularity_contributors';  -- t
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name='popularity_contributors' AND grantee IN ('anon','authenticated');  -- 0
