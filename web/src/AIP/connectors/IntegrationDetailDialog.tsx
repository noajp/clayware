'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ExternalLink } from '@/ui/icons';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, MenuCheck } from '@/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { appDialog } from '@/Function/shared/appDialogStore';
import { formatError } from '@/Function/shared/formatError';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { ToggleRow } from '@/Function/settings/SettingsControls';
import type { Integration } from '@/types/database';
import {
  KIND_LABELS, SOURCE_LABELS, TOKEN_AUTH_LABELS, darkIconFor, buildIntegrationRow, customOAuthFormOf, customOAuthHosts, oauthProviderOf,
  oauthRedirectUriFor, readLastTest, signsInWithOAuth, testOutcomeLabel, type CustomOAuthForm, type OAuthProvider,
  type IntegrationAuthType, type IntegrationDelegation, type IntegrationPreset, type IntegrationSource, type TokenAuthMethod,
} from './catalog';
import { useIntegrationActions, useIntegrationOAuthStatus } from './data';
import { CopyField } from './CopyField';
import { supabaseProjectUrl } from '@/lib/supabase';
import { CommandPermissions } from './CommandPermissions';
import { useActiveDraftForIntegration } from './draftData';
import { draftPermissionHashWeb, draftStructureHashWeb } from './draftModel';

// One integration: connect a preset (or a custom MCP / API), or manage an
// existing connection — credential, on/off, connection test,
// disconnect. The credential is write-only: it is sent to Vault and the
// dialog only ever knows whether one is set (`secret_id`).
//
// An OAuth preset (Google Drive, GitHub) has no credential field. Connect
// creates the row and sends the browser to the provider's sign-in
// (integration-oauth); the dialog then shows the account it signed in as,
// with Reconnect. Disconnect revokes the grant at the provider before
// deleting the row. Until the server has that provider's OAuth client,
// Connect stays disabled with a note saying so.
//
// Whether agents may use a connection at all is the on/off; whether its
// writes ask first is the delegation, chosen here — a new connection
// starts at approve_each. For an existing connection, on/off and
// delegation apply at once (optimistically, rolled back on failure); custom name / endpoint / auth are
// saved with 「保存」. Members see the same dialog read-only.
//
// A custom API / MCP connection can also sign in with OAuth through an app
// the owner registered at the service (catalog.ts's CustomOAuthForm): the
// dialog takes the sign-in URLs, scopes and client, shows the redirect URI
// to register, sends the client secret to Vault, and signs in like a
// preset does. Where sign-in goes and where the secret goes are said in
// plain words before the person signs in.

/** What a sign-in connection says, per provider (English source strings for t()). */
const OAUTH_COPY: Record<OAuthProvider, {
  opening: string; signIn: string; notSetUp: string; howItConnects: string; whose: string; actsAs: string; disconnect: string; revokeFailed: string;
}> = {
  google: {
    opening: 'Opening Google…',
    signIn: 'Sign in with Google',
    notSetUp: 'Google sign-in is not set up yet. An administrator needs to register the Google OAuth client before this can be connected.',
    howItConnects: 'Connect opens Google sign-in. Clayware asks only for access to files it creates or that you choose.',
    whose: 'Access belongs to the Google account: if it is connected in another Space too, agents there see the files Clayware created here, and disconnecting either one disconnects both.',
    actsAs: 'Files are created as {account}.',
    disconnect: "Disconnect {name}? Clayware's access is revoked at Google. If the same Google account is connected in another Space, that connection stops working too.",
    revokeFailed: 'Clayware could not revoke its access at Google. Remove it from your Google Account under Security › Third-party access.',
  },
  github: {
    opening: 'Opening GitHub…',
    signIn: 'Sign in with GitHub',
    notSetUp: 'GitHub sign-in is not set up yet. An administrator needs to register the GitHub OAuth App before this can be connected.',
    howItConnects: 'Connect opens GitHub sign-in. Clayware asks to read and write the repositories you can reach, to review and merge pull requests and to let agents push branches.',
    whose: 'Access belongs to the GitHub account: reviews, comments and merges from Clayware are posted as that account, and agents act as it. Disconnecting in one Space disconnects every Space that uses the same account.',
    actsAs: 'Pull requests, reviews and merges are made as {account}.',
    disconnect: "Disconnect {name}? Clayware's access is revoked at GitHub. If the same GitHub account is connected in another Space, that connection stops working too.",
    revokeFailed: 'Clayware could not revoke its access at GitHub. Remove it on GitHub under Settings › Applications › Authorized OAuth Apps.',
  },
  // Microsoft has no way for an app to withdraw a person's grant, so a
  // disconnect only deletes what Clayware holds; revokeFailed says where
  // the permission itself is removed.
  microsoft: {
    opening: 'Opening Microsoft…',
    signIn: 'Sign in with Microsoft',
    notSetUp: 'Microsoft sign-in is not set up yet. An administrator needs to register the Microsoft Entra app before this can be connected.',
    howItConnects: 'Connect opens Microsoft sign-in with a work or school account. Clayware asks only to read your basic profile (name and email).',
    whose: 'Access belongs to the Microsoft account. Your organization’s administrator may need to approve Clayware before you can connect; if so, Clayware gives you a link to send them.',
    actsAs: 'Connected as {account}.',
    disconnect: 'Disconnect {name}? Clayware deletes the access it holds for this connection.',
    revokeFailed: 'Clayware deleted the access it held. The permission you granted stays with your Microsoft account until you or your administrator remove it there.',
  },
};

