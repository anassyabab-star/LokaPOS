create table if not exists public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  register_id text not null default 'main',
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_cash numeric(12,2) not null default 0,
  opening_note text,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  counted_cash numeric(12,2),
  expected_cash numeric(12,2),
  over_short numeric(12,2),
  closing_note text
);

create index if not exists pos_shifts_register_status_idx
  on public.pos_shifts(register_id, status);

create index if not exists pos_shifts_opened_at_idx
  on public.pos_shifts(opened_at desc);

create unique index if not exists pos_shifts_one_open_shift_per_register_uq
  on public.pos_shifts(register_id)
  where status = 'open';
