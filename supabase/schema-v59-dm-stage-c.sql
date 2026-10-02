-- schema-v59-dm-stage-c.sql
--
-- THE MAIL DESK, STAGE C (V.2 brief §3–§4, owner, 1 Oct 2026). Four facts
-- the desk did not hold:
--
-- 1. EDITS. A message may be edited by its sender inside ONE HOUR of
--    sending (the owner's rule, which overrides the familiar apps' limits).
--    `edited_at` is the honesty label; `edit_version` is the optimistic
--    check — a stale client's edit is refused, never merged.
-- 2. THE TEXT LIMIT IS BYTES HERE, GRAPHEMES IN THE APP. The v40 check
--    counted characters (2,000). The product default is 1,000 grapheme
--    clusters (configurable, lib/dm.js) — a grapheme can be several
--    characters, so the database keeps the ceiling that cannot be gamed:
--    8 KiB of UTF-8. Both are enforced; neither truncates.
-- 3. CLEAR HISTORY, PER VIEWER. `cleared_before_id` is the viewer's
--    hidden-history boundary; the other participant's copy is untouched; a
--    new message reintroduces the conversation without restoring what was
--    cleared.
-- 4. MESSAGE KINDS. A message is text, a PROFILE CARD (a passenger shared
--    into the thread — rendered from the entity id, re-checked at view
--    time, never a frozen copy of a private bio), an ATTACHMENT (the media
--    pipeline — built, GATED OFF by OWNER-DECISIONS #3), or a SYSTEM line.
--
-- dm_attachments is the pipeline's table: paths in the PRIVATE bucket "dm",
-- the sha256 that de-duplicates within one conversation only (never across
-- authorization boundaries), the dimensions, and `archived_at` — after six
-- months the display image is no longer auto-loaded; the thumbnail stays.
--
-- dm_settings.profile_sharing — a passenger who does not want their profile
-- shared in messages; the server refuses the card and says the owner's
-- exact words (lib/dm.js SHARE_REFUSED_COPY).
--
-- notifications gains two kinds: 'dm-cleared' (the other participant is
-- told once, neutrally, per clear — the owner's requested behaviour; the
-- recommendation to suppress it is recorded in the stage note) and
-- 'profile-shared' (the shared passenger is told, without sender or
-- recipient, aggregated by day).
--
-- Numbered 59 after v58 on this branch.
--
-- ROLLBACK: ALTER TABLE dm_messages DROP COLUMN IF EXISTS edited_at, DROP
-- COLUMN IF EXISTS edit_version, DROP COLUMN IF EXISTS kind, DROP COLUMN IF
-- EXISTS shared_profile_account_id; ALTER TABLE dm_participants DROP COLUMN
-- IF EXISTS cleared_before_id, DROP COLUMN IF EXISTS cleared_at; ALTER TABLE
-- dm_settings DROP COLUMN IF EXISTS profile_sharing; DROP TABLE IF EXISTS
-- dm_attachments; (restore the v40 body check and the v58 kinds check by
-- hand); DELETE FROM app_schema_migrations WHERE version = 59;
-- VERIFY: SELECT count(*) FILTER (WHERE edited_at IS NOT NULL) FROM dm_messages;
--         SELECT kind, count(*) FROM dm_messages GROUP BY 1;

ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS edit_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS shared_profile_account_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dm_messages_kind_check') THEN
    ALTER TABLE dm_messages ADD CONSTRAINT dm_messages_kind_check CHECK (kind IN ('text', 'profile-card', 'attachment', 'system'));
  END IF;
END $$;
-- the byte ceiling replaces the character count (v40 named the check after the column)
ALTER TABLE dm_messages DROP CONSTRAINT IF EXISTS dm_messages_body_check;
ALTER TABLE dm_messages ADD CONSTRAINT dm_messages_body_check CHECK (body IS NULL OR (octet_length(body) BETWEEN 1 AND 8192));

ALTER TABLE dm_participants ADD COLUMN IF NOT EXISTS cleared_before_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE dm_participants ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;

ALTER TABLE dm_settings ADD COLUMN IF NOT EXISTS profile_sharing BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS dm_attachments (
  id              BIGSERIAL PRIMARY KEY,
  message_id      BIGINT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_account_id UUID NOT NULL,
  display_path    TEXT NOT NULL CHECK (char_length(display_path) <= 300),
  thumb_path      TEXT NOT NULL CHECK (char_length(thumb_path) <= 300),
  sha256          TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  bytes           INTEGER NOT NULL CHECK (bytes > 0),
  width           INTEGER, height INTEGER,
  mime            TEXT NOT NULL DEFAULT 'image/webp',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at     TIMESTAMPTZ,
  UNIQUE (conversation_id, sha256)
);
CREATE INDEX IF NOT EXISTS dm_attachments_message ON dm_attachments (message_id);

-- the edit law, in the database too: only the sender, only inside the hour,
-- only a live message, and the version climbs by exactly one
CREATE OR REPLACE FUNCTION dm_guard_edit() RETURNS TRIGGER AS $$
DECLARE actor TEXT;
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body AND NEW.unsent_at IS NULL AND OLD.unsent_at IS NULL THEN
    actor := current_setting('asilum.dm_actor', true);
    IF actor IS NULL OR actor = '' OR actor::uuid <> OLD.sender_account_id THEN
      RAISE EXCEPTION 'dm: an edit is the sender''s act' USING ERRCODE='42501';
    END IF;
    IF OLD.redacted_at IS NOT NULL THEN
      RAISE EXCEPTION 'dm: a redacted message cannot be edited' USING ERRCODE='P0006';
    END IF;
    IF OLD.created_at < clock_timestamp() - interval '1 hour' THEN
      RAISE EXCEPTION 'dm: the edit window is one hour' USING ERRCODE='P0007';
    END IF;
    IF NEW.edit_version <> OLD.edit_version + 1 THEN
      RAISE EXCEPTION 'dm: an edit must carry the next version' USING ERRCODE='P0008';
    END IF;
    IF NEW.edited_at IS NULL THEN
      RAISE EXCEPTION 'dm: an edit must be stamped' USING ERRCODE='P0006';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS dm_guard_edit_trg ON dm_messages;
CREATE TRIGGER dm_guard_edit_trg BEFORE UPDATE ON dm_messages
  FOR EACH ROW EXECUTE FUNCTION dm_guard_edit();

-- the notification kinds grow (v58 named one)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('liked-sold', 'dm-cleared', 'profile-shared'));

DO $$ DECLARE t TEXT; role_name TEXT;
BEGIN FOREACH t IN ARRAY ARRAY['dm_attachments'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', t);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', t, role_name); END IF;
  END LOOP; END LOOP; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asilum_app') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON dm_attachments TO asilum_app;
  GRANT USAGE, SELECT ON SEQUENCE dm_attachments_id_seq TO asilum_app;
  DROP POLICY IF EXISTS asilum_app_server_access ON dm_attachments;
  CREATE POLICY asilum_app_server_access ON dm_attachments FOR ALL TO asilum_app USING (true) WITH CHECK (true);
END IF; END $$;

INSERT INTO app_schema_migrations (version, name) VALUES (59, 'dm-stage-c')
ON CONFLICT (version) DO NOTHING;
