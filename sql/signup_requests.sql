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

create index if not exists signup_requests_status_idx on public.signup_requests(status);
create index if not exists signup_requests_requested_at_idx on public.signup_requests(requested_at desc);
create unique index if not exists signup_requests_email_pending_uq
  on public.signup_requests (lower(email))
  where status = 'pending';
