-- Backend Readiness Hardening
-- Purpose:
-- 1) Freeze + normalize core columns used by app API
-- 2) Add defensive indexes/constraints for scale
-- 3) Enable RLS with least-privilege policies before customer order app
--
-- Safe to re-run (idempotent).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Role helpers used by RLS policies
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then 'anonymous'
      else coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'cashier')
    end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin';
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'cashier');
$$;

grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Compatibility + schema freeze for order flow
-- ---------------------------------------------------------------------
alter table if exists public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

alter table if exists public.signup_requests
  add column if not exists approved_user_id uuid references auth.users(id);

alter table if exists public.products
  add column if not exists is_active boolean default true;

alter table if exists public.order_items
  add column if not exists sugar_level text;

do $$
begin
  if to_regclass('public.order_items') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_items_sugar_level_chk'
        and conrelid = 'public.order_items'::regclass
    ) then
      alter table public.order_items
        add constraint order_items_sugar_level_chk
        check (sugar_level is null or lower(sugar_level) in ('normal', 'less', 'half', 'none'));
    end if;
  end if;
end $$;

alter table if exists public.order_item_addons
  add column if not exists order_item_id uuid,
  add column if not exists addon_name_snapshot text,
  add column if not exists addon_price_snapshot numeric(12,2);

do $$
begin
  if to_regclass('public.order_item_addons') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'order_item_addons'
         and column_name = 'order_item_id'
     ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'order_item_addons_order_item_id_fkey'
        and conrelid = 'public.order_item_addons'::regclass
    ) then
      alter table public.order_item_addons
        add constraint order_item_addons_order_item_id_fkey
        foreign key (order_item_id)
        references public.order_items(id)
        on delete cascade
        not valid;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Indexes for reporting, customer history, and queueing
-- ---------------------------------------------------------------------
create index if not exists orders_created_at_idx
  on public.orders(created_at desc);

create index if not exists orders_date_key_idx
  on public.orders(date_key);

create index if not exists orders_receipt_number_idx
  on public.orders(receipt_number);

create index if not exists orders_customer_id_created_at_idx
  on public.orders(customer_id, created_at desc)
  where customer_id is not null;

create index if not exists orders_status_payment_idx
  on public.orders(status, payment_method, created_at desc);

create index if not exists order_items_order_id_idx
  on public.order_items(order_id);

create index if not exists order_items_product_id_idx
  on public.order_items(product_id);

create index if not exists order_items_variant_id_idx
  on public.order_items(variant_id)
  where variant_id is not null;

create index if not exists order_items_sugar_level_idx
  on public.order_items(sugar_level)
  where sugar_level is not null;

create index if not exists pos_shifts_register_status_opened_idx
  on public.pos_shifts(register_id, status, opened_at desc);

create index if not exists products_active_category_idx
  on public.products(is_active, category_id, created_at desc);

create index if not exists product_variants_product_id_idx
  on public.product_variants(product_id);

create index if not exists product_addons_product_id_idx
  on public.product_addons(product_id);

-- order_item_addons can vary by legacy schema. Index whichever column exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_item_addons' and column_name = 'order_item_id'
  ) then
    execute 'create index if not exists order_item_addons_order_item_id_idx on public.order_item_addons(order_item_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_item_addons' and column_name = 'order_item'
  ) then
    execute 'create index if not exists order_item_addons_order_item_idx on public.order_item_addons(order_item)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_item_addons' and column_name = 'order_items_id'
  ) then
    execute 'create index if not exists order_item_addons_order_items_id_idx on public.order_item_addons(order_items_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_item_addons' and column_name = 'addon_id'
  ) then
    execute 'create index if not exists order_item_addons_addon_id_idx on public.order_item_addons(addon_id)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RLS: enable and apply least-privilege baseline
-- ---------------------------------------------------------------------

