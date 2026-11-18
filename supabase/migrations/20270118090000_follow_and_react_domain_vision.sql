-- Every concept page has the same head: its "⋯", the check that follows it,
-- and reactions under its description. Domains and Visions join what can be
-- followed (home_pins) and Visions what can be reacted to (element_reactions,
-- the sixth subject beside Elements, comments, Strategies, Objects and
-- Domains), read and written under the Vision's own visibility.
-- Guarded for preview replay: the base schema lives outside this folder.
do $$
declare
  c record;
  added text;
begin
  -- Follow: a check on home_pins.entity_type, where there is one, takes the
  -- two new kinds; the values it allowed stay allowed.
  if to_regclass('public.home_pins') is not null then
    for c in
      select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
       where conrelid = 'public.home_pins'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) like '%entity_type%'
         and pg_get_constraintdef(oid) like '%ARRAY[%'
    loop
      added := '';
      if c.def not like '%''domain''%' then added := added || '''domain''::text, '; end if;
      if c.def not like '%''vision''%' then added := added || '''vision''::text, '; end if;
      if added <> '' then
        execute format('alter table public.home_pins drop constraint %I', c.conname);
        execute format('alter table public.home_pins add constraint %I %s', c.conname,
          replace(c.def, 'ARRAY[', 'ARRAY[' || added));
      end if;
    end loop;
  end if;

  if to_regclass('public.visions') is null
     or to_regclass('public.element_reactions') is null
     or to_regprocedure('public.user_can_see_vision(uuid)') is null
     or to_regprocedure('public.user_can_read_domain(uuid)') is null
     or to_regprocedure('public.user_can_see_domain(uuid)') is null
     or to_regprocedure('public.user_can_read_object(uuid)') is null
     or to_regprocedure('public.user_can_see_object(uuid)') is null
     or to_regprocedure('public.user_can_read_element(uuid)') is null
     or to_regprocedure('public.user_can_see_element(uuid)') is null
     or to_regprocedure('public.user_can_read_strategy(uuid)') is null then
    raise notice 'vision reactions skipped: base schema not present';
    return;
  end if;

  execute 'alter table public.element_reactions
    add column if not exists vision_id uuid references public.visions(id) on delete cascade';
  execute 'create index if not exists element_reactions_vision_idx on public.element_reactions (vision_id) where vision_id is not null';

  execute 'alter table public.element_reactions drop constraint if exists element_reactions_check';
  execute $sql$
    alter table public.element_reactions add constraint element_reactions_check check (
      (element_id is not null)::integer + (comment_id is not null)::integer
      + (strategy_id is not null)::integer + (object_id is not null)::integer
      + (domain_id is not null)::integer + (vision_id is not null)::integer = 1
    )
  $sql$;

  execute 'drop policy if exists element_reactions_select on public.element_reactions';
  execute $sql$
    create policy element_reactions_select on public.element_reactions
      for select to authenticated
      using (case
        when element_id is not null then public.user_can_read_element(element_id)
        when strategy_id is not null then public.user_can_read_strategy(strategy_id)
        when object_id is not null then public.user_can_read_object(object_id)
        when domain_id is not null then public.user_can_read_domain(domain_id)
        when vision_id is not null then public.user_can_see_vision(vision_id)
        else exists (select 1 from public.element_comments c where c.id = element_reactions.comment_id)
      end)
  $sql$;

  execute 'drop policy if exists element_reactions_insert on public.element_reactions';
  execute $sql$
    create policy element_reactions_insert on public.element_reactions
      for insert to authenticated
      with check (
        user_id = (select auth.uid())
        and case
          when element_id is not null then public.user_can_see_element(element_id)
          when strategy_id is not null then public.user_can_read_strategy(strategy_id)
          when object_id is not null then public.user_can_see_object(object_id)
          when domain_id is not null then public.user_can_see_domain(domain_id)
          when vision_id is not null then public.user_can_see_vision(vision_id)
          else exists (select 1 from public.element_comments c
                       where c.id = element_reactions.comment_id and public.user_can_see_element(c.element_id))
        end
      )
  $sql$;
end $$;
