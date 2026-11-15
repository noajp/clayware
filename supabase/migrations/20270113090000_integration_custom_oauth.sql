-- Per-connection OAuth ("Custom OAuth", supabase/functions/_shared/customOAuth.ts):
-- a connection carries its own OAuth 2.0 config, so any service that speaks
-- the authorization code flow with PKCE connects without code.
--
--   integrations.oauth_config            the connection's config: authorize /
--                                        token / revoke URLs, scopes, client_id,
--                                        token_auth, extra parameters. Owners
--                                        write it through their column grants;
--                                        members read it. Never a secret.
--   integrations.oauth_client_secret_id  says a client secret is stored; the
--                                        value lives in Vault as
--                                        `integration-oauth-client:<id>`.
--   set_integration_oauth_client_secret  owner only: writes (or, empty, clears)
--                                        that secret. Never readable back.
--   get_integration_oauth_client_secret  service role only (integration-oauth,
--                                        resolveCredential).
--   integration_oauth_states.binding_hash
--                                        what a per-connection sign-in is bound
--                                        to at /start (the row's kind, endpoint
--                                        and config); a row changed meanwhile
--                                        ends the sign-in.
--   integration_drafts.oauth_config      an OAuth draft's config (no client: the
--                                        person enters theirs on the staged row).
--   integrations_rebind_drops_secret     also drops the stored tokens when the
--                                        config changes, and the client secret
--                                        when where it is sent (token / revoke
--                                        URL), the client, the token auth
--                                        method or the auth type changes.
--   integrations_drop_oauth_client_secret
--                                        a deleted connection takes its client
--                                        secret with it.
--   copy_integration_secret              a draft's staging clone also gets the
--                                        original's client secret.
--   activate_integration_draft           an OAuth draft's config is bound like
--                                        the rest of its content (client aside).
--
-- Guarded for preview replay: each part checks what it touches first.

