-- ASILUM schema v12 — verified product colors + private fit measurements.

ALTER TABLE items ADD COLUMN IF NOT EXISTS color_evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS user_measurements (
  user_id        TEXT PRIMARY KEY,
  usual_size     TEXT,
  preferred_unit TEXT NOT NULL DEFAULT 'in',
  chest_in       NUMERIC,
  waist_in       NUMERIC,
  hips_in        NUMERIC,
  inseam_in      NUMERIC,
  height_in      NUMERIC,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_measurements_size CHECK (
    usual_size IS NULL OR usual_size IN ('XXS','XS','S','M','L','XL','XXL','XXXL')
  ),
  CONSTRAINT user_measurements_unit CHECK (preferred_unit IN ('in','cm')),
  CONSTRAINT user_measurements_chest CHECK (chest_in IS NULL OR chest_in BETWEEN 20 AND 100),
  CONSTRAINT user_measurements_waist CHECK (waist_in IS NULL OR waist_in BETWEEN 18 AND 100),
  CONSTRAINT user_measurements_hips CHECK (hips_in IS NULL OR hips_in BETWEEN 20 AND 100),
  CONSTRAINT user_measurements_inseam CHECK (inseam_in IS NULL OR inseam_in BETWEEN 15 AND 60),
  CONSTRAINT user_measurements_height CHECK (height_in IS NULL OR height_in BETWEEN 36 AND 96)
);

ALTER TABLE user_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE user_measurements FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE user_measurements FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_measurements TO asilum_app;

DROP POLICY IF EXISTS asilum_app_server_access ON user_measurements;
CREATE POLICY asilum_app_server_access ON user_measurements
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);

INSERT INTO app_schema_migrations (version,name)
VALUES (12,'verified-colors-and-user-measurements')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;