/**
 * The gmail preset's own copy: it signs in with the same Google client
 * as Drive, but what the consent grants is mail — reading, sending and
 * labeling, never deleting — and the Drive-flavored sentences above
 * would misstate it.
 */
const GMAIL_OAUTH_COPY: typeof OAUTH_COPY.google = {
  opening: 'Opening Google…',
  signIn: 'Sign in with Google',
  notSetUp: 'Google sign-in is not set up yet. An administrator needs to register the Google OAuth client before this can be connected.',
  howItConnects: 'Connect opens Google sign-in. Clayware asks to read your mail, send mail and change labels. Whether sending waits for a person follows this Space’s approval mode, and agents cannot delete any mail.',
  whose: 'Access belongs to the Google account: if it is connected in another Space too, agents there use the same mailbox, and disconnecting either one disconnects both.',
  actsAs: 'Mail is read and sent as {account}.',
  disconnect: "Disconnect {name}? Clayware's access is revoked at Google. If the same Google account is connected in another Space, that connection stops working too.",
  revokeFailed: 'Clayware could not revoke its access at Google. Remove it from your Google Account under Security › Third-party access.',
};

const CUSTOM_AUTH_LABELS: Record<'none' | 'bearer' | 'header' | 'oauth', string> = {
  none: 'None',
  bearer: 'Bearer token',
  header: 'Custom header',
  oauth: 'Sign in (OAuth)',
};

/** The delegation choice's words (English source strings for t()). */
const DELEGATION_LABELS: Record<IntegrationDelegation, string> = {
  approve_each: 'Approve each write',
  full_delegation: 'Full delegation',
};

const DELEGATION_DESCRIPTIONS: Record<IntegrationDelegation, string> = {
  approve_each: 'Agents ask before each write on this connection, as each command is set.',
  full_delegation: 'Agents write without asking on this connection. Critical operations still ask every time, and “Not allowed” and conditions still hold.',
};

/** A service's logo on a tile, or the name's first letter when it has none. */
export function IntegrationIcon({ name, icon, size }: { name: string; icon: string | null; size: number }) {
  const style = { width: size, height: size };
  if (icon) {
    const dark = darkIconFor(icon);
    const logo = Math.round(size * 0.58);
    return (
      <span aria-hidden="true" style={style}
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={logo} height={logo} className={cn('object-contain', dark && 'dark:hidden')} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {dark && <img src={dark} alt="" width={logo} height={logo} className="hidden object-contain dark:block" />}
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={style}
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--surface-strong)] font-semibold text-[var(--text-secondary)]">
      <span style={{ fontSize: Math.round(size * 0.42) }}>{name.trim().charAt(0) || '?'}</span>
    </span>
  );
}

function SourceChip({ source }: { source: IntegrationSource }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[var(--control-tab-radius)] border border-[var(--border-default)] px-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
      {t(SOURCE_LABELS[source])}
    </span>
  );
}

