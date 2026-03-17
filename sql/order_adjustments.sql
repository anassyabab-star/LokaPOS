-- Order adjustments audit (void / refund)
-- Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.order_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  action text not null check (action in ('void', 'refund')),
  amount numeric(12,2) not null default 0,
  reason text not null,
  approved_by uuid null references auth.users(id) on delete set null,
  approved_role text null,
  approval_level text not null default 'auto' check (approval_level in ('auto', 'manager_pin', 'admin')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_adjustments_order_id_idx
  on public.order_adjustments(order_id, created_at desc);

create index if not exists order_adjustments_action_idx
  on public.order_adjustments(action, created_at desc);

