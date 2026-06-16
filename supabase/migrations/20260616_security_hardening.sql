-- ============================================================================
-- LokaPOS — Security hardening (anon/PostgREST surface).
--
-- The public anon key is shipped in the browser bundle, so anything the `anon`
-- role can do over PostgREST is reachable by any visitor. Two gaps were found
-- by probing with the anon key:
--
--   1. store_settings was WRITABLE by anon (RLS missing/permissive) — an attacker
--      could rewrite loyalty_config (earn/redeem rates), payment_methods, or
--      kds_enabled for the whole store. CONFIRMED exploitable.
--   2. The loyalty RPCs had the default PUBLIC EXECUTE grant, so anon could call
--      them directly (bypassing the API + OTP gate). Underlying-table RLS blocks
--      the writes today, but the surface/oracle should be removed.
--
-- All app access uses the service-role client, which BYPASSES RLS and retains
-- function privileges — so these changes do not affect the app.
-- Idempotent / re-runnable.
-- ============================================================================

-- 1. store_settings — lock down writes; reads stay open (config is already
--    surfaced publicly via /api/public/store-status, and is non-sensitive).
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_settings: public read" ON store_settings;
CREATE POLICY "store_settings: public read"
  ON store_settings FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policy → writes are denied for anon/authenticated.
-- The service role bypasses RLS, so admin Settings (which uses it) still writes.

-- 2. Revoke direct execution of the loyalty RPCs from the public/anon surface.
--    They are only ever called from server routes via the service role.
REVOKE ALL ON FUNCTION
  redeem_loyalty_points (UUID, INTEGER, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  issue_loyalty_voucher (UUID, INTEGER, NUMERIC, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  redeem_voucher_code (TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
