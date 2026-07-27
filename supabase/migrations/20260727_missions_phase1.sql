-- ============================================================================
-- LokaPOS — Smart Loyalty Fasa 1: Mission engine + Free-Cup reward voucher
--
-- Missions are time-boxed, count-based, repeatable challenges that auto-issue a
-- redeemable reward (free cup + bonus points) when completed. Reuses the mature
-- `vouchers` table (extended below) + loyalty_ledger idempotency.
--
-- Idempotent / re-runnable: every statement guards with IF NOT EXISTS / OR REPLACE.
-- Apply MANUALLY in the Supabase SQL editor (project convention).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. mission_definitions — admin-configurable challenge templates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mission_definitions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  code                      TEXT NOT NULL UNIQUE,          -- stable key for event keys
  name                      TEXT NOT NULL,
  description               TEXT,
  active                    BOOLEAN NOT NULL DEFAULT true,
  type                      TEXT NOT NULL DEFAULT 'count_in_window',
                            -- 'count_in_window' | 'count_on_weekday_in_window'
  threshold                 INTEGER NOT NULL DEFAULT 1,    -- purchases needed
  window_days               INTEGER NOT NULL DEFAULT 8,    -- rolling window length
  weekday                   SMALLINT,                      -- 0=Sun..6=Sat (Tue=2); weekday type only
  qualifying_min_spend      NUMERIC NOT NULL DEFAULT 0,
  qualifying_category_id    UUID,
  reward_points             INTEGER NOT NULL DEFAULT 0,
  reward_free_product_id    UUID,
  reward_free_category_id   UUID,
  reward_free_label         TEXT,
  reward_voucher_expiry_days INTEGER NOT NULL DEFAULT 30,
  repeatable                BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now (),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now ()
);

-- ----------------------------------------------------------------------------
-- 2. mission_progress — one in-flight cycle per (mission, customer)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mission_progress (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  mission_id        UUID NOT NULL REFERENCES mission_definitions (id),
  customer_id       UUID NOT NULL REFERENCES customers (id),
  cycle_index       INTEGER NOT NULL DEFAULT 0,
  window_start_at   TIMESTAMPTZ NOT NULL DEFAULT now (),
  window_end_at     TIMESTAMPTZ NOT NULL,
  count             INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'in_progress',   -- in_progress | completed | expired
  completed_at      TIMESTAMPTZ,
  reward_voucher_id UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS mission_progress_customer_idx
  ON mission_progress (customer_id);
-- At most one in-flight cycle per (mission, customer).
CREATE UNIQUE INDEX IF NOT EXISTS mission_progress_active_uniq
  ON mission_progress (mission_id, customer_id)
  WHERE status = 'in_progress';

-- ----------------------------------------------------------------------------
-- 3. mission_progress_orders — audit + dedupe (an order counts once per mission)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mission_progress_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  progress_id  UUID REFERENCES mission_progress (id),
  mission_id   UUID NOT NULL REFERENCES mission_definitions (id),
  customer_id  UUID NOT NULL REFERENCES customers (id),
  order_id     UUID NOT NULL,
  counted_at   TIMESTAMPTZ NOT NULL DEFAULT now (),
  UNIQUE (mission_id, order_id)                            -- idempotency token
);

CREATE INDEX IF NOT EXISTS mission_progress_orders_order_idx
  ON mission_progress_orders (order_id);

-- ----------------------------------------------------------------------------
-- 4. vouchers — extend for non-points rewards (free cup) + provenance
-- ----------------------------------------------------------------------------
-- Defaults keep existing point-vouchers behaving exactly as before.
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS reward_type       TEXT NOT NULL DEFAULT 'amount';
                     -- 'amount' | 'free_product' | 'percent'
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS reward_product_id  UUID;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS reward_category_id UUID;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS discount_percent   NUMERIC;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS max_discount       NUMERIC;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS min_spend          NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS source             TEXT;   -- points|mission|coupon|review
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS source_ref         TEXT;   -- e.g. mission/coupon code
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS excludes_mission   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS issue_event_key    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_issue_event_key_uniq
  ON vouchers (issue_event_key)
  WHERE issue_event_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. RPC: mission_record_purchase — advisory-locked count/window/complete
