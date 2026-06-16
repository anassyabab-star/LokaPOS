-- Expenses module for management spending records (monthly outflow / P&L support)
-- Safe to re-run (idempotent).

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  category text not null default 'other',
  description text not null,
  vendor_name text,
  payment_method text not null default 'bank_transfer',
  invoice_number text,
  invoice_url text,
  invoice_file_name text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.expenses
  add column if not exists invoice_file_name text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_category_chk'
  ) then
    alter table public.expenses
      add constraint expenses_category_chk
      check (category in ('inventory', 'equipment', 'utilities', 'rent', 'salary', 'maintenance', 'marketing', 'other'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_payment_method_chk'
  ) then
    alter table public.expenses
      add constraint expenses_payment_method_chk
      check (payment_method in ('cash_drawer', 'bank_transfer', 'card', 'online', 'other'));
  end if;
end $$;

create index if not exists expenses_expense_date_idx
  on public.expenses(expense_date desc);

create index if not exists expenses_category_date_idx
  on public.expenses(category, expense_date desc);

create index if not exists expenses_payment_date_idx
  on public.expenses(payment_method, expense_date desc);

create index if not exists expenses_created_by_date_idx
  on public.expenses(created_by, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_expenses_set_updated_at'
  ) then
    create trigger trg_expenses_set_updated_at
    before update on public.expenses
    for each row
    execute function public.set_updated_at();
  end if;
end $$;
