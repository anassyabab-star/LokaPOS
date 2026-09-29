-- ============================================================================
-- MLBB tournament module.
--
-- Teams register through the customer app, upload a transfer receipt, and once
-- an admin approves the payment every player gets Loka vouchers (a discount for
-- later + one only valid on tournament day). Matches, standings and the
-- bracket are run from the dashboard; participants follow along live.
--
-- Public reads go through /api/public/tournaments/* (service role). The anon
-- SELECT policies below exist only so Supabase Realtime can push match /
-- announcement changes to participants' phones — those tables hold no personal
-- data. Teams and players (phones, receipts) have no anon policy at all.
--
-- Manual migration. Safe to re-run.
-- ============================================================================

-- ── Vouchers: "not valid before" ────────────────────────────────────────────
-- Tournament-day vouchers are issued weeks early but only spendable on the day.
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION redeem_voucher_code (
  p_code     TEXT,
  p_order_id UUID
) RETURNS vouchers
LANGUAGE plpgsql AS $$
DECLARE
  v_voucher vouchers;
BEGIN
  UPDATE vouchers
    SET status = 'redeemed',
        redeemed_at = now (),
        redeemed_order_id = p_order_id
    WHERE code = p_code
      AND status = 'issued'
      AND (expires_at IS NULL OR expires_at > now ())
      AND (valid_from IS NULL OR valid_from <= now ())
    RETURNING * INTO v_voucher;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VOUCHER_NOT_REDEEMABLE' USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_voucher;
END;
$$;

-- ── Tournaments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  slug                   TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,
  description            TEXT,
  logo_url               TEXT,
  venue                  TEXT,
  format                 TEXT NOT NULL DEFAULT 'round_robin'
                           CHECK (format IN ('round_robin', 'single_elim', 'group_knockout')),
  status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'registration_open', 'registration_closed', 'ongoing', 'completed')),
  published              BOOLEAN NOT NULL DEFAULT false,
  start_at               TIMESTAMPTZ,
  end_at                 TIMESTAMPTZ,
  registration_deadline  TIMESTAMPTZ,
  max_teams              INT NOT NULL DEFAULT 16,
  min_players            INT NOT NULL DEFAULT 5,
  max_players            INT NOT NULL DEFAULT 6,
  entry_fee              NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_instructions   TEXT,           -- bank, account no, name
  payment_qr_url         TEXT,           -- DuitNow QR image
  default_best_of        INT NOT NULL DEFAULT 1 CHECK (default_best_of IN (1, 3, 5)),
  knockout_best_of       INT NOT NULL DEFAULT 3 CHECK (knockout_best_of IN (1, 3, 5)),
  group_count            INT NOT NULL DEFAULT 2,
  advance_per_group      INT NOT NULL DEFAULT 2,
  points_win             INT NOT NULL DEFAULT 3,
  points_loss            INT NOT NULL DEFAULT 0,
  -- { discount: {type:'amount'|'percent', value, max_discount, min_spend, validity_days},
  --   event_day: {type, value, max_discount, min_spend} }   — either may be absent/off.
  voucher_config         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now (),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now ()
);

-- ── Teams ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_teams (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tournament_id        UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  short_name           TEXT,
  logo_url             TEXT,
  team_number          INT,
  group_name           TEXT,
  seed                 INT,
  manual_position      INT,            -- admin override in standings
  captain_customer_id  UUID REFERENCES customers (id) ON DELETE SET NULL,
  contact_phone        TEXT,
  registration_status  TEXT NOT NULL DEFAULT 'pending_payment'
                         CHECK (registration_status IN ('pending_payment', 'payment_submitted', 'approved', 'rejected', 'withdrawn')),
  payment_proof_path   TEXT,           -- object in the private tournament-payments bucket
  payment_ref          TEXT,
  payment_submitted_at TIMESTAMPTZ,
  reviewed_by          UUID,
  reviewed_at          TIMESTAMPTZ,
  reject_reason        TEXT,
  vouchers_issued_at   TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now ()
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_teams_name_uniq
  ON tournament_teams (tournament_id, lower(name));
CREATE INDEX IF NOT EXISTS tournament_teams_tournament_idx ON tournament_teams (tournament_id);

-- ── Players ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_players (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tournament_id  UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES tournament_teams (id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES customers (id) ON DELETE SET NULL,
  full_name      TEXT NOT NULL,
  ign            TEXT NOT NULL,
  mlbb_user_id   TEXT NOT NULL,
  server_id      TEXT NOT NULL,
  phone          TEXT NOT NULL,
  player_role    TEXT NOT NULL DEFAULT 'sub'
                   CHECK (player_role IN ('exp', 'gold', 'mid', 'jungler', 'roamer', 'sub')),
  is_captain     BOOLEAN NOT NULL DEFAULT false,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now ()
);
-- One person, one team per tournament (by game account and by phone — the
-- phone is what the vouchers are issued against).
CREATE UNIQUE INDEX IF NOT EXISTS tournament_players_mlbb_uniq
  ON tournament_players (tournament_id, mlbb_user_id, server_id);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_players_phone_uniq
  ON tournament_players (tournament_id, phone);
CREATE INDEX IF NOT EXISTS tournament_players_team_idx ON tournament_players (team_id);

-- ── Matches ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tournament_id   UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  match_number    INT NOT NULL,
  stage           TEXT NOT NULL DEFAULT 'group' CHECK (stage IN ('group', 'knockout')),
  round_index     INT NOT NULL DEFAULT 1,     -- 1-based; knockout: 1 = first round
  round_name      TEXT,
  bracket_slot    INT,                        -- knockout: position within the round, 0-based
  group_name      TEXT,
  team_a_id       UUID REFERENCES tournament_teams (id) ON DELETE SET NULL,
  team_b_id       UUID REFERENCES tournament_teams (id) ON DELETE SET NULL,
  team_a_score    INT NOT NULL DEFAULT 0,
  team_b_score    INT NOT NULL DEFAULT 0,
  best_of         INT NOT NULL DEFAULT 1 CHECK (best_of IN (1, 3, 5)),
  winner_team_id  UUID REFERENCES tournament_teams (id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ,
  station         TEXT,
  lobby_info      TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'check_in', 'ready', 'live', 'completed', 'delayed', 'cancelled')),
  next_match_id   UUID REFERENCES tournament_matches (id) ON DELETE SET NULL,
  next_slot       TEXT CHECK (next_slot IN ('a', 'b')),
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now (),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now ()
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_matches_number_uniq
  ON tournament_matches (tournament_id, match_number);
CREATE INDEX IF NOT EXISTS tournament_matches_tournament_idx ON tournament_matches (tournament_id);

CREATE TABLE IF NOT EXISTS tournament_match_games (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  match_id        UUID NOT NULL REFERENCES tournament_matches (id) ON DELETE CASCADE,
  game_number     INT NOT NULL,
  winner_team_id  UUID REFERENCES tournament_teams (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now (),
  UNIQUE (match_id, game_number)
);

-- ── Announcements ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_announcements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tournament_id  UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  message        TEXT NOT NULL DEFAULT '',
  priority       TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now ()
);
CREATE INDEX IF NOT EXISTS tournament_announcements_tournament_idx
  ON tournament_announcements (tournament_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE tournaments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_match_games   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_announcements ENABLE ROW LEVEL SECURITY;

-- Read-only, published tournaments only, no personal data — for Realtime.
DROP POLICY IF EXISTS tournaments_public_read ON tournaments;
CREATE POLICY tournaments_public_read ON tournaments
  FOR SELECT TO anon, authenticated USING (published);

DROP POLICY IF EXISTS tournament_matches_public_read ON tournament_matches;
CREATE POLICY tournament_matches_public_read ON tournament_matches
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_id AND t.published));

DROP POLICY IF EXISTS tournament_announcements_public_read ON tournament_announcements;
CREATE POLICY tournament_announcements_public_read ON tournament_announcements
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_id AND t.published));

-- tournaments carries payment_instructions — public, by design (they're shown
-- on the registration page). No other column is sensitive.

-- ── Realtime ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE tournament_matches;       EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE tournament_announcements; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;              EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
