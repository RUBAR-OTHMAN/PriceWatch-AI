-- PriceWatch AI secure per-user schema for Supabase.
--
-- This migration upgrades the prototype shared tables to owner-scoped tables.
-- If legacy rows already exist, assign tracked_items.user_id values before
-- enforcing NOT NULL; shared anonymous rows cannot be made secure automatically.

begin;

create extension if not exists pgcrypto;

create table if not exists public.tracked_items (
  id uuid primary key default gen_random_uuid()
);

alter table public.tracked_items
  add column if not exists user_id uuid default auth.uid(),
  add column if not exists title text,
  add column if not exists url text,
  add column if not exists current_price numeric(10,2),
  add column if not exists target_price numeric(10,2),
  add column if not exists currency text default 'USD',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists last_checked_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tracked_items'
      and column_name = 'price'
  ) then
    execute $sql$
      update public.tracked_items
      set current_price = round(
        (substring(regexp_replace(price::text, ',', '', 'g') from '-?[0-9]+(?:\.[0-9]+)?'))::numeric,
        2
      )
      where current_price is null
        and substring(regexp_replace(price::text, ',', '', 'g') from '-?[0-9]+(?:\.[0-9]+)?') is not null
    $sql$;
  end if;
end $$;

do $$
begin
  if exists (select 1 from public.tracked_items where user_id is null) then
    raise exception
      'tracked_items contains rows without user_id. Backfill each row to an auth.users(id) value before applying the secure schema.';
  end if;

  if exists (select 1 from public.tracked_items where title is null) then
    raise exception 'tracked_items.title must be populated before enforcing NOT NULL.';
  end if;

  if exists (select 1 from public.tracked_items where url is null) then
    raise exception 'tracked_items.url must be populated before enforcing NOT NULL.';
  end if;

  if exists (select 1 from public.tracked_items where current_price is null) then
    raise exception 'tracked_items.current_price must be populated before enforcing NOT NULL.';
  end if;
end $$;

update public.tracked_items
set
  currency = coalesce(currency, 'USD'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.tracked_items
  alter column user_id set not null,
  alter column title set not null,
  alter column url set not null,
  alter column current_price set not null,
  alter column currency set default 'USD',
  alter column currency set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracked_items_user_id_fkey'
      and conrelid = 'public.tracked_items'::regclass
  ) then
    alter table public.tracked_items
      add constraint tracked_items_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from public.tracked_items
    group by user_id, url
    having count(*) > 1
  ) then
    raise exception 'Duplicate tracked_items found for the same user_id and url. Remove duplicates before adding the unique constraint.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracked_items_user_id_url_key'
      and conrelid = 'public.tracked_items'::regclass
  ) then
    alter table public.tracked_items
      add constraint tracked_items_user_id_url_key unique (user_id, url);
  end if;
end $$;

alter table public.tracked_items
  drop column if exists price;

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  tracked_item_id uuid not null references public.tracked_items(id) on delete cascade,
  price numeric(10,2),
  checked_at timestamptz default now()
);

alter table public.price_history
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists tracked_item_id uuid,
  add column if not exists price numeric(10,2),
  add column if not exists checked_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'price_history'
      and column_name = 'price'
      and data_type <> 'numeric'
  ) then
    alter table public.price_history
      alter column price type numeric(10,2)
      using round(
        (substring(regexp_replace(price::text, ',', '', 'g') from '-?[0-9]+(?:\.[0-9]+)?'))::numeric,
        2
      );
  end if;
end $$;

do $$
begin
  if exists (select 1 from public.price_history where tracked_item_id is null) then
    raise exception 'price_history.tracked_item_id must be populated before enforcing NOT NULL.';
  end if;

  if exists (select 1 from public.price_history where price is null) then
    raise exception 'price_history.price must be populated before enforcing NOT NULL.';
  end if;
end $$;

update public.price_history
set
  id = coalesce(id, gen_random_uuid()),
  checked_at = coalesce(checked_at, now());

alter table public.price_history
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column tracked_item_id set not null,
  alter column price set not null,
  alter column checked_at set default now(),
  alter column checked_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where contype = 'p'
      and conrelid = 'public.price_history'::regclass
  ) then
    alter table public.price_history
      add constraint price_history_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_history_tracked_item_id_fkey'
      and conrelid = 'public.price_history'::regclass
  ) then
    alter table public.price_history
      add constraint price_history_tracked_item_id_fkey
      foreign key (tracked_item_id) references public.tracked_items(id) on delete cascade;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tracked_items_updated_at on public.tracked_items;
create trigger set_tracked_items_updated_at
  before update on public.tracked_items
  for each row
  execute function public.set_updated_at();

create index if not exists tracked_items_user_id_created_at_idx
  on public.tracked_items (user_id, created_at desc);

create index if not exists price_history_tracked_item_id_checked_at_idx
  on public.price_history (tracked_item_id, checked_at desc);

alter table public.tracked_items enable row level security;
alter table public.price_history enable row level security;
alter table public.tracked_items force row level security;
alter table public.price_history force row level security;

drop policy if exists "tracked_items_select_own" on public.tracked_items;
drop policy if exists "tracked_items_insert_own" on public.tracked_items;
drop policy if exists "tracked_items_update_own" on public.tracked_items;
drop policy if exists "tracked_items_delete_own" on public.tracked_items;

create policy "tracked_items_select_own"
  on public.tracked_items
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "tracked_items_insert_own"
  on public.tracked_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "tracked_items_update_own"
  on public.tracked_items
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tracked_items_delete_own"
  on public.tracked_items
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "price_history_select_for_owned_items" on public.price_history;
drop policy if exists "price_history_insert_for_owned_items" on public.price_history;
drop policy if exists "price_history_delete_for_owned_items" on public.price_history;

create policy "price_history_select_for_owned_items"
  on public.price_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tracked_items
      where tracked_items.id = price_history.tracked_item_id
        and tracked_items.user_id = auth.uid()
    )
  );

create policy "price_history_insert_for_owned_items"
  on public.price_history
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tracked_items
      where tracked_items.id = price_history.tracked_item_id
        and tracked_items.user_id = auth.uid()
    )
  );

create policy "price_history_delete_for_owned_items"
  on public.price_history
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.tracked_items
      where tracked_items.id = price_history.tracked_item_id
        and tracked_items.user_id = auth.uid()
    )
  );

revoke all on public.tracked_items from anon;
revoke all on public.price_history from anon;
grant select, insert, update, delete on public.tracked_items to authenticated;
grant select, insert, delete on public.price_history to authenticated;

commit;
