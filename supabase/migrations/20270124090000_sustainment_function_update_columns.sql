-- A member may edit any draft function, and publishing or removing one is
-- for whoever made it or the Space's owner. That rule reads `created_by`, so
-- a member must not be able to rewrite it: an update that set `created_by`
-- to the member's own id passed the publish check, and then the delete
-- check. The browser may now update only what a function's page edits; who
-- made it, and which Sustainment and Space it is in, stay as inserted.
--
-- Guarded: preview branches replay this on an empty database.

do $$
begin
  if to_regclass('public.sustainment_functions') is null then
    raise notice 'sustainment_function_update_columns skipped: sustainment_functions not present'; return;
  end if;

  execute 'revoke update on public.sustainment_functions from authenticated';
  execute 'grant update (name, icon, differences, definition, status, published_at, order_index) on public.sustainment_functions to authenticated';
end $$;
