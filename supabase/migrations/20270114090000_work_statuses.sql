-- Statuses a Space defines for itself.
--
-- An Object and a Strategy each stand in one of five stages — backlog,
-- planned, in progress, completed, canceled — and that stage is what lists,
-- boards and reports go by. Within a stage a Space can add statuses of its
-- own ("Waiting on legal" under planned), and give the stage's own status
-- another name, icon or colour. `work_statuses` holds both: a row with
-- `builtin` is the Space's look for a stage's own status, the rest are the
-- statuses it added. Objects and Strategies share one set (scope 'work');
-- Elements have their own stages and so their own set (scope 'element').
--
-- A row's stage is always set (`work_stage`); `work_status_id` names the
-- status within it, or is null for the stage's own. The two are kept in
-- step here, so no writer can leave them disagreeing.
--
-- Guarded: the tables this touches live outside this migration.

do $$
declare
  v_first_time boolean;
begin
  if to_regclass('public.activity_spaces') is null or to_regclass('public.objects') is null
     or to_regclass('public.strategies') is null or to_regclass('public.domains') is null
     or to_regprocedure('public.is_activity_space_member(uuid)') is null then
    raise notice 'work statuses skipped: spaces, objects or strategies not present';
    return;
  end if;

  execute $ddl$
    create table if not exists public.work_statuses (
      id uuid primary key default gen_random_uuid(),
      activity_space_id uuid not null references public.activity_spaces(id) on delete cascade,
      scope text not null check (scope in ('work', 'element')),
      stage text not null,
      builtin boolean not null default false,
      name text not null check (length(btrim(name)) between 1 and 60),
      icon text check (icon is null or length(icon) <= 12000),
      color text check (color is null or length(color) <= 32),
      order_index double precision not null default 0,
      created_by uuid default auth.uid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint work_statuses_stage_check check (
        (scope = 'work' and stage in ('backlog', 'planned', 'in_progress', 'completed', 'canceled'))
        or (scope = 'element' and stage in ('backlog', 'todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled'))
      )
    )
  $ddl$;
  execute 'create unique index if not exists work_statuses_builtin_once on public.work_statuses (activity_space_id, scope, stage) where builtin';
  execute 'create index if not exists work_statuses_space on public.work_statuses (activity_space_id, scope)';

  execute 'alter table public.work_statuses enable row level security';
  execute 'drop policy if exists work_statuses_read on public.work_statuses';
  execute 'drop policy if exists work_statuses_write on public.work_statuses';
  execute 'create policy work_statuses_read on public.work_statuses for select to authenticated
    using (public.is_activity_space_member(activity_space_id))';
  execute 'create policy work_statuses_write on public.work_statuses for all to authenticated
    using (public.is_activity_space_member(activity_space_id))
    with check (public.is_activity_space_member(activity_space_id))';
  execute 'grant select, insert, update, delete on public.work_statuses to authenticated';

  -- Objects and Strategies: the stage, and the status within it.
  select not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'objects' and column_name = 'work_stage'
  ) into v_first_time;
  execute $ddl$alter table public.objects
    add column if not exists work_stage text not null default 'backlog'
      check (work_stage in ('backlog', 'planned', 'in_progress', 'completed', 'canceled')),
    add column if not exists work_status_id uuid references public.work_statuses(id) on delete set null$ddl$;
  execute $ddl$alter table public.strategies
    add column if not exists work_stage text not null default 'backlog'
      check (work_stage in ('backlog', 'planned', 'in_progress', 'completed', 'canceled')),
    add column if not exists work_status_id uuid references public.work_statuses(id) on delete set null$ddl$;

  -- The first time only, start what already exists where it stands: a
  -- Strategy by its old status, an Object by its Elements (all of them done:
  -- completed; any of them under way or done: in progress; else backlog).
  -- Filled in quietly, with the tables' own triggers off for the moment: no
  -- row's updated_at moves and no guard or notice runs for a column that
  -- was not there a moment ago.
  if v_first_time then
    execute 'alter table public.strategies disable trigger user';
    execute 'alter table public.objects disable trigger user';
    execute $sql$
      update public.strategies set work_stage = case status
        when 'active' then 'in_progress' when 'completed' then 'completed'
        when 'archived' then 'canceled' when 'paused' then 'planned' else 'backlog' end
    $sql$;
    if to_regclass('public.elements') is not null then
      execute $sql$
        update public.objects o set work_stage = x.stage
        from (
          select e.object_id,
            case
              when count(*) filter (where e.status <> 'cancelled') > 0
                   and count(*) filter (where e.status not in ('done', 'cancelled')) = 0 then 'completed'
              when count(*) filter (where e.status in ('in_progress', 'review', 'done', 'blocked')) > 0 then 'in_progress'
              else 'backlog'
            end as stage
          from public.elements e where e.object_id is not null group by e.object_id
        ) x
        where x.object_id = o.id and x.stage <> 'backlog'
      $sql$;
    end if;
    execute 'alter table public.strategies enable trigger user';
    execute 'alter table public.objects enable trigger user';
  end if;

  -- Keep the stage and the status in step: a status brings its stage with
  -- it, and a stage changed on its own lets go of a status of another one.
  execute $fn$
    create or replace function public.work_status_in_step() returns trigger
    language plpgsql set search_path = '' as $body$
    declare
      v_stage text;
    begin
      if new.work_status_id is not null then
        select s.stage into v_stage from public.work_statuses s
          where s.id = new.work_status_id and s.scope = 'work';
        if v_stage is null then
          new.work_status_id := null;
        elsif tg_op = 'UPDATE' and new.work_status_id is not distinct from old.work_status_id
              and new.work_stage is distinct from old.work_stage then
          -- The stage was moved by itself: the old status no longer applies.
          if new.work_stage <> v_stage then new.work_status_id := null; end if;
        else
          new.work_stage := v_stage;
        end if;
      end if;
      return new;
    end
    $body$
  $fn$;
  execute 'revoke all on function public.work_status_in_step() from public, anon, authenticated';
  execute 'drop trigger if exists objects_work_status_in_step on public.objects';
  execute 'create trigger objects_work_status_in_step before insert or update of work_stage, work_status_id on public.objects
    for each row execute function public.work_status_in_step()';
  execute 'drop trigger if exists strategies_work_status_in_step on public.strategies';
  execute 'create trigger strategies_work_status_in_step before insert or update of work_stage, work_status_id on public.strategies
    for each row execute function public.work_status_in_step()';
end $$;