-- ----------------------------------------------------------------------------
-- Mirrors redeem_loyalty_points' locking discipline. All counting/window logic
-- runs here (never in JS) so two concurrent settlements can't double-count.
-- Qualification (weekday/min-spend/coupon-exclusivity) is decided by the CALLER
-- before invoking this — this RPC only counts a purchase already deemed eligible.
CREATE OR REPLACE FUNCTION mission_record_purchase (
  p_mission_id  UUID,
  p_customer_id UUID,
  p_order_id    UUID,
  p_order_at    TIMESTAMPTZ,
  p_window_days INTEGER,
  p_threshold   INTEGER,
  p_repeatable  BOOLEAN
) RETURNS TABLE (progress_id UUID, cycle_index INTEGER, completed BOOLEAN, already_counted BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  v_prog       mission_progress;
  v_next_cycle INTEGER;
  v_completed  BOOLEAN := false;
BEGIN
  PERFORM pg_advisory_xact_lock (hashtext (p_customer_id::text || p_mission_id::text));

  -- Idempotency: an order counts at most once per mission.
  INSERT INTO mission_progress_orders (mission_id, customer_id, order_id)
    VALUES (p_mission_id, p_customer_id, p_order_id)
    ON CONFLICT (mission_id, order_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::INTEGER, false, true;
    RETURN;
  END IF;

  -- Non-repeatable + already completed once → do not open a new cycle.
  IF NOT p_repeatable AND EXISTS (
      SELECT 1 FROM mission_progress
      WHERE mission_id = p_mission_id AND customer_id = p_customer_id
        AND status = 'completed'
  ) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::INTEGER, false, false;
    RETURN;
  END IF;

  -- Current in-flight cycle (if any).
  SELECT * INTO v_prog FROM mission_progress
    WHERE mission_id = p_mission_id AND customer_id = p_customer_id
      AND status = 'in_progress'
    LIMIT 1;

  IF v_prog.id IS NULL OR p_order_at > v_prog.window_end_at THEN
    -- Expire a lapsed cycle, then open a fresh one starting at this purchase.
    IF v_prog.id IS NOT NULL THEN
      UPDATE mission_progress SET status = 'expired', updated_at = now ()
        WHERE id = v_prog.id;
    END IF;
    SELECT COALESCE(MAX(cycle_index), -1) + 1 INTO v_next_cycle
      FROM mission_progress
      WHERE mission_id = p_mission_id AND customer_id = p_customer_id;
    INSERT INTO mission_progress (
      mission_id, customer_id, cycle_index, window_start_at, window_end_at, count, status
    ) VALUES (
      p_mission_id, p_customer_id, v_next_cycle, p_order_at,
      p_order_at + make_interval (days => p_window_days), 1, 'in_progress'
    ) RETURNING * INTO v_prog;
  ELSE
    UPDATE mission_progress
      SET count = count + 1, updated_at = now ()
      WHERE id = v_prog.id
      RETURNING * INTO v_prog;
  END IF;

  UPDATE mission_progress_orders SET progress_id = v_prog.id
    WHERE mission_id = p_mission_id AND order_id = p_order_id;

  IF v_prog.count >= p_threshold THEN
    UPDATE mission_progress
      SET status = 'completed', completed_at = now (), updated_at = now ()
      WHERE id = v_prog.id;
    v_completed := true;
  END IF;

  RETURN QUERY SELECT v_prog.id, v_prog.cycle_index, v_completed, false;
END;
$$;

-- Only the service role should call this (mirrors the loyalty RPC hardening).
REVOKE ALL ON FUNCTION
  mission_record_purchase (UUID, UUID, UUID, TIMESTAMPTZ, INTEGER, INTEGER, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. RLS — deny anon/authenticated; the app uses the service role (bypasses RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE mission_definitions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_progress_orders ENABLE ROW LEVEL SECURITY;
-- No policies → no anon/authenticated access. Service role bypasses RLS.

-- ----------------------------------------------------------------------------
-- 7. Seed the two confirmed missions (inactive-safe: edit/enable in admin later)
-- ----------------------------------------------------------------------------
INSERT INTO mission_definitions (code, name, description, type, threshold, window_days, weekday, reward_points, reward_free_label)
  VALUES ('m4in8', 'Beli 4 kali (8 hari)', 'Beli 4 kali dalam 8 hari — dapat 1 cup percuma + 150 point.',
          'count_in_window', 4, 8, NULL, 150, '1 Cup Percuma')
  ON CONFLICT (code) DO NOTHING;

INSERT INTO mission_definitions (code, name, description, type, threshold, window_days, weekday, reward_points, reward_free_label)
  VALUES ('m2tue', 'Selasa Special (2 kali)', 'Beli 2 kali pada hari Selasa (dalam 8 hari) — dapat 1 cup percuma.',
          'count_on_weekday_in_window', 2, 8, 2, 0, '1 Cup Percuma (Selasa)')
  ON CONFLICT (code) DO NOTHING;
