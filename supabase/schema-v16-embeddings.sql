-- schema-v16-embeddings.sql — graduate ONLY the embeddings table from
-- schema-alpha (owner directive Aug 3: embeddings v1 live with Voyage key).
-- The rest of schema-alpha stays STAGED per database-safety doctrine.
-- Additive + idempotent. Rollback: DROP TABLE IF EXISTS embeddings;
-- (safe — the table is new and holds only recomputable vectors).

create table if not exists embeddings (
  id text primary key,             -- "<space>:<owner_id>"
  owner_id text not null,          -- product / user / board / image ref
  owner_kind text not null,        -- product | user | board | image
  space text not null,             -- tag-v0 | visual-v1 | text-v1
  provider text,
  vector jsonb,                    -- swap to pgvector when scale demands
  updated_at timestamptz not null default now()
);
create index if not exists embeddings_owner on embeddings (owner_kind, owner_id);

alter table embeddings enable row level security;
-- server-only table: no anon/authenticated policies; the application role
-- gets full DML (house pattern, schema-v11), everyone else sees nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE embeddings TO asilum_app;
DROP POLICY IF EXISTS asilum_app_server_access ON embeddings;
CREATE POLICY asilum_app_server_access ON embeddings
  FOR ALL TO asilum_app USING (true) WITH CHECK (true);
