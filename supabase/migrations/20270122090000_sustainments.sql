-- Sustainment: an app a company builds for itself to keep its resources
-- right (billing, expenses, stock …), apart from Strategy and Execution
-- (PRODUCT.md §9). Each Space lists its own Sustainments on the ModeRail,
-- one button each, in order_index order. A Sustainment holds no functions
-- yet; this table is only its name, icon and place in the list.
--
-- Every member of the Space sees them; a member adds one in their own name;
-- whoever made it, or the Space's owner, renames or removes it.
--
-- Guarded: preview branches replay this on an empty database.

do $$
begin
  if to_regclass('public.activity_spaces') is null
     or to_regprocedure('public.is_activity_space_member(uuid)') is null
     or to_regprocedure('public.is_activity_space_owner(uuid)') is null then
    raise notice 'sustainments skipped: activity_spaces or its membership functions not present'; return;
  end if;

  execute $sql$
    create table if not exists public.sustainments (
      id uuid primary key default gen_random_uuid(),
      activity_space_id uuid not null references public.activity_spaces(id) on delete cascade,
      name text not null check (length(btrim(name)) > 0),
      icon text,
      order_index double precision,
      created_by uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $sql$;
  execute 'create index if not exists sustainments_space_idx on public.sustainments (activity_space_id, order_index)';

  execute 'alter table public.sustainments enable row level security';
  execute 'drop policy if exists sustainments_select on public.sustainments';
  execute $sql$create policy sustainments_select on public.sustainments for select
    using (public.is_activity_space_member(activity_space_id))$sql$;
  execute 'drop policy if exists sustainments_insert on public.sustainments';
  execute $sql$create policy sustainments_insert on public.sustainments for insert with check (
    (select auth.uid()) is not null and created_by = (select auth.uid())
    and public.is_activity_space_member(activity_space_id))$sql$;
  execute 'drop policy if exists sustainments_update on public.sustainments';
  execute $sql$create policy sustainments_update on public.sustainments for update
    using (public.is_activity_space_member(activity_space_id)
      and (created_by = (select auth.uid()) or public.is_activity_space_owner(activity_space_id)))
    with check (public.is_activity_space_member(activity_space_id))$sql$;
  execute 'drop policy if exists sustainments_delete on public.sustainments';
  execute $sql$create policy sustainments_delete on public.sustainments for delete
    using (public.is_activity_space_member(activity_space_id)
      and (created_by = (select auth.uid()) or public.is_activity_space_owner(activity_space_id)))$sql$;

  execute 'grant select, insert, update, delete on public.sustainments to authenticated';

  if to_regprocedure('alcon_internal.touch_updated_at()') is not null then
    execute 'drop trigger if exists sustainments_touch on public.sustainments';
    execute 'create trigger sustainments_touch before update on public.sustainments for each row execute function alcon_internal.touch_updated_at()';
  end if;
end $$;
