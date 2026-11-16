-- A Space's plan.
--
-- free        Up to two Domains, no Athena. Everything that runs without AI works.
-- team        ¥500 per member a month for the work itself; Athena's model use is paid on top.
-- enterprise  One fixed price however many members; Athena available, its model use settled in the contract.
--
-- Spaces that existed before plans keep working as they do: they start on
-- team. A Space made from now on starts on free. Nobody changes a plan from
-- the app — it moves only through the service (billing, or by hand), so a
-- person's own write can neither set nor change it.
--
-- The Domain limit is kept here, so no writer — the app, the API, Athena —
-- can go past it. Athena's own gate is in the Edge Functions
-- (_shared/plan.ts), which read the same column.
--
-- Guarded: the tables this touches live outside this migration.

do $$
begin
  if to_regclass('public.activity_spaces') is null or to_regclass('public.domains') is null then
    raise notice 'space plans skipped: activity_spaces or domains not present';
    return;
  end if;

  -- Existing Spaces are filled with team, then new ones default to free.
  execute 'alter table public.activity_spaces
    add column if not exists plan text not null default ''team''';
  execute 'alter table public.activity_spaces alter column plan set default ''free''';
  if not exists (select 1 from pg_constraint where conname = 'activity_spaces_plan_known') then
    execute 'alter table public.activity_spaces add constraint activity_spaces_plan_known
      check (plan in (''free'', ''team'', ''enterprise''))';
  end if;

  -- A person's write never sets or moves the plan.
  execute $fn$
    create or replace function public.space_plan_fixed() returns trigger
    language plpgsql set search_path = '' as $body$
    begin
      if auth.uid() is null then return new; end if;
      if tg_op = 'INSERT' then
        new.plan := 'free';
      elsif new.plan is distinct from old.plan then
        raise exception 'A Space''s plan cannot be changed here' using errcode = '42501';
      end if;
      return new;
    end
    $body$
  $fn$;
  execute 'revoke all on function public.space_plan_fixed() from public, anon, authenticated';
  execute 'drop trigger if exists space_plan_fixed on public.activity_spaces';
  execute 'create trigger space_plan_fixed before insert or update of plan on public.activity_spaces
    for each row execute function public.space_plan_fixed()';

  -- A free Space holds two Domains at most.
  execute $fn$
    create or replace function public.domain_within_plan() returns trigger
    language plpgsql security definer set search_path = '' as $body$
    declare
      v_plan text;
      v_count int;
    begin
      if new.activity_space_id is null then return new; end if;
      if tg_op = 'UPDATE' and new.activity_space_id is not distinct from old.activity_space_id then return new; end if;
      -- Locked, so two Domains added at once cannot both pass.
      select s.plan into v_plan from public.activity_spaces s where s.id = new.activity_space_id for update;
      if v_plan is distinct from 'free' then return new; end if;
      select count(*) into v_count from public.domains d
        where d.activity_space_id = new.activity_space_id and d.id <> new.id;
      if v_count >= 2 then
        raise exception 'The Free plan holds up to 2 Domains. Move the Space to Team to add more.'
          using errcode = 'P0001', hint = 'plan_domain_limit';
      end if;
      return new;
    end
    $body$
  $fn$;
  execute 'revoke all on function public.domain_within_plan() from public, anon, authenticated';
  execute 'drop trigger if exists domain_within_plan on public.domains';
  execute 'create trigger domain_within_plan before insert or update of activity_space_id on public.domains
    for each row execute function public.domain_within_plan()';
end $$;
