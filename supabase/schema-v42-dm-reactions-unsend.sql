-- schema-v42-dm-reactions-unsend.sql
--
-- Reactions and unsend.
--
-- THE EMOJI SET IS CLOSED, AND THAT IS A SAFETY DECISION, NOT A STYLE ONE.
-- An open emoji field is a covert text channel: a stranger held to ONE message
-- until you reply (law 3) could otherwise spell sentences at you one glyph at
-- a time, and no future moderation pass would read them as messages. A fixed
-- palette in a law table, granted SELECT-only, means the running app cannot
-- widen it — the same shape v40 used for the states it refuses to invent.
--
-- REACTIONS REQUIRE AN ACCEPTED CONVERSATION for the same reason. A reaction
-- on an unaccepted request is a notification a stranger can send, repeatedly,
-- past the one-knock law. Requests get replies or nothing.
--
-- UNSEND NULLS THE BODY AND KEEPS THE ENVELOPE. "Unsent" is not "never
-- existed": the row, its sender and its timestamp remain, so a conversation
-- someone is later asked about is still legible. It is a SEPARATE column from
-- redacted_at on purpose — a person removing their own words and a moderator
-- removing them are different facts, and one column would lose which happened.
--
-- Nothing here needs a recompute. Unread and the inbox preview are DERIVED
-- (v40, deliberately), so a body going NULL updates both by existing.

CREATE TABLE IF NOT EXISTS dm_reaction_kinds (
  emoji TEXT PRIMARY KEY,
  position INTEGER NOT NULL DEFAULT 100
);

INSERT INTO dm_reaction_kinds (emoji, position) VALUES
  ('♥', 10),   -- the house heart: an asterisk-adjacent mark, not a sticker
  ('✓', 20),   -- "seen and handled" — the suffix grammar already means this
  ('✕', 30),   -- "no" without typing it
  ('!', 40),   -- urgency, which a storefront needs and a heart cannot carry
  ('?', 50)    -- "say more" — the most useful reaction in a sales thread
ON CONFLICT (emoji) DO NOTHING;

CREATE TABLE IF NOT EXISTS dm_reactions (
  message_id BIGINT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  emoji TEXT NOT NULL REFERENCES dm_reaction_kinds(emoji),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ONE reaction per person per message. Choosing another replaces it, so a
  -- reaction cannot become a stream of notifications.
  PRIMARY KEY (message_id, account_id)
);

CREATE INDEX IF NOT EXISTS dm_reactions_message ON dm_reactions (message_id);

ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS unsent_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- laws
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dm_guard_reaction() RETURNS TRIGGER AS $$
DECLARE convo dm_conversations%ROWTYPE; msg dm_messages%ROWTYPE;
BEGIN
  SELECT * INTO msg FROM dm_messages WHERE id = NEW.message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'dm: no such message' USING ERRCODE='23503'; END IF;
  SELECT * INTO convo FROM dm_conversations WHERE id = msg.conversation_id;

  IF NEW.account_id NOT IN (convo.lo_account_id, convo.hi_account_id) THEN
    RAISE EXCEPTION 'dm: not a participant' USING ERRCODE='42501';
  END IF;

  -- A reaction on an unaccepted request is a notification past law 3.
  IF convo.state <> 'accepted' THEN
    RAISE EXCEPTION 'dm: reactions need an accepted conversation' USING ERRCODE='P0003';
  END IF;

  -- Blocking holds here too, in both directions. A block that stops words but
  -- allows a heart every few minutes is not a block.
  IF EXISTS (
    SELECT 1 FROM dm_blocks
    WHERE (blocker_account_id = convo.lo_account_id AND blocked_account_id = convo.hi_account_id)
       OR (blocker_account_id = convo.hi_account_id AND blocked_account_id = convo.lo_account_id)
  ) THEN
    RAISE EXCEPTION 'dm: blocked' USING ERRCODE='P0001';
  END IF;

  -- Nothing to react to once it is gone.
  IF msg.unsent_at IS NOT NULL OR msg.redacted_at IS NOT NULL THEN
    RAISE EXCEPTION 'dm: that message is gone' USING ERRCODE='P0005';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dm_guard_reaction_trg ON dm_reactions;
CREATE TRIGGER dm_guard_reaction_trg
  BEFORE INSERT OR UPDATE ON dm_reactions
  FOR EACH ROW EXECUTE FUNCTION dm_guard_reaction();

-- Unsend is the SENDER's act and nobody else's, and it is one-way: a body,
-- once removed, is not restorable by the app.
CREATE OR REPLACE FUNCTION dm_guard_unsend() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unsent_at IS NOT NULL AND OLD.unsent_at IS NULL THEN
    IF NEW.body IS NOT NULL THEN
      RAISE EXCEPTION 'dm: unsending must clear the body' USING ERRCODE='P0006';
    END IF;
  END IF;
  IF OLD.unsent_at IS NOT NULL AND NEW.unsent_at IS NULL THEN
    RAISE EXCEPTION 'dm: an unsend cannot be undone' USING ERRCODE='P0006';
  END IF;
  IF OLD.unsent_at IS NOT NULL AND NEW.body IS NOT NULL THEN
    RAISE EXCEPTION 'dm: an unsent body cannot come back' USING ERRCODE='P0006';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dm_guard_unsend_trg ON dm_messages;
CREATE TRIGGER dm_guard_unsend_trg
  BEFORE UPDATE ON dm_messages
  FOR EACH ROW EXECUTE FUNCTION dm_guard_unsend();

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT; role_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['dm_reactions','dm_reaction_kinds'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', t);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', t, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='asilum_app') THEN
    -- Reactions are removable by the person who left one.
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dm_reactions TO asilum_app;
    -- SELECT ONLY on the palette: the running app cannot widen the set, which
    -- is what keeps it from becoming a text channel.
    GRANT SELECT ON TABLE dm_reaction_kinds TO asilum_app;
    DROP POLICY IF EXISTS asilum_app_server_access ON dm_reactions;
    CREATE POLICY asilum_app_server_access ON dm_reactions
      FOR ALL TO asilum_app USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS asilum_app_server_access ON dm_reaction_kinds;
    CREATE POLICY asilum_app_server_access ON dm_reaction_kinds
      FOR SELECT TO asilum_app USING (true);
  END IF;
END $$;

INSERT INTO app_schema_migrations (version, name)
VALUES (42, 'dm-reactions-unsend')
ON CONFLICT (version) DO NOTHING;
