-- PriceWatch AI compatibility migration for existing prototype databases.
--
-- Use this if the secure migration rolled back because old prototype rows exist.
-- It adds the columns required by the current extension code without failing on
-- legacy rows. New rows inserted by the extension will include user_id.

create extension if not exists pgcrypto;

alter table public.tracked_items
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists current_price numeric(10,2),
  add column if not exists target_price numeric(10,2),
  add column if not exists currency text default 'USD',
  add column if not exists updated_at timestamptz default now(),
  add column if not exists last_checked_at timestamptz;

update public.tracked_items
set currency = coalesce(currency, 'USD');

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tracked_items'
      and column_name = 'price'
  ) then
    alter table public.tracked_items
      alter column price drop not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tracked_items'
      and column_name = 'price'
  ) then
    update public.tracked_items
    set current_price = coalesce(
      current_price,
      round(
        (substring(regexp_replace(price::text, ',', '', 'g') from '-?[0-9]+(?:\.[0-9]+)?'))::numeric,
        2
      )
    )
    where substring(regexp_replace(price::text, ',', '', 'g') from '-?[0-9]+(?:\.[0-9]+)?') is not null;
  end if;
end $$;

delete from public.price_history
where price is null
   or substring(regexp_replace(price::text, ',', '', 'g') from '-?[0-9]+(?:\.[0-9]+)?') is null;

alter table public.price_history
  alter column price type numeric(10,2)
  using round(
    (substring(regexp_replace(price::text, ',', '', 'g') from '-?[0-9]+(?:\.[0-9]+)?'))::numeric,
    2
  );

create unique index if not exists tracked_items_user_id_url_key
  on public.tracked_items (user_id, url)
  where user_id is not null;

create index if not exists tracked_items_user_id_created_at_idx
  on public.tracked_items (user_id, created_at desc);

create index if not exists price_history_tracked_item_id_checked_at_idx
  on public.price_history (tracked_item_id, checked_at desc);

alter table public.tracked_items enable row level security;
alter table public.price_history enable row level security;

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

grant select, insert, update, delete on public.tracked_items to authenticated;
grant select, insert, delete on public.price_history to authenticated;
