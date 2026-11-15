import { describe, expect, it } from 'vitest';
import { INTEGRATION_PRESETS, OAUTH_PROVIDERS as WEB_PROVIDERS, oauthProviderOf, signsInWithOAuth } from '@/AIP/connectors/catalog';
import { completeOAuthReturn, readOAuthReturn } from '@/AIP/connectors/oauthReturn';

// The OAuth provider registry (supabase/functions/_shared/oauthProviders.ts):
// one table of what differs per provider, one flow for all. Google and
// GitHub keep exactly their behavior (integrationOAuth.test.ts pins it);
// Microsoft is the first provider added as a registry entry.

const reg = await import(new URL('../../supabase/functions/_shared/oauthProviders.ts', import.meta.url).pathname);
const google = await import(new URL('../../supabase/functions/_shared/googleOAuth.ts', import.meta.url).pathname);
const github = await import(new URL('../../supabase/functions/_shared/githubOAuth.ts', import.meta.url).pathname);
const ms = await import(new URL('../../supabase/functions/_shared/microsoftOAuth.ts', import.meta.url).pathname);
const client = await import(new URL('../../supabase/functions/_shared/integrationClient.ts', import.meta.url).pathname);

const ID = '22222222-2222-4222-8222-222222222222';
const row = (preset: string, kind: string, endpoint: string, auth_type = 'oauth') => ({
  id: ID, preset, kind, name: preset, description: null, endpoint, auth_type, auth_header: null, delegation: 'approve_each',
});
const DRIVE_ROW = row('google-drive', 'http', 'https://www.googleapis.com/drive/v3');
const GMAIL_ROW = row('gmail', 'http', 'https://gmail.googleapis.com/gmail/v1/users/me');
const GITHUB_ROW = row('github', 'mcp', 'https://api.githubcopilot.com/mcp/');
const MS_ROW = row('microsoft-365', 'http', 'https://graph.microsoft.com/v1.0');
const REDIRECT = 'https://rkugtcqztkkacvoylupw.supabase.co/functions/v1/integration-oauth/callback';

const MS_SECRET = {
  v: 1, provider: 'microsoft', access_token: 'eyJ.access', refresh_token: '0.AAA-refresh-1', expires_at: 1_800_000_000_000, scope: 'openid profile User.Read',
};

