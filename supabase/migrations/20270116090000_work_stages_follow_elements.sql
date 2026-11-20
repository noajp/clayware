-- Objects and Strategies go through the same stages as an Element.
--
-- An Object's or a Strategy's `work_stage` (and the stage of a status the
-- Space added for them, work_statuses scope 'work') is one of the seven an
-- Element's status has: backlog, todo, in_progress, review, done, blocked,
-- cancelled. Every surface draws and names them the same way.
--
-- What stood in the earlier five moves over: planned → todo,
-- completed → done, canceled → cancelled (backlog and in_progress are the
-- same word). A writer that still sends one of the earlier names — an app
-- tab opened before this change — is read the same way, so nothing it saves
-- is refused or lost.
--
-- Guarded: the tables this touches live outside this migration.

do $$
begin
  if to_regclass('public.work_statuses') is null or to_regclass('public.objects') is null
     or to_regclass('public.strategies') is null then
    raise notice 'work stages skipped: work_statuses, objects or strategies not present';
    return;
  end if;

  -- The earlier names, read as the stage they became.
  execute $fn$
    create or replace function public.work_stage_of(p_stage text) returns text
    language sql immutable set search_path = '' as $body$
      select case p_stage
        when 'planned' then 'todo'
        when 'completed' then 'done'
        when 'canceled' then 'cancelled'
        else p_stage end
    $body$
  $fn$;

  execute 'alter table public.work_statuses drop constraint if exists work_statuses_stage_check';
  execute 'alter table public.objects drop constraint if exists objects_work_stage_check';
  execute 'alter table public.strategies drop constraint if exists strategies_work_stage_check';

  -- Move what stands in the earlier names, quietly: the tables' own
  -- triggers are off for the moment, so no row's updated_at moves and no
  -- notice runs for a rename. The statuses first, so a row's status and
  -- stage still agree when the rows move.
  execute 'alter table public.work_statuses disable trigger user';
  execute $sql$update public.work_statuses set stage = public.work_stage_of(stage)
    where scope = 'work' and stage in ('planned', 'completed', 'canceled')$sql$;
  execute 'alter table public.work_statuses enable trigger user';
  execute 'alter table public.objects disable trigger user';
  execute $sql$update public.objects set work_stage = public.work_stage_of(work_stage)
    where work_stage in ('planned', 'completed', 'canceled')$sql$;
  execute 'alter table public.objects enable trigger user';
  execute 'alter table public.strategies disable trigger user';
  execute $sql$update public.strategies set work_stage = public.work_stage_of(work_stage)
    where work_stage in ('planned', 'completed', 'canceled')$sql$;
  execute 'alter table public.strategies enable trigger user';

  execute $sql$alter table public.work_statuses add constraint work_statuses_stage_check
    check (scope in ('work', 'element') and stage in ('backlog', 'todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled'))$sql$;
  execute $sql$alter table public.objects add constraint objects_work_stage_check
    check (work_stage in ('backlog', 'todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled'))$sql$;
  execute $sql$alter table public.strategies add constraint strategies_work_stage_check
    check (work_stage in ('backlog', 'todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled'))$sql$;

  -- A status the Space adds under an earlier name lands in the stage it became.
  execute $fn$
    create or replace function public.work_status_stage_name() returns trigger
    language plpgsql set search_path = '' as $body$
    begin
      if new.scope = 'work' then new.stage := public.work_stage_of(new.stage); end if;
      return new;
    end
    $body$
  $fn$;
  execute 'revoke all on function public.work_status_stage_name() from public, anon, authenticated';
  execute 'drop trigger if exists work_statuses_stage_name on public.work_statuses';
  execute 'create trigger work_statuses_stage_name before insert or update of stage, scope on public.work_statuses
    for each row execute function public.work_status_stage_name()';

  -- Keep the stage and the status in step, reading an earlier name first:
  -- a status brings its stage with it, and a stage changed on its own lets
  -- go of a status of another one.
  execute $fn$
    create or replace function public.work_status_in_step() returns trigger
    language plpgsql set search_path = '' as $body$
    declare
      v_stage text;
    begin
      new.work_stage := public.work_stage_of(new.work_stage);
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
end $$;
