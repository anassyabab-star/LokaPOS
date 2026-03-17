create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  entry_type text not null check (entry_type in ('earn', 'redeem', 'adjust')),
  points_change integer not null check (points_change <> 0),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists loyalty_ledger_customer_created_idx
  on public.loyalty_ledger(customer_id, created_at desc);

create index if not exists loyalty_ledger_order_idx
  on public.loyalty_ledger(order_id);

create or replace view public.customer_loyalty_balances as
select
  customer_id,
  coalesce(sum(points_change), 0)::integer as points_balance,
  max(created_at) as last_activity_at
from public.loyalty_ledger
group by customer_id;
