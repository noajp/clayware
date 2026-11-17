-- Vision: the top of Strategy, as a Domain is the top of Execution. A Vision
-- is not nested; it holds Portfolios (today's strategies, which nest), and
-- every Portfolio belongs to exactly one Vision. A Vision has members and
-- roles as a Domain does (owner / admin / member / viewer) and a privacy:
-- 'workspace' lets every member of the Space read it, 'private' only its
-- members. A Portfolio can also hold Domains (strategy_domains), beside the
-- Objects it holds already (strategy_objects).
--
-- Writes that do not name a Vision yet (older clients, the AI's tools) land
-- in the Space's first Vision, made on the spot when the Space has none, so
-- every Portfolio has one from the start.
--
-- Guarded: preview branches replay this on an empty database.

do $$
begin
  if to_regclass('public.strategies') is null or to_regclass('public.activity_spaces') is null
     or to_regclass('public.domains') is null then
    raise notice 'visions skipped: base tables not present'; return;
  end if;

  execute $sql$
    create table if not exists public.visions (
      id uuid primary key default gen_random_uuid(),
      activity_space_id uuid not null references public.activity_spaces(id) on delete cascade,
      name text not null check (length(btrim(name)) > 0),
      description text,
      icon text,
      color text,
      privacy text not null default 'workspace' check (privacy in ('workspace', 'private')),
      order_index double precision,
      created_by uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $sql$;
  execute 'create index if not exists visions_space_idx on public.visions (activity_space_id, order_index)';

  execute $sql$
    create table if not exists public.vision_members (
      vision_id uuid not null references public.visions(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
      created_at timestamptz not null default now(),
      primary key (vision_id, user_id)
    )
  $sql$;
  execute 'create index if not exists vision_members_user_idx on public.vision_members (user_id)';

  -- Who may see and who may run a Vision.
  execute $sql$
    create or replace function public.user_has_vision_role(_vision_id uuid, _roles text[])
    returns boolean language sql stable security definer set search_path to 'public' as $f$
      select exists (select 1 from public.vision_members
                      where vision_id = _vision_id and user_id = auth.uid() and role = any(_roles));
    $f$
  $sql$;
  execute $sql$
    create or replace function public.user_can_see_vision(_vision_id uuid)
    returns boolean language sql stable security definer set search_path to 'public' as $f$
      select exists (
        select 1 from public.visions v
        where v.id = _vision_id
          and (exists (select 1 from public.vision_members m
                        where m.vision_id = v.id and m.user_id = auth.uid())
               or (v.privacy = 'workspace' and public.is_activity_space_member(v.activity_space_id)))
      );
    $f$
  $sql$;

  execute 'alter table public.visions enable row level security';
  execute 'alter table public.vision_members enable row level security';
  execute 'drop policy if exists visions_select on public.visions';
  execute 'create policy visions_select on public.visions for select using (public.user_can_see_vision(id))';
  execute 'drop policy if exists visions_insert on public.visions';
  execute $sql$create policy visions_insert on public.visions for insert with check (
    (select auth.uid()) is not null and created_by = (select auth.uid())
    and public.is_activity_space_member(activity_space_id))$sql$;
  execute 'drop policy if exists visions_update on public.visions';
  execute $sql$create policy visions_update on public.visions for update
    using (public.user_has_vision_role(id, array['owner', 'admin']))
    with check (public.is_activity_space_member(activity_space_id))$sql$;
  execute 'drop policy if exists visions_delete on public.visions';
  execute $sql$create policy visions_delete on public.visions for delete
    using (public.user_has_vision_role(id, array['owner']))$sql$;

  execute 'drop policy if exists vision_members_select on public.vision_members';
  execute $sql$create policy vision_members_select on public.vision_members for select
    using (user_id = (select auth.uid()) or public.user_can_see_vision(vision_id))$sql$;
  execute 'drop policy if exists vision_members_insert on public.vision_members';
  execute $sql$create policy vision_members_insert on public.vision_members for insert with check (
    public.user_has_vision_role(vision_id, array['owner', 'admin'])
    or (user_id = (select auth.uid()) and role = 'member' and public.user_can_see_vision(vision_id)))$sql$;
  execute 'drop policy if exists vision_members_update on public.vision_members';
  execute $sql$create policy vision_members_update on public.vision_members for update
    using (public.user_has_vision_role(vision_id, array['owner', 'admin']))$sql$;
  execute 'drop policy if exists vision_members_delete on public.vision_members';
  execute $sql$create policy vision_members_delete on public.vision_members for delete
    using (user_id = (select auth.uid()) or public.user_has_vision_role(vision_id, array['owner', 'admin']))$sql$;

  -- Whoever makes a Vision runs it.
  execute $sql$
    create or replace function alcon_internal.enrol_vision_creator()
    returns trigger language plpgsql security definer set search_path to '' as $f$
    begin
      if auth.uid() is not null then
        insert into public.vision_members (vision_id, user_id, role)
        values (new.id, auth.uid(), 'owner') on conflict do nothing;
      end if;
      return new;
    end $f$
  $sql$;
  execute 'drop trigger if exists visions_enrol_creator on public.visions';
  execute 'create trigger visions_enrol_creator after insert on public.visions for each row execute function alcon_internal.enrol_vision_creator()';

  execute $sql$
    create or replace function alcon_internal.touch_updated_at()
    returns trigger language plpgsql set search_path to '' as $f$
    begin new.updated_at := now(); return new; end $f$
  $sql$;
  execute 'drop trigger if exists visions_touch on public.visions';
  execute 'create trigger visions_touch before update on public.visions for each row execute function alcon_internal.touch_updated_at()';

  -- A Vision that still holds Portfolios is not deleted (as a Domain that
  -- holds Objects is not): the Portfolios' foreign key restricts it.
  execute 'alter table public.strategies add column if not exists vision_id uuid references public.visions(id) on delete restrict';
  execute 'create index if not exists strategies_vision_idx on public.strategies (vision_id)';

  -- Every Space that has Strategies gets one Vision, named after it and run
  -- by the Space's owners; its Strategies become its Portfolios.
  execute $sql$
    insert into public.visions (activity_space_id, name, created_by, order_index)
    select sp.id, sp.name, sp.created_by, 0
      from public.activity_spaces sp
     where exists (select 1 from public.strategies s where s.activity_space_id = sp.id)
       and not exists (select 1 from public.visions v where v.activity_space_id = sp.id)
  $sql$;
  execute $sql$
    insert into public.vision_members (vision_id, user_id, role)
    select v.id, m.user_id, 'owner'
      from public.visions v
      join public.activity_space_members m on m.activity_space_id = v.activity_space_id and m.role = 'owner'
    on conflict do nothing
  $sql$;
  execute $sql$
    update public.strategies s
       set vision_id = (select v.id from public.visions v where v.activity_space_id = s.activity_space_id
                         order by v.order_index nulls last, v.created_at limit 1)
     where s.vision_id is null and s.activity_space_id is not null
  $sql$;

  -- A Portfolio written without a Vision lands in its Space's first one
  -- (made when there is none); its Space follows its Vision.
  execute $sql$
    create or replace function alcon_internal.strategy_into_vision()
    returns trigger language plpgsql security definer set search_path to '' as $f$
    declare _space uuid;
    begin
      if new.vision_id is not null then
        select v.activity_space_id into _space from public.visions v where v.id = new.vision_id;
        new.activity_space_id := _space;
        return new;
      end if;
      if new.activity_space_id is null then
        raise exception 'A Portfolio belongs to a Vision; name one.' using errcode = '23502';
      end if;
      select v.id into new.vision_id from public.visions v
       where v.activity_space_id = new.activity_space_id
       order by v.order_index nulls last, v.created_at limit 1;
      if new.vision_id is null then
        insert into public.visions (activity_space_id, name, created_by, order_index)
        select sp.id, sp.name, auth.uid(), 0 from public.activity_spaces sp where sp.id = new.activity_space_id
        returning id into new.vision_id;
      end if;
      return new;
    end $f$
  $sql$;
  execute 'drop trigger if exists strategies_into_vision on public.strategies';
  execute 'create trigger strategies_into_vision before insert or update of vision_id, activity_space_id on public.strategies for each row execute function alcon_internal.strategy_into_vision()';

  if not exists (select 1 from public.strategies where vision_id is null) then
    execute 'alter table public.strategies alter column vision_id set not null';
  else
    raise notice 'strategies.vision_id left nullable: some Strategies have no Space';
  end if;

  -- A Portfolio holds Domains as well as Objects.
  execute $sql$
    create table if not exists public.strategy_domains (
      strategy_id uuid not null references public.strategies(id) on delete cascade,
      domain_id uuid not null references public.domains(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (strategy_id, domain_id)
    )
  $sql$;
  execute 'create index if not exists strategy_domains_domain_idx on public.strategy_domains (domain_id)';
  execute 'alter table public.strategy_domains enable row level security';
  execute 'drop policy if exists strategy_domains_select on public.strategy_domains';
  execute $sql$create policy strategy_domains_select on public.strategy_domains for select
    using (public.user_can_read_strategy(strategy_id) and public.user_can_see_domain(domain_id))$sql$;
  execute 'drop policy if exists strategy_domains_insert on public.strategy_domains';
  execute $sql$create policy strategy_domains_insert on public.strategy_domains for insert
    with check (alcon_internal.user_can_edit_strategy(strategy_id) and public.user_can_see_domain(domain_id))$sql$;
  execute 'drop policy if exists strategy_domains_delete on public.strategy_domains';
  execute $sql$create policy strategy_domains_delete on public.strategy_domains for delete
    using (alcon_internal.user_can_edit_strategy(strategy_id) and public.user_can_see_domain(domain_id))$sql$;
end $$;
