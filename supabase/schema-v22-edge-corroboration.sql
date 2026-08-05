-- ASILUM schema v22 — gamma edge corroboration (Aug 6, 2026).
-- Idempotent and additive. Apply after schema-v20-asterisk-guidance.sql.
--
-- NOTE ON NUMBERING: live production carries a v21 "account-profiles" row in
-- app_schema_migrations with NO corresponding file in this repo (applied
-- out-of-band). This file therefore takes v22 rather than colliding. The
-- drift itself is recorded in the PR for the owner; it is not resolved here.
--
-- WHY THIS EXISTS. The co-engagement graph (`edges`) was a global, monotone,
-- unauthenticated counter: POST /api/interaction wrote up to 100 pair-writes
-- per request with ON CONFLICT DO UPDATE SET w = edges.w + EXCLUDED.w, and
-- nothing anywhere deduped by identity, capped, or decayed. One device cookie
-- could push a chosen pair to w≈450 in minutes; gammaScore squashes w/(w+3),
-- so that pair then scored ≈0.99 on the gamma bridge — 20% of the core blend
-- — in EVERY other user's feed, and became the first "people who saved this
-- also saved" result on the public GET /api/related. It persisted forever.
--
-- THE FIX IS AN ARITHMETIC ONE, NOT A THRESHOLD. A distinct-contributor
-- THRESHOLD does not price the attack correctly: the ledger is keyed per
-- (contributor, pair), so an attacker mints N identities ONCE and reuses them
-- across unlimited pairs. Instead, gamma is scored from the number of DISTINCT
-- identities that corroborated a pair, and the squash constant is retuned
-- (GAMMA_CONTRIB_HALF = 2) so that a single contributor scores 0.333 — below
-- the r18 vector-neighbour floor of ~0.509 (0.6 × median cosine 0.848). One
-- identity therefore cannot lift an item above the baseline it would have had
-- with no edge at all, no matter how many times it engages.
--
--   edge_contributors — one row per (pair, identity). Stores that identity's
--     BEST weight for the pair, so the deliberate action hierarchy (bag 2 >
--     share 1.5 > save/favorite 1, board co-membership 2) survives, while
--     repetition buys nothing. Identity is stored as a SHA-256 hash, the
--     unknown_query_votes precedent — still pseudonymous personal data, so
--     account deletion erases it (see lib/db/production.js purge).
--   edges.contributors — materialized distinct-contributor count, bumped in
--     the SAME transaction as the ledger insert (the recordUnknownQuery
--     shape). Materialized because getEdges accepts up to 100 anchors and a
--     per-neighbour EXISTS probe would be the read path's DoS surface.
--
-- HISTORICAL ROWS ARE NOT GRANDFATHERED. Existing edges keep their w for
-- audit but get contributors = 0, so they score zero on the new curve until
-- real distinct identities corroborate them. Inferring contributors from w
-- would be fabricating history the system never recorded — and because the
-- attack inflates w, any such inference would assign the HIGHEST trust to the
-- most-likely-poisoned edges. The rows are retained, not truncated: deleting
-- production data is an owner decision, and the PR states the option.
--
-- Rollback / forward fix: BRAIN_EDGE_CORROBORATION=0 restores w-based scoring
-- without a deploy. A hard revert is DROP TABLE edge_contributors, ALTER
-- TABLE edges DROP COLUMN contributors, and reverting REQUIRED_SCHEMA_VERSION.
-- Retention: ledger rows live with the identity and are erased with it; the
-- CONTRIB_CAP bound is documented in docs/DATA-INVENTORY.md.

ALTER TABLE edges ADD COLUMN IF NOT EXISTS contributors INTEGER NOT NULL DEFAULT 0;
ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_contributors_check;
ALTER TABLE edges ADD CONSTRAINT edges_contributors_check CHECK (contributors >= 0);

CREATE TABLE IF NOT EXISTS edge_contributors (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  identity_hash TEXT NOT NULL CHECK (char_length(identity_hash) = 64),
  w REAL NOT NULL DEFAULT 1 CHECK (w > 0),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (a, b, identity_hash)
);

-- Read path: per-anchor top-K ordered by corroboration. A GLOBAL limit would
-- let one hot anchor starve the other 99 requested ids, so the read is a
-- LATERAL per anchor; these indexes serve that ordering. Deliberately NOT
-- partial on a contributors threshold — that would freeze the threshold at
-- deploy time and defeat the env kill switch.
CREATE INDEX IF NOT EXISTS edges_a_corroborated ON edges (a, contributors DESC, w DESC);
CREATE INDEX IF NOT EXISTS edges_b_corroborated ON edges (b, contributors DESC, w DESC);
-- Erasure: delete every ledger row for one identity.
CREATE INDEX IF NOT EXISTS edge_contributors_identity ON edge_contributors (identity_hash);

ALTER TABLE edge_contributors ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE edge_contributors FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE edge_contributors TO asilum_app';
    DROP POLICY IF EXISTS asilum_app_server_access ON edge_contributors;
    CREATE POLICY asilum_app_server_access ON edge_contributors
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO app_schema_migrations (version,name)
VALUES (22,'edge-corroboration')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;                    -- >= 22
--   SELECT count(*) FROM edges WHERE contributors > 0;                 -- 0 at first
--   SELECT relrowsecurity FROM pg_class WHERE relname='edge_contributors';  -- t
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name='edge_contributors' AND grantee IN ('anon','authenticated');  -- 0