do $$
begin
  if to_regclass('public.integrations') is null
     or not exists (select 1 from pg_namespace where nspname = 'vault')
     or to_regprocedure('public.is_activity_space_owner(uuid)') is null then
    raise notice 'custom oauth (integrations) skipped: integrations, vault or is_activity_space_owner not present';
    return;
  end if;

  execute 'alter table public.integrations add column if not exists oauth_config jsonb';
  execute 'alter table public.integrations add column if not exists oauth_client_secret_id uuid';
  if not exists (select 1 from pg_constraint where conname = 'integrations_oauth_config_shape') then
    execute $ddl$
      alter table public.integrations add constraint integrations_oauth_config_shape
        check (oauth_config is null or (jsonb_typeof(oauth_config) = 'object' and octet_length(oauth_config::text) <= 16000))
    $ddl$;
  end if;
  -- Owners write the config like the row's other settings (RLS: owners).
  -- oauth_client_secret_id is written only by the secret RPCs.
  execute 'grant insert (oauth_config), update (oauth_config) on public.integrations to authenticated';

  execute $ddl$
    create or replace function public.set_integration_oauth_client_secret(p_integration_id uuid, p_secret text)
    returns void
    language plpgsql
    security definer
    set search_path = public, vault
    as $f$
    declare
      v_space uuid;
      v_auth text;
      v_config jsonb;
      v_secret_id uuid;
      v_name text := 'integration-oauth-client:' || p_integration_id::text;
    begin
      select activity_space_id, auth_type, oauth_config into v_space, v_auth, v_config
      from public.integrations where id = p_integration_id for update;
      if v_space is null or not public.is_activity_space_owner(v_space) then
        raise exception 'not allowed' using errcode = '42501';
      end if;
      select id into v_secret_id from vault.secrets where name = v_name;
      if p_secret is null or length(p_secret) = 0 then
        if v_secret_id is not null then delete from vault.secrets where id = v_secret_id; end if;
        update public.integrations set oauth_client_secret_id = null, updated_at = now() where id = p_integration_id;
        return;
      end if;
      if v_auth <> 'oauth' or v_config is null then
        raise exception 'This connection does not sign in with its own OAuth client.' using errcode = '22023';
      end if;
      if position('alc_pat_' in p_secret) > 0 then
        raise exception 'An Alcon personal access token cannot be used as an OAuth client secret.' using errcode = '22023';
      end if;
      if length(p_secret) > 4096 then
        raise exception 'The client secret is too long.' using errcode = '22023';
      end if;
      if v_secret_id is null then
        v_secret_id := vault.create_secret(p_secret, v_name, 'Alcon integration OAuth client secret');
      else
        perform vault.update_secret(v_secret_id, p_secret);
      end if;
      update public.integrations set oauth_client_secret_id = v_secret_id, updated_at = now() where id = p_integration_id;
    end
    $f$
  $ddl$;
  execute 'revoke all on function public.set_integration_oauth_client_secret(uuid, text) from public, anon';
  execute 'grant execute on function public.set_integration_oauth_client_secret(uuid, text) to authenticated';

  execute $ddl$
    create or replace function public.get_integration_oauth_client_secret(p_integration_id uuid)
    returns text
    language sql
    security definer
    set search_path = public, vault
    as $f$
      select ds.decrypted_secret from vault.decrypted_secrets ds
      where ds.name = 'integration-oauth-client:' || p_integration_id::text
    $f$
  $ddl$;
  execute 'revoke all on function public.get_integration_oauth_client_secret(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.get_integration_oauth_client_secret(uuid) to service_role';

  -- The credential belongs to the destination it was entered for
  -- (20261003120000); a connection's own OAuth config is part of that
  -- destination. Any change to it drops the tokens; a change to where the
  -- client secret is sent, or to the client itself, drops the secret too.
  execute $ddl$
    create or replace function public.integrations_rebind_drops_secret()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, vault
    as $f$
    begin
      if new.endpoint is distinct from old.endpoint
         or new.auth_type is distinct from old.auth_type
         or new.auth_header is distinct from old.auth_header
         or new.oauth_config is distinct from old.oauth_config then
        delete from vault.secrets where name = 'integration:' || old.id::text;
        new.secret_id := null;
        new.last_test := null;
        new.external_account := null;
      end if;
      if new.auth_type is distinct from old.auth_type
         or (new.oauth_config ->> 'token_url') is distinct from (old.oauth_config ->> 'token_url')
         or (new.oauth_config ->> 'revoke_url') is distinct from (old.oauth_config ->> 'revoke_url')
         or (new.oauth_config ->> 'client_id') is distinct from (old.oauth_config ->> 'client_id')
         or coalesce(new.oauth_config ->> 'token_auth', 'client_secret_post') is distinct from coalesce(old.oauth_config ->> 'token_auth', 'client_secret_post') then
        delete from vault.secrets where name = 'integration-oauth-client:' || old.id::text;
        new.oauth_client_secret_id := null;
      end if;
      return new;
    end
    $f$
  $ddl$;
  execute 'drop trigger if exists trg_integrations_rebind_drops_secret on public.integrations';
  execute 'create trigger trg_integrations_rebind_drops_secret before update on public.integrations
             for each row execute function public.integrations_rebind_drops_secret()';

  execute $ddl$
    create or replace function public.integrations_drop_oauth_client_secret()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, vault
    as $f$
    begin
      delete from vault.secrets where name = 'integration-oauth-client:' || old.id::text;
      return old;
    end
    $f$
  $ddl$;
  execute 'drop trigger if exists trg_integrations_drop_oauth_client_secret on public.integrations';
  execute 'create trigger trg_integrations_drop_oauth_client_secret after delete on public.integrations
             for each row execute function public.integrations_drop_oauth_client_secret()';

  -- A draft's staging clone tests as the original would: with its token set
  -- and, now, its OAuth client secret (both copied by the server only).
  execute $ddl$
    create or replace function public.copy_integration_secret(p_from_id uuid, p_to_id uuid)
    returns boolean language plpgsql security definer set search_path = public, vault as $f$
    declare
      v_from_space uuid;
      v_from_secret uuid;
      v_to_space uuid;
      v_to_secret uuid;
      v_secret text;
      v_client text;
      v_new_id uuid;
    begin
      select activity_space_id, secret_id into v_from_space, v_from_secret
      from public.integrations where id = p_from_id;
      select activity_space_id, secret_id into v_to_space, v_to_secret
      from public.integrations where id = p_to_id;
      if v_from_space is null or v_to_space is null or v_from_space <> v_to_space then
        return false;
      end if;
      select decrypted_secret into v_client from vault.decrypted_secrets
      where name = 'integration-oauth-client:' || p_from_id::text;
      if v_client is not null then
        delete from vault.secrets where name = 'integration-oauth-client:' || p_to_id::text;
        v_new_id := vault.create_secret(v_client, 'integration-oauth-client:' || p_to_id::text, 'Alcon integration OAuth client secret (draft staging copy)');
        update public.integrations set oauth_client_secret_id = v_new_id, updated_at = now() where id = p_to_id;
      end if;
      if v_from_secret is null then return false; end if;
      select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_from_secret;
      if v_secret is null then return false; end if;
      if v_to_secret is not null then delete from vault.secrets where id = v_to_secret; end if;
      v_new_id := vault.create_secret(v_secret, 'integration:' || p_to_id::text, 'Alcon integration credential (draft staging copy)');
      update public.integrations set secret_id = v_new_id, updated_at = now() where id = p_to_id;
      return true;
    end
    $f$
  $ddl$;
  execute 'revoke all on function public.copy_integration_secret(uuid, uuid) from public, anon, authenticated';
  execute 'grant execute on function public.copy_integration_secret(uuid, uuid) to service_role';
end
$$;