-- profiles
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'alter table public.profiles enable row level security';

    EXECUTE 'drop policy if exists profiles_select_own on public.profiles';
    EXECUTE 'create policy profiles_select_own on public.profiles
      for select to authenticated
      using (id = auth.uid())';

    EXECUTE 'drop policy if exists profiles_select_admin on public.profiles';
    EXECUTE 'create policy profiles_select_admin on public.profiles
      for select to authenticated
      using (public.is_admin())';

    EXECUTE 'drop policy if exists profiles_update_own on public.profiles';
    EXECUTE 'create policy profiles_update_own on public.profiles
      for update to authenticated
      using (id = auth.uid())
      with check (id = auth.uid())';
  END IF;
END $$;

-- signup_requests
DO $$
BEGIN
  IF to_regclass('public.signup_requests') IS NOT NULL THEN
    EXECUTE 'alter table public.signup_requests enable row level security';

    EXECUTE 'drop policy if exists signup_requests_insert_public on public.signup_requests';
    EXECUTE 'create policy signup_requests_insert_public on public.signup_requests
      for insert to anon, authenticated
      with check (
        status = ''pending''
        and reviewed_at is null
        and reviewed_by is null
        and approved_user_id is null
        and requested_role in (''admin'', ''cashier'', ''customer'')
      )';

    EXECUTE 'drop policy if exists signup_requests_admin_all on public.signup_requests';
    EXECUTE 'create policy signup_requests_admin_all on public.signup_requests
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin())';
  END IF;
END $$;

-- customers
DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    EXECUTE 'alter table public.customers enable row level security';

    EXECUTE 'drop policy if exists customers_staff_read on public.customers';
    EXECUTE 'create policy customers_staff_read on public.customers
      for select to authenticated
      using (public.is_staff())';

    EXECUTE 'drop policy if exists customers_staff_insert on public.customers';
    EXECUTE 'create policy customers_staff_insert on public.customers
      for insert to authenticated
      with check (public.is_staff())';

    EXECUTE 'drop policy if exists customers_staff_update on public.customers';
    EXECUTE 'create policy customers_staff_update on public.customers
      for update to authenticated
      using (public.is_staff())
      with check (public.is_staff())';

    EXECUTE 'drop policy if exists customers_staff_delete on public.customers';
    EXECUTE 'create policy customers_staff_delete on public.customers
      for delete to authenticated
      using (public.is_staff())';
  END IF;
END $$;

-- loyalty_ledger
DO $$
BEGIN
  IF to_regclass('public.loyalty_ledger') IS NOT NULL THEN
    EXECUTE 'alter table public.loyalty_ledger enable row level security';

    EXECUTE 'drop policy if exists loyalty_staff_read on public.loyalty_ledger';
    EXECUTE 'create policy loyalty_staff_read on public.loyalty_ledger
      for select to authenticated
      using (public.is_staff())';

    EXECUTE 'drop policy if exists loyalty_staff_write on public.loyalty_ledger';
    EXECUTE 'create policy loyalty_staff_write on public.loyalty_ledger
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- crm_campaigns
DO $$
BEGIN
  IF to_regclass('public.crm_campaigns') IS NOT NULL THEN
    EXECUTE 'alter table public.crm_campaigns enable row level security';

    EXECUTE 'drop policy if exists crm_campaigns_admin_all on public.crm_campaigns';
    EXECUTE 'create policy crm_campaigns_admin_all on public.crm_campaigns
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin())';
  END IF;
END $$;

-- crm_campaign_recipients
DO $$
BEGIN
  IF to_regclass('public.crm_campaign_recipients') IS NOT NULL THEN
    EXECUTE 'alter table public.crm_campaign_recipients enable row level security';

    EXECUTE 'drop policy if exists crm_campaign_recipients_admin_all on public.crm_campaign_recipients';
    EXECUTE 'create policy crm_campaign_recipients_admin_all on public.crm_campaign_recipients
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin())';
  END IF;
END $$;

