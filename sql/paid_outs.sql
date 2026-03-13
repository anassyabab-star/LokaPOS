-- Paid Outs (cash keluar dari drawer untuk belian segera)
-- Safe to re-run (idempotent).

create extension if not exists pgcrypto;

create table if not exists public.paid_outs (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.pos_shifts(id) on delete cascade,
  register_id text not null,
  amount numeric(12,2) not null check (amount > 0),
  staff_name text not null,
  reason text not null,
  vendor_name text,
  invoice_number text,
  invoice_url text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table if exists public.paid_outs
  add column if not exists staff_name text,
  add column if not exists vendor_name text,
  add column if not exists invoice_number text,
  add column if not exists invoice_url text,
  add column if not exists notes text;

update public.paid_outs
set staff_name = 'Unknown'
where staff_name is null or btrim(staff_name) = '';

alter table if exists public.paid_outs
  alter column staff_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'paid_outs_staff_name_chk'
  ) then
    alter table public.paid_outs
      add constraint paid_outs_staff_name_chk
      check (length(btrim(staff_name)) > 0);
  end if;
end $$;

create index if not exists paid_outs_shift_created_idx
  on public.paid_outs(shift_id, created_at desc);

create index if not exists paid_outs_register_created_idx
  on public.paid_outs(register_id, created_at desc);

create index if not exists paid_outs_created_by_created_idx
  on public.paid_outs(created_by, created_at desc);
