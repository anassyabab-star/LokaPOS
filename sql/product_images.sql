-- Product image support for customer ordering UI
-- Safe to run multiple times

alter table if exists public.products
  add column if not exists image_url text;

comment on column public.products.image_url is
  'Optional product image URL used by POS and customer menu UI.';
