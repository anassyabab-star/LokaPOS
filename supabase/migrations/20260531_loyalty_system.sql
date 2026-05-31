-- ============================================================================
-- LokaPOS — Unified Loyalty System
-- Fasa 1–8: economy unification, vouchers, OTP auth, expiry cron, tiers,
-- referral/birthday, admin dashboard.
--
-- Idempotent / re-runnable: every statement guards with IF NOT EXISTS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. loyalty_ledger — add source + event_key for idempotency & reporting
-- ----------------------------------------------------------------------------
-- entry_type stays the accounting primitive ('earn' | 'redeem' | 'adjust').
-- source classifies WHY ('order' | 'checkin' | 'voucher' | 'expiry'
--   | 'referral' | 'birthday' | 'manual').
-- event_key is a globally-unique idempotency key (NULL = not deduped).

ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS event_key TEXT;
ALTER TABLE loyalty_ledger ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_event_key_uniq
  ON loyalty_ledger (event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS loyalty_ledger_customer_created_idx
  ON loyalty_ledger (customer_id, created_at);

-- ----------------------------------------------------------------------------
-- 2. customers — referral + birthday support
-- ----------------------------------------------------------------------------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES customers (id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS customers_referral_code_uniq
  ON customers (referral_code)
  WHERE referral_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. store_settings — loyalty_config JSONB (single source of truth)
-- ----------------------------------------------------------------------------
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS loyalty_config JSONB;

-- ----------------------------------------------------------------------------
-- 4. vouchers — real redeemable vouchers (redeem mode #2)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vouchers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  code              TEXT NOT NULL UNIQUE,
  customer_id       UUID REFERENCES customers (id),
  status            TEXT NOT NULL DEFAULT 'issued', -- issued | redeemed | expired
  points_spent      INTEGER NOT NULL DEFAULT 0,
  reward_amount     NUMERIC NOT NULL DEFAULT 0,
  reward_label      TEXT,
  ledger_id         UUID,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now (),
  expires_at        TIMESTAMPTZ,
  redeemed_at       TIMESTAMPTZ,
  redeemed_order_id UUID
);

CREATE INDEX IF NOT EXISTS vouchers_customer_idx ON vouchers (customer_id);
CREATE INDEX IF NOT EXISTS vouchers_status_idx ON vouchers (status);

-- ----------------------------------------------------------------------------
-- 5. otp_codes — phone OTP for public redeem / check-in
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS otp_codes_phone_created_idx ON otp_codes (phone, created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. RPC: redeem_loyalty_points — atomic, never lets net balance go negative
-- ----------------------------------------------------------------------------
-- Uses a per-customer transactional advisory lock so concurrent redeems can't
-- both pass the balance check (anti double-spend). Guard is the strict
-- non-negative invariant on the FULL ledger net (expiry adjustments already
-- decrement it, so net == true available balance).
CREATE OR REPLACE FUNCTION redeem_loyalty_points (
  p_customer_id UUID,
  p_points      INTEGER,
  p_order_id    UUID,
  p_source      TEXT,
  p_note        TEXT,
  p_event_key   TEXT
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_available INTEGER;
BEGIN
  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN 0;
  END IF;

  PERFORM pg_advisory_xact_lock (hashtext (p_customer_id::text));

  -- Idempotency: if this event_key was already recorded, this is a retry —
  -- return the current net balance without inserting a duplicate redeem.
  IF p_event_key IS NOT NULL
     AND EXISTS (SELECT 1 FROM loyalty_ledger WHERE event_key = p_event_key) THEN
    SELECT COALESCE(SUM(points_change), 0) INTO v_available
      FROM loyalty_ledger
      WHERE customer_id = p_customer_id;
    RETURN v_available;
  END IF;

  SELECT COALESCE(SUM(points_change), 0) INTO v_available
    FROM loyalty_ledger
    WHERE customer_id = p_customer_id;

  IF v_available < p_points THEN
    RAISE EXCEPTION 'INSUFFICIENT_POINTS available=% requested=%', v_available, p_points
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO loyalty_ledger (
    customer_id, order_id, entry_type, points_change, source, note, event_key
  ) VALUES (
    p_customer_id, p_order_id, 'redeem', -p_points, p_source, p_note, p_event_key
  );

  RETURN v_available - p_points;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: issue_loyalty_voucher — atomic (ledger redeem + voucher in one tx)
-- ----------------------------------------------------------------------------
-- Caller generates p_code and retries on unique violation (whole tx rolls back,
-- so the ledger redeem is never orphaned).
CREATE OR REPLACE FUNCTION issue_loyalty_voucher (
  p_customer_id UUID,
  p_points      INTEGER,
  p_amount      NUMERIC,
  p_label       TEXT,
  p_code        TEXT,
  p_expires_at  TIMESTAMPTZ
) RETURNS vouchers
LANGUAGE plpgsql AS $$
DECLARE
  v_available INTEGER;
  v_ledger_id UUID;
  v_voucher   vouchers;
BEGIN
  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION 'INVALID_POINTS' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock (hashtext (p_customer_id::text));

  SELECT COALESCE(SUM(points_change), 0) INTO v_available
    FROM loyalty_ledger
    WHERE customer_id = p_customer_id;

  IF v_available < p_points THEN
    RAISE EXCEPTION 'INSUFFICIENT_POINTS available=% requested=%', v_available, p_points
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO loyalty_ledger (
    customer_id, entry_type, points_change, source, note
  ) VALUES (
    p_customer_id, 'redeem', -p_points, 'voucher', 'Voucher ' || p_code
  ) RETURNING id INTO v_ledger_id;

  INSERT INTO vouchers (
    code, customer_id, status, points_spent, reward_amount, reward_label,
    ledger_id, expires_at
  ) VALUES (
    p_code, p_customer_id, 'issued', p_points, p_amount, p_label,
    v_ledger_id, p_expires_at
  ) RETURNING * INTO v_voucher;

  RETURN v_voucher;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: redeem_voucher_code — atomic issued -> redeemed transition
-- ----------------------------------------------------------------------------
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
    RETURNING * INTO v_voucher;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VOUCHER_NOT_REDEEMABLE' USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_voucher;
END;
$$;
