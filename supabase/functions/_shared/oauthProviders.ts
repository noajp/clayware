// The OAuth providers integrations sign in with (ADR 0035), as one registry.
// What differs per provider is declared here — its URLs, which rows it
// claims and with what scopes (profiles), how a token response becomes the
// stored token set, whether and how that set is refreshed, how a grant is
// revoked, whether an organization's administrator can be asked to approve,
// and the Edge secrets that hold its client. The flow around it is one for
// every provider: integration-oauth runs the sign-in (ticket → PKCE + state
// + nonce cookie → held token → /finish), resolveCredential
// (integrationClient.ts) refreshes, integration-test checks. A new provider
// is a new entry here and its pure module, not new flow code.
//
// Pure apart from `revoke`, which is given its fetch. No Deno globals, so
// web/tests imports it.

import {
  GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, buildAuthorizeUrl, googleProfileOf, grantsRequiredScopes, parseOAuthSecret, secretFromTokenResponse,
  type GoogleProviderProfile, type OAuthSecret,
} from "./googleOAuth.ts";
import {
  GITHUB_PROFILE, GITHUB_TOKEN_URL, buildGithubAuthorizeUrl, githubHasScope, githubSecretFromTokenResponse, isGithubOAuthRow, parseGithubSecret,
} from "./githubOAuth.ts";
import {
  MICROSOFT_TOKEN_URL, buildMicrosoftAuthorizeUrl, microsoftAdminApproved, microsoftAdminConsentUrl, microsoftGrantsRequiredScopes,
  microsoftNeedsAdminConsent, microsoftProfileOf, microsoftSecretFromTokenResponse, microsoftTokenParams, parseMicrosoftSecret,
} from "./microsoftOAuth.ts";

export type OAuthProviderId = "google" | "github" | "microsoft";

/** Who signed in: the request that answers it and where the answer says so. */
export interface OAuthAccountCheck {
  url: string;
  /** Headers besides the bearer token (the token is always Authorization). */
  headers?: Readonly<Record<string, string>>;
  /** The account (an email, or GitHub's login) in the answer's JSON, or null. */
  accountOf(body: unknown): string | null;
}

/** One kind of row a provider signs in: the preset, the row's kind and
 *  endpoint (all must agree), the scopes a sign-in asks for, and the
 *  account check. */
export interface OAuthProfile {
  preset: string;
  kind: "http" | "mcp";
  endpoint: string;
  scopes: readonly string[];
  accountCheck: OAuthAccountCheck;
}

/** A stored token set, under the provider it was signed in with. A provider
 *  that refreshes keeps refresh_token and expires_at (epoch ms) too. */
export interface OAuthTokenSet {
  v: 1;
  provider: OAuthProviderId;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope: string;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export type OAuthFetch = (url: string, init: RequestInit) => Promise<Response>;

type IntegrationRowLike = { preset?: string | null; kind?: string | null; auth_type?: string | null; endpoint?: string | null } | null | undefined;

export interface OAuthProvider {
  id: OAuthProviderId;
  /** The provider's proper name, for messages ("Google sign-in is not set up yet"). */
  name: string;
  /** The Edge secrets that hold the provider's OAuth client. */
  clientEnv: { id: string; secret: string };
  tokenUrl: string;
  /** The profile a row signs in under, or null when the row is not this provider's. */
  profileOf(row: IntegrationRowLike): OAuthProfile | null;
  authorizeUrl(p: { clientId: string; redirectUri: string; state: string; codeChallenge: string; profile: OAuthProfile }): string;
  /** Form fields every token request (code exchange and refresh) adds to the grant. */
  tokenParams?(profile: OAuthProfile): Record<string, string>;
  /** The token set to store from a token response, or null when it has no
   *  usable token. `previous` is the set a refresh started from. */
  tokenSetFrom(res: unknown, nowMs: number, previous?: OAuthTokenSet | null): OAuthTokenSet | null;
  /** The stored token set, or null when it is not this provider's. */
  parse(raw: unknown): OAuthTokenSet | null;
  /** True when a granted scope string covers what the profile requires. */
  grants(scope: string, profile: OAuthProfile): boolean;
  /** Present when the access token expires and is renewed with the refresh
   *  token at tokenUrl. reauthErrors: the token endpoint's errors that end
   *  the grant, so the connection needs a new sign-in (oauth_expired). */
  refresh?: { reauthErrors: readonly string[] };
  /** Ends Clayware's grant at the provider; true when it confirmed. Absent:
   *  the provider has no way to do it, and a disconnect only clears the
   *  stored tokens. */
  revoke?(ctx: { client: OAuthClientConfig | null; tokens: OAuthTokenSet; fetch: OAuthFetch }): Promise<boolean>;
  /** Present when an organization's administrator can approve Clayware for
   *  everyone: when a sign-in came back needing it, the link to send them,
   *  and whether their approval came back granted. */
  adminConsent?: {
    required(params: URLSearchParams): boolean;
    url(p: { clientId: string; redirectUri: string; profile: OAuthProfile; state: string }): string;
    approved(params: URLSearchParams): boolean;
  };
}

const TIMEOUT_MS = 20_000;

/** The status of a request, or null when it could not be made in time. */
async function statusOf(fetchImpl: OAuthFetch, url: string, init: RequestInit): Promise<number | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctl.signal, redirect: "manual" });
    await res.body?.cancel();
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const GOOGLE: OAuthProvider = {
  id: "google",
  name: "Google",
  clientEnv: { id: "GOOGLE_OAUTH_CLIENT_ID", secret: "GOOGLE_OAUTH_CLIENT_SECRET" },
  tokenUrl: GOOGLE_TOKEN_URL,
  profileOf: googleProfileOf,
  // A Google profile is the only kind profileOf hands back for this provider.
  authorizeUrl: (p) => buildAuthorizeUrl({ ...p, profile: p.profile as GoogleProviderProfile }),
  tokenSetFrom: (res, nowMs, previous) => secretFromTokenResponse(res, nowMs, previous?.provider === "google" ? previous as OAuthSecret : null),
  parse: parseOAuthSecret,
  grants: (scope, profile) => grantsRequiredScopes(scope, profile as GoogleProviderProfile),
  refresh: { reauthErrors: ["invalid_grant"] },
  // Revoking the refresh token ends the whole grant for that account.
  revoke: async ({ tokens, fetch }) => {
    if (!tokens.refresh_token) return false;
    const status = await statusOf(fetch, GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ token: tokens.refresh_token }).toString(),
    });
    return status === 200;
  },
};

