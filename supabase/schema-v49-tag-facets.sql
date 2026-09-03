-- schema-v49-tag-facets.sql
--
-- A FACET NOBODY DEFINED CANNOT BE WRITTEN.
--
-- `product_tags.tag_type` has carried its vocabulary as a COMMENT since v2:
--
--   -- aesthetic|silhouette|fit|fabric|color|era|decade|city|movie|influencer|
--   -- designer_reference|runway_reference|mood|condition|search_reference|
--   -- personalization|brand|category|subculture
--
-- Nineteen names, enforced by nothing. What was actually written was two
-- different sets from two different code paths — eighteen facets from the
-- backfill script and ten from the ingest adapter, agreeing on five, and only
-- SEVEN of the nineteen in the comment appearing in either. The comment
-- described a system nobody had built while the table accepted anything.
--
-- The register is now lib/tagging/vocabulary.js, where each facet carries a
-- definition, a weight and its aliases, and both writers resolve through it.
-- This is the database saying the same thing: the column takes a name from
-- that list or it takes nothing.
--
-- WHY A CHECK AND NOT A FOREIGN KEY. A lookup table would put the vocabulary
-- in two places again — the code needs the definitions and the weights at
-- request time, so the code is the source and this is the fence. The list is
-- short, it changes rarely, and a migration is the right amount of friction
-- for adding an axis to how every piece in the catalog is described.
--
-- Existing rows are checked as they stand: if anything in production carries a
-- facet outside the list, this migration FAILS rather than silently accepting
-- it, and that failure is the answer to "did the comment match reality".

ALTER TABLE product_tags DROP CONSTRAINT IF EXISTS product_tags_facet_ck;

ALTER TABLE product_tags ADD CONSTRAINT product_tags_facet_ck CHECK (
  tag_type IN (
    -- what the piece IS
    'garment', 'category', 'material', 'color', 'silhouette', 'fit', 'condition',
    -- where it comes from
    'brand', 'designer', 'collection', 'origin',
    -- when it is from
    'decade', 'year', 'season', 'climate',
    -- what it means
    'aesthetic', 'aesthetic-adjacent', 'aesthetic-brand', 'mood', 'subculture',
    -- practical facts
    'gender', 'size', 'size-system', 'price-band'
  )
);

INSERT INTO app_schema_migrations (version, name)
VALUES (49, 'tag-facets')
ON CONFLICT (version) DO NOTHING;
