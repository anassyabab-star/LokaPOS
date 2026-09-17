-- ============================================================================
-- One customer row per phone number.
--
-- The QR ordering app stored "60XXXXXXXXX" while the POS, OTP and import paths
-- stored "0XXXXXXXXX", so the same person could hold two `customers` rows with
-- their loyalty points and order history split between them. lib/phone.ts now
-- gives every entry point one canonical form ("0XXXXXXXXX"); this index stops
-- a duplicate ever being created again.
--
-- RUN scripts/normalize-customer-phones.mjs --apply FIRST. This migration
-- refuses to create the index while duplicates remain, rather than failing
-- half way, so running it early is harmless — it just prints a notice.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

DO $$
DECLARE
  dupes int;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT 1
    FROM public.customers
    WHERE phone IS NOT NULL AND btrim(phone) <> ''
    GROUP BY phone
    HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE NOTICE 'customers.phone still has % duplicated value(s) — unique index skipped. Run scripts/normalize-customer-phones.mjs --apply, then re-run this migration.', dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_uidx
      ON public.customers (phone)
      WHERE phone IS NOT NULL AND btrim(phone) <> '';
    RAISE NOTICE 'customers_phone_uidx created.';
  END IF;
END $$;

-- Lookups by phone happen on every order, OTP and coupon check.
CREATE INDEX IF NOT EXISTS customers_phone_idx
  ON public.customers (phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';