do $$
begin
  if to_regclass('public.integration_oauth_states') is null then
    raise notice 'custom oauth (sign-in binding) skipped: integration_oauth_states not present';
    return;
  end if;
  execute 'alter table public.integration_oauth_states add column if not exists binding_hash text';
  if not exists (select 1 from pg_constraint where conname = 'integration_oauth_states_binding_hash_shape') then
    execute $ddl$
      alter table public.integration_oauth_states add constraint integration_oauth_states_binding_hash_shape
        check (binding_hash is null or binding_hash ~ '^[0-9a-f]{64}$')
    $ddl$;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.integration_drafts') is null
     or to_regclass('public.integrations') is null
     or to_regprocedure('public.is_activity_space_owner(uuid)') is null then
    raise notice 'custom oauth (drafts) skipped: integration_drafts, integrations or is_activity_space_owner not present';
    return;
  end if;
  execute 'alter table public.integration_drafts add column if not exists oauth_config jsonb';

  -- Activation binds an OAuth draft's config like the rest of what was
  -- tested: the draft, the tested payload and the staged row must agree on
  -- it — all without the client, which is the person's, not the draft's.
  -- A key-shaped draft's payload carries no oauth_config key at all, so
  -- drafts tested before this compare exactly as they did.
  execute $ddl$
    create or replace function public.activate_integration_draft(p_draft_id uuid)
    returns uuid language plpgsql security definer set search_path = public as $f$
    declare
      v_draft public.integration_drafts%rowtype;
      v_row public.integrations%rowtype;
      v_candidate jsonb;
      v_config jsonb;
      v_activated uuid;
    begin
      select * into v_draft from public.integration_drafts where id = p_draft_id for update;
      if v_draft.id is null then raise exception 'draft not found'; end if;
      if not public.is_activity_space_owner(v_draft.activity_space_id) then
        raise exception 'not allowed' using errcode = '42501';
      end if;
      if v_draft.status <> 'awaiting_review' then
        raise exception 'このドラフトは審査待ちではありません';
      end if;
      v_config := v_draft.oauth_config - 'client_id';
      v_candidate := jsonb_build_object(
        'name', v_draft.name, 'endpoint', v_draft.endpoint, 'auth_type', v_draft.auth_type,
        'auth_header', v_draft.auth_header, 'manifest', v_draft.manifest, 'guide', v_draft.guide)
        || case when v_config is not null then jsonb_build_object('oauth_config', v_config) else '{}'::jsonb end;
      if v_draft.tested_content is null or v_candidate <> v_draft.tested_content then
        raise exception 'テストした内容と現在の内容が一致しません。再テストしてください';
      end if;
      select * into v_row from public.integrations where id = v_draft.materialized_integration_id;
      if v_row.id is null then raise exception 'テストした接続が見つかりません'; end if;
      if v_row.name <> v_draft.name or v_row.endpoint <> v_draft.endpoint
         or v_row.auth_type <> v_draft.auth_type
         or v_row.auth_header is distinct from v_draft.auth_header
         or v_row.manifest is distinct from v_draft.manifest
         or v_row.guide is distinct from v_draft.guide
         or (v_row.oauth_config - 'client_id') is distinct from v_config then
        raise exception 'テストした接続の内容が変わっています。再テストしてください';
      end if;

      if v_draft.target_integration_id is not null then
        -- An update: the tested content lands on the original, atomically
        -- with the decision; the clone that was tested is deleted (its
        -- copied secret goes with it). The original's own credential was
        -- never touched — the clone only borrowed a copy. A changed sign-in
        -- config drops the original's tokens (the rebind rule), so it signs
        -- in again under the config that was tested.
        update public.integrations set
          name = v_draft.name, endpoint = v_draft.endpoint, auth_type = v_draft.auth_type,
          auth_header = v_draft.auth_header, manifest = v_draft.manifest, guide = v_draft.guide,
          oauth_config = case when v_config is null then null
            else v_config || case when v_row.oauth_config ? 'client_id'
              then jsonb_build_object('client_id', v_row.oauth_config -> 'client_id') else '{}'::jsonb end end,
          updated_at = now()
        where id = v_draft.target_integration_id;
        delete from public.integrations where id = v_draft.materialized_integration_id;
        v_activated := v_draft.target_integration_id;
      else
        update public.integrations set enabled = true, updated_at = now()
        where id = v_draft.materialized_integration_id;
        v_activated := v_draft.materialized_integration_id;
      end if;

      update public.integration_drafts set
        status = 'active', activated_integration_id = v_activated,
        activated_hash = tested_hash, activated_structure_hash = tested_structure_hash,
        activated_permission_hash = tested_permission_hash,
        decided_by = (select auth.uid()), decided_at = now(), expires_at = null, updated_at = now()
      where id = v_draft.id;
      -- The name's previous drafted connection gives way to this one.
      update public.integration_drafts set status = 'superseded', updated_at = now()
      where activity_space_id = v_draft.activity_space_id and name_key = v_draft.name_key
        and status = 'active' and id <> v_draft.id;
      return v_activated;
    end
    $f$
  $ddl$;
  execute 'revoke all on function public.activate_integration_draft(uuid) from public';
  execute 'grant execute on function public.activate_integration_draft(uuid) to authenticated';
end
$$;
