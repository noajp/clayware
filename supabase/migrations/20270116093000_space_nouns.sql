-- What a Space calls Strategy, Object and Element.
--
-- `nouns` holds the Space's own words, singular and plural
-- ({"element": "Task", "elements": "Tasks", "object": "プロジェクト"}); a
-- word left out is the built-in one. The app puts them into its labels
-- (web/src/Function/i18n/spaceNouns.ts); data, ids and what AI reads keep
-- the built-in names. Changed by the Space's owner, like its name and logo
-- (the existing owner-only update policy on activity_spaces).
--
-- Guarded: activity_spaces lives outside this migration.

do $$
begin
  if to_regclass('public.activity_spaces') is null then
    raise notice 'space nouns skipped: activity_spaces not present';
    return;
  end if;

  execute $fn$
    create or replace function public.space_nouns_valid(p jsonb) returns boolean
    language sql immutable set search_path = '' as $body$
      select jsonb_typeof(p) = 'object'
        and not exists (
          select 1 from jsonb_each(p) e
          where e.key not in ('strategy', 'strategies', 'object', 'objects', 'element', 'elements')
             or jsonb_typeof(e.value) <> 'string'
             or char_length(e.value #>> '{}') not between 1 and 40
        )
    $body$
  $fn$;

  execute 'alter table public.activity_spaces
    add column if not exists nouns jsonb not null default ''{}''::jsonb';
  if not exists (select 1 from pg_constraint where conname = 'activity_spaces_nouns_valid') then
    execute 'alter table public.activity_spaces
      add constraint activity_spaces_nouns_valid check (public.space_nouns_valid(nouns))';
  end if;
end $$;
