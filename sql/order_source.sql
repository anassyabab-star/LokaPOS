-- Add order source tracking so staff can distinguish POS vs Web App orders.
-- Safe to run multiple times.

alter table public.orders
add column if not exists order_source text;

update public.orders
set order_source = case
  when coalesce(lower(payment_method), '') = 'fpx' then 'customer_web'
  else 'pos'
end
where coalesce(order_source, '') = '';

alter table public.orders
alter column order_source set default 'pos';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_order_source_check'
  ) then
    alter table public.orders
    add constraint orders_order_source_check
    check (order_source in ('pos', 'customer_web'));
  end if;
end $$;

create index if not exists idx_orders_order_source
on public.orders(order_source);
