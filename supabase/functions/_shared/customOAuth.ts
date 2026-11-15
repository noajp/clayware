// Per-connection OAuth ("Custom OAuth"): a connection that carries its own
// OAuth 2.0 configuration — authorization code with PKCE — instead of
// signing in with a provider Clayware registered once (oauthProviders.ts).
// Any service that speaks the standard flow connects without code: the
// Space owner registers an app at the service, enters its client, and
// signs in. The same config is what a later discovery (an MCP server's
// authorization metadata) fills in automatically.
//
// The config lives on the integration row (integrations.oauth_config):
//   { authorize_url, token_url, revoke_url?, scopes[], client_id?,
//     token_auth, authorize_params?, token_params? }
// client_id is absent on a draft (the person brings it); the client secret
// never is part of it — it is a Vault secret of its own
// (`integration-oauth-client:<id>`, set_integration_oauth_client_secret).
//
// What keeps the client secret and the tokens where they belong:
//   - every URL passes the same guard every request passes (https, a public
//     host); the caller also resolves the token and revoke hosts before it
//     sends anything (resolvesToPublic)
//   - the client secret and the authorization code go only to token_url
//     (and the secret to revoke_url, when one is set); the access token
//     goes only to the row's endpoint, as for every connection
//   - a stored token set records the binding it was signed in under (the
//     row's kind, endpoint and whole config); a token whose binding no
//     longer matches the row is not used, and a sign-in whose row changed
//     while it was under way is discarded. The database drops tokens and
//     the client secret when the config moves (integrations_rebind_drops_secret).
//
// Pure apart from `revoke` (given its fetch) and the binding digest. No
// Deno globals, so web/tests imports it.

import { isSafeEndpoint } from "./safeEndpoint.ts";
import { sha256Hex } from "./googleOAuth.ts";
import type { OAuthFetch, OAuthProfile, OAuthProvider, OAuthTokenSet } from "./oauthProviders.ts";

export const CUSTOM_PROVIDER_ID = "custom";

export type TokenAuthMethod = "client_secret_post" | "client_secret_basic" | "none";
export const TOKEN_AUTH_METHODS: readonly TokenAuthMethod[] = ["client_secret_post", "client_secret_basic", "none"];

export interface CustomOAuthConfig {
  authorize_url: string;
  token_url: string;
  revoke_url: string | null;
  scopes: string[];
  /** Absent on a draft: the person enters the client they registered. */
  client_id: string | null;
  token_auth: TokenAuthMethod;
  authorize_params: Record<string, string>;
  token_params: Record<string, string>;
}

const MAX_URL = 2000;
const MAX_SCOPES = 50;
const MAX_SCOPE = 256;
const MAX_CLIENT_ID = 512;
const MAX_PARAMS = 20;
const MAX_PARAM_VALUE = 1000;
const PARAM_KEY = /^[A-Za-z0-9_.-]{1,64}$/;
/** A control character: none of these values may break a URL or a header. */
const hasControl = (v: string) => [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
/** Whitespace too: a scope is joined with spaces. */
const hasUnsafe = (v: string) => /\s/.test(v) || hasControl(v);

/** The parameters the flow itself sets; a config may not supply them. */
const RESERVED_AUTHORIZE_PARAMS = new Set(["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope"]);
const RESERVED_TOKEN_PARAMS = new Set(["grant_type", "code", "redirect_uri", "code_verifier", "client_id", "client_secret", "refresh_token", "token", "token_type_hint"]);

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);

function hostOf(raw: string): string | null {
  try { return new URL(raw).hostname.toLowerCase().replace(/\.+$/, ""); } catch { return null; }
}

function checkUrl(label: string, raw: unknown, errors: string[]): string | null {
  if (typeof raw !== "string" || !raw.trim()) {
    errors.push(`${label} が要ります`);
    return null;
  }
  const url = raw.trim();
  if (url.length > MAX_URL) errors.push(`${label} は ${MAX_URL} 文字以内にしてください`);
  else if (!isSafeEndpoint(url)) errors.push(`${label} は https の公開ホストにしてください`);
  else if (new URL(url).hash) errors.push(`${label} に # 以降は付けられません`);
  else return url;
  return null;
}