describe('the provider registry', () => {
  it('lists Google, GitHub and Microsoft, each with its client secrets named', () => {
    expect(reg.OAUTH_PROVIDER_IDS).toEqual(['google', 'github', 'microsoft']);
    expect(reg.OAUTH_PROVIDERS.google.clientEnv).toEqual({ id: 'GOOGLE_OAUTH_CLIENT_ID', secret: 'GOOGLE_OAUTH_CLIENT_SECRET' });
    expect(reg.OAUTH_PROVIDERS.github.clientEnv).toEqual({ id: 'GITHUB_OAUTH_CLIENT_ID', secret: 'GITHUB_OAUTH_CLIENT_SECRET' });
    expect(reg.OAUTH_PROVIDERS.microsoft.clientEnv).toEqual({ id: 'MICROSOFT_OAUTH_CLIENT_ID', secret: 'MICROSOFT_OAUTH_CLIENT_SECRET' });
  });

  it('finds the provider and profile a row signs in with, by preset, kind, auth and endpoint together', () => {
    expect(reg.signInOf(DRIVE_ROW)).toEqual({ provider: reg.OAUTH_PROVIDERS.google, profile: google.GOOGLE_DRIVE_PROFILE });
    expect(reg.signInOf(GMAIL_ROW)).toEqual({ provider: reg.OAUTH_PROVIDERS.google, profile: google.GOOGLE_GMAIL_PROFILE });
    expect(reg.signInOf(GITHUB_ROW)).toEqual({ provider: reg.OAUTH_PROVIDERS.github, profile: github.GITHUB_PROFILE });
    expect(reg.signInOf(MS_ROW)).toEqual({ provider: reg.OAUTH_PROVIDERS.microsoft, profile: ms.MICROSOFT_365_PROFILE });
    expect(reg.signInOf({ ...MS_ROW, endpoint: 'https://evil.example.com/v1.0' })).toBeNull();
    expect(reg.signInOf({ ...MS_ROW, kind: 'mcp' })).toBeNull();
    expect(reg.signInOf({ ...MS_ROW, auth_type: 'bearer' })).toBeNull();
    expect(reg.signInOf({ ...MS_ROW, preset: 'custom-http' })).toBeNull();
    expect(reg.signInOf(null)).toBeNull();
  });

  it('agrees with the web catalog: every sign-in preset is a server profile of the same provider', () => {
    const signIn = INTEGRATION_PRESETS.filter(signsInWithOAuth);
    expect(signIn.map((p) => p.id).sort()).toEqual(['github', 'gmail', 'google-drive', 'microsoft-365']);
    for (const p of signIn) {
      const server = reg.signInOf({ preset: p.id, kind: p.kind, auth_type: p.auth, endpoint: p.endpoint });
      expect(server, p.id).not.toBeNull();
      expect(server.provider.id, p.id).toBe(oauthProviderOf(p));
    }
    expect([...WEB_PROVIDERS].sort()).toEqual([...reg.OAUTH_PROVIDER_IDS].sort());
  });

  it('reads a token set under whichever provider it names, and never as another', () => {
    expect(reg.parseTokenSet(JSON.stringify(MS_SECRET))).toEqual(MS_SECRET);
    const gh = { v: 1, provider: 'github', access_token: 'gho_x', scope: 'repo' };
    expect(reg.parseTokenSet(gh)).toEqual(gh);
    const g = { ...MS_SECRET, provider: 'google' };
    expect(reg.parseTokenSet(g)).toEqual(g);
    expect(reg.parseTokenSet({ ...MS_SECRET, provider: 'okta' })).toBeNull();
    expect(reg.parseTokenSet('not json')).toBeNull();
    // A Microsoft set is not a Google one, nor the reverse.
    expect(reg.OAUTH_PROVIDERS.google.parse(MS_SECRET)).toBeNull();
    expect(reg.OAUTH_PROVIDERS.microsoft.parse(g)).toBeNull();
    expect(reg.OAUTH_PROVIDERS.microsoft.parse({ ...MS_SECRET, refresh_token: '' })).toBeNull();
  });

  it('takes each client from its own secrets, only when both are set', () => {
    const env: Record<string, string> = { MICROSOFT_OAUTH_CLIENT_ID: ' app-id ', MICROSOFT_OAUTH_CLIENT_SECRET: 's3cret', GOOGLE_OAUTH_CLIENT_ID: 'g' };
    const get = (k: string) => env[k];
    expect(reg.oauthClientFromEnv(reg.OAUTH_PROVIDERS.microsoft, get)).toEqual({ clientId: 'app-id', clientSecret: 's3cret' });
    expect(reg.oauthClientFromEnv(reg.OAUTH_PROVIDERS.google, get)).toBeNull();
    expect(reg.oauthClientFromEnv(reg.OAUTH_PROVIDERS.github, get)).toBeNull();
  });
});

