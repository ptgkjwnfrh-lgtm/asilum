-- supabase/schema-v4-asterisk.sql
-- Asterisk AI foundation (Day 10): canonical ontology, dual tagging audit,
-- staged learned-fact provenance, moderation queue.
-- Additive only — never drops or rewrites existing tables.
-- Apply: node --experimental-default-type=module scripts/apply-schema.mjs supabase/schema-v4-asterisk.sql

-- ---- Canonical fashion ontology -------------------------------------------
-- One defined meaning per tag. Aliases collapse duplicates ("dark-romantic",
-- "dark romance", ...) into a single canonical id. Code seed lives in
-- lib/asterisk/ontology.js and is synced here via admin action.
CREATE TABLE IF NOT EXISTS ontology_tags (
  id          TEXT PRIMARY KEY,           -- canonical id: "<type>.<slug>" e.g. "aesthetic.avant-garde"
  label       TEXT NOT NULL,              -- display label
  tag_type    TEXT NOT NULL,              -- aesthetic|category|material|silhouette|color|era|mood|construction|culture
  parent_id   TEXT,                       -- optional parent canonical id
  aliases     JSONB NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',  -- active|deprecated|merged
  merged_into TEXT,
  version     INT  NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ontology_tags_type ON ontology_tags (tag_type);

CREATE TABLE IF NOT EXISTS ontology_relationships (
  id       BIGSERIAL PRIMARY KEY,
  from_tag TEXT NOT NULL,
  to_tag   TEXT NOT NULL,
  relation TEXT NOT NULL,                 -- related|implies|opposite|part-of
  weight   NUMERIC NOT NULL DEFAULT 0.5,
  UNIQUE (from_tag, to_tag, relation)
);

-- ---- Dual tagging: Asterisk AI layer (Base layer = existing product_tags) --
-- Field-level interpretation with confidence + certainty status. Stored
-- SEPARATELY from base tags; never overwrites them.
CREATE TABLE IF NOT EXISTS product_ai_tags (
  id             BIGSERIAL PRIMARY KEY,
  product_id     TEXT NOT NULL,
  audit_id       TEXT NOT NULL,           -- groups one audit pass
  field          TEXT NOT NULL,           -- category|subcategory|color|material|silhouette|aesthetic|mood|era|...
  value          TEXT NOT NULL,
  canonical_tag  TEXT,                    -- ontology id when resolvable, else NULL
  confidence     NUMERIC NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'ai_generated',
    -- confirmed|verified|strongly_supported|probable|estimated|visually_inferred|
    -- user_supplied|seller_supplied|ai_generated|disputed|unverified|unknown
  evidence       TEXT NOT NULL DEFAULT '',
  model_provider TEXT, model_name TEXT, prompt_version TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_ai_tags_product ON product_ai_tags (product_id);
CREATE INDEX IF NOT EXISTS product_ai_tags_audit   ON product_ai_tags (audit_id);

-- One reconciliation record per audit pass: agreement, conflicts, gaps.
-- Conflicts NEVER auto-overwrite base tags; review_required routes to
-- moderation_tasks.
CREATE TABLE IF NOT EXISTS tag_reconciliations (
  id                  TEXT PRIMARY KEY,   -- = audit_id
  product_id          TEXT NOT NULL,
  agreement_score     NUMERIC NOT NULL DEFAULT 0,
  conflicts           JSONB NOT NULL DEFAULT '[]',
  missing_base_fields JSONB NOT NULL DEFAULT '[]',
  review_required     BOOLEAN NOT NULL DEFAULT false,
  analysis_source     TEXT NOT NULL DEFAULT 'local-rules',  -- local-rules|model
  resolution          TEXT,               -- moderation outcome (kept forever)
  resolved_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tag_reconciliations_product ON tag_reconciliations (product_id);
CREATE INDEX IF NOT EXISTS tag_reconciliations_review  ON tag_reconciliations (review_required) WHERE review_required;

-- ---- Learned facts: staged, sourced, reversible ---------------------------
-- Research/ingestion output lands here — NEVER directly in trusted records.
CREATE TABLE IF NOT EXISTS learned_facts (
  id                  TEXT PRIMARY KEY,
  entity_type         TEXT NOT NULL,      -- product|brand|designer|collection|celebrity|city|trend|...
  entity_id           TEXT NOT NULL,
  claim               TEXT NOT NULL,
  claim_type          TEXT NOT NULL,      -- collection_attribution|material|season|designer_credit|...
  value               TEXT,
  source_urls         JSONB NOT NULL DEFAULT '[]',
  source_types        JSONB NOT NULL DEFAULT '[]',
  publication_dates   JSONB NOT NULL DEFAULT '[]',
  retrieved_at        TIMESTAMPTZ,
  reliability_score   NUMERIC NOT NULL DEFAULT 0,
  confidence_score    NUMERIC NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'discovered',
    -- discovered|pending_verification|machine_reviewed|human_reviewed|approved|rejected|superseded|archived
  reviewed_by         TEXT,
  model_version       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learned_facts_entity ON learned_facts (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS learned_facts_status ON learned_facts (verification_status);

-- ---- Moderation queue ------------------------------------------------------
CREATE TABLE IF NOT EXISTS moderation_tasks (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,             -- tag-conflict|fact-verification|user-report|...
  subject_type TEXT NOT NULL,             -- product|fact|reconciliation|...
  subject_id   TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  priority     TEXT NOT NULL DEFAULT 'normal',   -- low|normal|high
  status       TEXT NOT NULL DEFAULT 'open',     -- open|in_review|resolved|dismissed
  resolution   TEXT,
  resolved_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_tasks_status ON moderation_tasks (status);

-- Server-only posture, same as every other table.
ALTER TABLE ontology_tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ai_tags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_reconciliations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_facts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_tasks       ENABLE ROW LEVEL SECURITY;
