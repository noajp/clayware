-- Work taken back out of Done picks up at 75% progress. Left at 100 the
-- Element still reads as finished wherever its mark is drawn; cleared, it
-- reads as not started. The client applies the same rule for its own writes;
-- this holds it for every writer (the board, agents, the MCP).
--
-- Guarded: elements lives outside this migration.

do $$
begin
  if to_regclass('public.elements') is null then
    raise notice 'reopened progress skipped: elements not present';
    return;
  end if;

  execute $fn$
    create or replace function public.elements_reopened_progress() returns trigger
    language plpgsql set search_path = '' as $body$
    begin
      if old.status = 'done' and new.status in ('in_progress', 'review', 'blocked')
         and (new.progress is null or new.progress >= 100) then
        new.progress := 75;
      end if;
      return new;
    end
    $body$
  $fn$;
  execute 'revoke all on function public.elements_reopened_progress() from public, anon, authenticated';
  execute 'drop trigger if exists elements_reopened_progress on public.elements';
  execute 'create trigger elements_reopened_progress before update of status on public.elements
    for each row execute function public.elements_reopened_progress()';
end $$;
