-- schema-v51-asterisk-stream.sql
--
-- THE STREAM: what Asterisk read in a listing, what people answered, and the
-- shared map that routes the next piece better (owner, 10 Sep 2026 — the
-- five-step order; docs/adr/ADR-008-asterisk-stream.md).
--
--   asterisk_identifications  one row per catalog item Asterisk has read:
--                             the identification (house, line, garment,
--                             collection, year with confidence), the
--                             descriptors, the decoded seller tags and their
--                             readings, the model and what the read cost.
--                             Re-reading a piece replaces the row.
--   stream_outcomes           the shared map: descriptor × aesthetic ×
--                             what people did. No identity — counts only.
--                             A dislike counts twice against, an ignore a
--                             quarter (lib/db/production/stream.js).
--   asterisk_reflections      the system's own account of why a send was
--                             answered the way it was — per person, so they
--                             can read it on their memory page and erase it
--                             with everything else.
--
-- Two facets join the product_tags vocabulary: `detail` (a construction or
-- hardware fact — dagger collar, metal zippers, wool lining) and `reference`
-- (a cultural reference the piece earns — a film, a record, a scene).
--
-- ROLLBACK: DROP TABLE IF EXISTS asterisk_reflections; DROP TABLE IF EXISTS
-- stream_outcomes; DROP TABLE IF EXISTS asterisk_identifications; re-run the
-- v49 CHECK block; DELETE FROM app_schema_migrations WHERE version = 51.
-- (product_tags rows of type detail/reference must be deleted before the
-- narrower CHECK can be re-added.)

CREATE TABLE IF NOT EXISTS asterisk_identifications (
  item_id         TEXT PRIMARY KEY,
  source          TEXT NOT NULL DEFAULT 'ebay',
  house           TEXT,
  line            TEXT,
  designer        TEXT,
  garment         TEXT,
  collection      TEXT,
  season          TEXT,
  year            INT,
  year_low        INT,
  year_high       INT,
  year_confidence REAL NOT NULL DEFAULT 0,
  what_it_is      TEXT,
  evidence        JSONB NOT NULL DEFAULT '[]'::jsonb,
  descriptors     JSONB NOT NULL DEFAULT '[]'::jsonb,
  decoded         JSONB NOT NULL DEFAULT '{}'::jsonb,
  readings        JSONB NOT NULL DEFAULT '[]'::jsonb,
  taste           JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence      REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'ok',
  model           TEXT,
  prompt_version  TEXT,
  tokens_in       INT NOT NULL DEFAULT 0,
  tokens_out      INT NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10,5) NOT NULL DEFAULT 0,
  searched        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (year IS NULL OR (year >= 1900 AND year <= 2030))
);
CREATE INDEX IF NOT EXISTS asterisk_identifications_house ON asterisk_identifications (house) WHERE house IS NOT NULL;
CREATE INDEX IF NOT EXISTS asterisk_identifications_updated ON asterisk_identifications (updated_at DESC);

CREATE TABLE IF NOT EXISTS stream_outcomes (
  descriptor  TEXT NOT NULL,
  taste_tag   TEXT NOT NULL,
  likes       INT NOT NULL DEFAULT 0,
  dislikes    INT NOT NULL DEFAULT 0,
  ignores     INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (descriptor, taste_tag),
  CHECK (likes >= 0 AND dislikes >= 0 AND ignores >= 0)
);
CREATE INDEX IF NOT EXISTS stream_outcomes_taste ON stream_outcomes (taste_tag);

CREATE TABLE IF NOT EXISTS asterisk_reflections (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  action      TEXT NOT NULL,
  expectation REAL NOT NULL DEFAULT 0,
  blamed      JSONB NOT NULL DEFAULT '[]'::jsonb,
  credited    JSONB NOT NULL DEFAULT '[]'::jsonb,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asterisk_reflections_user ON asterisk_reflections (user_id, created_at DESC);

-- GHOST LISTINGS (owner, 10 Sep: "the app is still in demo, I just need ghost
-- listings so there aren't just random images"). A ghost is a REAL listing
-- read by Asterisk and shown for demonstration: real photographs, a real
-- link to the source, no purchase ticket (tickets/route.js answers 409).
-- The seed catalog stays 'live' by default and is demo by its source name.
ALTER TABLE items ADD COLUMN IF NOT EXISTS listing_kind TEXT NOT NULL DEFAULT 'live';
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_listing_kind_ck;
ALTER TABLE items ADD CONSTRAINT items_listing_kind_ck CHECK (listing_kind IN ('live', 'ghost'));

-- the two new facets (lib/tagging/vocabulary.js is the source of this list)
ALTER TABLE product_tags DROP CONSTRAINT IF EXISTS product_tags_facet_ck;
ALTER TABLE product_tags ADD CONSTRAINT product_tags_facet_ck CHECK (
  tag_type IN (
    'garment', 'category', 'material', 'color', 'silhouette', 'fit', 'condition',
    'brand', 'designer', 'collection', 'origin',
    'decade', 'year', 'season', 'climate',
    'aesthetic', 'aesthetic-adjacent', 'aesthetic-brand', 'mood', 'subculture',
    'gender', 'size', 'size-system', 'price-band',
    'detail', 'reference'
  )
);

-- Same lockdown every table since v11 gets: RLS on, PUBLIC/anon/authenticated
-- revoked, the app role given a policy (tests/rls-app-policy.test.js).
DO $$
DECLARE t TEXT; role_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['asterisk_identifications', 'stream_outcomes', 'asterisk_reflections'] LOOP
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
    DROP POLICY IF EXISTS asilum_app_server_access ON asterisk_identifications;
    CREATE POLICY asilum_app_server_access ON asterisk_identifications
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS asilum_app_server_access ON stream_outcomes;
    CREATE POLICY asilum_app_server_access ON stream_outcomes
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS asilum_app_server_access ON asterisk_reflections;
    CREATE POLICY asilum_app_server_access ON asterisk_reflections
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON asterisk_identifications TO asilum_app;
    GRANT SELECT, INSERT, UPDATE ON stream_outcomes TO asilum_app;
    GRANT SELECT, INSERT, DELETE ON asterisk_reflections TO asilum_app;
    GRANT USAGE, SELECT ON SEQUENCE asterisk_reflections_id_seq TO asilum_app;
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
VALUES (51, 'asterisk-stream')
ON CONFLICT (version) DO NOTHING;
