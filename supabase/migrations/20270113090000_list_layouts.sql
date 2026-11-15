-- A person's list layouts — which columns show, in what order, how wide, and
-- the sort — kept with their preferences, so a list looks the same on every
-- machine they sign in on. One entry per list (its storage key), written one
-- at a time so two lists saved at once do not overwrite each other.
--
-- Guarded: user_preferences lives outside this migration.

do $$
begin
  if to_regclass('public.user_preferences') is null then
    raise notice 'list layouts skipped: user_preferences not present';
    return;
  end if;

  execute 'alter table public.user_preferences add column if not exists list_layouts jsonb not null default ''{}''::jsonb';

  execute $fn$
    create or replace function public.set_list_layout(p_key text, p_layout jsonb) returns void
    language plpgsql security invoker set search_path = '' as $body$
    begin
      if auth.uid() is null then raise exception 'not signed in'; end if;
      if p_key is null or length(p_key) = 0 or length(p_key) > 200 then raise exception 'bad layout key'; end if;
      if p_layout is null or jsonb_typeof(p_layout) <> 'object' or pg_column_size(p_layout) > 16384 then
        raise exception 'bad layout';
      end if;
      insert into public.user_preferences (user_id, list_layouts)
        values (auth.uid(), jsonb_build_object(p_key, p_layout))
      on conflict (user_id) do update
        set list_layouts = public.user_preferences.list_layouts || jsonb_build_object(p_key, p_layout),
            updated_at = now();
    end
    $body$
  $fn$;
  execute 'revoke all on function public.set_list_layout(text, jsonb) from public, anon';
  execute 'grant execute on function public.set_list_layout(text, jsonb) to authenticated';
end $$;
