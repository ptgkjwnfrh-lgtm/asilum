-- schema-v51-catalog-connections.sql
--
-- One lawful catalog contract, many independently authorized connections.
-- `source_connections` remains the historical global status board; it is NOT
-- overloaded with merchant credentials. Per-account installations, OAuth
-- state, variants, leased jobs, webhook dedupe, quarantine, and completed-run
-- reconciliation live here.
--
-- ROLLBACK (withdraw connection inventory before running):
--   DROP TABLE IF EXISTS catalog_sync_seen, shopify_webhook_deliveries,
--     catalog_jobs, catalog_quarantine, catalog_variants,
--     shopify_oauth_states, merchant_connections, catalog_source_registry;
--   DROP INDEX IF EXISTS items_connection_listing_variant;
--   ALTER TABLE items DROP COLUMN IF EXISTS connection_id;
--   ALTER TABLE items DROP COLUMN IF EXISTS source_variant_id;
--   ALTER TABLE items DROP COLUMN IF EXISTS schema_version;
--   ALTER TABLE items DROP COLUMN IF EXISTS title_original;
--   ALTER TABLE items DROP COLUMN IF EXISTS clickout_url;
--   ALTER TABLE items DROP COLUMN IF EXISTS money_amount_minor;
--   ALTER TABLE items DROP COLUMN IF EXISTS resale_status;
--   ALTER TABLE items DROP COLUMN IF EXISTS availability_checked_at;
--   ALTER TABLE items DROP COLUMN IF EXISTS fetched_at;
--   ALTER TABLE items DROP COLUMN IF EXISTS source_updated_at;
--   ALTER TABLE items DROP COLUMN IF EXISTS expires_at;
--   ALTER TABLE items DROP COLUMN IF EXISTS delivery_eligibility;
--   ALTER TABLE items DROP COLUMN IF EXISTS checkout_mode;
--   ALTER TABLE items DROP COLUMN IF EXISTS source_policy_id;
--   ALTER TABLE items DROP COLUMN IF EXISTS source_policy_version;
--   ALTER TABLE items DROP COLUMN IF EXISTS source_environment;
--   ALTER TABLE items DROP COLUMN IF EXISTS source_attributes;
--   DELETE FROM app_schema_migrations WHERE version=51;

