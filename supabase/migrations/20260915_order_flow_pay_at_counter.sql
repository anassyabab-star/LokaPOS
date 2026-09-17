-- ============================================================================
-- LokaPOS — Pay-at-counter order flow (QR order → bayar kaunter → meja/buzzer
-- → Kitchen Display → completed).
--
-- Idempotent: safe to run more than once in the Supabase SQL editor.
--
-- What it does:
--   1. orders: order_type / table_number / buzzer_number / paid_at / completed_at
--   2. backfill paid_at / completed_at for historical rows; move today's unpaid
--      web orders to the new `awaiting_payment` status (older unpaid ones are
--      closed as cancelled, status only — no stock/loyalty side effects)
--   3. store_settings: dine_in_tables (jsonb array), unpaid_order_expiry_minutes,
--      and turn the Kitchen Display flow ON
--   4. atomic daily receipt numbering (receipt_counters + get_next_receipt_number)
--   5. unique index on orders.receipt_number (skipped if duplicates already exist)
--
-- BEFORE RUNNING: if a DB-only get_next_receipt_number already exists, check it
--   select pg_get_functiondef('public.get_next_receipt_number'::regproc);
-- This migration drops and recreates the (text) signature.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. orders columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type    text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_number  text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buzzer_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at       timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at  timestamptz;

-- Customer journey columns (originally 20260727_order_journey_phase3.sql).
-- Re-declared here so this migration works even if that one was never applied.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_stage text DEFAULT 'received';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at          timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS picked_up_at      timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reviewed_at       timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_type_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_type_check
      CHECK (order_type IS NULL OR order_type IN ('dine_in', 'take_away'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. backfill
-- ---------------------------------------------------------------------------
UPDATE public.orders
   SET paid_at = created_at
 WHERE paid_at IS NULL AND payment_status = 'paid';

UPDATE public.orders
   SET completed_at = COALESCE(picked_up_at, created_at)
 WHERE completed_at IS NULL AND status = 'completed';

-- (orders.date_key is a DATE column — compare as dates, Malaysia business day.)
-- Unpaid customer-web orders placed TODAY → awaiting_payment (cashier collects).
UPDATE public.orders
   SET status = 'awaiting_payment'
 WHERE status = 'pending'
   AND payment_status = 'pending'
   AND order_source = 'customer_web'
   AND date_key::date = (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;

-- Older unpaid customer-web orders were abandoned → close them (status only).
UPDATE public.orders
   SET status = 'cancelled'
 WHERE status = 'pending'
   AND payment_status = 'pending'
   AND order_source = 'customer_web'
   AND date_key::date < (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;

CREATE INDEX IF NOT EXISTS orders_date_key_status_idx ON public.orders (date_key, status);
CREATE INDEX IF NOT EXISTS orders_status_paid_at_idx  ON public.orders (status, paid_at);

-- ---------------------------------------------------------------------------
-- 3. store_settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS dine_in_tables jsonb NOT NULL
  DEFAULT '["1","2","3","4","5","6","7","8","9","10","11","12"]'::jsonb;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS unpaid_order_expiry_minutes integer NOT NULL DEFAULT 30;

-- KDS toggle column (originally 20260616_kds_toggle.sql) — re-declared here so
-- this migration works even if that one was never applied.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS kds_enabled boolean NOT NULL DEFAULT false;

-- The owner's flow uses the Kitchen Display — turn it on.
UPDATE public.store_settings SET kds_enabled = true WHERE id = 'main';

-- ---------------------------------------------------------------------------
-- 4. atomic daily receipt numbering
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.receipt_counters (
  date_key   text PRIMARY KEY,
  last_seq   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;  -- service role only

-- Seed counters from existing receipts so new numbers never collide.
-- (counter key is the ISO day as text, e.g. '2026-09-15')
INSERT INTO public.receipt_counters (date_key, last_seq)
SELECT to_char(date_key::date, 'YYYY-MM-DD'), MAX((regexp_match(receipt_number, '-(\d+)$'))[1]::int)
  FROM public.orders
 WHERE date_key IS NOT NULL AND receipt_number ~ '-\d+$'
 GROUP BY to_char(date_key::date, 'YYYY-MM-DD')
ON CONFLICT (date_key) DO UPDATE
   SET last_seq = GREATEST(receipt_counters.last_seq, EXCLUDED.last_seq);

-- Drop every earlier overload (a DB-only version may take a DATE), otherwise
-- PostgREST cannot pick one and the app falls back to count+1 numbering.
DROP FUNCTION IF EXISTS public.get_next_receipt_number(text);
DROP FUNCTION IF EXISTS public.get_next_receipt_number(date);
DROP FUNCTION IF EXISTS public.get_next_receipt_number();

CREATE OR REPLACE FUNCTION public.get_next_receipt_number(p_date_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  INSERT INTO public.receipt_counters (date_key, last_seq)
  VALUES (p_date_key, 1)
  ON CONFLICT (date_key) DO UPDATE
    SET last_seq = receipt_counters.last_seq + 1,
        updated_at = now()
  RETURNING last_seq INTO v_seq;

  RETURN to_char(p_date_key::date, 'DDMMYYYY') || '-' || lpad(v_seq::text, 3, '0');
END
$$;

REVOKE ALL ON FUNCTION public.get_next_receipt_number(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_receipt_number(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. unique receipt_number (only when no pre-existing duplicates)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
     WHERE receipt_number IS NOT NULL
     GROUP BY receipt_number HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'orders.receipt_number has duplicates — unique index skipped; dedupe then re-run this block';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS orders_receipt_number_uidx ON public.orders (receipt_number);
  END IF;
END $$;
