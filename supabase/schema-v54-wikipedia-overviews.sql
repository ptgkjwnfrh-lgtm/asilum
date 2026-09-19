-- ASILUM schema v54 — revision-pinned Wikipedia designer/house overviews.
--
-- Wikipedia prose is a licensed source record, never generated ASILUM copy.
-- Identity/discovery, the paragraph, image rights, career relationships and
-- refresh state are deliberately separate so one source cannot silently stand
-- in for another. These tables are server-only: public clients receive a
-- strict DTO through ASILUM routes and never arbitrary remote HTML.
--
-- ROLLBACK (loses imported knowledge records; export first):
--   DROP TABLE IF EXISTS wikipedia_reviews, wikipedia_audit,
--     wikipedia_jobs, fashion_relationships, wikipedia_overviews,
--     fashion_discovery_evidence, fashion_discovery_sources,
--     fashion_entity_aliases, fashion_entities CASCADE;
--   DELETE FROM app_schema_migrations WHERE version = 54;

CREATE TABLE IF NOT EXISTS fashion_entities (
  id                    TEXT PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 160),
  kind                  TEXT NOT NULL CHECK (kind IN ('designer','house')),
  canonical_name        TEXT NOT NULL CHECK (char_length(canonical_name) BETWEEN 1 AND 300),
  wikidata_qid          TEXT CHECK (wikidata_qid IS NULL OR wikidata_qid ~ '^Q[1-9][0-9]*$'),
  match_status          TEXT NOT NULL DEFAULT 'candidate' CHECK (match_status IN
    ('candidate','matched','ambiguous','rejected','wikidata_only','no_article','language_only','temporary_failure')),
  public_status         TEXT NOT NULL DEFAULT 'unpublished' CHECK (public_status IN
    ('unpublished','published','review','withdrawn')),
  preferred_language    TEXT CHECK (preferred_language IS NULL OR preferred_language ~ '^[a-z][a-z0-9-]{1,19}$'),
  review_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, wikidata_qid)
);

CREATE TABLE IF NOT EXISTS fashion_entity_aliases (
  id                    BIGSERIAL PRIMARY KEY,
  entity_id             TEXT NOT NULL REFERENCES fashion_entities(id) ON DELETE CASCADE,
  alias                 TEXT NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 300),
  alias_folded          TEXT NOT NULL CHECK (char_length(alias_folded) BETWEEN 1 AND 300),
  language              TEXT,
  source                TEXT NOT NULL DEFAULT 'import',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, alias_folded)
);
CREATE INDEX IF NOT EXISTS fashion_entity_aliases_folded_idx
  ON fashion_entity_aliases (alias_folded, entity_id);