describe('authorize URLs, per provider', () => {
  const base = { clientId: 'cid', redirectUri: REDIRECT, state: 'state-abc', codeChallenge: 'challenge-xyz' };

  it('builds Google’s and GitHub’s exactly as their own builders do', () => {
    for (const profile of [google.GOOGLE_DRIVE_PROFILE, google.GOOGLE_GMAIL_PROFILE]) {
      expect(reg.OAUTH_PROVIDERS.google.authorizeUrl({ ...base, profile })).toBe(google.buildAuthorizeUrl({ ...base, profile }));
    }
    expect(reg.OAUTH_PROVIDERS.github.authorizeUrl({ ...base, profile: github.GITHUB_PROFILE })).toBe(github.buildGithubAuthorizeUrl(base));
  });

  it('asks Microsoft’s organizations authority for the profile’s scopes, with S256 and an account choice', () => {
    const u = new URL(reg.OAUTH_PROVIDERS.microsoft.authorizeUrl({ ...base, profile: ms.MICROSOFT_365_PROFILE }));
    expect(u.origin + u.pathname).toBe('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: 'cid',
      response_type: 'code',
      redirect_uri: REDIRECT,
      response_mode: 'query',
      scope: 'openid profile offline_access User.Read',
      state: 'state-abc',
      code_challenge: 'challenge-xyz',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
  });

  it('names Microsoft’s scopes again on every token request, and nothing extra for Google or GitHub', () => {
    expect(reg.OAUTH_PROVIDERS.microsoft.tokenParams(ms.MICROSOFT_365_PROFILE)).toEqual({ scope: 'openid profile offline_access User.Read' });
    expect(reg.OAUTH_PROVIDERS.google.tokenParams).toBeUndefined();
    expect(reg.OAUTH_PROVIDERS.github.tokenParams).toBeUndefined();
  });
});

describe('Microsoft token sets and grants', () => {
  const p = reg.OAUTH_PROVIDERS.microsoft;

  it('stores a code exchange’s token set as Microsoft’s', () => {
    const now = 1_000_000;
    expect(p.tokenSetFrom({ access_token: 'a', refresh_token: 'r', expires_in: 3599, scope: 'User.Read openid' }, now))
      .toEqual({ v: 1, provider: 'microsoft', access_token: 'a', refresh_token: 'r', expires_at: now + 3_599_000, scope: 'User.Read openid' });
    // No refresh token (offline_access not granted): nothing usable to keep.
    expect(p.tokenSetFrom({ access_token: 'a', expires_in: 3599 }, now)).toBeNull();
    expect(p.tokenSetFrom({ error: 'invalid_grant' }, now)).toBeNull();
  });

  it('takes the rotated refresh token from a refresh, and keeps the old one only when none comes back', () => {
    const now = 2_000_000;
    expect(p.tokenSetFrom({ access_token: 'new', refresh_token: '0.AAA-refresh-2', expires_in: 3600 }, now, MS_SECRET))
      .toEqual({ ...MS_SECRET, access_token: 'new', refresh_token: '0.AAA-refresh-2', expires_at: now + 3_600_000 });
    expect(p.tokenSetFrom({ access_token: 'new', expires_in: 3600 }, now, MS_SECRET))
      .toEqual({ ...MS_SECRET, access_token: 'new', expires_at: now + 3_600_000 });
    // A previous set from another provider lends nothing.
    expect(p.tokenSetFrom({ access_token: 'new', expires_in: 3600 }, now, { ...MS_SECRET, provider: 'google' })).toBeNull();
  });

  it('requires User.Read however Microsoft spells it, and not the OpenID Connect scopes', () => {
    const profile = ms.MICROSOFT_365_PROFILE;
    expect(p.grants('User.Read', profile)).toBe(true);
    expect(p.grants('openid profile user.read email', profile)).toBe(true);
    expect(p.grants('https://graph.microsoft.com/User.Read', profile)).toBe(true);
    expect(p.grants('openid profile offline_access', profile)).toBe(false);
    expect(p.grants('User.ReadBasic.All', profile)).toBe(false);
    expect(p.grants('', profile)).toBe(false);
  });

  it('reads the account as the mailbox address, else the sign-in name', () => {
    const accountOf = ms.MICROSOFT_365_PROFILE.accountCheck.accountOf;
    expect(ms.MICROSOFT_365_PROFILE.accountCheck.url).toBe('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName');
    expect(accountOf({ mail: 'a@contoso.com', userPrincipalName: 'a@contoso.onmicrosoft.com' })).toBe('a@contoso.com');
    expect(accountOf({ mail: null, userPrincipalName: 'a@contoso.onmicrosoft.com' })).toBe('a@contoso.onmicrosoft.com');
    expect(accountOf({})).toBeNull();
    expect(accountOf({ mail: 'x'.repeat(321) })).toBeNull();
  });

  it('reads GitHub’s login as its account', () => {
    expect(github.GITHUB_PROFILE.accountCheck.accountOf({ login: 'octocat' })).toBe('octocat');
    expect(github.GITHUB_PROFILE.accountCheck.accountOf({ login: 'x'.repeat(101) })).toBeNull();
    expect(github.GITHUB_PROFILE.accountCheck.headers).toMatchObject({ accept: 'application/vnd.github+json' });
  });
});

describe('an administrator’s approval', () => {
  const q = (s: string) => new URLSearchParams(s);
  const consent = reg.OAUTH_PROVIDERS.microsoft.adminConsent;

  it('tells a refusal that needs an administrator from any other', () => {
    expect(consent.required(q('error=access_denied&error_description=AADSTS65001%3A+The+user+or+administrator+has+not+consented'))).toBe(true);
    expect(consent.required(q('error=invalid_request&error_description=AADSTS90094: The grant requires admin permission.'))).toBe(true);
    expect(consent.required(q('error=access_denied&error_description=AADSTS900941: Administrator consent is required. App is considered risky.'))).toBe(true);
    expect(consent.required(q('error=consent_required'))).toBe(true);
    // The person declined, or another code that merely starts with one of them.
    expect(consent.required(q('error=access_denied&error_description=AADSTS65004: User declined to consent'))).toBe(false);
    expect(consent.required(q('error=access_denied&error_description=AADSTS9009412: something else'))).toBe(false);
    expect(consent.required(q('code=abc&state=s'))).toBe(false);
  });

  it('builds the administrator’s link, coming back to the same callback with a state that names the provider', () => {
    const state = reg.adminConsentState(reg.OAUTH_PROVIDERS.microsoft);
    expect(state).toBe('admin-consent.microsoft');
    const u = new URL(consent.url({ clientId: 'cid', redirectUri: REDIRECT, profile: ms.MICROSOFT_365_PROFILE, state }));
    expect(u.origin + u.pathname).toBe('https://login.microsoftonline.com/organizations/v2.0/adminconsent');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: 'cid', scope: 'openid profile offline_access User.Read', redirect_uri: REDIRECT, state: 'admin-consent.microsoft',
    });
  });

  it('recognizes that state only for a provider with an approval, and never a sign-in’s', () => {
    expect(reg.adminConsentProviderOf('admin-consent.microsoft')).toBe(reg.OAUTH_PROVIDERS.microsoft);
    expect(reg.adminConsentProviderOf('admin-consent.google')).toBeNull();
    expect(reg.adminConsentProviderOf('admin-consent.okta')).toBeNull();
    expect(reg.adminConsentProviderOf(google.randomToken())).toBeNull();
    expect(reg.adminConsentProviderOf('')).toBeNull();
    expect(reg.OAUTH_PROVIDERS.google.adminConsent).toBeUndefined();
    expect(reg.OAUTH_PROVIDERS.github.adminConsent).toBeUndefined();
  });

  it('reads whether the approval was granted', () => {
    expect(consent.approved(q('tenant=t&state=admin-consent.microsoft&admin_consent=True'))).toBe(true);
    expect(consent.approved(q('error=access_denied&error_description=The+admin+canceled+the+request&admin_consent=True'))).toBe(false);
    expect(consent.approved(q('state=admin-consent.microsoft'))).toBe(false);
  });

  it('sends the browser back to the app with admin_consent, and the app records it', async () => {
    const url = new URL(google.appReturnUrl('https://clayware.app', 'admin_consent', ID));
    expect(Object.fromEntries(url.searchParams)).toEqual({ integration_oauth: 'admin_consent', integration: ID });
    const ret = readOAuthReturn(url.search);
    expect(ret).toEqual({ kind: 'admin_consent', integrationId: ID });
    // Nothing to finish: no handle comes back, and nothing is stored.
    let finished = false;
    await completeOAuthReturn(ret!, async () => { finished = true; return null; });
    expect(finished).toBe(false);
  });
});