const GITHUB: OAuthProvider = {
  id: "github",
  name: "GitHub",
  clientEnv: { id: "GITHUB_OAUTH_CLIENT_ID", secret: "GITHUB_OAUTH_CLIENT_SECRET" },
  tokenUrl: GITHUB_TOKEN_URL,
  profileOf: (row) => (isGithubOAuthRow(row) ? GITHUB_PROFILE : null),
  authorizeUrl: (p) => buildGithubAuthorizeUrl(p),
  // An OAuth App's token does not expire: nothing to refresh, nothing kept from before.
  tokenSetFrom: (res) => githubSecretFromTokenResponse(res),
  parse: parseGithubSecret,
  grants: (scope) => githubHasScope(scope),
  // Deleting the grant ends the person's whole authorization of Clayware's OAuth App.
  revoke: async ({ client, tokens, fetch }) => {
    if (!client) return false;
    const status = await statusOf(fetch, `https://api.github.com/applications/${encodeURIComponent(client.clientId)}/grant`, {
      method: "DELETE",
      headers: {
        authorization: `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "clayware-integration-oauth",
      },
      body: JSON.stringify({ access_token: tokens.access_token }),
    });
    return status === 204;
  },
};

const MICROSOFT: OAuthProvider = {
  id: "microsoft",
  name: "Microsoft",
  clientEnv: { id: "MICROSOFT_OAUTH_CLIENT_ID", secret: "MICROSOFT_OAUTH_CLIENT_SECRET" },
  tokenUrl: MICROSOFT_TOKEN_URL,
  profileOf: microsoftProfileOf,
  authorizeUrl: buildMicrosoftAuthorizeUrl,
  tokenParams: microsoftTokenParams,
  tokenSetFrom: (res, nowMs, previous) => microsoftSecretFromTokenResponse(res, nowMs, previous?.provider === "microsoft" ? previous : null),
  parse: parseMicrosoftSecret,
  grants: microsoftGrantsRequiredScopes,
  // invalid_grant: the refresh token expired or was revoked. The other two:
  // the organization now asks for something only a fresh sign-in can give
  // (multi-factor, a changed policy, consent withdrawn).
  refresh: { reauthErrors: ["invalid_grant", "interaction_required", "consent_required"] },
  // No revoke: Microsoft offers an app no way to withdraw a delegated
  // grant. Disconnect clears the stored tokens; the person or their
  // administrator removes the app's permission on Microsoft's side.
  adminConsent: { required: microsoftNeedsAdminConsent, url: microsoftAdminConsentUrl, approved: microsoftAdminApproved },
};

export const OAUTH_PROVIDERS: Readonly<Record<OAuthProviderId, OAuthProvider>> = { google: GOOGLE, github: GITHUB, microsoft: MICROSOFT };
export const OAUTH_PROVIDER_IDS = Object.keys(OAUTH_PROVIDERS) as OAuthProviderId[];

/** The provider and profile a row signs in with, or null when it signs in
 *  with none (not an OAuth row, or one no profile claims). */
export function signInOf(row: IntegrationRowLike): { provider: OAuthProvider; profile: OAuthProfile } | null {
  for (const id of OAUTH_PROVIDER_IDS) {
    const provider = OAUTH_PROVIDERS[id];
    const profile = provider.profileOf(row);
    if (profile) return { provider, profile };
  }
  return null;
}

/** A stored or held token set under whichever provider it names, or null
 *  when it is not a well-formed one. */
export function parseTokenSet(raw: unknown): OAuthTokenSet | null {
  for (const id of OAUTH_PROVIDER_IDS) {
    const tokens = OAUTH_PROVIDERS[id].parse(raw);
    if (tokens) return tokens;
  }
  return null;
}

/** The provider's OAuth client from the Edge secrets, or null until both are set. */
export function oauthClientFromEnv(provider: OAuthProvider, get: (key: string) => string | undefined): OAuthClientConfig | null {
  const clientId = get(provider.clientEnv.id)?.trim();
  const clientSecret = get(provider.clientEnv.secret)?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** The `state` an administrator's approval comes back to the callback with:
 *  it names the provider, and is never a sign-in's (those are 43 random
 *  base64url characters). */
export const ADMIN_CONSENT_STATE_PREFIX = "admin-consent.";

export function adminConsentState(provider: OAuthProvider): string {
  return `${ADMIN_CONSENT_STATE_PREFIX}${provider.id}`;
}

/** The provider an administrator's approval came back for, or null when
 *  `state` is not one (or the provider has no such approval). */
export function adminConsentProviderOf(state: string): OAuthProvider | null {
  if (!state.startsWith(ADMIN_CONSENT_STATE_PREFIX)) return null;
  const id = state.slice(ADMIN_CONSENT_STATE_PREFIX.length);
  const provider = (OAUTH_PROVIDER_IDS as string[]).includes(id) ? OAUTH_PROVIDERS[id as OAuthProviderId] : null;
  return provider?.adminConsent ? provider : null;
}
