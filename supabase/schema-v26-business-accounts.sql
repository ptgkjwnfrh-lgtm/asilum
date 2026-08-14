-- supabase/schema-v26-business-accounts.sql
-- THE WIRE's booths (owner law, Aug 13 2026): a PASSPORT account becomes
-- a BUSINESS account by verifying itself — brand name + Shopify
-- storefront + personal website — through a HUMAN-reviewed brand_cases
-- verification case (Feature G machinery: enforced status machine,
-- evidence-required verification, append-only case events; there is no
-- machine path to business). Only business accounts get a chance at a
-- hotlist booth. Shopify OAuth deepens the connection once the commerce
-- pipeline has keys; until then the storefront domain is reviewed
-- evidence, not a token exchange.
--
-- One row per account (the current application/state); the full history
-- lives in the linked case + its events. Rollback: DROP TABLE
-- business_accounts; (the linked brand_cases rows are audit and stay).

CREATE TABLE IF NOT EXISTS business_accounts (
  account_id UUID PRIMARY KEY,
  brand_name TEXT NOT NULL CHECK (char_length(brand_name) BETWEEN 2 AND 80),
  website_url TEXT NOT NULL CHECK (char_length(website_url) <= 300),
  shopify_domain TEXT NOT NULL
    CHECK (shopify_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  statement TEXT CHECK (char_length(statement) <= 500),
  status TEXT NOT NULL DEFAULT 'under_review'
    CHECK (status IN ('under_review','business','rejected')),
  case_id TEXT REFERENCES brand_cases(id),
  review_note TEXT CHECK (char_length(review_note) <= 500),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Booth order is verification order: first verified, first booth.
CREATE INDEX IF NOT EXISTS business_accounts_booths
  ON business_accounts (status, decided_at ASC);

ALTER TABLE business_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE business_accounts FROM PUBLIC;

-- anon/authenticated exist on Supabase, not on plain CI Postgres — guard.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE business_accounts FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asilum_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_accounts TO asilum_app;
  END IF;
END $$;
