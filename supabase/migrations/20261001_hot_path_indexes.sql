-- Indexes for the lookups the busiest screens run all day.
--
-- Supabase warned the project is depleting its Disk IO budget. The KDS reads
-- order_items by order_id every poll, the POS reads today's orders every 15s,
-- and loyalty reads a customer's ledger on every checkout — none of those
-- foreign-key columns had an index, so each read scanned the whole table.
--
-- Each index is only created when no existing index already leads with that
-- column (some may have been added from the dashboard), so nothing is
-- duplicated. Missing tables/columns are skipped. Safe to re-run.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('order_items',        'order_id',      'order_items_order_id_idx',          '(order_id)'),
      ('order_item_addons',  'order_item_id', 'order_item_addons_order_item_idx',  '(order_item_id)'),
      ('loyalty_ledger',     'customer_id',   'loyalty_ledger_customer_created_idx','(customer_id, created_at)'),
      ('orders',             'customer_id',   'orders_customer_created_idx',       '(customer_id, created_at DESC)'),
      ('orders',             'created_at',    'orders_created_at_idx',             '(created_at DESC)'),
      ('customers',          'phone',         'customers_phone_idx',               '(phone)'),
      ('customers',          'user_id',       'customers_user_id_idx',             '(user_id)'),
      ('mission_progress',   'customer_id',   'mission_progress_customer_idx',     '(customer_id)'),
      ('vouchers',           'redeemed_order_id', 'vouchers_redeemed_order_idx',   '(redeemed_order_id)')
    ) AS v(tbl, lead_col, idx, cols)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = ('public.' || r.tbl)::regclass AND a.attname = r.lead_col AND NOT a.attisdropped
    ) THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = ('public.' || r.tbl)::regclass AND a.attname = r.lead_col
    ) THEN CONTINUE; END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I %s', r.idx, r.tbl, r.cols);
    RAISE NOTICE 'created %', r.idx;
  END LOOP;
END $$;

-- Fresh planner statistics so the new indexes are used straight away.
ANALYZE public.orders;
ANALYZE public.order_items;
