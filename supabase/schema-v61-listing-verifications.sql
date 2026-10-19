-- schema-v61-listing-verifications.sql
--
-- THE VERIFICATION LEDGER (V.2 brief §12, owner, 1 Oct 2026). The card's
-- asterisk represents COMPLETED ASILUM LISTING CHECKS — not counterfeit-proof
-- authentication, not inventory freshness. One append-only row per check
-- run, BOUND TO THE LISTING'S EVIDENCE VERSION (a hash of the material
-- fields: title, brand, designers, size, category, image). A material change
-- gives the listing a new version, and every row for the old one is stale by
-- definition — the badge rule (lib/verification/ledger.js) reads only rows
-- whose version matches the listing as it is NOW.
--
-- Three checks ride on one row, each with its own status:
--   source   provenance — does the listing come from an approved provider
--            with a stable source id and a reachable listing URL?
--   ai       metadata consistency — do the listing's words agree with its
--            structured fields? With the model OFF this is LOCAL RULES
--            (lib/verification/desk.js) and never confident enough to skip a
--            human; with a keyed model the confidence may cross the bar.
--   human    optional review by a named reviewer (ADMIN_ACTOR), recorded
--            with its time.
-- Plus: who ran it (model/version or reviewer), when, and when it expires.
-- Failed, stale, missing or expired → no badge. AI confident + passing → badge
-- without a human. AI uncertain → PENDING until a human passes.
--
-- Numbered 61 after v60 on this branch.
--
-- ROLLBACK: DROP TABLE IF EXISTS listing_verifications;
--           DELETE FROM app_schema_migrations WHERE version = 61;
-- VERIFY:   SELECT ai_status, human_status, count(*) FROM listing_verifications GROUP BY 1, 2;

CREATE TABLE IF NOT EXISTS listing_verifications (
  id               BIGSERIAL PRIMARY KEY,
  item_id          TEXT NOT NULL,
  evidence_version TEXT NOT NULL CHECK (evidence_version ~ '^[0-9a-f]{16}$'),
  source_status    TEXT NOT NULL CHECK (source_status IN ('pass', 'fail', 'missing')),
  source_detail    TEXT,
  ai_status        TEXT NOT NULL CHECK (ai_status IN ('pass', 'flag', 'fail', 'missing')),
  ai_confidence    REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_model         TEXT,
  ai_version       TEXT,
  ai_detail        TEXT,
  human_status     TEXT NOT NULL DEFAULT 'none' CHECK (human_status IN ('none', 'pass', 'fail')),
  human_reviewer   TEXT,
  human_at         TIMESTAMPTZ,
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  rules_version    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS listing_verifications_item ON listing_verifications (item_id, evidence_version, checked_at DESC);

DO $$ DECLARE role_name TEXT;
BEGIN
  ALTER TABLE listing_verifications ENABLE ROW LEVEL SECURITY;
  REVOKE ALL PRIVILEGES ON TABLE listing_verifications FROM PUBLIC;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE listing_verifications FROM %I', role_name); END IF;
  END LOOP;
END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
  GRANT SELECT, INSERT ON listing_verifications TO asilum_app;
  GRANT USAGE, SELECT ON SEQUENCE listing_verifications_id_seq TO asilum_app;
  DROP POLICY IF EXISTS asilum_app_server_access ON listing_verifications;
  CREATE POLICY asilum_app_server_access ON listing_verifications FOR ALL TO asilum_app USING (true) WITH CHECK (true);
END IF; END $$;

INSERT INTO app_schema_migrations (version, name) VALUES (61, 'listing-verifications')
ON CONFLICT (version) DO NOTHING;
