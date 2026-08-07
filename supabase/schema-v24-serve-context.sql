-- ASILUM schema v24 — per-search exposure record (Aug 6, 2026).
-- Idempotent and additive. Apply after schema-v23-popularity-contributors.sql.
--
-- WHY. Audit #27: engagement was logged, exposure was not, so no rate could be
-- computed on either surface.
--
--   FEED — fixed in code, no schema needed. Interaction events now carry the
--     slot and zone the item was served at, stamped SERVER-side from
--     profile._meta.lastServe (lib/brain/index.js recordServe /
--     serveContextFor). Position is the largest confound in any engagement
--     number and was recorded nowhere, so no round could de-bias its own data
--     after the fact. It is stamped from the server's memory rather than
--     accepted from the client because the client is the party with an
--     interest in the answer.
--
--   SEARCH — needs this column. search_logs recorded the query, the
--     interpretation and a result COUNT, but never WHICH items were shown, and
--     no per-result impression record existed anywhere in the repo. Clicks on
--     search results were therefore uncountable against exposure: a numerator
--     with no denominator.
--
-- served_ids holds the ids of the page ACTUALLY SERVED, in served order,
-- bounded at 100 by the writer (lib/search/index.js SERVED_IDS_CAP). Not the
-- full ranked candidate list — logging ~900 ranked items as though they had
-- been seen would understate every rate by the size of the tail. Ids only: no
-- scores, no tags, nothing that duplicates the catalog or grows without bound.
--
-- NO REQUIRED_SCHEMA_VERSION BUMP, deliberately. lib/db/production.js detects
-- this column once per process and falls back to the pre-v24 insert when it is
-- absent, so application code is safe to deploy BEFORE this migration is
-- applied, and starts recording the moment it is — with no deploy. Bumping the
-- required version would invert that and make an additive column a deploy-order
-- landmine. Bump it in a later round, once this has been applied everywhere.
--
-- Rollback: ALTER TABLE search_logs DROP COLUMN served_ids. The writer's column
-- detection is per-process, so a rolled-back column resumes the old insert path
-- on the next boot with no code change; existing rows are unaffected either way.
-- Nothing reads served_ids for ranking — it is a measurement record only.

ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS served_ids JSONB;

COMMENT ON COLUMN search_logs.served_ids IS
  'v24: ids of the page actually served, in order, capped at 100 by the writer. Measurement only — never read for ranking. NULL for rows written before v24 or by a pre-v24 process.';

INSERT INTO app_schema_migrations (version,name)
VALUES (24,'serve-context')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;                      -- >= 24
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='search_logs' AND column_name='served_ids';       -- jsonb
--   SELECT count(*) FROM search_logs WHERE served_ids IS NOT NULL;       -- 0 at first,
--                                                                        -- climbing after the next search
