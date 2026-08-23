-- schema-v41-dm-activity.sql
--
-- Read receipts and typing indicators — "activity signals".
--
-- ONE SETTING, NOT TWO, AND IT IS RECIPROCAL. Both features answer the same
-- question about a person ("what are you doing in this thread right now?"),
-- and splitting them produces states nobody asked for: someone who sees your
-- typing but hides their reading. Reciprocity is the part that matters —
-- switching your signals OFF also switches off your ability to see anyone
-- else's. Without it the setting is a one-way mirror, and a one-way mirror is
-- the thing a privacy control is supposed to prevent.
--
-- READ RECEIPTS NEED NO NEW STORAGE. dm_participants.last_read_message_id
-- already exists and is already maintained monotonically; a receipt is that
-- number, read from the OTHER side, and shown only when reciprocity allows.
-- Adding a receipts table would be a second copy of a fact that already has a
-- home — the mistake v40's design pass produced four blockers from.
--
-- TYPING IS THE ONLY NEW TABLE, AND IT IS DELIBERATELY TINY AND EXPIRING.
-- A typing indicator is not history. The row carries an expiry rather than a
-- boolean, so "stopped typing" needs no write at all — the state simply
-- lapses. A client that closes its laptop mid-word leaves nothing behind.

ALTER TABLE dm_settings
  ADD COLUMN IF NOT EXISTS activity_signals BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS dm_typing (
  conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  -- An INSTANT, not a flag. Expiry makes the absence of a write mean
  -- "stopped", which is the only way a browser that vanished tells the truth.
  typing_until TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (conversation_id, account_id)
);

-- The read is always "is anyone else typing in THIS conversation, right now",
-- so the index the PK already provides is the whole access pattern.

ALTER TABLE dm_typing ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE dm_typing FROM PUBLIC;

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE dm_typing FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asilum_app') THEN
    -- DELETE is granted here, unlike every other DM table: a typing row is
    -- ephemeral state rather than a record of anything, and the sweeper has to
    -- be able to remove lapsed ones.
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dm_typing TO asilum_app;
    DROP POLICY IF EXISTS asilum_app_server_access ON dm_typing;
    CREATE POLICY asilum_app_server_access ON dm_typing
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
  END IF;
END $$;

-- A typing row may only exist for someone who is actually in the conversation.
-- Same reasoning as the message guard: the route is not the only writer.
CREATE OR REPLACE FUNCTION dm_guard_typing() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM dm_participants
     WHERE conversation_id = NEW.conversation_id AND account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'dm: not a participant' USING ERRCODE='42501';
  END IF;
  -- Cap the horizon. A client asking to appear "typing" for an hour is either
  -- broken or lying, and either way the indicator must not outlive the person.
  IF NEW.typing_until > now() + interval '30 seconds' THEN
    NEW.typing_until := now() + interval '30 seconds';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dm_guard_typing_trg ON dm_typing;
CREATE TRIGGER dm_guard_typing_trg
  BEFORE INSERT OR UPDATE ON dm_typing
  FOR EACH ROW EXECUTE FUNCTION dm_guard_typing();

INSERT INTO app_schema_migrations (version, name)
VALUES (41, 'dm-activity')
ON CONFLICT (version) DO NOTHING;
