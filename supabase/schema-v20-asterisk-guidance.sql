-- ASILUM schema v20 — one cross-device Asterisk guidance switch.
-- Idempotent forward fix after schema-v19-integrity-hardening.sql.
--
-- The Passport/taste record is retained when guidance is paused. This flag
-- controls whether recommendation surfaces may USE that record for ordering;
-- it is not consent to delete, retrain, or expose the underlying profile.

ALTER TABLE asterisk_memory_preferences
  ADD COLUMN IF NOT EXISTS guidance_enabled BOOLEAN NOT NULL DEFAULT true;

INSERT INTO app_schema_migrations (version,name)
VALUES (20,'asterisk-guidance')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification:
--   SELECT max(version) FROM app_schema_migrations; -- = 20
--   SELECT guidance_enabled, count(*)
--     FROM asterisk_memory_preferences GROUP BY guidance_enabled;
