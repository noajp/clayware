-- Artifacts on a Domain's, an Object's and an Element's page too, as on a
-- Vision's and a Portfolio's: artifact_links takes any of them as its subject.
-- Read by whoever can see the subject, added by whoever can see it (as
-- themselves), taken off by who added it.
-- Guarded for preview replay: the base schema lives outside this folder.
do $$
begin
  if to_regclass('public.artifact_links') is null or to_regclass('public.domains') is null
     or to_regclass('public.objects') is null or to_regclass('public.elements') is null
     or to_regprocedure('public.user_can_read_element(uuid)') is null
     or to_regprocedure('public.user_can_see_element(uuid)') is null
     or to_regprocedure('public.user_can_see_vision(uuid)') is null
     or to_regprocedure('public.user_has_vision_role(uuid, text[])') is null
     or to_regprocedure('public.user_can_read_strategy(uuid)') is null
     or to_regprocedure('alcon_internal.user_can_edit_strategy(uuid)') is null
     or to_regprocedure('public.user_can_read_domain(uuid)') is null
     or to_regprocedure('public.user_can_see_domain(uuid)') is null
     or to_regprocedure('public.user_can_read_object(uuid)') is null
     or to_regprocedure('public.user_can_see_object(uuid)') is null then
    raise notice 'artifact_links more subjects skipped: base schema not present';
    return;
  end if;

  execute 'alter table public.artifact_links add column if not exists domain_id uuid references public.domains(id) on delete cascade';
  execute 'alter table public.artifact_links add column if not exists object_id uuid references public.objects(id) on delete cascade';
  execute 'alter table public.artifact_links add column if not exists element_id uuid references public.elements(id) on delete cascade';
  execute 'create index if not exists artifact_links_element_idx on public.artifact_links (element_id) where element_id is not null';
  execute 'create index if not exists artifact_links_domain_idx on public.artifact_links (domain_id) where domain_id is not null';
  execute 'create index if not exists artifact_links_object_idx on public.artifact_links (object_id) where object_id is not null';

  execute 'alter table public.artifact_links drop constraint if exists artifact_links_one_subject';
  execute $sql$alter table public.artifact_links add constraint artifact_links_one_subject
    check (num_nonnulls(vision_id, strategy_id, domain_id, object_id, element_id) = 1)$sql$;

  execute 'drop index if exists public.artifact_links_unique';
  execute $sql$create unique index artifact_links_unique on public.artifact_links
    (coalesce(vision_id, strategy_id, domain_id, object_id, element_id), coalesce(file_id::text, note_id::text, deck_id))$sql$;

  execute 'drop policy if exists artifact_links_select on public.artifact_links';
  execute $sql$create policy artifact_links_select on public.artifact_links for select to authenticated
    using (case
      when vision_id is not null then public.user_can_see_vision(vision_id)
      when strategy_id is not null then public.user_can_read_strategy(strategy_id)
      when domain_id is not null then public.user_can_read_domain(domain_id)
      when object_id is not null then public.user_can_read_object(object_id)
      else public.user_can_read_element(element_id) end)$sql$;

  execute 'drop policy if exists artifact_links_insert on public.artifact_links';
  execute $sql$create policy artifact_links_insert on public.artifact_links for insert to authenticated
    with check (added_by = (select auth.uid()) and case
      when vision_id is not null then public.user_has_vision_role(vision_id, array['owner', 'admin', 'member'])
      when strategy_id is not null then alcon_internal.user_can_edit_strategy(strategy_id)
      when domain_id is not null then public.user_can_see_domain(domain_id)
      when object_id is not null then public.user_can_see_object(object_id)
      else public.user_can_see_element(element_id) end)$sql$;

  execute 'drop policy if exists artifact_links_delete on public.artifact_links';
  execute $sql$create policy artifact_links_delete on public.artifact_links for delete to authenticated
    using (added_by = (select auth.uid()) or case
      when vision_id is not null then public.user_has_vision_role(vision_id, array['owner', 'admin'])
      when strategy_id is not null then alcon_internal.user_can_edit_strategy(strategy_id)
      else false end)$sql$;
end $$;
