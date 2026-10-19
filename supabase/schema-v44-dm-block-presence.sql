-- schema-v44-dm-block-presence.sql
--
-- A BLOCK MUST STOP PRESENCE, NOT ONLY WORDS.
--
-- v40 stopped messages both directions. v42 explicitly extended that to
-- reactions — "a block that stops words but allows a heart every few minutes
-- is not a block". v41's activity signals were written BETWEEN those two and
-- never got the predicate: dm_guard_typing checked participation and a horizon
-- cap, peerActivity checked reciprocity, and neither ever looked at dm_blocks.
--
-- The result was a live two-way presence channel surviving a block. The person
-- you blocked could still see you typing and still see your read position, and
-- you could still see theirs, indefinitely. Found by the adversarial review of
-- the finished subsystem — no single PR's review could see it, because each
-- feature was correct on the day it shipped and the LAW moved underneath the
-- ones written earlier.
--
-- The lesson, recorded because it will recur: WHEN A LAW GAINS A NEW
-- ENFORCEMENT POINT, EVERY SURFACE OLDER THAN THAT LAW HAS TO BE RE-CHECKED.
-- v42 added the block predicate to reactions and nobody carried it back.

CREATE OR REPLACE FUNCTION dm_guard_typing() RETURNS TRIGGER AS $$
DECLARE convo dm_conversations%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM dm_participants
     WHERE conversation_id = NEW.conversation_id AND account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'dm: not a participant' USING ERRCODE='42501';
  END IF;

  -- NEW in v44: the same bidirectional predicate dm_guard_message and
  -- dm_guard_reaction already carry.
  SELECT * INTO convo FROM dm_conversations WHERE id = NEW.conversation_id;
  IF EXISTS (
    SELECT 1 FROM dm_blocks
    WHERE (blocker_account_id = convo.lo_account_id AND blocked_account_id = convo.hi_account_id)
       OR (blocker_account_id = convo.hi_account_id AND blocked_account_id = convo.lo_account_id)
  ) THEN
    RAISE EXCEPTION 'dm: blocked' USING ERRCODE='P0001';
  END IF;

  IF NEW.typing_until > now() + interval '30 seconds' THEN
    NEW.typing_until := now() + interval '30 seconds';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Existing rows written before the block are stale presence and must not
-- outlive it. Nothing else deletes them, because the expiry normally does.
DELETE FROM dm_typing t
 USING dm_conversations c, dm_blocks b
 WHERE t.conversation_id = c.id
   AND ((b.blocker_account_id = c.lo_account_id AND b.blocked_account_id = c.hi_account_id)
     OR (b.blocker_account_id = c.hi_account_id AND b.blocked_account_id = c.lo_account_id));

INSERT INTO app_schema_migrations (version, name)
VALUES (44, 'dm-block-presence')
ON CONFLICT (version) DO NOTHING;