function checkParams(label: string, raw: unknown, reserved: ReadonlySet<string>, errors: string[]): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  const o = obj(raw);
  if (!o) {
    errors.push(`${label} は文字列の値を持つオブジェクトにしてください`);
    return {};
  }
  const entries = Object.entries(o);
  if (entries.length > MAX_PARAMS) errors.push(`${label} は ${MAX_PARAMS} 個までです`);
  const out: Record<string, string> = {};
  for (const [key, value] of entries.slice(0, MAX_PARAMS)) {
    if (!PARAM_KEY.test(key)) { errors.push(`${label} の名前が正しくありません: ${key.slice(0, 64)}`); continue; }
    if (reserved.has(key.toLowerCase())) { errors.push(`${label} に ${key} は書けません（流れが決める値です）`); continue; }
    if (typeof value !== "string" || value.length > MAX_PARAM_VALUE || hasControl(value)) {
      errors.push(`${label}.${key} は ${MAX_PARAM_VALUE} 文字以内の文字列にしてください`);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Pure. A connection's OAuth config, checked. `requireClientId`: a
 * connection needs its client ID to sign in; a draft never carries one.
 * Errors are Japanese, in the drafting rules' voice — they go back to the
 * drafting model as its feedback; elsewhere only whether the config is
 * null matters.
 */
export function parseCustomOAuthConfig(raw: unknown, opts: { requireClientId: boolean }): { config: CustomOAuthConfig | null; errors: string[] } {
  const errors: string[] = [];
  const o = obj(raw);
  if (!o) return { config: null, errors: ["OAuth の設定はオブジェクトにしてください"] };
  const authorize = checkUrl("認可 URL（authorize_url）", o.authorize_url, errors);
  const token = checkUrl("トークン URL（token_url）", o.token_url, errors);
  const revoke = o.revoke_url === undefined || o.revoke_url === null || o.revoke_url === ""
    ? null
    : checkUrl("取り消し URL（revoke_url）", o.revoke_url, errors);

  let scopes: string[] = [];
  if (o.scopes !== undefined && o.scopes !== null) {
    if (!Array.isArray(o.scopes)) errors.push("scopes は文字列の配列にしてください");
    else {
      if (o.scopes.length > MAX_SCOPES) errors.push(`scopes は ${MAX_SCOPES} 個までです`);
      for (const s of o.scopes.slice(0, MAX_SCOPES)) {
        if (typeof s !== "string" || !s || s.length > MAX_SCOPE || hasUnsafe(s)) {
          errors.push(`scope は空白を含まない ${MAX_SCOPE} 文字以内の文字列にしてください: ${String(s).slice(0, 60)}`);
        } else if (!scopes.includes(s)) scopes.push(s);
      }
    }
  }

  let clientId: string | null = null;
  if (o.client_id !== undefined && o.client_id !== null && o.client_id !== "") {
    if (!opts.requireClientId) errors.push("client_id は人が入れる値です。起草では書かないでください");
    else if (typeof o.client_id !== "string" || o.client_id.length > MAX_CLIENT_ID || hasUnsafe(o.client_id)) {
      errors.push(`client_id は空白を含まない ${MAX_CLIENT_ID} 文字以内の文字列にしてください`);
    } else clientId = o.client_id;
  } else if (opts.requireClientId) errors.push("client_id が要ります");

  const tokenAuth = (o.token_auth ?? "client_secret_post") as TokenAuthMethod;
  if (!TOKEN_AUTH_METHODS.includes(tokenAuth)) errors.push("token_auth は client_secret_post / client_secret_basic / none のいずれかにしてください");

  const authorizeParams = checkParams("authorize_params", o.authorize_params, RESERVED_AUTHORIZE_PARAMS, errors);
  const tokenParams = checkParams("token_params", o.token_params, RESERVED_TOKEN_PARAMS, errors);

  if (errors.length || !authorize || !token) return { config: null, errors };
  return {
    config: {
      authorize_url: authorize, token_url: token, revoke_url: revoke, scopes,
      client_id: clientId, token_auth: tokenAuth,
      authorize_params: authorizeParams, token_params: tokenParams,
    },
    errors,
  };
}

/** Pure. The config as it is stored on a row: canonical keys only. */
export function storedCustomOAuthConfig(config: CustomOAuthConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {
    authorize_url: config.authorize_url, token_url: config.token_url, scopes: config.scopes, token_auth: config.token_auth,
  };
  if (config.revoke_url) out.revoke_url = config.revoke_url;
  if (config.client_id) out.client_id = config.client_id;
  if (Object.keys(config.authorize_params).length) out.authorize_params = config.authorize_params;
  if (Object.keys(config.token_params).length) out.token_params = config.token_params;
  return out;
}

/** Pure. The hosts a config sends the person (authorize) and the client
 *  secret and code (token, revoke) to — what a person confirms before a
 *  drafted config is activated. */
export function customOAuthHosts(config: Pick<CustomOAuthConfig, "authorize_url" | "token_url" | "revoke_url">): { authorize: string | null; token: string | null; revoke: string | null } {
  return { authorize: hostOf(config.authorize_url), token: hostOf(config.token_url), revoke: config.revoke_url ? hostOf(config.revoke_url) : null };
}

type RowLike = {
  kind?: string | null;
  endpoint?: string | null;
  auth_type?: string | null;
  oauth_config?: unknown;
} | null | undefined;

/** Pure. A row's OAuth config, or null: not an OAuth row, or one whose
 *  config is missing or does not pass (a row without its client ID cannot
 *  sign in, so it reads as none). */
export function customOAuthConfigOf(row: RowLike): CustomOAuthConfig | null {
  if (!row || row.auth_type !== "oauth" || row.oauth_config === undefined || row.oauth_config === null) return null;
  if (row.kind !== "http" && row.kind !== "mcp") return null;
  return parseCustomOAuthConfig(row.oauth_config, { requireClientId: true }).config;
}

/** JSON with object keys sorted, so equal configs hash equally. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/** The binding a token set is signed in under: the row's kind, endpoint and
 *  whole OAuth config (client ID included). A token from another binding —
 *  the row was repointed, or its sign-in URLs or client changed — is not
 *  this connection's. */
export async function customOAuthBinding(row: { kind: string; endpoint: string; oauth_config?: unknown }): Promise<string> {
  return sha256Hex(canonical({ kind: row.kind, endpoint: row.endpoint, oauth_config: row.oauth_config ?? null }));
}

const BINDING = /^[0-9a-f]{64}$/;

/** The stored token set of a per-connection sign-in, or null. */
export function parseCustomTokenSet(raw: unknown): OAuthTokenSet | null {
  let o: unknown = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); } catch { return null; }
  }
  const r = obj(o);
  if (!r || r.v !== 1 || r.provider !== CUSTOM_PROVIDER_ID) return null;
  if (typeof r.access_token !== "string" || !r.access_token) return null;
  if (r.refresh_token !== undefined && (typeof r.refresh_token !== "string" || !r.refresh_token)) return null;
  if (r.expires_at !== undefined && (typeof r.expires_at !== "number" || !Number.isFinite(r.expires_at))) return null;
  if (typeof r.scope !== "string") return null;
  if (r.binding !== undefined && (typeof r.binding !== "string" || !BINDING.test(r.binding))) return null;
  const out: OAuthTokenSet = { v: 1, provider: CUSTOM_PROVIDER_ID, access_token: r.access_token, scope: r.scope };
  if (r.refresh_token) out.refresh_token = r.refresh_token as string;
  if (r.expires_at !== undefined) out.expires_at = r.expires_at as number;
  if (r.binding) out.binding = r.binding as string;
  return out;
}

