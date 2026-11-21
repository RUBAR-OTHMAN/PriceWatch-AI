-- Dashboard → SQL Editor → New query → paste and run.

create table if not exists public.tracked_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  price text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  tracked_item_id uuid not null references public.tracked_items(id) on delete cascade,
  price text not null,
  checked_at timestamptz not null default now()
);

-- Optional: enable Row Level Security (RLS) and add policies as needed.
-- alter table public.tracked_items enable row level security;
-- alter table public.price_history enable row level security;
