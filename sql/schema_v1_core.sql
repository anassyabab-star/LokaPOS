-- Core DB schema v1 for:
-- 1) Auth + Role
-- 2) Customer + Consent
-- 3) Loyalty ledger
-- 4) CRM campaign foundation (ready for next step)
--
-- Safe to re-run (idempotent).

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Shared trigger function: updated_at touch
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Auth / Role
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'cashier',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table if exists public.profiles
  add column if not exists full_name text,
  add column if not exists role text not null default 'cashier',
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_chk'
  ) then
    alter table public.profiles
      add constraint profiles_role_chk
      check (role in ('admin', 'cashier', 'customer'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_status_chk'
  ) then
    alter table public.profiles
      add constraint profiles_status_chk
      check (status in ('active', 'inactive'));
  end if;
end $$;

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_status_idx on public.profiles(status);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_profiles_set_updated_at'
  ) then
    create trigger trg_profiles_set_updated_at
    before update on public.profiles
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- Auto-create profile from auth.users (fallback role = cashier).
create or replace function public.sync_profile_from_auth_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_role text;
begin
  desired_role := lower(
    coalesce(
      new.raw_app_meta_data ->> 'role',
      new.raw_user_meta_data ->> 'role',
      'cashier'
    )
  );

  if desired_role not in ('admin', 'cashier', 'customer') then
    desired_role := 'cashier';
  end if;

  insert into public.profiles (id, full_name, role, status, created_at, updated_at)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))), ''),
    desired_role,
    'active',
    now(),
    now()
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    updated_at = now();

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created_sync_profile'
  ) then
    create trigger on_auth_user_created_sync_profile
    after insert on auth.users
    for each row
    execute function public.sync_profile_from_auth_users();
  end if;
end $$;

-- ------------------------------------------------------------
-- Signup requests (admin approval flow)
-- ------------------------------------------------------------
create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  requested_role text not null check (requested_role in ('admin', 'cashier', 'customer')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text
);

alter table if exists public.signup_requests
  add column if not exists phone text,
  add column if not exists request_source text not null default 'web',
  add column if not exists approved_user_id uuid references auth.users(id),
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists review_note text;

create index if not exists signup_requests_status_idx on public.signup_requests(status);
create index if not exists signup_requests_requested_at_idx
  on public.signup_requests(requested_at desc);
create unique index if not exists signup_requests_email_pending_uq
  on public.signup_requests (lower(email))
  where status = 'pending';

-- ------------------------------------------------------------
-- Customers + Consent
-- ------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  birth_date date,
  consent_whatsapp boolean not null default false,
  consent_email boolean not null default false,
  consent_whatsapp_at timestamptz,
  consent_email_at timestamptz,
  consent_source text,
  total_orders integer not null default 0,
  total_spend numeric(12,2) not null default 0,
  last_order_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.customers
  add column if not exists birth_date date,
  add column if not exists consent_source text,
  add column if not exists total_orders integer not null default 0,
  add column if not exists total_spend numeric(12,2) not null default 0,
  add column if not exists last_order_at timestamptz,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists customers_email_uq
  on public.customers (lower(email))
  where email is not null and email <> '';

create unique index if not exists customers_phone_uq
  on public.customers (phone)
  where phone is not null and phone <> '';

create index if not exists customers_last_order_at_idx
  on public.customers (last_order_at desc);
create index if not exists customers_name_idx on public.customers (lower(name));
create index if not exists customers_created_at_idx on public.customers (created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_customers_set_updated_at'
  ) then
    create trigger trg_customers_set_updated_at
    before update on public.customers
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- ------------------------------------------------------------
-- Loyalty ledger
-- ------------------------------------------------------------
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  entry_type text not null check (entry_type in ('earn', 'redeem', 'adjust')),
  points_change integer not null check (points_change <> 0),
  expires_at timestamptz,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table if exists public.loyalty_ledger
  add column if not exists expires_at timestamptz,
  add column if not exists note text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now();

create index if not exists loyalty_ledger_customer_created_idx
  on public.loyalty_ledger(customer_id, created_at desc);
create index if not exists loyalty_ledger_order_idx
  on public.loyalty_ledger(order_id);
create index if not exists loyalty_ledger_expires_idx
  on public.loyalty_ledger(expires_at);

create or replace view public.customer_loyalty_balances as
select
  customer_id,
  coalesce(sum(points_change), 0)::integer as points_balance,
  max(created_at) as last_activity_at
from public.loyalty_ledger
group by customer_id;

-- 1-year window balance (used for expiry-driven campaign/visibility).
create or replace view public.customer_loyalty_balances_1y as
select
  customer_id,
  coalesce(
    sum(
      case
        when created_at >= now() - interval '365 days' then points_change
        else 0
      end
    ),
    0
  )::integer as points_balance_1y,
  coalesce(
    sum(
      case
        when points_change > 0
          and created_at >= now() - interval '365 days'
          and created_at < now() - interval '335 days'
        then points_change
        else 0
      end
    ),
    0
  )::integer as expiring_points_30d
from public.loyalty_ledger
group by customer_id;

-- ------------------------------------------------------------
-- CRM Campaign foundation (send queue + logs)
-- ------------------------------------------------------------
create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('whatsapp', 'email', 'multi')),
  segment_type text not null check (segment_type in ('active_30d', 'inactive_60d', 'birthday_month', 'manual')),
  message_template text not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'running', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_campaigns_status_idx on public.crm_campaigns(status);
create index if not exists crm_campaigns_scheduled_at_idx on public.crm_campaigns(scheduled_at);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_crm_campaigns_set_updated_at'
  ) then
    create trigger trg_crm_campaigns_set_updated_at
    before update on public.crm_campaigns
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.crm_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.crm_campaigns(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'email')),
  destination text not null,
  consent_snapshot boolean not null default false,
  send_status text not null default 'queued'
    check (send_status in ('queued', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_campaign_recipients_campaign_idx
  on public.crm_campaign_recipients(campaign_id, send_status);
create index if not exists crm_campaign_recipients_customer_idx
  on public.crm_campaign_recipients(customer_id, created_at desc);
create unique index if not exists crm_campaign_recipients_dedupe_uq
  on public.crm_campaign_recipients(campaign_id, customer_id, channel)
  where customer_id is not null;

-- Segment helper for admin preview:
create or replace view public.crm_customer_segments as
select
  c.id as customer_id,
  c.name,
  c.phone,
  c.email,
  c.birth_date,
  c.last_order_at,
  c.total_orders,
  c.total_spend,
  c.consent_whatsapp,
  c.consent_email,
  (c.last_order_at is not null and c.last_order_at >= now() - interval '30 days') as is_active_30d,
  (c.last_order_at is null or c.last_order_at < now() - interval '60 days') as is_inactive_60d,
  (
    c.birth_date is not null and
    extract(month from c.birth_date) = extract(month from now())
  ) as is_birthday_month
from public.customers c;

