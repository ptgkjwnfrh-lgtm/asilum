-- ASILUM schema v1 — durable Alpha Learning Brain tables.
-- These tables were historically created at application startup. They are now
-- explicit migrations so production boot never needs DDL privileges.

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  title TEXT, brand TEXT, price NUMERIC, currency TEXT,
  tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  img TEXT, alt TEXT, source TEXT,
  designers JSONB NOT NULL DEFAULT '[]'::jsonb,
  category TEXT, era JSONB, size JSONB, url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  vec JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS interactions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL, item_id TEXT NOT NULL, action TEXT NOT NULL,
  dwell_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS edges (
  a TEXT NOT NULL, b TEXT NOT NULL, w REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (a,b), CHECK (a <> b)
);
CREATE INDEX IF NOT EXISTS edges_b ON edges (b);
CREATE TABLE IF NOT EXISTS popularity (
  item_id TEXT PRIMARY KEY,
  eng REAL NOT NULL DEFAULT 0,
  imp REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS board_items (
  board_id TEXT NOT NULL, item_id TEXT NOT NULL, item JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id,item_id)
);
CREATE TABLE IF NOT EXISTS user_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_events_user_at ON user_events (user_id,at DESC);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE popularity ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;
