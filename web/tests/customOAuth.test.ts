import { describe, expect, it } from 'vitest';
import { buildCustomOAuthConfig, buildIntegrationRow, customOAuthFormOf, customOAuthHosts, oauthRedirectUriFor, presetById, EMPTY_CUSTOM_OAUTH } from '@/AIP/connectors/catalog';
import { draftStructureHashWeb } from '@/AIP/connectors/draftModel';

// A connection's own OAuth config (supabase/functions/_shared/customOAuth.ts):
// any OAuth 2.0 service signs in through the same flow as the providers
// Clayware registered, with its client from the row and Vault. What must
// hold: the config is checked the same way on both sides, the client
// secret and the code go only to the token URL, a token serves only the
// row (binding) it was signed in for, and a draft can propose a config
// but never a client.

const custom = await import(new URL('../../supabase/functions/_shared/customOAuth.ts', import.meta.url).pathname);
const reg = await import(new URL('../../supabase/functions/_shared/oauthProviders.ts', import.meta.url).pathname);
const client = await import(new URL('../../supabase/functions/_shared/integrationClient.ts', import.meta.url).pathname);
const cd = await import(new URL('../../supabase/functions/_shared/connectorDraft.ts', import.meta.url).pathname);
const tools = await import(new URL('../../supabase/functions/_shared/integrationTools.ts', import.meta.url).pathname);
const google = await import(new URL('../../supabase/functions/_shared/googleOAuth.ts', import.meta.url).pathname);

const ID = '33333333-3333-4333-8333-333333333333';
const CONFIG = {
  authorize_url: 'https://accounts.example.com/oauth/authorize',
  token_url: 'https://accounts.example.com/oauth/token',
  revoke_url: 'https://accounts.example.com/oauth/revoke',
  scopes: ['read', 'write'],
  client_id: 'app-123',
  token_auth: 'client_secret_basic',
};
const ROW = {
  id: ID, preset: 'custom-http', kind: 'http', name: 'Example', description: null, endpoint: 'https://api.example.com/v1',
  auth_type: 'oauth', auth_header: null, delegation: 'approve_each', oauth_config: CONFIG,
};
const REDIRECT = 'https://rkugtcqztkkacvoylupw.supabase.co/functions/v1/integration-oauth/callback';

