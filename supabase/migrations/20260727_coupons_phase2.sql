-- ============================================================================
-- LokaPOS — Smart Loyalty Fasa 2: Coupons + mutual exclusivity
--
-- Admin defines coupon TEMPLATES. After a qualifying purchase, a coupon is
-- auto-issued to the customer as a `vouchers` row (source='coupon',
-- excludes_mission=true) — so redeeming a coupon on a later order removes that
-- order from mission progress (handled by lib/missions.ts).
--
-- Idempotent / re-runnable. Apply MANUALLY in the Supabase SQL editor.
-- Requires 20260727_missions_phase1.sql first (it extends `vouchers`).
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupon_templates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  code                   TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,
  description            TEXT,
  active                 BOOLEAN NOT NULL DEFAULT true,
  discount_type          TEXT NOT NULL DEFAULT 'percent',   -- 'percent' | 'fixed'
  discount_value         NUMERIC NOT NULL DEFAULT 0,        -- 10 (%) or 5 (RM)
  max_discount           NUMERIC,                           -- cap for percent
  applies_to             TEXT NOT NULL DEFAULT 'all',       -- 'all' | 'product' | 'category'
  product_id             UUID,
  category_id            UUID,
  min_spend              NUMERIC NOT NULL DEFAULT 0,        -- redemption threshold
  validity_days          INTEGER NOT NULL DEFAULT 14,       -- issued-coupon lifetime
  issue_trigger          TEXT NOT NULL DEFAULT 'on_paid',   -- when to auto-issue
  issue_min_spend        NUMERIC NOT NULL DEFAULT 0,        -- min order total to issue
  one_active_per_customer BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now (),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now ()
);

ALTER TABLE coupon_templates ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated denied. App uses service role (bypasses RLS).

-- Demo template (kept ready; coupons stay dormant until loyalty_config.couponsEnabled
-- is turned on by the owner). Owner can edit / add category-specific ones later.
INSERT INTO coupon_templates (code, name, description, discount_type, discount_value, max_discount, applies_to, validity_days, issue_min_spend)
  VALUES ('WELCOME10', '10% Diskaun', '10% off pembelian seterusnya (maks RM5).',
          'percent', 10, 5, 'all', 14, 0)
  ON CONFLICT (code) DO NOTHING;
