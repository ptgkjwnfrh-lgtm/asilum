-- schema-v43-dm-mute.sql
--
-- Muting a conversation.
--
-- MUTE IS NOT A QUIET BLOCK, AND THE DIFFERENCE IS THE WHOLE FEATURE.
-- A block stops delivery, is enforced by a trigger, and is deliberately
-- indistinguishable from other refusals so it cannot be probed. A mute stops
-- NOTHING: messages arrive, land in the thread, and count as unread INSIDE the
-- conversation. It removes exactly one thing — the conversation's contribution
-- to the badge in the corner. It is a decision about your own attention, not
-- about the other person, and they cannot detect it because nothing they do
-- behaves differently.
--
-- PER SIDE, obviously: it lives on dm_participants, so muting is your view of
-- the thread and not a property of the thread.
--
-- A TIMESTAMP, NOT A BOOLEAN, for the same reason the consent columns are:
-- "when did you stop wanting to hear about this" is a question worth being
-- able to answer later, and it costs the same eight bytes.

ALTER TABLE dm_participants
  ADD COLUMN IF NOT EXISTS muted_at TIMESTAMPTZ;

-- The badge query filters on (account_id, folder) and now also on muted_at.
-- A partial index over the UNMUTED rows keeps the common read — "what should
-- the corner say" — off the muted ones entirely.
CREATE INDEX IF NOT EXISTS dm_participants_unmuted
  ON dm_participants (account_id, folder)
  WHERE muted_at IS NULL;

INSERT INTO app_schema_migrations (version, name)
VALUES (43, 'dm-mute')
ON CONFLICT (version) DO NOTHING;
