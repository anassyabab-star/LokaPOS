-- ============================================================================
-- Phone lookup index.
--
-- NOTE: customers.phone ALREADY carries a unique constraint in this database
-- (customers_phone_uq) — discovered when the backfill hit 23505 on it. That
-- constraint was never the protection it looked like: it compares the literal
-- string, and the QR ordering app stored "60XXXXXXXXX" while the POS, OTP and
-- import paths stored "0XXXXXXXXX", so the same person passed it happily with
-- two rows and a split points balance.
--
-- The actual fix is lib/phone.ts, which gives every entry point one canonical
-- form ("0XXXXXXXXX"); with that in place the existing constraint finally does
-- what it appears to do. This migration only adds the lookup index, and
-- creates the unique constraint for a database that somehow lacks it.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- Phone lookups happen on every order, OTP request and coupon check.
CREATE INDEX IF NOT EXISTS customers_phone_idx
  ON public.customers (phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

DO $$
DECLARE
  dupes int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(phone)%'
  ) OR EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'customers' AND indexname = 'customers_phone_uidx'
  ) THEN
    RAISE NOTICE 'customers.phone is already unique — nothing to do.';
    RETURN;
  END IF;

  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM public.customers
    WHERE phone IS NOT NULL AND btrim(phone) <> ''
    GROUP BY phone HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE NOTICE 'customers.phone still has % duplicated value(s) — unique index skipped. Run scripts/normalize-customer-phones.mjs --apply first.', dupes;
  ELSE
    CREATE UNIQUE INDEX customers_phone_uidx
      ON public.customers (phone)
      WHERE phone IS NOT NULL AND btrim(phone) <> '';
    RAISE NOTICE 'customers_phone_uidx created.';
  END IF;
END $$;
