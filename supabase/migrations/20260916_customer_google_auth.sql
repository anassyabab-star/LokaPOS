-- ============================================================================
-- LokaPOS — Google sign-in for customers + role-default hardening.
-- Idempotent: safe to run more than once in the Supabase SQL editor.
--
--   1. customers.user_id  → hard link between auth.users and the customer row
--                            (backfilled from the legacy user_metadata.customer_id)
--   2. Profile trigger    → new auth users default to role 'customer', and ONLY
--                            app_metadata.role (service-role writable) can grant
--                            staff. Previously any OAuth signup became 'cashier'
--                            with full POS/KDS access.
--   3. current_app_role() → same default for RLS helpers.
--
-- Supabase dashboard steps (not SQL): enable the Google provider under
-- Authentication → Providers, and add <site>/auth/callback (plus
-- http://localhost:3000/auth/callback) under Authentication → URL Configuration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. customers.user_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_uq
  ON public.customers (user_id) WHERE user_id IS NOT NULL;

-- Backfill from the soft link the members PWA has been writing into auth metadata.
UPDATE public.customers c
   SET user_id = u.id
  FROM auth.users u
 WHERE c.user_id IS NULL
   AND (u.raw_user_meta_data ->> 'customer_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND (u.raw_user_meta_data ->> 'customer_id')::uuid = c.id
   AND NOT EXISTS (SELECT 1 FROM public.customers x WHERE x.user_id = u.id);

-- ---------------------------------------------------------------------------
-- 2. Profile trigger: default 'customer'; trust app_metadata.role only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  desired_role text;
BEGIN
  -- raw_user_meta_data is user-writable (signUp options / auth.updateUser) and
  -- must never decide staff access. Staff are provisioned by admins, who set
  -- app_metadata.role through the service role.
  desired_role := lower(coalesce(new.raw_app_meta_data ->> 'role', 'customer'));

  IF desired_role NOT IN ('admin', 'cashier', 'customer') THEN
    desired_role := 'customer';
  END IF;

  INSERT INTO public.profiles (id, full_name, role, status, created_at, updated_at)
  VALUES (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))), ''),
    desired_role,
    'active',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();

  RETURN new;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_sync_profile') THEN
    CREATE TRIGGER on_auth_user_created_sync_profile
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_auth_users();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. RLS role helper: unknown users are customers, not cashiers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NULL THEN 'anonymous'
      ELSE coalesce((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), 'customer')
    END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Safety sweep: OAuth-only accounts that the old default graded 'cashier'
--    without any admin-granted role are demoted to 'customer'.
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
   SET role = 'customer', updated_at = now()
  FROM auth.users u
 WHERE p.id = u.id
   AND p.role = 'cashier'
   AND coalesce(u.raw_app_meta_data ->> 'role', '') = ''
   AND coalesce(u.raw_app_meta_data ->> 'provider', '') NOT IN ('', 'email')
   AND u.encrypted_password IS NULL;
