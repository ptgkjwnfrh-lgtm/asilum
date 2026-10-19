-- supabase/schema-v3-ai.sql
-- AI-foundation tables (Day 9): mood-board analysis, user style profiles,
-- stylist requests/feedback, and model-event logging. Applied WITH the code
-- that writes them (lib/ai/*, lib/db/production.js). Server-only via
-- DATABASE_URL like schema-v2; RLS enabled, no anon policies on purpose.
-- Apply: node --experimental-default-type=module scripts/apply-schema.mjs supabase/schema-v3-ai.sql

-- mood_board_uploads doubles as mood_board_items (typed tags array covers
-- manual/ai/color/silhouette/fabric/mood/aesthetic/designer-ref/brand-ref/era
-- via tag_type). Add the missing per-item fields only:
ALTER TABLE mood_board_uploads ADD COLUMN IF NOT EXISTS user_notes TEXT;
ALTER TABLE mood_board_uploads ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE mood_board_uploads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Every analysis pass over an upload: who/what produced it, raw + parsed
-- output, status. One upload can be re-analyzed later by a real model.
CREATE TABLE IF NOT EXISTS mood_board_analysis (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  analysis_status TEXT NOT NULL DEFAULT 'complete',  -- pending|complete|failed
  analysis_source TEXT NOT NULL DEFAULT 'local-rules', -- local-rules|manual|model
  model_provider TEXT,                                -- null until a real model runs
  model_name TEXT,
  prompt_version TEXT,
  raw_model_output TEXT,                              -- null for local-rules
  parsed_tags JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{tag, tag_type, confidence}]
  summary TEXT,
  confidence_score REAL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mood_board_analysis_user ON mood_board_analysis (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mood_board_analysis_upload ON mood_board_analysis (upload_id);

-- The distilled taste document every intelligent surface reads.
CREATE TABLE IF NOT EXISTS user_style_profiles (
  user_id TEXT PRIMARY KEY,
  dominant_aesthetics JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{tag, weight}]
  preferred_colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_silhouettes JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_fabrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_eras JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_brands JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_designers JSONB NOT NULL DEFAULT '[]'::jsonb,
  avoided_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  taste_summary TEXT,
  confidence_score REAL,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,   -- counts per signal source
  last_rebuilt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stylist_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_text TEXT,
  occasion TEXT,
  mood TEXT,
  budget_min NUMERIC,
  budget_max NUMERIC,
  size_preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
  color_preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
  excluded_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  use_mood_board_brain BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'complete',      -- pending|complete|failed|empty
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stylist_requests_user ON stylist_requests (user_id, created_at DESC);

-- stylist_outfits exists (schema-v2); add the request link + reasoning fields.
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS stylist_request_id BIGINT;
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS outfit_name TEXT;
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS outfit_summary TEXT;
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS color_logic TEXT;
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS silhouette_logic TEXT;
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS aesthetic_logic TEXT;
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS model_provider TEXT;
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS model_name TEXT;
ALTER TABLE stylist_outfits ADD COLUMN IF NOT EXISTS matched_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS stylist_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  stylist_outfit_id BIGINT NOT NULL,
  feedback_type TEXT NOT NULL,                  -- like|dislike|save|reject|purchase|note
  feedback_notes TEXT,
  saved BOOLEAN NOT NULL DEFAULT false,
  rejected BOOLEAN NOT NULL DEFAULT false,
  purchased BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stylist_feedback_user ON stylist_feedback (user_id, created_at DESC);

-- Every model call (or refusal) the adapter makes, for audit + debugging.
CREATE TABLE IF NOT EXISTS ai_model_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  feature TEXT NOT NULL,                        -- mood-board|stylist|style-profile
  model_provider TEXT,
  model_name TEXT,
  prompt_version TEXT,
  input_summary TEXT,
  output_summary TEXT,
  status TEXT NOT NULL,                         -- ok|invalid-output|error|disabled
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_model_events_feature ON ai_model_events (feature, created_at DESC);

ALTER TABLE mood_board_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stylist_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_events ENABLE ROW LEVEL SECURITY;