describe('refreshing and revoking through the registry', () => {
  function fakeAdmin(written = true) {
    const calls: { rpc: [string, Record<string, unknown>][]; updates: [Record<string, unknown>, string][] } = { rpc: [], updates: [] };
    const admin = {
      rpc: async (fn: string, args: Record<string, unknown>) => { calls.rpc.push([fn, args]); return { data: written, error: null }; },
      from: () => ({ update: (values: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { calls.updates.push([values, id]); return { error: null }; } }) }),
    };
    return { admin, calls };
  }
  const CLIENT = { clientId: 'app-id', clientSecret: 's3cret' };

  it('uses a fresh Microsoft token as it is', async () => {
    const { admin, calls } = fakeAdmin();
    const fetchImpl = async () => { throw new Error('no network expected'); };
    expect(await client.resolveCredential(admin, MS_ROW, JSON.stringify(MS_SECRET), { now: MS_SECRET.expires_at - 600_000, client: CLIENT, fetchImpl })).toBe('eyJ.access');
    expect(calls.rpc).toEqual([]);
  });

  it('refreshes at Microsoft with the scopes, and stores the rotated refresh token over the one it started from', async () => {
    const { admin, calls } = fakeAdmin();
    let sent: { url: string; body: string } | null = null;
    const fetchImpl = async (url: string, init: RequestInit) => {
      sent = { url, body: String(init.body) };
      return new Response(JSON.stringify({ access_token: 'eyJ.new', refresh_token: '0.AAA-refresh-2', expires_in: 3600, scope: 'openid profile User.Read' }), { status: 200 });
    };
    const now = MS_SECRET.expires_at - 60_000;
    expect(await client.resolveCredential(admin, MS_ROW, JSON.stringify(MS_SECRET), { now, client: CLIENT, fetchImpl })).toBe('eyJ.new');
    expect(sent!.url).toBe('https://login.microsoftonline.com/organizations/oauth2/v2.0/token');
    expect(Object.fromEntries(new URLSearchParams(sent!.body))).toEqual({
      grant_type: 'refresh_token', refresh_token: '0.AAA-refresh-1', client_id: 'app-id', client_secret: 's3cret', scope: 'openid profile offline_access User.Read',
    });
    expect(calls.rpc).toHaveLength(1);
    expect(JSON.parse(String(calls.rpc[0][1].p_secret))).toEqual({ ...MS_SECRET, access_token: 'eyJ.new', refresh_token: '0.AAA-refresh-2', expires_at: now + 3_600_000 });
    expect(calls.rpc[0][1].p_expected_refresh_hash).toBe(await google.sha256Hex('0.AAA-refresh-1'));
  });

  it('marks the connection expired when Microsoft wants a fresh sign-in', async () => {
    for (const error of ['invalid_grant', 'interaction_required', 'consent_required']) {
      const { admin, calls } = fakeAdmin();
      const fetchImpl = async () => new Response(JSON.stringify({ error, error_description: 'AADSTS50076' }), { status: 400 });
      expect(await client.resolveCredential(admin, MS_ROW, JSON.stringify(MS_SECRET), { now: MS_SECRET.expires_at, client: CLIENT, fetchImpl }), error).toBeNull();
      expect(calls.updates[0][0].last_test, error).toMatchObject({ ok: false, code: 'oauth_expired' });
    }
    const { admin } = fakeAdmin();
    const fetchImpl = async () => new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503 });
    await expect(client.resolveCredential(admin, MS_ROW, JSON.stringify(MS_SECRET), { now: MS_SECRET.expires_at, client: CLIENT, fetchImpl })).rejects.toThrow(/Microsoft token refresh failed: HTTP 503/);
  });

  it('gives a Microsoft row nothing for another provider’s token set, and nothing without a client', async () => {
    const { admin } = fakeAdmin();
    expect(await client.resolveCredential(admin, MS_ROW, JSON.stringify({ ...MS_SECRET, provider: 'google' }))).toBeNull();
    expect(await client.resolveCredential(admin, MS_ROW, JSON.stringify(MS_SECRET), { now: MS_SECRET.expires_at, client: null })).toBeNull();
  });

  it('revokes at Google with the refresh token, at GitHub only with the client, and has no revoke for Microsoft', async () => {
    const seen: { url: string; method?: string; body: string }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method, body: String(init.body) });
      return new Response(null, { status: url.includes('github') ? 204 : 200 });
    };
    const gTokens = { ...MS_SECRET, provider: 'google' };
    expect(await reg.OAUTH_PROVIDERS.google.revoke({ client: null, tokens: gTokens, fetch: fetchImpl })).toBe(true);
    expect(seen[0].url).toBe('https://oauth2.googleapis.com/revoke');
    expect(Object.fromEntries(new URLSearchParams(seen[0].body))).toEqual({ token: '0.AAA-refresh-1' });

    const ghTokens = { v: 1, provider: 'github', access_token: 'gho_x', scope: 'repo' };
    expect(await reg.OAUTH_PROVIDERS.github.revoke({ client: null, tokens: ghTokens, fetch: fetchImpl })).toBe(false);
    expect(await reg.OAUTH_PROVIDERS.github.revoke({ client: CLIENT, tokens: ghTokens, fetch: fetchImpl })).toBe(true);
    expect(seen[1]).toMatchObject({ url: 'https://api.github.com/applications/app-id/grant', method: 'DELETE' });
    expect(JSON.parse(seen[1].body)).toEqual({ access_token: 'gho_x' });

    // A network failure reads as unconfirmed, not as an error.
    expect(await reg.OAUTH_PROVIDERS.google.revoke({ client: null, tokens: gTokens, fetch: async () => { throw new Error('down'); } })).toBe(false);
    expect(reg.OAUTH_PROVIDERS.microsoft.revoke).toBeUndefined();
  });
});
