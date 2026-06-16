create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  consent_whatsapp boolean not null default false,
  consent_email boolean not null default false,
  consent_whatsapp_at timestamptz,
  consent_email_at timestamptz,
  total_orders integer not null default 0,
  total_spend numeric(12,2) not null default 0,
  last_order_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_email_uq
  on public.customers (lower(email))
  where email is not null and email <> '';

create unique index if not exists customers_phone_uq
  on public.customers (phone)
  where phone is not null and phone <> '';

create index if not exists customers_last_order_at_idx
  on public.customers (last_order_at desc);