-- pos_shifts
DO $$
BEGIN
  IF to_regclass('public.pos_shifts') IS NOT NULL THEN
    EXECUTE 'alter table public.pos_shifts enable row level security';

    EXECUTE 'drop policy if exists pos_shifts_staff_all on public.pos_shifts';
    EXECUTE 'create policy pos_shifts_staff_all on public.pos_shifts
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- orders
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'alter table public.orders enable row level security';

    EXECUTE 'drop policy if exists orders_staff_all on public.orders';
    EXECUTE 'create policy orders_staff_all on public.orders
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- order_items
DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE 'alter table public.order_items enable row level security';

    EXECUTE 'drop policy if exists order_items_staff_all on public.order_items';
    EXECUTE 'create policy order_items_staff_all on public.order_items
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- order_item_addons
DO $$
BEGIN
  IF to_regclass('public.order_item_addons') IS NOT NULL THEN
    EXECUTE 'alter table public.order_item_addons enable row level security';

    EXECUTE 'drop policy if exists order_item_addons_staff_all on public.order_item_addons';
    EXECUTE 'create policy order_item_addons_staff_all on public.order_item_addons
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- products (catalog read for authenticated users, full write for staff)
DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    EXECUTE 'alter table public.products enable row level security';

    EXECUTE 'drop policy if exists products_select_catalog on public.products';
    EXECUTE 'create policy products_select_catalog on public.products
      for select to authenticated
      using (coalesce(is_active, true) = true or public.is_staff())';

    EXECUTE 'drop policy if exists products_staff_write on public.products';
    EXECUTE 'create policy products_staff_write on public.products
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- categories (authenticated read, staff write)
DO $$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    EXECUTE 'alter table public.categories enable row level security';

    EXECUTE 'drop policy if exists categories_select_authenticated on public.categories';
    EXECUTE 'create policy categories_select_authenticated on public.categories
      for select to authenticated
      using (true)';

    EXECUTE 'drop policy if exists categories_staff_write on public.categories';
    EXECUTE 'create policy categories_staff_write on public.categories
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- product_variants (authenticated read if parent product visible, staff write)
DO $$
BEGIN
  IF to_regclass('public.product_variants') IS NOT NULL THEN
    EXECUTE 'alter table public.product_variants enable row level security';

    EXECUTE 'drop policy if exists product_variants_select_catalog on public.product_variants';
    EXECUTE 'create policy product_variants_select_catalog on public.product_variants
      for select to authenticated
      using (
        exists (
          select 1
          from public.products p
          where p.id = product_variants.product_id
            and (coalesce(p.is_active, true) = true or public.is_staff())
        )
      )';

    EXECUTE 'drop policy if exists product_variants_staff_write on public.product_variants';
    EXECUTE 'create policy product_variants_staff_write on public.product_variants
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- product_addons (authenticated read if parent product visible, staff write)
DO $$
BEGIN
  IF to_regclass('public.product_addons') IS NOT NULL THEN
    EXECUTE 'alter table public.product_addons enable row level security';

    EXECUTE 'drop policy if exists product_addons_select_catalog on public.product_addons';
    EXECUTE 'create policy product_addons_select_catalog on public.product_addons
      for select to authenticated
      using (
        exists (
          select 1
          from public.products p
          where p.id = product_addons.product_id
            and (coalesce(p.is_active, true) = true or public.is_staff())
        )
      )';

    EXECUTE 'drop policy if exists product_addons_staff_write on public.product_addons';
    EXECUTE 'create policy product_addons_staff_write on public.product_addons
      for all to authenticated
      using (public.is_staff())
      with check (public.is_staff())';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Optional verification queries (run manually after applying)
-- ---------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in
-- ('profiles','signup_requests','customers','loyalty_ledger','crm_campaigns','crm_campaign_recipients',
--  'pos_shifts','orders','order_items','order_item_addons','products','categories','product_variants','product_addons')
-- order by tablename;
--
-- select schemaname, tablename, policyname, permissive, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;
