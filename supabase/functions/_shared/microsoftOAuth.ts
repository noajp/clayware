// Microsoft (Entra ID) OAuth for integrations — the pure parts: which rows
// sign in with Microsoft, the authorize URL, the grant check, the stored
// secret's shape and the administrator's approval. No network, no Deno
// globals, so web/tests imports it. The sign-in itself runs in
// integration-oauth, the same flow as Google and GitHub (ticket → PKCE +
// state + nonce cookie → held token → /finish), through the provider
// registry (oauthProviders.ts).
//
// The app is registered once, for work and school accounts in any
// organization (the `organizations` authority). The stored Vault value is the
// expiring token set (googleOAuth.ts):
//   { v: 1, provider: "microsoft", access_token, refresh_token, expires_at, scope }
// Microsoft rotates the refresh token: every refresh answers a new one and
// the stored set takes it (expiringSecretFromTokenResponse).
//
// Many organizations do not let their people consent to an app themselves.
// The sign-in then comes back refused (microsoftNeedsAdminConsent), and the
// person is given the administrator's approval link
// (microsoftAdminConsentUrl) instead of a bare failure.

import { accountEmail, expiringSecretFromTokenResponse, parseExpiringSecret, type ExpiringOAuthSecret } from "./googleOAuth.ts";
import type { OAuthProfile } from "./oauthProviders.ts";

const AUTHORITY = "https://login.microsoftonline.com/organizations";
export const MICROSOFT_AUTH_URL = `${AUTHORITY}/oauth2/v2.0/authorize`;
export const MICROSOFT_TOKEN_URL = `${AUTHORITY}/oauth2/v2.0/token`;
export const MICROSOFT_ADMIN_CONSENT_URL = `${AUTHORITY}/v2.0/adminconsent`;
/** The endpoint a microsoft-365 integration row carries (catalog.ts). */
export const MICROSOFT_GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

/** The OpenID Connect part of a sign-in: who signed in, and a refresh token
 *  (offline_access). Granted with the sign-in, never listed back as a
 *  resource grant, so the grant check skips them. */
const OIDC_SCOPES = ["openid", "profile", "offline_access"] as const;

export type MicrosoftOAuthSecret = ExpiringOAuthSecret<"microsoft">;

export const MICROSOFT_365_PROFILE: OAuthProfile = {
  preset: "microsoft-365",
  kind: "http",
  endpoint: MICROSOFT_GRAPH_ENDPOINT,
  scopes: [...OIDC_SCOPES, "User.Read"],
  accountCheck: {
    url: `${MICROSOFT_GRAPH_ENDPOINT}/me?$select=mail,userPrincipalName`,
    // The mailbox address when there is one, else the sign-in name.
    accountOf: (body) => {
      const b = body as { mail?: unknown; userPrincipalName?: unknown } | null;
      return accountEmail(b?.mail) ?? accountEmail(b?.userPrincipalName);
    },
  },
};

export const MICROSOFT_PROFILES: readonly OAuthProfile[] = [MICROSOFT_365_PROFILE];

type IntegrationRowLike = { preset?: string | null; kind?: string | null; auth_type?: string | null; endpoint?: string | null } | null | undefined;

/** The Microsoft profile an integration row belongs to, or null: not a row
 *  that signs in with Microsoft (preset, kind, auth and endpoint all agree). */
export function microsoftProfileOf(row: IntegrationRowLike): OAuthProfile | null {
  if (!row || row.auth_type !== "oauth") return null;
  return MICROSOFT_PROFILES.find((p) => p.preset === row.preset && p.kind === row.kind && p.endpoint === row.endpoint) ?? null;
}

/** A scope as Microsoft may spell it back — "User.Read", "user.read" or
 *  "https://graph.microsoft.com/User.Read" — in one comparable form. */
function scopeKey(scope: string): string {
  return scope.replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase();
}

/** True when the granted scope string covers every resource scope the
 *  profile requires (the OpenID Connect scopes aside). */
export function microsoftGrantsRequiredScopes(granted: unknown, profile: OAuthProfile): boolean {
  if (typeof granted !== "string") return false;
  const have = new Set(granted.split(/\s+/).filter(Boolean).map(scopeKey));
  const oidc = new Set<string>(OIDC_SCOPES);
  return profile.scopes.filter((s) => !oidc.has(s)).every((s) => have.has(scopeKey(s)));
}

export function buildMicrosoftAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string; codeChallenge: string; profile: OAuthProfile }): string {
  const u = new URL(MICROSOFT_AUTH_URL);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", p.profile.scopes.join(" "));
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  // Let the person choose the work account; consent is asked only when the
  // organization has not already given it (forcing it would stop people
  // whose administrator approved the app for everyone).
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

/** The form fields Microsoft's token endpoint is sent besides the grant:
 *  the scopes again, for both the code exchange and a refresh. */
export function microsoftTokenParams(profile: OAuthProfile): Record<string, string> {
  return { scope: profile.scopes.join(" ") };
}

/** The token set to store after Microsoft's token response; a refresh's new
 *  refresh token replaces the stored one. */
export function microsoftSecretFromTokenResponse(res: unknown, nowMs: number, previous?: { refresh_token?: string; scope?: string } | null): MicrosoftOAuthSecret | null {
  return expiringSecretFromTokenResponse(res, nowMs, "microsoft", previous);
}

/** The stored secret, or null when it is not a well-formed Microsoft OAuth secret. */
export function parseMicrosoftSecret(raw: unknown): MicrosoftOAuthSecret | null {
  return parseExpiringSecret(raw, "microsoft");
}

/** Errors Microsoft's sign-in answers when the person cannot consent alone:
 *  65001 (no consent yet, and they may not give it), 90094 (the permissions
 *  need an administrator) and 900941 (an administrator must approve an app
 *  Microsoft considers risky, as an unverified one can be). */
const ADMIN_CONSENT_CODES = ["AADSTS65001", "AADSTS90094", "AADSTS900941"];

/** True when a sign-in came back refused because the organization's
 *  administrator must approve Clayware first. */
export function microsoftNeedsAdminConsent(params: URLSearchParams): boolean {
  const error = params.get("error");
  if (!error) return false;
  if (error === "consent_required") return true;
  const description = params.get("error_description") ?? "";
  return ADMIN_CONSENT_CODES.some((code) => new RegExp(`\\b${code}\\b`).test(description));
}

/** The link an administrator opens to approve Clayware for their whole
 *  organization. It comes back to the same callback with `state`, which
 *  names the provider and is not a sign-in (oauthProviders.ts). */
export function microsoftAdminConsentUrl(p: { clientId: string; redirectUri: string; profile: OAuthProfile; state: string }): string {
  const u = new URL(MICROSOFT_ADMIN_CONSENT_URL);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("scope", p.profile.scopes.join(" "));
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("state", p.state);
  return u.toString();
}

/** True when the administrator's approval came back granted. */
export function microsoftAdminApproved(params: URLSearchParams): boolean {
  return !params.get("error") && (params.get("admin_consent") ?? "").toLowerCase() === "true";
}
