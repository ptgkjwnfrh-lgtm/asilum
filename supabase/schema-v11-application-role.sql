-- ASILUM schema v11 — least-privilege runtime database role.
-- Apply as the project owner after schema-v10-policy-performance.sql.
-- This creates the role without LOGIN; activate it with the local
-- scripts/configure-database-role.mjs helper so no password enters git.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
    CREATE ROLE asilum_app WITH
      NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
      CONNECTION LIMIT 20;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='asilum_app' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'existing asilum_app role has unsafe attributes';
  END IF;
END $$;

-- Re-applying the migration must also repair any drift in attributes the
-- project owner is allowed to control. LOGIN is left unchanged because the
-- one-time configuration helper intentionally enables it after migration.
ALTER ROLE asilum_app WITH
  NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
  CONNECTION LIMIT 20;

-- The server owns authorization and needs cross-user reads. Hosted Supabase
-- does not grant project owners the superuser power required for BYPASSRLS, so
-- explicit policies below authorize only this custom database role.
GRANT USAGE ON SCHEMA public TO asilum_app;
REVOKE CREATE ON SCHEMA public FROM asilum_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  ai_model_events,
  api_rate_limits,
  board_items,
  boards,
  edges,
  editorial_posts,
  identity_adoptions,
  interactions,
  items,
  learned_facts,
  moderation_tasks,
  mood_board_analysis,
  mood_board_uploads,
  ontology_relationships,
  ontology_tags,
  popularity,
  processed_operations,
  product_ai_tags,
  product_availability_checks,
  product_images,
  product_tags,
  profiles,
  purchase_tickets,
  search_logs,
  search_mappings,
  source_connections,
  source_sync_logs,
  stylist_feedback,
  stylist_outfits,
  stylist_requests,
  tag_reconciliations,
  user_corrections,
  user_events,
  user_style_profiles
TO asilum_app;

-- Legacy auth-linked profile deletion is used only by the privacy endpoint.
GRANT SELECT, DELETE ON TABLE user_profiles TO asilum_app;

-- SERIAL/BIGSERIAL inserts need sequence access. Revoke any broad grant left
-- by an earlier preview, then grant only sequences owned by writable tables.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM asilum_app;
DO $$
DECLARE
  table_name TEXT;
  sequence_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_model_events', 'editorial_posts', 'interactions',
    'mood_board_analysis', 'mood_board_uploads', 'ontology_relationships',
    'product_ai_tags', 'product_availability_checks', 'product_images',
    'product_tags', 'purchase_tickets', 'search_logs', 'search_mappings',
    'source_connections', 'source_sync_logs', 'stylist_feedback',
    'stylist_outfits', 'stylist_requests', 'user_corrections', 'user_events'
  ] LOOP
    sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
    IF sequence_name IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO asilum_app', sequence_name);
    END IF;
  END LOOP;
END $$;

-- Every application table has RLS enabled. Policies are restricted to the
-- custom runtime role; anon and authenticated remain denied by default.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_model_events', 'api_rate_limits', 'app_schema_migrations',
    'board_items', 'boards', 'edges', 'editorial_posts',
    'identity_adoptions', 'interactions', 'items', 'learned_facts',
    'moderation_tasks', 'mood_board_analysis', 'mood_board_uploads',
    'ontology_relationships', 'ontology_tags', 'popularity',
    'processed_operations', 'product_ai_tags', 'product_availability_checks',
    'product_images', 'product_tags', 'profiles', 'purchase_tickets',
    'search_logs', 'search_mappings', 'source_connections',
    'source_sync_logs', 'stylist_feedback', 'stylist_outfits',
    'stylist_requests', 'tag_reconciliations', 'user_corrections',
    'user_events', 'user_profiles', 'user_style_profiles'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=table_name
        AND policyname='asilum_app_server_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY asilum_app_server_access ON public.%I FOR ALL TO asilum_app USING (true) WITH CHECK (true)',
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- Runtime code verifies migration state but must never rewrite it.
REVOKE ALL PRIVILEGES ON TABLE app_schema_migrations FROM asilum_app;
GRANT SELECT ON TABLE app_schema_migrations TO asilum_app;

INSERT INTO app_schema_migrations (version,name)
VALUES (11,'application-role')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;