export function IntegrationDetailDialog({ spaceId, preset, integration, canEdit, onClose, onCreated, initial }: {
  spaceId: string;
  preset: IntegrationPreset;
  integration: Integration | null;
  /** A new custom connection's starting values (a server found in the registry). */
  initial?: { name: string; endpoint: string; auth: IntegrationAuthType; authHeader: string | null };
  canEdit: boolean;
  onClose: () => void;
  onCreated: (created: Integration) => void;
}) {
  const { t, locale } = useI18n();
  const actions = useIntegrationActions(spaceId);
  const isNew = !integration;

  const [name, setName] = useState(integration?.name ?? initial?.name ?? '');
  const [endpoint, setEndpoint] = useState(integration?.endpoint ?? initial?.endpoint ?? preset.endpoint ?? '');
  const [auth, setAuth] = useState<IntegrationAuthType>(integration?.auth_type ?? initial?.auth ?? preset.auth);
  const [authHeader, setAuthHeader] = useState(integration?.auth_header ?? initial?.authHeader ?? '');
  const [oauthForm, setOAuthForm] = useState<CustomOAuthForm>(() => customOAuthFormOf(integration?.oauth_config));
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [editingClientSecret, setEditingClientSecret] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [editingSecret, setEditingSecret] = useState(false);
  const secretRef = useRef<HTMLInputElement>(null);
  const [newEnabled, setNewEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delegation is the person's choice, not a constant: a new connection
  // starts at approve_each — agents ask before writes, as each command
  // is set — with full delegation one tap away; an existing connection's
  // switch applies at once, like its on/off. (A model connection is not
  // a tool agents call: its delegation is inert, keeps the historical
  // default, and is not shown.)
  const [newDelegation, setNewDelegation] = useState<IntegrationDelegation>(
    integration?.delegation ?? (preset.kind === 'model' ? 'full_delegation' : 'approve_each'),
  );
  const delegation: IntegrationDelegation = integration?.delegation ?? newDelegation;
  const setDelegation = (v: IntegrationDelegation) => {
    if (!integration) { setNewDelegation(v); return; }
    setError(null);
    actions.update.mutate({ id: integration.id, patch: { delegation: v } }, { onError: (e) => setError(t(formatError(e))) });
  };
  const enabled = integration?.enabled ?? newEnabled;
  const needsSecret = auth === 'bearer' || auth === 'header';
  const hasSecret = !!integration?.secret_id;
  const lastTest = readLastTest(integration?.last_test);
  const unavailable = preset.unavailableReason;
  const readOnly = !canEdit || !!unavailable;
  const oauth = signsInWithOAuth(preset);
  // A model provider is not a tool agents call.
  const isModel = preset.kind === 'model';
  const provider = oauthProviderOf(preset) ?? 'google';
  const copy = preset.id === 'gmail' ? GMAIL_OAUTH_COPY : OAUTH_COPY[provider];
  const oauthStatus = useIntegrationOAuthStatus(oauth && canEdit, provider);
  const oauthReady = oauthStatus === true;
  const oauthAccount = integration?.external_account ?? null;
  // A custom connection signing in through the owner's own app.
  const ownOAuth = preset.custom && !isModel && auth === 'oauth';
  const oauthConnected = (oauth || ownOAuth) && hasSecret;
  const storedOAuthForm = customOAuthFormOf(integration?.oauth_config);
  const oauthFormDirty = ownOAuth && JSON.stringify(oauthForm) !== JSON.stringify(storedOAuthForm);
  const hasClientSecret = !!integration?.oauth_client_secret_id;
  const clientSecretNeeded = oauthForm.tokenAuth !== 'none';
  const customDirty = !!integration && preset.custom && (
    name.trim() !== integration.name || endpoint.trim() !== integration.endpoint
    || auth !== integration.auth_type || (auth === 'header' && authHeader.trim() !== (integration.auth_header ?? ''))
    || oauthFormDirty
  );
  // A saved connection with its client in place can sign in; edits are saved first.
  const ownOAuthReady = ownOAuth && !!integration && integration.auth_type === 'oauth' && !customDirty
    && (!clientSecretNeeded || hasClientSecret);
  const busy = actions.create.isPending || actions.update.isPending || actions.remove.isPending || actions.secret.isPending
    || actions.clientSecret.isPending || actions.signIn.isPending || actions.revoke.isPending;

  const draft = () => ({ name, endpoint, auth, authHeader, oauth: oauthForm, oauthKeep: integration?.oauth_config ?? null, delegation, enabled });

  /** Leaves the app for the provider's sign-in; it comes back to the Settings page it left. */
  const signIn = async (id: string) => {
    const url = await actions.signIn.mutateAsync(id);
    window.location.assign(url);
  };

  const connect = async () => {
    setError(null);
    const built = buildIntegrationRow(preset, spaceId, draft());
    if (!built.ok) { setError(t(built.error)); return; }
    if (needsSecret && !secretInput.trim()) {
      setError(t('Enter the {label}.', { label: t(preset.credentialLabel) }));
      secretRef.current?.focus();
      return;
    }
    if (ownOAuth && clientSecretNeeded && !clientSecretInput.trim()) { setError(t('Enter the client secret.')); return; }
    let created: Integration;
    try {
      created = await actions.create.mutateAsync({
        row: built.row,
        secret: needsSecret ? secretInput.trim() : '',
        clientSecret: ownOAuth && clientSecretNeeded ? clientSecretInput.trim() : '',
      });
      setSecretInput('');
      setClientSecretInput('');
      onCreated(created);
    } catch (e) { setError(t(formatError(e))); return; }
    if (oauth || ownOAuth) {
      // The row stays when sign-in can't start; Sign in retries.
      try { await signIn(created.id); } catch (e) { setError(t(formatError(e))); }
    }
  };

  const reconnect = async () => {
    if (!integration) return;
    setError(null);
    try { await signIn(integration.id); } catch (e) { setError(t(formatError(e))); }
  };

  const setLive = (patch: { enabled?: boolean }) => {
    if (!integration) {
      if (patch.enabled !== undefined) setNewEnabled(patch.enabled);
      return;
    }
    setError(null);
    actions.update.mutate({ id: integration.id, patch }, { onError: (e) => setError(t(formatError(e))) });
  };

  const saveCustom = async () => {
    if (!integration) return;
    setError(null);
    const built = buildIntegrationRow(preset, spaceId, draft());
    if (!built.ok) { setError(t(built.error)); return; }
    const { name: n, endpoint: ep, auth_type, auth_header, oauth_config } = built.row;
    // A credential belongs to its destination: changing where or how it is
    // sent drops it (a database rule), so say so before it happens.
    const rebinds = ep !== integration.endpoint || auth_type !== integration.auth_type || (auth_header ?? null) !== (integration.auth_header ?? null);
    // The same rule for a sign-in: new sign-in settings (or a new address)
    // end the current sign-in, and a new token URL, revocation URL, client
    // or client authentication deletes the client secret as well.
    const signedInBefore = integration.auth_type === 'oauth' && (!!integration.secret_id || hasClientSecret);
    if (signedInBefore && (rebinds || oauthFormDirty)) {
      if (!await appDialog.confirm(t('Changing the sign-in settings ends the current sign-in. If the token URL, revocation URL, client ID or client authentication changes, the stored client secret is deleted too. Continue?'))) return;
    } else if (rebinds && integration.secret_id
      && !await appDialog.confirm(t('Changing the address or how the credential is sent deletes the stored credential. Enter it again afterwards. Continue?'))) return;
    try {
      await actions.update.mutateAsync({ id: integration.id, patch: { name: n, endpoint: ep, auth_type, auth_header, oauth_config } });
    } catch (e) { setError(t(formatError(e))); }
  };

  const saveClientSecret = async () => {
    if (!integration || !clientSecretInput.trim()) return;
    setError(null);
    try {
      await actions.clientSecret.mutateAsync({ id: integration.id, value: clientSecretInput.trim() });
      setClientSecretInput('');
      setEditingClientSecret(false);
    } catch (e) { setError(t(formatError(e))); }
  };

  const clearClientSecret = async () => {
    if (!integration) return;
    if (!await appDialog.confirm(t('Delete the stored client secret for {name}? It cannot sign in or renew its sign-in until a new one is set.', { name: integration.name }))) return;
    setError(null);
    try { await actions.clientSecret.mutateAsync({ id: integration.id, value: '' }); } catch (e) { setError(t(formatError(e))); }
  };

  const saveSecret = async () => {
    if (!integration || !secretInput.trim()) return;
    setError(null);
    try {
      await actions.secret.mutateAsync({ id: integration.id, value: secretInput.trim() });
      setSecretInput('');
      setEditingSecret(false);
    } catch (e) { setError(t(formatError(e))); }
  };

  const clearSecret = async () => {
    if (!integration) return;
    if (!await appDialog.confirm(t('Delete the stored credential for {name}? Agents can no longer use this connection until a new one is set.', { name: integration.name }))) return;
    setError(null);
    try { await actions.secret.mutateAsync({ id: integration.id, value: '' }); } catch (e) { setError(t(formatError(e))); }
  };

  const runTest = () => {
    if (!integration) return;
    setError(null);
    actions.test.mutate(integration.id, { onError: (e) => setError(t(formatError(e))) });
  };

  const disconnect = async () => {
    if (!integration) return;
    const question = oauthConnected
      ? (ownOAuth
        ? t('Disconnect {name}? Clayware revokes its access at the service when it can, and deletes the access it holds.', { name: integration.name })
        : t(copy.disconnect, { name: integration.name }))
      : t('Disconnect {name}? Its credential is deleted and agents can no longer use it.', { name: integration.name });
    if (!await appDialog.confirm(question)) return;
    setError(null);
    try {
      if (oauthConnected) {
        // Revoke the grant at the provider first; deleting the row alone would
        // only forget the tokens. If the provider can't confirm it, still
        // disconnect and say where to remove the access by hand.
        let revoked = false;
        try {
          revoked = (await actions.revoke.mutateAsync(integration.id)).revoked;
        } catch { /* reported below */ }
        if (!revoked) {
          await appDialog.alert(ownOAuth
            ? t('Clayware deleted the access it held. If the service still lists the permission you granted, remove it in the service’s settings.')
            : t(copy.revokeFailed));
        }
      }
      await actions.remove.mutateAsync(integration.id);
      onClose();
    } catch (e) { setError(t(formatError(e))); }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-48px)] overflow-y-auto sm:max-w-lg">
        {/* The first screen answers what this is and how it connects: who
            made it, where its docs are, and — for a service that connects
            by signing in — the one button that does it all. A connection
            that takes a pasted credential, or a custom one, is a form, so
            its Connect stays under the form. */}
        <DialogHeader>
          <div className="flex items-start gap-3">
            <IntegrationIcon name={integration?.name ?? preset.name} icon={integration?.icon ?? preset.icon} size={40} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{integration?.name ?? t(preset.name)}</DialogTitle>
              <DialogDescription className="mt-1 text-[12px]">{t(preset.description)}</DialogDescription>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <SourceChip source={preset.source} />
                {!preset.custom && <span>{t('Built by {name}', { name: t(preset.builtBy) })}</span>}
                {!preset.custom && <span aria-hidden="true">·</span>}
                <span>{t(KIND_LABELS[preset.kind])}</span>
                {preset.docsUrl && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a href={preset.docsUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-foreground hover:underline">
                      {t('Docs')}
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
          {canEdit && isNew && !preset.custom && (oauth || unavailable) && (
            <div className="pt-3">
              {unavailable ? (
                <Button variant="primary" size="sm" disabled>{t('Connect')}</Button>
              ) : oauthStatus === false ? (
                <Button variant="primary" size="sm" disabled>{t('Needs setup')}</Button>
              ) : (
                <Button variant="primary" size="sm" onClick={connect} disabled={busy || !oauthReady}>
                  {actions.create.isPending || actions.signIn.isPending ? t(copy.opening) : t(copy.signIn)}
                </Button>
              )}
            </div>
          )}
        </DialogHeader>

        {unavailable && (
          <p className="rounded-md bg-[var(--status-warning-subtle)] px-3 py-2 text-[12px] text-foreground">{t(unavailable)}</p>
        )}
        {!canEdit && !unavailable && (
          <p className="text-[12px] text-muted-foreground">{t('Only Space owners can connect or change integrations. You can see what is connected.')}</p>
        )}
        {oauth && canEdit && oauthStatus === false && (
          <p className="rounded-md bg-[var(--status-warning-subtle)] px-3 py-2 text-[12px] text-foreground">
            {t(copy.notSetUp)}
          </p>
        )}

        <div className="space-y-4">
          {preset.custom && (
            <Field label={t('Name')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} placeholder={preset.kind === 'mcp' ? t('My MCP server') : isModel ? t('My model provider') : t('My API')} className="h-8 text-[13px] md:text-[13px]" />
            </Field>
          )}

          {/* A preset's address is the provider's business, not the person's —
              only a custom connection asks for one. */}
          {preset.custom && (
            <Field label={preset.kind === 'mcp' ? t('Endpoint') : t('Base URL')}>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} disabled={readOnly} inputMode="url"
                placeholder="https://" className="h-8 font-mono text-[12px] md:text-[12px]" />
            </Field>
          )}

          {preset.custom && !isModel && (
            <Field label={t('Authentication')}>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" align="start" disabled={readOnly}>
                      <span>{t(CUSTOM_AUTH_LABELS[auth])}</span>
                      <ChevronDown size={12} aria-hidden="true" className="opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[160px]">
                    {(Object.keys(CUSTOM_AUTH_LABELS) as (keyof typeof CUSTOM_AUTH_LABELS)[]).map((k) => (
                      <DropdownMenuItem key={k} onSelect={() => setAuth(k)} className="gap-2 text-[12px]">
                        <span className="flex-1">{t(CUSTOM_AUTH_LABELS[k])}</span>
                        {auth === k && <MenuCheck />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {auth === 'header' && (
                  <Input value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} disabled={readOnly} aria-label={t('Header name')}
                    placeholder="X-API-Key" className="h-7 w-44 font-mono text-[12px] md:text-[12px]" />
                )}
              </div>
            </Field>
          )}

          {ownOAuth && (
            <OwnOAuthFields
              form={oauthForm} setForm={setOAuthForm} readOnly={readOnly} canEdit={canEdit} busy={busy}
              isNew={isNew} hasClientSecret={hasClientSecret} editingClientSecret={editingClientSecret}
              setEditingClientSecret={setEditingClientSecret} clientSecretInput={clientSecretInput}
              setClientSecretInput={setClientSecretInput} onSaveClientSecret={saveClientSecret} onClearClientSecret={clearClientSecret}
              connected={oauthConnected} account={oauthAccount} ready={ownOAuthReady} dirty={customDirty}
              signingIn={actions.signIn.isPending} onSignIn={reconnect}
            />
          )}

          {oauth && (
            <Field label={t(preset.credentialLabel)}>
              {oauthConnected ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-[13px] text-foreground">
                      {oauthAccount ? t('Connected as {account}', { account: oauthAccount }) : t('Connected')}
                    </span>
                    {canEdit && (
                      <Button variant="ghost" size="xs" onClick={reconnect} disabled={busy || !oauthReady}>
                        {actions.signIn.isPending ? t(copy.opening) : t('Reconnect')}
                      </Button>
                    )}
                  </div>
                  {oauthAccount && (
                    <p className="text-[12px] text-muted-foreground">{t(copy.actsAs, { account: oauthAccount })}</p>
                  )}
                  <p className="text-[12px] text-muted-foreground">
                    {t(copy.whose)}
                  </p>
                </div>
              ) : integration ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] text-muted-foreground">{t('Not connected')}</span>
                  {canEdit && (
                    <Button variant="secondary" size="sm" onClick={reconnect} disabled={busy || !oauthReady}>
                      {actions.signIn.isPending ? t(copy.opening) : t(copy.signIn)}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5 text-[12px] text-muted-foreground">
                  <p>{t(copy.howItConnects)}</p>
                  <p>{t(copy.whose)}</p>
                </div>
              )}
            </Field>
          )}

          {needsSecret && (
            <Field label={preset.custom ? t('Credential') : t(preset.credentialLabel)}>
              {integration && hasSecret && !editingSecret ? (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-foreground">{t('Set')}</span>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="xs" onClick={() => setEditingSecret(true)} disabled={busy}>{t('Update')}</Button>
                      <Button variant="danger" size="xs" onClick={clearSecret} disabled={busy}>{t('Delete')}</Button>
                    </>
                  )}
                </div>
              ) : canEdit && !unavailable ? (
                <div className="flex items-center gap-2">
                  <Input ref={secretRef} type="password" autoComplete="off" value={secretInput} onChange={(e) => setSecretInput(e.target.value)}
                    placeholder={integration && !hasSecret ? t('Not set') : ''} aria-label={t(preset.credentialLabel)} className="h-8 text-[13px] md:text-[13px]" />
                  {integration && (
                    <>
                      <Button variant="primary" size="sm" onClick={saveSecret} disabled={busy || !secretInput.trim()}>{t('Save')}</Button>
                      {editingSecret && <Button variant="ghost" size="sm" onClick={() => { setEditingSecret(false); setSecretInput(''); }}>{t('Cancel')}</Button>}
                    </>
                  )}
                </div>
              ) : (
                <span className="text-[13px] text-muted-foreground">{hasSecret ? t('Set') : t('Not set')}</span>
              )}
            </Field>
          )}

          {isModel && (
            <p className="text-[12px] text-muted-foreground">
              {t('Choose this connection as an AI agent\'s model in Settings › Team. Element content is sent to this provider when the agent runs.')}
            </p>
          )}

          {/* On/off and delegation are a connection's settings: a new one
              starts on, asking before every write, and both appear once it
              exists — so a first look reads what it is → the one button →
              what will be asked. */}
          {integration && <div className="-my-1">
            <ToggleRow flush label={t('Enabled')} desc={isModel ? t('When off, AI agents on this connection do not run.') : t('When off, agents do not see this connection.')} value={enabled}
              disabled={readOnly} onChange={(v) => setLive({ enabled: v })} />
          </div>}

          {integration && !isModel && (
            <Field label={t('Delegation')}>
              <div className="space-y-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" align="start" disabled={readOnly || busy}>
                      <span>{t(DELEGATION_LABELS[delegation])}</span>
                      <ChevronDown size={12} aria-hidden="true" className="opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[200px]">
                    {(['approve_each', 'full_delegation'] as const).map((v) => (
                      <DropdownMenuItem key={v} onSelect={() => setDelegation(v)} className="gap-2 text-[12px]">
                        <span className="flex-1">{t(DELEGATION_LABELS[v])}</span>
                        {delegation === v && <MenuCheck />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-[12px] text-muted-foreground">{t(DELEGATION_DESCRIPTIONS[delegation])}</p>
              </div>
            </Field>
          )}

          {integration && integration.kind === 'mcp' && (
            <Field label={t('Commands')}>
              <CommandPermissions integration={integration} spaceId={spaceId} readOnly={readOnly} />
            </Field>
          )}

          {integration?.preset === 'ai-drafted' && (
            <DraftDriftNote integration={integration} />
          )}

          {integration && (
            <Field label={t('Connection test')}>
              <div className="space-y-2">
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={runTest} disabled={actions.test.isPending}>
                    {actions.test.isPending ? t('Testing…') : t('Test connection')}
                  </Button>
                )}
                {lastTest ? (
                  <div className="space-y-1.5 text-[12px]">
                    <div className={cn('font-medium', lastTest.code === 'connected' ? 'text-[var(--status-success)]' : lastTest.ok ? 'text-muted-foreground' : 'text-[var(--status-danger)]')}>
                      {t(testOutcomeLabel(lastTest.code))}{lastTest.status ? ` (HTTP ${lastTest.status})` : ''}
                      {lastTest.at && <span className="ml-2 font-normal text-muted-foreground">{new Date(lastTest.at).toLocaleString(locale)}</span>}
                    </div>
                    {lastTest.detail && <p className="text-muted-foreground">{lastTest.detail}</p>}
                    {lastTest.tools.length > 0 && (
                      <ul className="flex flex-wrap gap-1">
                        {lastTest.tools.map((tool) => (
                          <li key={tool.name} className="inline-flex h-5 items-center gap-1 rounded-[var(--control-tab-radius)] border border-[var(--border-default)] px-1.5 font-mono text-[11px] text-foreground">
                            {tool.name}
                            <span className="font-sans text-muted-foreground">{tool.readOnly ? t('read') : t('write')}</span>
                          </li>
                        ))}
                        {lastTest.toolCount != null && lastTest.toolCount > lastTest.tools.length && (
                          <li className="text-[11px] text-muted-foreground">{t('+{count} more', { count: lastTest.toolCount - lastTest.tools.length })}</li>
                        )}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">{t('Not tested yet.')}</p>
                )}
              </div>
            </Field>
          )}
        </div>

        {error && <p role="alert" className="text-[12px] text-[var(--status-danger)]">{error}</p>}

        {canEdit && !unavailable && (
          <DialogFooter className="items-center sm:justify-between">
            {integration ? (
              <Button variant="danger" size="sm" onClick={disconnect} disabled={busy}>{t('Disconnect')}</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>{isNew ? t('Cancel') : t('Close')}</Button>
              {isNew && (preset.custom || !oauth) ? (
                <Button variant="primary" size="sm" onClick={connect} disabled={busy || (oauth && !oauthReady)}>
                  {actions.create.isPending || actions.signIn.isPending ? t('Connecting…') : t('Connect')}
                </Button>
              ) : customDirty ? (
                <Button variant="primary" size="sm" onClick={saveCustom} disabled={busy}>{t('Save')}</Button>
              ) : null}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** §4.11: a drafted connection against what was approved. A drafted
 *  definition is stored trust — it keeps being used — so a change to
 *  its structure (where requests go, how they authenticate, what the
 *  commands are, the guide) is called out loudly, while a permission-
 *  only change, the owner's ordinary tuning, is a quiet note. The
 *  draft's change log says when the approved content last moved. */
function DraftDriftNote({ integration }: { integration: Integration }) {
  const { t, locale } = useI18n();
  const { draft } = useActiveDraftForIntegration(integration.id);
  const [computed, setComputed] = useState<{ key: string; drift: 'structure' | 'permission' | 'none' } | null>(null);
  const structureHash = draft?.activated_structure_hash ?? null;
  const permissionHash = draft?.activated_permission_hash ?? null;
  const contentKey = `${integration.id}:${integration.updated_at}:${structureHash ?? ''}`;
  useEffect(() => {
    if (!draft || !structureHash) return;
    let live = true;
    const content = {
      name: integration.name, endpoint: integration.endpoint, auth_type: integration.auth_type,
      auth_header: integration.auth_header, manifest: integration.manifest, guide: integration.guide,
      oauth_config: integration.oauth_config,
    };
    void (async () => {
      const [s, p] = await Promise.all([draftStructureHashWeb(content), draftPermissionHashWeb(content)]);
      if (!live) return;
      setComputed({
        key: contentKey,
        drift: s !== structureHash ? 'structure' : permissionHash && p !== permissionHash ? 'permission' : 'none',
      });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contentKey carries the row's identity and version
  }, [draft, structureHash, permissionHash, contentKey]);
  const drift = computed && computed.key === contentKey ? computed.drift : null;
  if (!draft) return null;
  const events = [...(draft.change_events ?? [])].slice(-5).reverse();
  return (
    <Field label={t('AI draft')}>
      <div className="space-y-1.5 text-[12px]">
        <p className="text-muted-foreground">
          {draft.decided_at
            ? t('Drafted by the AI and approved on {when}.', { when: new Date(draft.decided_at).toLocaleString(locale) })
            : t('Drafted by the AI.')}
        </p>
        {drift === 'structure' && (
          <p className="font-medium text-[var(--status-danger)]">
            {t('This connection has changed since it was approved. Test it again before relying on it.')}
          </p>
        )}
        {drift === 'permission' && (
          <p className="text-muted-foreground">{t('Its permissions have been changed since it was approved.')}</p>
        )}
        {events.length > 0 && (
          <ul className="space-y-0.5">
            {events.map((e, i) => (
              <li key={i} className="text-muted-foreground">
                {t('Changed {fields} on {when}.', { fields: e.fields.join(', '), when: new Date(e.at).toLocaleString(locale) })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

/** A custom connection's own sign-in: where it goes (the service's URLs
 *  and scopes), the client registered there, the redirect URI to register,
 *  and — once saved — whether it is signed in. The client secret is
 *  write-only, like a credential. */
function OwnOAuthFields(p: {
  form: CustomOAuthForm;
  setForm: (next: CustomOAuthForm) => void;
  readOnly: boolean;
  canEdit: boolean;
  busy: boolean;
  isNew: boolean;
  hasClientSecret: boolean;
  editingClientSecret: boolean;
  setEditingClientSecret: (v: boolean) => void;
  clientSecretInput: string;
  setClientSecretInput: (v: string) => void;
  onSaveClientSecret: () => void;
  onClearClientSecret: () => void;
  connected: boolean;
  account: string | null;
  ready: boolean;
  dirty: boolean;
  signingIn: boolean;
  onSignIn: () => void;
}) {
  const { t } = useI18n();
  const { form, setForm, readOnly } = p;
  const set = (patch: Partial<CustomOAuthForm>) => setForm({ ...form, ...patch });
  const hosts = customOAuthHosts({ authorize_url: form.authorizeUrl.trim(), token_url: form.tokenUrl.trim(), revoke_url: form.revokeUrl.trim() || null });
  const needsSecret = form.tokenAuth !== 'none';
  const input = 'h-8 font-mono text-[12px] md:text-[12px]';
  return (
    <>
      <Field label={t('Redirect URI')}>
        <div className="space-y-1.5">
          <CopyField value={oauthRedirectUriFor(supabaseProjectUrl)} label={t('Redirect URI')} />
          <p className="text-[12px] text-muted-foreground">{t('Register an app at the service with this redirect URI, then enter its client ID and secret here.')}</p>
        </div>
      </Field>
      <Field label={t('Authorization URL')}>
        <Input value={form.authorizeUrl} onChange={(e) => set({ authorizeUrl: e.target.value })} disabled={readOnly} inputMode="url" placeholder="https://" className={input} />
      </Field>
      <Field label={t('Token URL')}>
        <Input value={form.tokenUrl} onChange={(e) => set({ tokenUrl: e.target.value })} disabled={readOnly} inputMode="url" placeholder="https://" className={input} />
      </Field>
      <Field label={t('Revocation URL (optional)')}>
        <Input value={form.revokeUrl} onChange={(e) => set({ revokeUrl: e.target.value })} disabled={readOnly} inputMode="url" placeholder="https://" className={input} />
      </Field>
      <Field label={t('Scopes')}>
        <div className="space-y-1.5">
          <Input value={form.scopes} onChange={(e) => set({ scopes: e.target.value })} disabled={readOnly} className={input} />
          <p className="text-[12px] text-muted-foreground">{t('Separate scopes with spaces.')}</p>
        </div>
      </Field>
      <Field label={t('Client ID')}>
        <Input value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} disabled={readOnly} autoComplete="off" className={input} />
      </Field>
      <Field label={t('Client authentication')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" align="start" disabled={readOnly}>
              <span>{t(TOKEN_AUTH_LABELS[form.tokenAuth])}</span>
              <ChevronDown size={12} aria-hidden="true" className="opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            {(Object.keys(TOKEN_AUTH_LABELS) as TokenAuthMethod[]).map((k) => (
              <DropdownMenuItem key={k} onSelect={() => set({ tokenAuth: k })} className="gap-2 text-[12px]">
                <span className="flex-1">{t(TOKEN_AUTH_LABELS[k])}</span>
                {form.tokenAuth === k && <MenuCheck />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Field>
      {needsSecret && (
        <Field label={t('Client secret')}>
          {!p.isNew && p.hasClientSecret && !p.editingClientSecret ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-foreground">{t('Set')}</span>
              {p.canEdit && (
                <>
                  <Button variant="ghost" size="xs" onClick={() => p.setEditingClientSecret(true)} disabled={p.busy}>{t('Update')}</Button>
                  <Button variant="danger" size="xs" onClick={p.onClearClientSecret} disabled={p.busy}>{t('Delete')}</Button>
                </>
              )}
            </div>
          ) : !readOnly ? (
            <div className="flex items-center gap-2">
              <Input type="password" autoComplete="off" value={p.clientSecretInput} onChange={(e) => p.setClientSecretInput(e.target.value)}
                placeholder={!p.isNew && !p.hasClientSecret ? t('Not set') : ''} aria-label={t('Client secret')} className="h-8 text-[13px] md:text-[13px]" />
              {!p.isNew && (
                <>
                  <Button variant="primary" size="sm" onClick={p.onSaveClientSecret} disabled={p.busy || !p.clientSecretInput.trim()}>{t('Save')}</Button>
                  {p.editingClientSecret && <Button variant="ghost" size="sm" onClick={() => { p.setEditingClientSecret(false); p.setClientSecretInput(''); }}>{t('Cancel')}</Button>}
                </>
              )}
            </div>
          ) : (
            <span className="text-[13px] text-muted-foreground">{p.hasClientSecret ? t('Set') : t('Not set')}</span>
          )}
        </Field>
      )}
      {hosts.authorize && hosts.token && (
        <p className="text-[12px] text-muted-foreground">
          {hosts.revoke
            ? t('Sign-in opens {host}. The client secret and the authorization code are sent only to {token}. To revoke access, the client secret and the token are sent to {revoke}.', { host: hosts.authorize, token: hosts.token, revoke: hosts.revoke })
            : t('Sign-in opens {host}. The client secret and the authorization code are sent only to {token}.', { host: hosts.authorize, token: hosts.token })}
        </p>
      )}
      {!p.isNew && (
        <Field label={t('Sign-in')}>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('min-w-0 truncate text-[13px]', p.connected ? 'text-foreground' : 'text-muted-foreground')}>
                {p.connected ? (p.account ? t('Connected as {account}', { account: p.account }) : t('Connected')) : t('Not connected')}
              </span>
              {p.canEdit && (
                <Button variant={p.connected ? 'ghost' : 'secondary'} size={p.connected ? 'xs' : 'sm'} onClick={p.onSignIn} disabled={p.busy || !p.ready}>
                  {p.signingIn ? t('Opening sign-in…') : p.connected ? t('Reconnect') : t('Sign in')}
                </Button>
              )}
            </div>
            {p.canEdit && p.dirty && <p className="text-[12px] text-muted-foreground">{t('Save the settings before signing in.')}</p>}
          </div>
        </Field>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
