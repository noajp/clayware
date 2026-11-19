-- Artifacts placed on a Vision or a Portfolio: a file, a notebook or a slide
-- deck from Artifacts, listed in the page's Artifacts section with who put it
-- there. A link is one subject (vision_id or strategy_id) and one artifact
-- (file_id, note_id or deck_id); the artifact itself stays where it lives and
-- keeps its own rules — a reader who cannot see it sees no row for it.
-- Read by whoever can see the subject; added by whoever can work in it, as
-- themselves; taken off by who added it or whoever can edit the subject.
-- Guarded for preview replay: the base schema lives outside this folder.
do $$
begin
  if to_regclass('public.visions') is null or to_regclass('public.strategies') is null
     or to_regclass('public.attachments') is null or to_regclass('public.notes') is null
     or to_regclass('public.decks') is null
     or to_regprocedure('public.user_can_see_vision(uuid)') is null
     or to_regprocedure('public.user_has_vision_role(uuid, text[])') is null
     or to_regprocedure('public.user_can_read_strategy(uuid)') is null
     or to_regprocedure('alcon_internal.user_can_edit_strategy(uuid)') is null then
    raise notice 'artifact_links skipped: base schema not present';
    return;
  end if;

  execute $sql$
    create table if not exists public.artifact_links (
      id uuid primary key default gen_random_uuid(),
      vision_id uuid references public.visions(id) on delete cascade,
      strategy_id uuid references public.strategies(id) on delete cascade,
      file_id uuid references public.attachments(id) on delete cascade,
      note_id uuid references public.notes(id) on delete cascade,
      deck_id text references public.decks(id) on delete cascade,
      added_by uuid default auth.uid() references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      constraint artifact_links_one_subject check (num_nonnulls(vision_id, strategy_id) = 1),
      constraint artifact_links_one_artifact check (num_nonnulls(file_id, note_id, deck_id) = 1)
    )
  $sql$;
  execute 'create index if not exists artifact_links_vision_idx on public.artifact_links (vision_id) where vision_id is not null';
  execute 'create index if not exists artifact_links_strategy_idx on public.artifact_links (strategy_id) where strategy_id is not null';
  -- One artifact once per subject.
  execute $sql$create unique index if not exists artifact_links_unique on public.artifact_links
    (coalesce(vision_id, strategy_id), coalesce(file_id::text, note_id::text, deck_id))$sql$;

  execute 'alter table public.artifact_links enable row level security';

  execute 'drop policy if exists artifact_links_select on public.artifact_links';
  execute $sql$create policy artifact_links_select on public.artifact_links for select to authenticated
    using (case when vision_id is not null then public.user_can_see_vision(vision_id)
                else public.user_can_read_strategy(strategy_id) end)$sql$;

  execute 'drop policy if exists artifact_links_insert on public.artifact_links';
  execute $sql$create policy artifact_links_insert on public.artifact_links for insert to authenticated
    with check (added_by = (select auth.uid()) and
      case when vision_id is not null
           then public.user_has_vision_role(vision_id, array['owner', 'admin', 'member'])
           else alcon_internal.user_can_edit_strategy(strategy_id) end)$sql$;

  execute 'drop policy if exists artifact_links_delete on public.artifact_links';
  execute $sql$create policy artifact_links_delete on public.artifact_links for delete to authenticated
    using (added_by = (select auth.uid()) or
      case when vision_id is not null
           then public.user_has_vision_role(vision_id, array['owner', 'admin'])
           else alcon_internal.user_can_edit_strategy(strategy_id) end)$sql$;
end $$;