describe('a connection’s OAuth config', () => {
  it('accepts a standard config and stores only canonical keys', () => {
    const { config, errors } = custom.parseCustomOAuthConfig({ ...CONFIG, extra: 'ignored' }, { requireClientId: true });
    expect(errors).toEqual([]);
    expect(config).toEqual({ ...CONFIG, authorize_params: {}, token_params: {} });
    expect(custom.storedCustomOAuthConfig(config)).toEqual(CONFIG);
  });

  it('refuses URLs that are not https on a public host, or that carry a fragment', () => {
    for (const bad of ['http://accounts.example.com/token', 'https://localhost/token', 'https://10.0.0.5/token', 'https://user:pw@accounts.example.com/token', 'https://accounts.example.com/token#x', 'javascript:alert(1)']) {
      expect(custom.parseCustomOAuthConfig({ ...CONFIG, token_url: bad }, { requireClientId: true }).config, bad).toBeNull();
    }
    expect(custom.parseCustomOAuthConfig({ ...CONFIG, revoke_url: 'https://169.254.169.254/revoke' }, { requireClientId: true }).config).toBeNull();
    expect(custom.parseCustomOAuthConfig({ ...CONFIG, revoke_url: '' }, { requireClientId: true }).config?.revoke_url).toBeNull();
  });

  it('refuses parameters the flow itself sets, scopes with spaces, and an unknown client authentication', () => {
    const errs = (over: Record<string, unknown>) => custom.parseCustomOAuthConfig({ ...CONFIG, ...over }, { requireClientId: true }).errors.join(' ');
    expect(errs({ authorize_params: { redirect_uri: 'https://evil.example.net/cb' } })).toContain('redirect_uri');
    expect(errs({ authorize_params: { State: 'x' } })).toContain('State');
    expect(errs({ token_params: { client_secret: 'x' } })).toContain('client_secret');
    expect(errs({ scopes: ['read write'] })).toContain('scope');
    expect(errs({ token_auth: 'private_key_jwt' })).toContain('token_auth');
    expect(errs({ authorize_params: { audience: 'https://api.example.com' } })).toBe('');
  });

  it('needs a client ID on a connection, and refuses one in a draft', () => {
    const { client_id: _id, ...noClient } = CONFIG;
    expect(custom.parseCustomOAuthConfig(noClient, { requireClientId: true }).config).toBeNull();
    expect(custom.parseCustomOAuthConfig(noClient, { requireClientId: false }).config?.client_id).toBeNull();
    expect(custom.parseCustomOAuthConfig(CONFIG, { requireClientId: false }).errors.join(' ')).toContain('client_id');
  });

  it('agrees with the web form: what the web builds, the server parses unchanged', () => {
    const form = customOAuthFormOf(CONFIG as never);
    expect(form).toEqual({
      authorizeUrl: CONFIG.authorize_url, tokenUrl: CONFIG.token_url, revokeUrl: CONFIG.revoke_url,
      scopes: 'read write', clientId: 'app-123', tokenAuth: 'client_secret_basic',
    });
    const built = buildCustomOAuthConfig(form);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(custom.parseCustomOAuthConfig(built.config, { requireClientId: true }).errors).toEqual([]);
    expect(built.config).toEqual(CONFIG);
    // Extra parameters a draft set are kept on edit.
    const kept = buildCustomOAuthConfig(form, { ...CONFIG, authorize_params: { audience: 'x' } } as never);
    expect(kept.ok && kept.config.authorize_params).toEqual({ audience: 'x' });
    for (const bad of [{ tokenUrl: 'http://accounts.example.com/token' }, { authorizeUrl: 'https://localhost/a' }, { clientId: 'has space' }, { clientId: '' }, { revokeUrl: 'https://127.0.0.1/r' }]) {
      expect(buildCustomOAuthConfig({ ...form, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('builds a custom API row that signs in with its own config, and says where sign-in goes', () => {
    const preset = presetById('custom-http')!;
    const built = buildIntegrationRow(preset, 'space-1', {
      name: 'Example', endpoint: 'https://api.example.com/v1', auth: 'oauth', oauth: customOAuthFormOf(CONFIG as never),
      delegation: 'approve_each', enabled: true,
    });
    expect(built.ok && built.row).toMatchObject({ auth_type: 'oauth', auth_header: null, oauth_config: CONFIG });
    expect(buildIntegrationRow(preset, 'space-1', { name: 'Example', endpoint: 'https://api.example.com/v1', auth: 'oauth', oauth: EMPTY_CUSTOM_OAUTH, delegation: 'approve_each', enabled: true }).ok).toBe(false);
    // A model connection always takes a bearer key.
    const model = buildIntegrationRow(presetById('custom-model')!, 'space-1', { name: 'M', endpoint: 'https://models.example.com', auth: 'oauth', delegation: 'approve_each', enabled: true });
    expect(model.ok && model.row.auth_type).toBe('bearer');
    expect(customOAuthHosts(CONFIG as never)).toEqual({ authorize: 'accounts.example.com', token: 'accounts.example.com', revoke: 'accounts.example.com' });
    expect(oauthRedirectUriFor('https://rkugtcqztkkacvoylupw.supabase.co/')).toBe(REDIRECT);
    expect(google.redirectUriFor('https://rkugtcqztkkacvoylupw.supabase.co')).toBe(REDIRECT);
  });
});

describe('signing in with a connection’s own config', () => {
  it('resolves the row to its own provider, after every registered provider', () => {
    const signIn = reg.signInOf(ROW);
    expect(signIn.provider.id).toBe('custom');
    expect(signIn.provider.tokenUrl).toBe(CONFIG.token_url);
    expect(signIn.profile).toEqual({ preset: 'custom-http', kind: 'http', endpoint: ROW.endpoint, scopes: ['read', 'write'] });
    expect(reg.signInOf({ ...ROW, kind: 'mcp' }).profile.kind).toBe('mcp');
    // Not an OAuth row, a model, an invalid config, no client: none.
    expect(reg.signInOf({ ...ROW, auth_type: 'bearer' })).toBeNull();
    expect(reg.signInOf({ ...ROW, kind: 'model' })).toBeNull();
    expect(reg.signInOf({ ...ROW, oauth_config: { ...CONFIG, token_url: 'http://x.example.com' } })).toBeNull();
    expect(reg.signInOf({ ...ROW, oauth_config: { ...CONFIG, client_id: undefined } })).toBeNull();
    expect(reg.signInOf({ ...ROW, oauth_config: null })).toBeNull();
    // A registered provider's profile wins over a config on the same row.
    const ms = { ...ROW, preset: 'microsoft-365', endpoint: 'https://graph.microsoft.com/v1.0' };
    expect(reg.signInOf(ms).provider.id).toBe('microsoft');
    // The registered list is unchanged: a config is not a provider anyone configures.
    expect(reg.OAUTH_PROVIDER_IDS).toEqual(['google', 'github', 'microsoft']);
    expect(tools.oauthRowOpens(ROW)).toBe(true);
    expect(tools.oauthRowOpens({ ...ROW, oauth_config: null })).toBe(false);
  });

  it('sends the person to the config’s authorize URL with PKCE, the scopes and the extra parameters', () => {
    const row = { ...ROW, oauth_config: { ...CONFIG, authorize_url: 'https://accounts.example.com/oauth/authorize?tenant=t1', authorize_params: { audience: 'api' } } };
    const { provider, profile } = reg.signInOf(row);
    const url = new URL(provider.authorizeUrl({ clientId: 'app-123', redirectUri: REDIRECT, state: 'st', codeChallenge: 'cc', profile }));
    expect(url.origin + url.pathname).toBe('https://accounts.example.com/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tenant: 't1', audience: 'api', response_type: 'code', client_id: 'app-123', redirect_uri: REDIRECT,
      scope: 'read write', state: 'st', code_challenge: 'cc', code_challenge_method: 'S256',
    });
  });

  it('authenticates the client at the token endpoint the config’s way, and registered providers as before', () => {
    const c = { clientId: 'app 1', clientSecret: 's3:cret' };
    const grant = { grant_type: 'refresh_token', refresh_token: 'r1' };
    const at = (token_auth: string) => {
      const { provider, profile } = reg.signInOf({ ...ROW, oauth_config: { ...CONFIG, token_auth, token_params: { resource: 'https://api.example.com' } } });
      return reg.tokenRequestInit(provider, c, grant, profile);
    };
    const basic = at('client_secret_basic');
    expect(basic.headers.authorization).toBe(`Basic ${btoa('app+1:s3%3Acret')}`);
    expect(Object.fromEntries(new URLSearchParams(basic.body))).toEqual({ ...grant, resource: 'https://api.example.com' });
    expect(Object.fromEntries(new URLSearchParams(at('client_secret_post').body))).toEqual({ ...grant, resource: 'https://api.example.com', client_id: 'app 1', client_secret: 's3:cret' });
    const none = at('none');
    expect(none.headers.authorization).toBeUndefined();
    expect(Object.fromEntries(new URLSearchParams(none.body))).toEqual({ ...grant, resource: 'https://api.example.com', client_id: 'app 1' });
    // Microsoft: the post method and its scope field, exactly as #966 pinned.
    const ms = reg.signInOf({ ...ROW, preset: 'microsoft-365', endpoint: 'https://graph.microsoft.com/v1.0' });
    expect(Object.fromEntries(new URLSearchParams(reg.tokenRequestInit(ms.provider, c, grant, ms.profile).body))).toEqual({
      ...grant, client_id: 'app 1', client_secret: 's3:cret', scope: 'openid profile offline_access User.Read',
    });
  });

  it('reads a standard token response: optional expiry and refresh token, bearer only, binding kept', () => {
    const prev = { v: 1, provider: 'custom', access_token: 'a0', refresh_token: 'r0', expires_at: 1, scope: 'read', binding: 'b'.repeat(64) };
    expect(custom.customTokenSetFrom({ access_token: 'a1', token_type: 'Bearer', expires_in: 600, refresh_token: 'r1' }, 1000, ['read'], prev))
      .toEqual({ v: 1, provider: 'custom', access_token: 'a1', refresh_token: 'r1', expires_at: 601_000, scope: 'read', binding: 'b'.repeat(64) });
    expect(custom.customTokenSetFrom({ access_token: 'a1' }, 1000, ['read', 'write'], null)).toEqual({ v: 1, provider: 'custom', access_token: 'a1', scope: 'read write' });
    expect(custom.customTokenSetFrom({ access_token: 'a1', expires_in: '3600' }, 0, [], prev)?.expires_at).toBe(3_600_000);
    expect(custom.customTokenSetFrom({ access_token: 'a1', token_type: 'mac' }, 0, [], null)).toBeNull();
    expect(custom.customTokenSetFrom({ error: 'invalid_grant' }, 0, [], null)).toBeNull();
    expect(reg.parseTokenSet(JSON.stringify(prev))).toEqual(prev);
    expect(custom.parseCustomTokenSet(JSON.stringify({ ...prev, binding: 'nothex' }))).toBeNull();
  });

  it('binds a sign-in to the row’s kind, endpoint and whole config — not to key order', async () => {
    const base = await custom.customOAuthBinding(ROW);
    expect(await custom.customOAuthBinding({ ...ROW, oauth_config: Object.fromEntries(Object.entries(CONFIG).reverse()) })).toBe(base);
    for (const changed of [
      { ...ROW, endpoint: 'https://evil.example.net/v1' },
      { ...ROW, kind: 'mcp' },
      { ...ROW, oauth_config: { ...CONFIG, token_url: 'https://evil.example.net/token' } },
      { ...ROW, oauth_config: { ...CONFIG, authorize_url: 'https://evil.example.net/authorize' } },
      { ...ROW, oauth_config: { ...CONFIG, client_id: 'other' } },
      { ...ROW, oauth_config: { ...CONFIG, scopes: ['read'] } },
    ]) expect(await custom.customOAuthBinding(changed)).not.toBe(base);
  });
});

describe('a connection’s own sign-in at run time', () => {
  function fakeAdmin(opts: { written?: boolean; clientSecret?: string | null; stored?: unknown } = {}) {
    const calls: { rpc: [string, Record<string, unknown>][]; updates: Record<string, unknown>[] } = { rpc: [], updates: [] };
    const admin = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.rpc.push([fn, args]);
        if (fn === 'get_integration_oauth_client_secret') return { data: opts.clientSecret ?? null, error: null };
        if (fn === 'get_integration_secret') return { data: opts.stored ?? null, error: null };
        return { data: opts.written ?? true, error: null };
      },
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: async () => { calls.updates.push(values); return { error: null }; } }) }),
    };
    return { admin, calls };
  }

  it('uses a token only while it was signed in under the row as it is now', async () => {
    const binding = await custom.customOAuthBinding(ROW);
    const tokens = { v: 1, provider: 'custom', access_token: 'tok', scope: 'read write', binding };
    const { admin } = fakeAdmin();
    expect(await client.resolveCredential(admin, ROW, JSON.stringify(tokens))).toBe('tok');
    expect(await client.resolveCredential(admin, { ...ROW, endpoint: 'https://evil.example.net/v1' }, JSON.stringify(tokens))).toBeNull();
    expect(await client.resolveCredential(admin, ROW, JSON.stringify({ ...tokens, binding: undefined }))).toBeNull();
  });

  it('refreshes at the token URL with the client from the row and Vault, and stores the rotated set with its binding', async () => {
    const binding = await custom.customOAuthBinding(ROW);
    const tokens = { v: 1, provider: 'custom', access_token: 'old', refresh_token: 'r1', expires_at: 1_000_000, scope: 'read write', binding };
    const { admin, calls } = fakeAdmin({ clientSecret: 'shh' });
    let sent: { url: string; init: RequestInit } | null = null;
    const fetchImpl = async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'r2', expires_in: 3600, token_type: 'bearer' }), { status: 200 });
    };
    expect(await client.resolveCredential(admin, ROW, JSON.stringify(tokens), { now: 1_000_000 - 30_000, fetchImpl })).toBe('new');
    expect(sent!.url).toBe(CONFIG.token_url);
    expect((sent!.init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa('app-123:shh')}`);
    expect(Object.fromEntries(new URLSearchParams(String(sent!.init.body)))).toEqual({ grant_type: 'refresh_token', refresh_token: 'r1' });
    expect(calls.rpc[0]).toEqual(['get_integration_oauth_client_secret', { p_integration_id: ID }]);
    const stored = JSON.parse(String(calls.rpc[1][1].p_secret));
    expect(stored).toEqual({ v: 1, provider: 'custom', access_token: 'new', refresh_token: 'r2', expires_at: 1_000_000 - 30_000 + 3_600_000, scope: 'read write', binding });
  });

  it('gives nothing without the client secret, sends a public client’s id alone, and marks a refused grant expired', async () => {
    const binding = await custom.customOAuthBinding(ROW);
    const tokens = { v: 1, provider: 'custom', access_token: 'old', refresh_token: 'r1', expires_at: 1_000_000, scope: '', binding };
    const noNetwork = async () => { throw new Error('no network expected'); };
    expect(await client.resolveCredential(fakeAdmin({ clientSecret: null }).admin, ROW, JSON.stringify(tokens), { now: 1_000_000, fetchImpl: noNetwork })).toBeNull();

    const publicRow = { ...ROW, oauth_config: { ...CONFIG, token_auth: 'none' } };
    const pb = await custom.customOAuthBinding(publicRow);
    let body = '';
    const ok = async (_url: string, init: RequestInit) => { body = String(init.body); return new Response(JSON.stringify({ access_token: 'n' }), { status: 200 }); };
    const pub = fakeAdmin();
    expect(await client.resolveCredential(pub.admin, publicRow, JSON.stringify({ ...tokens, binding: pb }), { now: 1_000_000, fetchImpl: ok })).toBe('n');
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({ grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'app-123' });
    expect(pub.calls.rpc.map(([fn]) => fn)).not.toContain('get_integration_oauth_client_secret');

    const refused = fakeAdmin({ clientSecret: 'shh' });
    const bad = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    expect(await client.resolveCredential(refused.admin, ROW, JSON.stringify(tokens), { now: 1_000_000, fetchImpl: bad })).toBeNull();
    expect(refused.calls.updates[0].last_test).toMatchObject({ ok: false, code: 'oauth_expired' });
  });

  it('revokes at the revoke URL with the client authenticated, and only says so on a 200', async () => {
    const { provider } = reg.signInOf(ROW);
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response('', { status: 200 }); };
    const tokens = { v: 1, provider: 'custom', access_token: 'a', refresh_token: 'r', scope: '' };
    expect(await provider.revoke({ client: { clientId: 'app-123', clientSecret: 'shh' }, tokens, fetch: fetchImpl })).toBe(true);
    expect(seen[0].url).toBe(CONFIG.revoke_url);
    expect(Object.fromEntries(new URLSearchParams(String(seen[0].init.body)))).toEqual({ token: 'r', token_type_hint: 'refresh_token' });
    expect(await provider.revoke({ client: null, tokens, fetch: fetchImpl })).toBe(false);
    expect(reg.signInOf({ ...ROW, oauth_config: { ...CONFIG, revoke_url: undefined } }).provider.revoke).toBeUndefined();
  });
});

describe('drafting a service that signs in with OAuth', () => {
  const MANIFEST = {
    version: 1, defaults: { read: 'allow', write: 'ask' },
    commands: [{ name: 'list_items', action: 'items.list', effect: 'read', input: { limit: { type: 'number' } }, http: { method: 'GET', path: '/items', query: ['limit'] } }],
  };
  const { client_id: _c, revoke_url: _r, ...DRAFTED } = CONFIG;
  const candidate = (over: Record<string, unknown> = {}) => ({
    name: 'Example', endpoint: 'https://api.example.com/v1', authType: 'oauth', authHeader: null, manifest: MANIFEST,
    guide: null, testInputs: {}, sources: ['https://docs.example.com/oauth'], oauth: DRAFTED, ...over,
  });

  it('accepts the service’s own config without a client, and hands back what is stored', () => {
    const v = cd.validateDraftCandidate(candidate());
    expect(v.errors).toEqual([]);
    expect(v.oauth).toEqual(DRAFTED);
  });

  it('refuses a client in the draft, a config off the service’s domain, and a config on a key-shaped draft', () => {
    expect(cd.validateDraftCandidate(candidate({ oauth: CONFIG })).errors.join(' ')).toContain('client_id');
    expect(cd.validateDraftCandidate(candidate({ oauth: { ...DRAFTED, token_url: 'https://collect.example.net/token' } })).errors.join(' ')).toContain('collect.example.net');
    // The person's official host, when known, is the anchor instead of the endpoint.
    expect(cd.validateDraftCandidate(candidate({ oauth: { ...DRAFTED, authorize_url: 'https://login.example.org/a' } }), { officialHost: 'example.org' }).errors.join(' ')).not.toContain('login.example.org');
    expect(cd.validateDraftCandidate(candidate({ authType: 'bearer' })).errors.join(' ')).toContain('oauth');
    expect(cd.validateDraftCandidate(candidate({ oauth: null })).errors.join(' ')).toContain('OAuth');
  });

  it('hashes the config into what was tested, never the client, and leaves key-shaped content as it was', async () => {
    const base = { name: 'Example', endpoint: 'https://api.example.com/v1', auth_type: 'oauth', auth_header: null, manifest: MANIFEST, guide: null };
    const withConfig = cd.draftContentOf({ ...base, oauth_config: DRAFTED });
    expect(withConfig.oauth_config).toEqual(DRAFTED);
    // The staged row's client does not move the content.
    expect(await cd.draftContentHash(cd.draftContentOf({ ...base, oauth_config: { ...DRAFTED, client_id: 'mine' } }))).toBe(await cd.draftContentHash(withConfig));
    expect(await cd.draftContentHash(cd.draftContentOf({ ...base, oauth_config: { ...DRAFTED, token_url: 'https://accounts.example.com/t2' } }))).not.toBe(await cd.draftContentHash(withConfig));
    // A key-shaped draft has no oauth_config key at all.
    const keyed = cd.draftContentOf({ ...base, auth_type: 'bearer' });
    expect('oauth_config' in keyed).toBe(false);
    expect(cd.draftStructureOf(keyed)).not.toHaveProperty('oauth_config');
    // The web twin hashes a live connection's structure the same way, client aside.
    const live = { ...base, oauth_config: { ...DRAFTED, client_id: 'mine' } };
    expect(await draftStructureHashWeb(live)).toBe(await cd.draftStructureHash(withConfig));
  });
});