ALTER TABLE items ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS connection_id TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_variant_id TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS title_original TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS clickout_url TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS money_amount_minor NUMERIC(38,0);
ALTER TABLE items ADD COLUMN IF NOT EXISTS resale_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE items ADD COLUMN IF NOT EXISTS availability_checked_at TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS delivery_eligibility TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE items ADD COLUMN IF NOT EXISTS checkout_mode TEXT NOT NULL DEFAULT 'external';
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_policy_id TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_policy_version INTEGER;
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_environment TEXT NOT NULL DEFAULT 'production';
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_v51_resale_status') THEN
    ALTER TABLE items ADD CONSTRAINT items_v51_resale_status CHECK (resale_status IN ('resale','retail','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_v51_delivery_eligibility') THEN
    ALTER TABLE items ADD CONSTRAINT items_v51_delivery_eligibility CHECK (delivery_eligibility IN ('direct','proxy_required','unavailable','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_v51_checkout_mode') THEN
    ALTER TABLE items ADD CONSTRAINT items_v51_checkout_mode CHECK (checkout_mode IN ('external','approved_provider','proxy_quote','none'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_v51_environment') THEN
    ALTER TABLE items ADD CONSTRAINT items_v51_environment CHECK (source_environment IN ('production','sandbox','fixture'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='items_v51_minor_nonnegative') THEN
    ALTER TABLE items ADD CONSTRAINT items_v51_minor_nonnegative CHECK (money_amount_minor IS NULL OR money_amount_minor >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS items_connection_listing_variant
  ON items (connection_id, source_product_id, COALESCE(source_variant_id, ''))
  WHERE connection_id IS NOT NULL AND source_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_connection_active
  ON items (connection_id, is_available, availability_status)
  WHERE connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_expiry
  ON items (expires_at) WHERE expires_at IS NOT NULL AND is_available;

CREATE TABLE IF NOT EXISTS catalog_source_registry (
  source_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  provider TEXT NOT NULL,
  territory TEXT NOT NULL,
  requested_use TEXT NOT NULL,
  evidence_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  application_destination TEXT,
  credentials_needed JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_stage TEXT NOT NULL CHECK (access_stage IN (
    'researching','application_prepared','submitted','provider_approved',
    'credentials_configured','sandbox_verified','production_canary_verified','live'
  )),
  allowed_operations JSONB NOT NULL DEFAULT '[]'::jsonb,
  quota JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_action TEXT NOT NULL,
  last_checked DATE NOT NULL,
  kill_switch BOOLEAN NOT NULL DEFAULT TRUE,
  supported_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  supported_countries JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_successful_fetch TIMESTAMPTZ,
  published_live_offer_count INTEGER NOT NULL DEFAULT 0,
  known_sold_count INTEGER NOT NULL DEFAULT 0,
  unknown_stale_count INTEGER NOT NULL DEFAULT 0,
  quarantined_count INTEGER NOT NULL DEFAULT 0,
  p95_refresh_lag_ms BIGINT,
  error_rate REAL,
  rate_limit_rate REAL,
  checked_clickout_sample TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  canonical_domain TEXT NOT NULL,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  publication_selection JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_policy_id TEXT NOT NULL,
  source_policy_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'awaiting_authorization','awaiting_provider_approval','syncing','partially_synced',
    'connected','permission_changed','rate_limited','paused','revoked','unavailable'
  )),
  token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  token_key_version TEXT,
  refresh_lease_until TIMESTAMPTZ,
  sync_cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (provider, provider_account_id),
  UNIQUE (account_id, provider, canonical_domain)
);
CREATE INDEX IF NOT EXISTS merchant_connections_account
  ON merchant_connections (account_id, provider, updated_at DESC);
CREATE INDEX IF NOT EXISTS merchant_connections_domain
  ON merchant_connections (provider, canonical_domain) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS shopify_oauth_states (
  state_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  return_path TEXT NOT NULL DEFAULT '/board?tab=studio',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shopify_oauth_states_expiry
  ON shopify_oauth_states (expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS catalog_variants (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES merchant_connections(id) ON DELETE CASCADE,
  source_variant_id TEXT NOT NULL,
  title TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  amount_minor NUMERIC(38,0),
  currency TEXT,
  availability TEXT NOT NULL DEFAULT 'unknown'
    CHECK (availability IN ('available','sold','reserved','removed','unknown')),
  inventory_policy TEXT,
  source_updated_at TIMESTAMPTZ,
  availability_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, source_variant_id)
);
CREATE INDEX IF NOT EXISTS catalog_variants_item ON catalog_variants (item_id, availability);
CREATE INDEX IF NOT EXISTS catalog_variants_connection ON catalog_variants (connection_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS catalog_quarantine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES merchant_connections(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  source_listing_id TEXT,
  reason_codes JSONB NOT NULL,
  payload_digest TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS catalog_quarantine_reason
  ON catalog_quarantine (source_key, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_quarantine_expiry ON catalog_quarantine (expires_at);

CREATE TABLE IF NOT EXISTS catalog_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES merchant_connections(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','retry','completed','failed','canceled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS catalog_jobs_claim
  ON catalog_jobs (available_at, created_at)
  WHERE status IN ('pending','retry');
CREATE INDEX IF NOT EXISTS catalog_jobs_connection
  ON catalog_jobs (connection_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS catalog_sync_seen (
  sync_run_id UUID NOT NULL,
  connection_id UUID NOT NULL REFERENCES merchant_connections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sync_run_id, item_id)
);
CREATE INDEX IF NOT EXISTS catalog_sync_seen_connection
  ON catalog_sync_seen (connection_id, sync_run_id);

CREATE TABLE IF NOT EXISTS shopify_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  connection_id UUID REFERENCES merchant_connections(id) ON DELETE SET NULL,
  shop_domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  source_object_id TEXT,
  source_updated_at TIMESTAMPTZ,
  safe_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS shopify_webhooks_pending
  ON shopify_webhook_deliveries (received_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS shopify_webhooks_expiry ON shopify_webhook_deliveries (expires_at);

-- Every table is server-owned and absent from the Data API. The runtime role
-- still needs both a GRANT and an RLS policy; either one alone is not access.
DO $$
DECLARE t TEXT; role_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_source_registry','merchant_connections','shopify_oauth_states',
    'catalog_variants','catalog_quarantine','catalog_jobs','catalog_sync_seen',
    'shopify_webhook_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', t);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', t, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asilum_app') THEN
    FOREACH t IN ARRAY ARRAY[
      'catalog_source_registry','merchant_connections','shopify_oauth_states',
      'catalog_variants','catalog_quarantine','catalog_jobs','catalog_sync_seen',
      'shopify_webhook_deliveries'
    ] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO asilum_app', t);
      EXECUTE format('DROP POLICY IF EXISTS asilum_app_server_access ON public.%I', t);
      EXECUTE format('CREATE POLICY asilum_app_server_access ON public.%I FOR ALL TO asilum_app USING (true) WITH CHECK (true)', t);
    END LOOP;
  END IF;
END $$;

-- Honest starting states. A registry row is qualification work, never proof of
-- access. Evidence links are intentionally sparse here; the reviewed register
-- in docs/RIGHTS-REGISTER.md carries the narrative and is updated beside code.
INSERT INTO catalog_source_registry
  (source_key,owner,provider,territory,requested_use,access_stage,allowed_operations,next_action,last_checked,kill_switch)
VALUES
  ('ebay','ASILUM','eBay','global','resale discovery','researching','[]','audit production approval, marketplaces, display and model-use terms','2026-09-19',true),
  ('therealreal','ASILUM','The RealReal','global','licensed resale feed','researching','[]','request direct catalog or entitled affiliate feed','2026-09-19',true),
  ('vestiaire','ASILUM','Vestiaire Collective','global','licensed resale feed','researching','[]','verify territory and feed/image rights','2026-09-19',true),
  ('vinted','ASILUM','Vinted','eligible Pro territories','merchant inventory plus discovery','researching','[]','apply for Pro integrations and separate discovery rights','2026-09-19',true),
  ('poshmark','ASILUM','Poshmark','US and supported markets','licensed resale feed','researching','[]','request direct inventory partnership','2026-09-19',true),
  ('mercari-us','ASILUM','Mercari US','US','licensed resale feed','researching','[]','request partner access or authorized seller export','2026-09-19',true),
  ('mercari-jp','ASILUM','Mercari Japan','Japan','licensed resale feed','researching','[]','qualify licensed direct or proxy route','2026-09-19',true),
  ('rakuma','ASILUM','Rakuma','Japan','licensed resale feed','researching','[]','qualify licensed direct or proxy route','2026-09-19',true),
  ('yahoo-shopping-jp','ASILUM','Yahoo Shopping Japan','Japan','used item discovery','researching','[]','register app and approve source policy','2026-09-19',true),
  ('yahoo-auctions-jp','ASILUM','Yahoo Japan Auctions','Japan','auction discovery via contracted partner','researching','[]','negotiate current partner or proxy route','2026-09-19',true),
  ('rakuten-ichiba','ASILUM','Rakuten Ichiba','Japan','secondhand merchant discovery','researching','[]','register app and identify authorized used merchants','2026-09-19',true),
  ('shopify-merchant','ASILUM','Shopify Admin API','global','merchant-installed catalog sync','application_prepared','[]','register public app and complete development-store lifecycle','2026-09-19',true),
  ('shopify-catalog-live','ASILUM','Shopify Catalog','global','request-time live discovery','researching','[]','obtain agent-profile access and enforce no-cache path','2026-09-19',true),
  ('woocommerce-merchant','ASILUM','WooCommerce Store API','global','consenting merchant catalog sync','researching','[]','move legacy singleton to per-store approvals','2026-09-19',true),
  ('depop','ASILUM','Depop','global','licensed resale feed','researching','[]','request partnership; no scraping','2026-09-19',true),
  ('grailed','ASILUM','Grailed','global','licensed resale feed','researching','[]','request partnership; no scraping','2026-09-19',true),
  ('sellpy','ASILUM','Sellpy','Europe','licensed resale feed','researching','[]','qualify partner feed','2026-09-19',true),
  ('momox-fashion','ASILUM','momox fashion','Germany/EU','licensed resale feed','researching','[]','qualify partner feed','2026-09-19',true),
  ('buyee','ASILUM','Buyee','Japan','proxy quote and handoff','researching','[]','apply and verify catalog/quote/order capabilities separately','2026-09-19',true),
  ('zenmarket','ASILUM','ZenMarket','Japan','proxy quote and handoff','researching','[]','apply and verify catalog/quote/order capabilities separately','2026-09-19',true),
  ('neokyo','ASILUM','Neokyo','Japan','proxy handoff','researching','[]','request documented partner capabilities','2026-09-19',true),
  ('fromjapan','ASILUM','FROM JAPAN','Japan','proxy handoff','researching','[]','request documented partner capabilities','2026-09-19',true),
  ('xianyu','ASILUM','Xianyu / Goofish','China','licensed resale discovery','researching','[]','obtain usable approved API contract','2026-09-19',true),
  ('taobao-tmall','ASILUM','Taobao / Tmall','China','eligible used merchant discovery','researching','[]','qualify open-platform rights and resale classification','2026-09-19',true),
  ('superbuy','ASILUM','Superbuy','China','proxy handoff','researching','[]','request documented quote/order API and data rights','2026-09-19',true),
  ('cssbuy','ASILUM','CSSBuy','China','proxy handoff','researching','[]','request documented quote/order API and data rights','2026-09-19',true),
  ('bunjang','ASILUM','Bunjang','South Korea','licensed resale discovery','researching','[]','request export and data rights','2026-09-19',true),
  ('joonggonara','ASILUM','Joonggonara','South Korea','licensed resale discovery','researching','[]','qualify direct partner route','2026-09-19',true),
  ('karrot','ASILUM','Karrot','South Korea','licensed resale discovery','researching','[]','qualify direct partner route','2026-09-19',true),
  ('delivered-korea','ASILUM','Delivered Korea','South Korea','proxy handoff','researching','[]','request documented integration','2026-09-19',true),
  ('kleinanzeigen','ASILUM','Kleinanzeigen','Germany','licensed resale discovery','researching','[]','verify whole-market read rights','2026-09-19',true),
  ('shafa','ASILUM','Shafa','Ukraine','licensed resale discovery','researching','[]','confirm feed rights and shipping route','2026-09-19',true),
  ('olx-ua','ASILUM','OLX Ukraine','Ukraine','licensed resale discovery','researching','[]','qualify direct partner route','2026-09-19',true),
  ('avito','ASILUM','Avito','Russia','transaction-eligible resale discovery','researching','[]','review access, sanctions, payment and shipping per transaction','2026-09-19',true),
  ('oskelly','ASILUM','Oskelly','Russia','transaction-eligible resale discovery','researching','[]','review access, sanctions, payment and shipping per transaction','2026-09-19',true),
  ('bland','ASILUM','Bland','Iceland','licensed resale discovery','researching','[]','qualify API/feed and delivery','2026-09-19',true),
  ('extraloppan','ASILUM','Extraloppan','Iceland','merchant inventory','researching','[]','qualify actual ecommerce inventory','2026-09-19',true),
  ('yaga-za','ASILUM','Yaga','South Africa','licensed resale discovery','researching','[]','request bulk redistribution feed','2026-09-19',true),
  ('jiji-ng','ASILUM','Jiji Nigeria','Nigeria','licensed resale discovery','researching','[]','request bulk redistribution feed','2026-09-19',true)
ON CONFLICT (source_key) DO UPDATE SET
  owner=EXCLUDED.owner, provider=EXCLUDED.provider, territory=EXCLUDED.territory,
  requested_use=EXCLUDED.requested_use, next_action=EXCLUDED.next_action,
  last_checked=EXCLUDED.last_checked, updated_at=now();

UPDATE catalog_source_registry SET
  evidence_links='["https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens","https://shopify.dev/docs/apps/build/webhooks/verify-deliveries"]'::jsonb,
  application_destination='Shopify Partner Dashboard / app review',
  credentials_needed='["SHOPIFY_CLIENT_ID","SHOPIFY_CLIENT_SECRET","CATALOG_TOKEN_KEY"]'::jsonb,
  allowed_operations='["display","store_metadata","cache_images","lexical_index","personalized_ranking"]'::jsonb,
  quota='{"pageSize":20,"variantPageSize":100}'::jsonb,
  retention_terms='{"connection":"until disconnect","webhookDedupeDays":7}'::jsonb,
  image_terms='{"merchantAuthorized":true,"cache":true}'::jsonb,
  model_terms='{"personalizedRanking":"allowed_by_merchant_install","embeddings":"denied","externalProcessing":"denied","training":"denied"}'::jsonb
WHERE source_key='shopify-merchant';

UPDATE catalog_source_registry SET
  evidence_links='["https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html"]'::jsonb,
  credentials_needed='["YAHOO_SHOPPING_APP_ID"]'::jsonb,
  quota='{"resultsMax":50,"startPlusResultsMax":1000}'::jsonb,
  retention_terms='{"mode":"live_only","seconds":0}'::jsonb,
  image_terms='{"cache":"denied"}'::jsonb,
  model_terms='{"ranking":"denied","embeddings":"denied","training":"denied"}'::jsonb
WHERE source_key='yahoo-shopping-jp';

UPDATE catalog_source_registry SET
  evidence_links='["https://webservice.rakuten.co.jp/documentation/ichiba-item-search-20260401"]'::jsonb,
  credentials_needed='["RAKUTEN_APPLICATION_ID","RAKUTEN_ACCESS_KEY","RAKUTEN_USED_SHOP_CODES"]'::jsonb,
  quota='{"pageMax":100,"resaleClassification":"reviewed_shop_allowlist_only"}'::jsonb,
  retention_terms='{"mode":"live_only","seconds":0}'::jsonb,
  image_terms='{"cache":"denied"}'::jsonb,
  model_terms='{"ranking":"denied","embeddings":"denied","training":"denied"}'::jsonb
WHERE source_key='rakuten-ichiba';

INSERT INTO app_schema_migrations (version,name)
VALUES (51,'catalog-connections')
ON CONFLICT (version) DO NOTHING;