CREATE TABLE IF NOT EXISTS fashion_discovery_sources (
  source_key            TEXT PRIMARY KEY CHECK (char_length(source_key) BETWEEN 1 AND 120),
  label                 TEXT NOT NULL,
  source_type           TEXT NOT NULL CHECK (source_type IN
    ('internal_registry','wikipedia_category','wikipedia_list','wikidata','fashion_week','runway_archive','boutique_directory')),
  discovery_url         TEXT NOT NULL,
  region                TEXT,
  season_or_date        TEXT,
  enabled               BOOLEAN NOT NULL DEFAULT false,
  access_mode           TEXT NOT NULL DEFAULT 'reviewed' CHECK (access_mode IN ('api','manual','reviewed','disabled')),
  retrieved_at          TIMESTAMPTZ,
  checkpoint            JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fashion_discovery_evidence (
  id                    BIGSERIAL PRIMARY KEY,
  entity_id             TEXT NOT NULL REFERENCES fashion_entities(id) ON DELETE CASCADE,
  source_key            TEXT NOT NULL REFERENCES fashion_discovery_sources(source_key),
  evidence_url          TEXT NOT NULL,
  evidence_type         TEXT NOT NULL CHECK (evidence_type IN
    ('existing_catalog','category','list','wikidata_statement','sitelink','stockist','fashion_week','runway','operator_mapping')),
  relevant_date         TEXT,
  qualification         JSONB NOT NULL DEFAULT '{}'::jsonb,
  retrieved_at          TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, source_key, evidence_url)
);
CREATE INDEX IF NOT EXISTS fashion_discovery_evidence_entity_idx
  ON fashion_discovery_evidence (entity_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS fashion_discovery_evidence_source_idx
  ON fashion_discovery_evidence (source_key, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS wikipedia_overviews (
  entity_id             TEXT NOT NULL REFERENCES fashion_entities(id) ON DELETE CASCADE,
  language              TEXT NOT NULL CHECK (language ~ '^[a-z][a-z0-9-]{1,19}$'),
  page_id               BIGINT NOT NULL CHECK (page_id > 0),
  canonical_title       TEXT NOT NULL,
  canonical_url         TEXT NOT NULL,
  redirect_from         JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision_id           BIGINT NOT NULL CHECK (revision_id > 0),
  revision_timestamp    TIMESTAMPTZ NOT NULL,
  source_paragraph      TEXT NOT NULL CHECK (char_length(source_paragraph) BETWEEN 40 AND 12000),
  rendered_text         TEXT NOT NULL CHECK (char_length(rendered_text) BETWEEN 40 AND 12000),
  paragraph_selector    TEXT NOT NULL,
  extractor_version     TEXT NOT NULL,
  content_hash          TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  attribution_label     TEXT NOT NULL DEFAULT 'Wikipedia contributors',
  text_license          TEXT NOT NULL DEFAULT 'CC BY-SA 4.0',
  text_license_url      TEXT NOT NULL DEFAULT 'https://creativecommons.org/licenses/by-sa/4.0/',
  editorial_modifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  image                 JSONB,
  status                TEXT NOT NULL DEFAULT 'review' CHECK (status IN
    ('published','review','withdrawn','unusable','temporary_failure')),
  checked_at            TIMESTAMPTZ NOT NULL,
  fetched_at            TIMESTAMPTZ NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, language),
  UNIQUE (language, page_id)
);
CREATE INDEX IF NOT EXISTS wikipedia_overviews_public_idx
  ON wikipedia_overviews (entity_id, language, checked_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS wikipedia_overviews_refresh_idx
  ON wikipedia_overviews (expires_at, entity_id) WHERE status IN ('published','temporary_failure');

CREATE TABLE IF NOT EXISTS fashion_relationships (
  id                    TEXT PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 240),
  designer_id           TEXT NOT NULL REFERENCES fashion_entities(id) ON DELETE CASCADE,
  house_id              TEXT NOT NULL REFERENCES fashion_entities(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL,
  start_value           TEXT,
  end_value             TEXT,
  date_precision        TEXT NOT NULL DEFAULT 'unknown' CHECK (date_precision IN ('day','month','year','unknown')),
  evidence              JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status         TEXT NOT NULL DEFAULT 'reviewed' CHECK (review_status IN ('candidate','reviewed','disputed','withdrawn')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fashion_relationships_designer_idx
  ON fashion_relationships (designer_id, start_value, id);
CREATE INDEX IF NOT EXISTS fashion_relationships_house_idx
  ON fashion_relationships (house_id, start_value, id);

CREATE TABLE IF NOT EXISTS wikipedia_jobs (
  id                    BIGSERIAL PRIMARY KEY,
  job_key               TEXT NOT NULL UNIQUE,
  kind                  TEXT NOT NULL CHECK (kind IN ('discover','resolve','refresh','withdrawal_check')),
  entity_id             TEXT REFERENCES fashion_entities(id) ON DELETE CASCADE,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','retry','completed','dead','cancelled')),
  attempts              INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts          INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  run_after             TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner           TEXT,
  lease_until           TIMESTAMPTZ,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wikipedia_jobs_claim_idx
  ON wikipedia_jobs (run_after, id) WHERE status IN ('queued','retry');
CREATE INDEX IF NOT EXISTS wikipedia_jobs_entity_idx
  ON wikipedia_jobs (entity_id, created_at DESC) WHERE entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wikipedia_audit (
  id                    BIGSERIAL PRIMARY KEY,
  entity_id             TEXT REFERENCES fashion_entities(id) ON DELETE SET NULL,
  action                TEXT NOT NULL,
  previous_revision_id  BIGINT,
  next_revision_id      BIGINT,
  details               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wikipedia_audit_entity_idx
  ON wikipedia_audit (entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wikipedia_reviews (
  id                    BIGSERIAL PRIMARY KEY,
  entity_id             TEXT REFERENCES fashion_entities(id) ON DELETE CASCADE,
  reason                TEXT NOT NULL,
  candidate             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  resolution            JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS wikipedia_reviews_open_idx
  ON wikipedia_reviews (created_at, id) WHERE status='open';
CREATE INDEX IF NOT EXISTS wikipedia_reviews_entity_idx
  ON wikipedia_reviews (entity_id, created_at DESC) WHERE entity_id IS NOT NULL;

DO $$ DECLARE t TEXT; role_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fashion_entities','fashion_entity_aliases','fashion_discovery_sources',
    'fashion_discovery_evidence','wikipedia_overviews','fashion_relationships',
    'wikipedia_jobs','wikipedia_audit','wikipedia_reviews'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', t);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', t, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$ DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asilum_app') THEN
    FOREACH t IN ARRAY ARRAY[
      'fashion_entities','fashion_entity_aliases','fashion_discovery_sources',
      'fashion_discovery_evidence','wikipedia_overviews','fashion_relationships',
      'wikipedia_jobs','wikipedia_audit','wikipedia_reviews'
    ] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO asilum_app', t);
      EXECUTE format('DROP POLICY IF EXISTS asilum_app_server_access ON public.%I', t);
      EXECUTE format('CREATE POLICY asilum_app_server_access ON public.%I FOR ALL TO asilum_app USING (true) WITH CHECK (true)', t);
    END LOOP;
    GRANT USAGE, SELECT ON SEQUENCE fashion_entity_aliases_id_seq,
      fashion_discovery_evidence_id_seq, wikipedia_jobs_id_seq,
      wikipedia_audit_id_seq, wikipedia_reviews_id_seq TO asilum_app;
  END IF;
END $$;

INSERT INTO fashion_discovery_sources
  (source_key,label,source_type,discovery_url,region,season_or_date,enabled,access_mode,notes)
VALUES
  ('asilum-career-registry','ASILUM sourced career registry','internal_registry','internal://lib/people/careers.data.json','global','continuing',true,'reviewed','Existing sourced identities and relationships; not overview prose.'),
  ('wikidata-fashion-designers','Wikidata fashion-designer candidates','wikidata','https://query.wikidata.org/','global','continuing',true,'api','Bounded candidate discovery using Q3501317 plus sitelinks; not universal proof.'),
  ('wikidata-fashion-houses','Wikidata fashion-house candidates','wikidata','https://query.wikidata.org/','global','continuing',true,'api','Bounded candidate discovery using Q1941779 plus sitelinks; companies still require kind review.'),
  ('wikidata-language-only-designers','Wikidata designers with French Wikipedia coverage and no English article','wikidata','https://query.wikidata.org/','global','continuing',true,'api','Bounded language-coverage discovery; prose is never automatically translated.'),
  ('enwiki-fashion-designers','English Wikipedia fashion designer categories','wikipedia_category','https://en.wikipedia.org/wiki/Category:Fashion_designers','global','continuing',true,'api','Category traversal is bounded and incomplete by design.'),
  ('enwiki-fashion-houses','English Wikipedia fashion house categories','wikipedia_category','https://en.wikipedia.org/wiki/Category:Fashion_houses','global','continuing',true,'api','Category traversal is bounded and incomplete by design.'),
  ('operator-wikipedia-mapping','Reviewed operator Wikipedia mappings','internal_registry','operator://wikipedia-mapping','global','continuing',false,'manual','Explicit QID, language and article-title corrections; every accepted mapping is audited.'),
  ('fashion-week-official','Official fashion-week calendars and archives','fashion_week','operator://official-fashion-week-registry','global','seasonal',false,'manual','Enable per reviewed calendar/region/season; evidence discovery only.'),
  ('boutique-directories','Reviewed multi-brand boutique directories','boutique_directory','operator://boutique-source-registry','global','historical-and-current',false,'manual','Stockist evidence only; no biographies or portraits copied.')
ON CONFLICT (source_key) DO UPDATE SET
  label=EXCLUDED.label,source_type=EXCLUDED.source_type,discovery_url=EXCLUDED.discovery_url,
  region=EXCLUDED.region,season_or_date=EXCLUDED.season_or_date,
  access_mode=EXCLUDED.access_mode,notes=EXCLUDED.notes,updated_at=now();

INSERT INTO app_schema_migrations (version,name)
VALUES (54,'wikipedia-overviews')
ON CONFLICT (version) DO NOTHING;
