-- ============================================================================
-- LokaPOS — Smart Loyalty Fasa 3: Ordering journey (ready → pickup → review)
--
-- Adds a `fulfillment_stage` to orders (SEPARATE from `status`, so KDS logic in
-- lib/kds.ts is untouched) + an order_reviews table. A required review unlocks a
-- reward voucher (issued via lib/rewards-vouchers.ts).
--
-- Idempotent / re-runnable. Apply MANUALLY in the Supabase SQL editor.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_stage TEXT DEFAULT 'received';
                   -- 'received' | 'ready' | 'picked_up' | 'reviewed'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at      TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at  TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS order_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  order_id    UUID NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers (id),
  rating      SMALLINT NOT NULL,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS order_reviews_customer_idx ON order_reviews (customer_id);

ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated denied. App uses service role (bypasses RLS).
