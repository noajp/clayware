-- A Sustainment's functions (billing, expenses, deals …), each one a
-- definition document in contract `sustainment/v0` (PRODUCT.md §9.4): what
-- it is for, and what it keeps — things, commitments, facts, matches, norms,
-- time, intake and approvals. A function starts as a draft and is published
-- when the team has checked it. A Sustainment also keeps what it is for.
--
-- Every member of the Space reads them; a member adds one in their own name;
-- any member edits a draft; whoever made it, or the Space's owner, publishes,
-- edits a published one or removes it.
--
-- Guarded: preview branches replay this on an empty database.

do $$
begin
  if to_regclass('public.sustainments') is null
     or to_regprocedure('public.is_activity_space_member(uuid)') is null
     or to_regprocedure('public.is_activity_space_owner(uuid)') is null then
    raise notice 'sustainment_functions skipped: sustainments or its membership functions not present'; return;
  end if;

  execute 'alter table public.sustainments add column if not exists description text';

  execute $sql$
    create table if not exists public.sustainment_functions (
      id uuid primary key default gen_random_uuid(),
      activity_space_id uuid not null references public.activity_spaces(id) on delete cascade,
      sustainment_id uuid not null references public.sustainments(id) on delete cascade,
      name text not null check (length(btrim(name)) > 0),
      icon text,
      template_key text,
      differences text,
      definition jsonb not null default '{}'::jsonb,
      status text not null default 'draft' check (status in ('draft', 'published')),
      published_at timestamptz,
      order_index double precision,
      created_by uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $sql$;
  execute 'create index if not exists sustainment_functions_sustainment_idx on public.sustainment_functions (sustainment_id, order_index)';
  execute 'create index if not exists sustainment_functions_space_idx on public.sustainment_functions (activity_space_id)';

  -- A function belongs to the Space its Sustainment is in.
  execute $sql$
    create or replace function public.sustainment_function_space_matches(p_sustainment uuid, p_space uuid)
    returns boolean language sql stable security definer set search_path = public as $f$
      select exists (select 1 from public.sustainments s where s.id = p_sustainment and s.activity_space_id = p_space)
    $f$
  $sql$;
  execute 'revoke all on function public.sustainment_function_space_matches(uuid, uuid) from public';
  execute 'grant execute on function public.sustainment_function_space_matches(uuid, uuid) to authenticated';

  execute 'alter table public.sustainment_functions enable row level security';
  execute 'drop policy if exists sustainment_functions_select on public.sustainment_functions';
  execute $sql$create policy sustainment_functions_select on public.sustainment_functions for select
    using (public.is_activity_space_member(activity_space_id))$sql$;
  execute 'drop policy if exists sustainment_functions_insert on public.sustainment_functions';
  execute $sql$create policy sustainment_functions_insert on public.sustainment_functions for insert with check (
    (select auth.uid()) is not null and created_by = (select auth.uid())
    and public.is_activity_space_member(activity_space_id)
    and public.sustainment_function_space_matches(sustainment_id, activity_space_id))$sql$;
  execute 'drop policy if exists sustainment_functions_update on public.sustainment_functions';
  execute $sql$create policy sustainment_functions_update on public.sustainment_functions for update
    using (public.is_activity_space_member(activity_space_id)
      and (status = 'draft' or created_by = (select auth.uid()) or public.is_activity_space_owner(activity_space_id)))
    with check (public.is_activity_space_member(activity_space_id)
      and public.sustainment_function_space_matches(sustainment_id, activity_space_id)
      and (status = 'draft' or created_by = (select auth.uid()) or public.is_activity_space_owner(activity_space_id)))$sql$;
  execute 'drop policy if exists sustainment_functions_delete on public.sustainment_functions';
  execute $sql$create policy sustainment_functions_delete on public.sustainment_functions for delete
    using (public.is_activity_space_member(activity_space_id)
      and (created_by = (select auth.uid()) or public.is_activity_space_owner(activity_space_id)))$sql$;

  execute 'grant select, insert, update, delete on public.sustainment_functions to authenticated';

  if to_regprocedure('alcon_internal.touch_updated_at()') is not null then
    execute 'drop trigger if exists sustainment_functions_touch on public.sustainment_functions';
    execute 'create trigger sustainment_functions_touch before update on public.sustainment_functions for each row execute function alcon_internal.touch_updated_at()';
  end if;
end $$;
