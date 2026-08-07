-- ASILUM schema v25 — popularity evidence ages (Aug 6, 2026).
-- Idempotent and additive. Apply after schema-v24-serve-context.sql.
--
-- WHY. Audit #15. v23 made the counters count PEOPLE; it did not make them
-- count RECENT people. volume = engagers/(engagers+8) saturates on lifetime
-- distinct contributors with no recency term, so — measured on the shipped
-- code — an item with 10 lifetime engagers scores delta 0.5000 permanently and
-- outranks a currently-hot 5-engager item at 0.3654 indefinitely, regardless of
-- when those ten people engaged or whether anyone has touched it since.
--
-- The ledger is monotone by construction (`engaged = engaged OR EXCLUDED`), and
-- although popularity_contributors already stores first_seen per contributor,
-- no code path anywhere read it for scoring. The result is a permanent
-- head-start for whatever was engaged with first: invisible on a pre-launch
-- synthetic catalog, and a structural monoculture pressure the moment real
-- traffic accumulates. It is the one part of the popularity design that gets
-- worse with time rather than better.
--
-- WHAT THESE COLUMNS HOLD.
--   engagers_decayed / viewers_decayed — SUM over that item's contributors of
--     0.5 ^ (age / half_life), evaluated at decayed_at.
--   decayed_at — the instant that sum was evaluated.
--
-- Two columns and a timestamp rather than a windowed query, because the
-- exponential FACTORS: 0.5^((t2-ti)/H) = 0.5^((t2-t1)/H) * 0.5^((t1-ti)/H).
-- A sum materialized at t1 is carried to any later t2 by ONE multiplication at
-- read time. So the aggregate is recomputed only for items a write touches
-- (where the ledger is already being read), never scanned per feed serve, and
-- it cannot drift from the definition because every touch recomputes it from
-- the ledger. Erasure recomputes them too — a departed person must stop
-- counting in every counter they are in, not just the lifetime ones.
--
-- DOUBLE PRECISION, not INTEGER: the value is a weighted count and is
-- fractional by design. DEFAULT 0 with the existing rows left at zero — the
-- v23 precedent, and for the same reason. Backfilling from first_seen would be
-- defensible here (the timestamps exist), but the rows that would gain most are
-- the bot-era rows whose eng/imp mass is explicitly diagnostic; the columns
-- populate correctly on the first touch of any item that still matters.
--
-- HALF-LIFE is declared in code (lib/brain/popularity.js, DEFAULT_HALF_LIFE_DAYS
-- = 30) and passed into the aggregate as a parameter, so it is tunable via
-- POPULARITY_HALF_LIFE_DAYS without a migration. It is NOT calibrated against
-- outcome data — no real traffic exists to calibrate against — and that is
-- stated rather than implied.
--
-- NO REQUIRED_SCHEMA_VERSION BUMP, deliberately, exactly as v24: lib/db detects
-- these columns once per process and falls back to lifetime counts when absent,
-- so application code is safe to deploy before this migration runs.
--
-- Rollback, two independent levers:
--   BRAIN_POPULARITY_DECAY=0        restores lifetime scoring with no deploy
--                                   and no schema change (the columns keep
--                                   being maintained, they are just not read).
--   ALTER TABLE popularity DROP COLUMN engagers_decayed, viewers_decayed,
--                                      decayed_at;
-- Detection is per-process, so a dropped column resumes the pre-v25 path on the
-- next boot with no code change. Nothing else reads these columns.

ALTER TABLE popularity ADD COLUMN IF NOT EXISTS engagers_decayed DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE popularity ADD COLUMN IF NOT EXISTS viewers_decayed DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE popularity ADD COLUMN IF NOT EXISTS decayed_at TIMESTAMPTZ;

ALTER TABLE popularity DROP CONSTRAINT IF EXISTS popularity_engagers_decayed_check;
ALTER TABLE popularity ADD CONSTRAINT popularity_engagers_decayed_check CHECK (engagers_decayed >= 0);
ALTER TABLE popularity DROP CONSTRAINT IF EXISTS popularity_viewers_decayed_check;
ALTER TABLE popularity ADD CONSTRAINT popularity_viewers_decayed_check CHECK (viewers_decayed >= 0);

COMMENT ON COLUMN popularity.engagers_decayed IS
  'v25: recency-weighted distinct engagers — SUM(0.5 ^ (age/half_life)) over popularity_contributors, evaluated at decayed_at. Carry to now() by multiplying by 0.5 ^ ((now()-decayed_at)/half_life). Ranking reads this when BRAIN_POPULARITY_DECAY is on.';
COMMENT ON COLUMN popularity.viewers_decayed IS
  'v25: recency-weighted distinct viewers, same construction as engagers_decayed. Feeds the novelty percentile, so exposure-based suppression now heals on the half-life instead of lasting forever.';
COMMENT ON COLUMN popularity.decayed_at IS
  'v25: the instant engagers_decayed / viewers_decayed were evaluated. NULL means never computed — scoring falls back to lifetime counts.';

INSERT INTO app_schema_migrations (version,name)
VALUES (25,'popularity-decay')
ON CONFLICT (version) DO UPDATE SET name=EXCLUDED.name;

-- Verification (run after apply):
--   SELECT max(version) FROM app_schema_migrations;                        -- >= 25
--   SELECT count(*) FROM information_schema.columns WHERE table_name='popularity'
--     AND column_name IN ('engagers_decayed','viewers_decayed','decayed_at'); -- 3
--   SELECT count(*) FROM popularity WHERE decayed_at IS NOT NULL;          -- 0 at first,
--                                                                          -- climbing as items are touched
--   -- after some traffic, decayed must never exceed lifetime:
--   SELECT count(*) FROM popularity WHERE engagers_decayed > engagers + 1e-6;  -- 0
