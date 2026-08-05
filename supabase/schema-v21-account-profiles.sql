-- ASILUM schema v21 — account-profiles (RECONSTRUCTED STUB, Aug 5 2026).
--
-- Live production carries row (21, 'account-profiles', applied 2026-07-20
-- 01:02 UTC) in app_schema_migrations, but the file that produced it was
-- applied out-of-band and never committed. This stub closes that drift with
-- the FORENSIC RESULT rather than guessed DDL.
--
-- WHAT THE AUDIT FOUND (owner-approved reconstruction, Aug 5 2026; full
-- method in PR #126): every structural object in the live database is
-- attributable to a committed file or to known code-side DDL —
--   * tables/columns — all 57 public tables match schema.sql, schema-v2.sql,
--     or schema-v1..v20/v22/v23; user_profiles (the natural "account
--     profiles" table) matches schema.sql exactly, device_uid included,
--     and has never held a row (count 0, no created_at history);
--   * indexes — all match committed DDL except three auto-named inline
--     UNIQUE constraints (designers_slug_key, profile_rooms_handle_key,
--     user_profiles_handle_key) and user_events_user_idem, which the db
--     layer creates lazily (lib/db);
--   * policies — the v11 asilum_app set plus schema.sql's MVP policies,
--     nothing else; no triggers in public/auth beyond stock Supabase and
--     v8's rls_auto_enable; storage has only the v15 wardrobe bucket.
--
-- Conclusion: v21 left no unique structural footprint. It was most likely
-- an idempotent re-application (objects already present) or a change later
-- superseded by committed files. A database rebuilt from this repo's files
-- is structurally complete relative to production — verified by the diff
-- above. If the original out-of-band file ever resurfaces, it replaces
-- this stub at the same version number.
--
-- The only real content: record the version row, so a rebuilt database
-- carries the same migration history production has.

INSERT INTO app_schema_migrations (version,name)
VALUES (21,'account-profiles')
ON CONFLICT (version) DO NOTHING;

-- Verify (matches production):
--   SELECT version,name FROM app_schema_migrations WHERE version=21;
