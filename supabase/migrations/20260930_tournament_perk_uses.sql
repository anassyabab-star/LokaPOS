-- Tournament-day player perk (e.g. 20% off drinks for every player, every
-- purchase, on the tournament day). Configured in tournaments.voucher_config
-- ->player_perk; each use at the till is recorded here so the owner can see
-- how much was given away and to which teams.
--
-- Manual migration. Safe to re-run. Without it the discount still applies;
-- uses just aren't recorded.

CREATE TABLE IF NOT EXISTS tournament_perk_uses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tournament_id    UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  team_id          UUID REFERENCES tournament_teams (id) ON DELETE SET NULL,
  player_id        UUID REFERENCES tournament_players (id) ON DELETE SET NULL,
  player_ign       TEXT,
  order_id         UUID,
  discount_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now ()
);
CREATE INDEX IF NOT EXISTS tournament_perk_uses_tournament_idx ON tournament_perk_uses (tournament_id, created_at DESC);
ALTER TABLE tournament_perk_uses ENABLE ROW LEVEL SECURITY;
