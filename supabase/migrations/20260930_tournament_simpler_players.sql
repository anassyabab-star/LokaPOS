-- Simpler team registration: only the captain gives a phone number and a
-- full name; Server ID is no longer asked for (IGN + User ID identify a
-- player for an offline custom-room tournament).
--
-- Manual migration. Safe to re-run. Run BEFORE deploying the matching code —
-- without it, registering a team with phone-less players fails.

ALTER TABLE tournament_players ALTER COLUMN phone     DROP NOT NULL;
ALTER TABLE tournament_players ALTER COLUMN server_id DROP NOT NULL;
ALTER TABLE tournament_players ALTER COLUMN full_name DROP NOT NULL;

-- One MLBB account, one team — by User ID alone now that Server ID is optional.
-- (The (tournament_id, phone) unique index stays: NULL phones don't collide.)
DROP INDEX IF EXISTS tournament_players_mlbb_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS tournament_players_mlbb_uid_uniq
  ON tournament_players (tournament_id, mlbb_user_id);
