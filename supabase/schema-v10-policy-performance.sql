-- ASILUM schema v10 — evaluate the authenticated user once per statement in
-- the two client-facing RLS policies, rather than once for every candidate row.

ALTER POLICY "own profile" ON user_profiles
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

ALTER POLICY "own saves" ON saved_items
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

INSERT INTO app_schema_migrations (version,name)
VALUES (10,'policy-performance')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;