/**
 * Pure. The token set to store after a standard token response (RFC 6749
 * §5.1). A refresh that answers a new refresh token replaces the stored
 * one; one that answers none keeps the previous. expires_in is optional:
 * without it the token is used until the service refuses it. A token type
 * other than bearer cannot be sent as one, so it is refused. The binding
 * rides along from the previous set (a refresh) — a sign-in sets it.
 */
export function customTokenSetFrom(res: unknown, nowMs: number, scopes: readonly string[], previous?: OAuthTokenSet | null): OAuthTokenSet | null {
  const r = obj(res);
  if (!r) return null;
  const access = typeof r.access_token === "string" ? r.access_token : "";
  if (!access) return null;
  if (r.token_type !== undefined && (typeof r.token_type !== "string" || r.token_type.toLowerCase() !== "bearer")) return null;
  const out: OAuthTokenSet = {
    v: 1, provider: CUSTOM_PROVIDER_ID, access_token: access,
    scope: typeof r.scope === "string" ? r.scope : previous?.scope ?? scopes.join(" "),
  };
  const refresh = typeof r.refresh_token === "string" && r.refresh_token ? r.refresh_token : previous?.refresh_token;
  if (refresh) out.refresh_token = refresh;
  const expiresIn = typeof r.expires_in === "number" ? r.expires_in : typeof r.expires_in === "string" ? Number(r.expires_in) : NaN;
  if (Number.isFinite(expiresIn) && expiresIn > 0) out.expires_at = nowMs + expiresIn * 1000;
  if (previous?.binding) out.binding = previous.binding;
  return out;
}

