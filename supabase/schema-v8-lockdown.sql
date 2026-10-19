-- ASILUM schema v8 — deny-by-default database and RPC access.
-- Idempotent. Apply after schema-v7-integrity.sql.

-- These tables are reached only by the server-side DATABASE_URL connection.
-- RLS already denies Data API rows; explicit revokes also remove table access.
REVOKE ALL PRIVILEGES ON TABLE
  api_rate_limits,
  processed_operations,
  identity_adoptions,
  app_schema_migrations
FROM PUBLIC;

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE api_rate_limits, processed_operations, identity_adoptions, app_schema_migrations FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;

-- Supabase installs this event-trigger helper as SECURITY DEFINER. The event
-- trigger can continue invoking it without exposing a callable public RPC.
DO $$
DECLARE role_name TEXT;
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format(
          'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM %I',
          role_name
        );
      END IF;
    END LOOP;
  END IF;
END $$;

-- New public-schema objects are private unless a later migration deliberately
-- grants a client role access. Preserve service_role access for server APIs.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;

INSERT INTO app_schema_migrations (version,name)
VALUES (8,'lockdown')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;
