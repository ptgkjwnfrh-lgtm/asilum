-- ASILUM Supabase schema (MVP persistence plan — see CONSTITUTION.md).
-- Run in the Supabase SQL editor (or psql against DATABASE_URL).
--
-- NOTE: apply schema-v1-brain.sql first. This file adds the MVP tables on top
-- of the explicit brain-table migration and formalizes
-- the mapping:
--   products         = items (existing)
--   mood_boards      = boards (existing)
--   mood_board_items = board_items (existing)
--   interactions     = interactions (existing)
-- New tables below: user_profiles (auth-linked), designers, saved_items,
-- articles, product_sources.

-- ---- users / profiles (linked to Supabase auth.users) ----
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text,
  bio text,
  avatar_url text,
  device_uid text,          -- legacy localStorage asilum-uid, for migrating taste profiles
  created_at timestamptz default now()
);

-- ---- designers (manual uploads first; Shopify sync later) ----
create table if not exists designers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  bio text,
  website_url text,
  shopify_domain text,      -- null until the designer connects Shopify
  avatar_url text,
  created_at timestamptz default now()
);

-- ---- product sources (where a product can actually be bought) ----
create table if not exists product_sources (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,              -- references items(id)
  source text not null,               -- 'ebay' | 'shopify' | 'manual' | 'demo'
  external_id text,
  external_url text,
  price numeric,
  currency text default 'USD',
  condition text,
  is_demo boolean not null default false,  -- demo data stays clearly separated
  created_at timestamptz default now(),
  unique (item_id, source, external_id)
);

-- ---- saved items (Mood Board Lite: a user's saved products) ----
create table if not exists saved_items (
  user_id uuid not null references user_profiles(id) on delete cascade,
  item_id text not null,
  saved_at timestamptz default now(),
  primary key (user_id, item_id)
);

-- ---- editorial articles (original summaries only; link out — copyright rule) ----
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  publication text,
  title text not null,
  summary text,              -- ORIGINAL text only, never copied
  external_url text,
  published_at timestamptz,
  created_at timestamptz default now()
);

-- ---- row level security (Supabase default posture) ----
alter table user_profiles enable row level security;
alter table saved_items enable row level security;
alter table designers enable row level security;
alter table articles enable row level security;
alter table product_sources enable row level security;

create policy "own profile" on user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own saves" on saved_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public read designers" on designers for select using (true);
create policy "public read articles" on articles for select using (true);
create policy "public read sources" on product_sources for select using (true);
