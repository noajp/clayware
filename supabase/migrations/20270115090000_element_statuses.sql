-- An Element's status within its stage.
--
-- An Element's `status` is its stage — one of the seven every list, board and
-- rule goes by. A Space can add statuses of its own under a stage
-- (work_statuses, scope 'element'); `status_id` names the one an Element
-- stands in, or is null for the stage's own. The two are kept in step here,
-- so no writer — the app, Athena, the API — can leave them disagreeing:
-- a status brings its stage with it, and a stage changed on its own lets go
-- of a status of another stage.
--
-- The trigger is named to sort before the other BEFORE triggers on elements
-- (they fire in name order), so the approval guard and the reopened-progress
-- rule see the stage the status brings.
--
-- Guarded: the tables this touches live outside this migration.

do $$
begin
  if to_regclass('public.elements') is null or to_regclass('public.work_statuses') is null then
    raise notice 'element statuses skipped: elements or work_statuses not present';
    return;
  end if;

  execute 'alter table public.elements
    add column if not exists status_id uuid references public.work_statuses(id) on delete set null';
  execute 'create index if not exists elements_status_id on public.elements (status_id) where status_id is not null';

  execute $fn$
    create or replace function public.element_status_in_step() returns trigger
    language plpgsql set search_path = '' as $body$
    declare
      v_stage text;
    begin
      if new.status_id is not null then
        select s.stage into v_stage from public.work_statuses s
          where s.id = new.status_id and s.scope = 'element';
        if v_stage is null then
          new.status_id := null;
        elsif tg_op = 'UPDATE' and new.status_id is not distinct from old.status_id
              and new.status is distinct from old.status then
          -- The stage was moved by itself: the old status no longer applies.
          if new.status is distinct from v_stage then new.status_id := null; end if;
        else
          new.status := v_stage;
        end if;
      end if;
      return new;
    end
    $body$
  $fn$;
  execute 'revoke all on function public.element_status_in_step() from public, anon, authenticated';
  execute 'drop trigger if exists element_status_in_step on public.elements';
  execute 'create trigger element_status_in_step before insert or update of status, status_id on public.elements
    for each row execute function public.element_status_in_step()';
end $$;