/** RFC 6749 §2.3.1: the client's id and secret, form-encoded, as HTTP Basic. */
export function basicClientAuth(clientId: string, clientSecret: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
  return `Basic ${btoa(`${enc(clientId)}:${enc(clientSecret)}`)}`;
}

/** The provider a per-connection config signs in with. */
export function customOAuthProvider(config: CustomOAuthConfig): OAuthProvider {
  return {
    id: CUSTOM_PROVIDER_ID,
    name: "OAuth",
    tokenAuth: config.token_auth,
    tokenUrl: config.token_url,
    // Never claims a row by itself: signInOf builds this provider from the row.
    profileOf: () => null,
    authorizeUrl: (p) => {
      const u = new URL(config.authorize_url);
      for (const [k, v] of Object.entries(config.authorize_params)) u.searchParams.set(k, v);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", p.clientId);
      u.searchParams.set("redirect_uri", p.redirectUri);
      if (p.profile.scopes.length) u.searchParams.set("scope", p.profile.scopes.join(" "));
      u.searchParams.set("state", p.state);
      u.searchParams.set("code_challenge", p.codeChallenge);
      u.searchParams.set("code_challenge_method", "S256");
      return u.toString();
    },
    tokenParams: () => ({ ...config.token_params }),
    tokenSetFrom: (res, nowMs, previous) => customTokenSetFrom(res, nowMs, config.scopes, previous?.provider === CUSTOM_PROVIDER_ID ? previous : null),
    parse: parseCustomTokenSet,
    // A service may answer scope in its own spelling, or not at all (it
    // granted what was asked): the connection test is what tells.
    grants: () => true,
    // Whether a service rotates refresh tokens is not known in advance;
    // reading back what a concurrent refresh stored is right either way.
    refresh: { reauthErrors: ["invalid_grant"], rotates: true },
    revoke: config.revoke_url
      ? async ({ client, tokens, fetch }) => revokeAt(config, client, tokens, fetch)
      : undefined,
  };
}

/** RFC 7009: the refresh token (or, without one, the access token) at the
 *  config's revoke URL, with the client authenticated as for the token
 *  endpoint. True when the service answered 200. */
async function revokeAt(config: CustomOAuthConfig, client: { clientId: string; clientSecret: string } | null, tokens: OAuthTokenSet, fetchImpl: OAuthFetch): Promise<boolean> {
  if (!config.revoke_url || !client) return false;
  const token = tokens.refresh_token ?? tokens.access_token;
  const form: Record<string, string> = { token, token_type_hint: tokens.refresh_token ? "refresh_token" : "access_token" };
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (config.token_auth === "client_secret_basic") headers.authorization = basicClientAuth(client.clientId, client.clientSecret);
  else {
    form.client_id = client.clientId;
    if (config.token_auth === "client_secret_post") form.client_secret = client.clientSecret;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetchImpl(config.revoke_url, { method: "POST", headers, body: new URLSearchParams(form).toString(), signal: ctl.signal, redirect: "manual" });
    await res.body?.cancel();
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** The profile a per-connection sign-in runs under: the row as it is, with
 *  the config's scopes. No account check — a service's "who am I" is its
 *  own; the connection test asks the endpoint instead. */
export function customOAuthProfile(row: { preset?: string | null; kind: string; endpoint: string }, config: CustomOAuthConfig): OAuthProfile {
  return { preset: row.preset ?? "", kind: row.kind === "mcp" ? "mcp" : "http", endpoint: row.endpoint, scopes: config.scopes };
}
