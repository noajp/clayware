'use client';

import { formatError } from '@/Function/shared/formatError';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, Search } from '@/ui/icons';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { CARD_FLAT, CARD_HOVER, FONT, SETTINGS_ISLAND } from '@/shared/designTokens';
import { cn } from '@/lib/utils';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import type { Integration } from '@/types/database';
import {
  CATEGORY_LABELS, INTEGRATION_PRESETS, INTEGRATION_STATUS_LABELS,
  catalogByCategory, installedPresetIds, integrationStatus, matchesQuery, presetById, presetMatchesQuery, readLastTest, testOutcomeLabel,
  type CatalogCardState, type IntegrationPreset, type IntegrationStatus, type OAuthProvider,
} from './catalog';
import { useIntegrationOAuthStatus, useIntegrations, useIsSpaceOwner } from './data';
import { useSpaceApprovalMode } from './approvalModeData';
import { APPROVAL_MODE_LABELS } from './approvalModeModel';
import { ServiceCard, type ServiceCardTone } from './ServiceCard';
import { setActiveSettingsSection } from '@/Function/settings/settingsNav';
import { createDraft, useIntegrationDrafts } from './draftData';
import { DRAFT_STATUS_LABELS, reconcileDraftWeb } from './draftModel';
import { IntegrationDraftDialog } from './IntegrationDraftDialog';
import { SiteCredentialsSection } from './SiteCredentialsSection';
import { Textarea } from '@/ui/textarea';
import type { IntegrationDraft } from '@/types/database';
import { IntegrationIcon } from './IntegrationDetailDialog';
import { ConnectDialogHost, openedForIntegration, openedForPreset, openedForRegistryEntry, type OpenedConnection } from './ConnectDialogHost';
import { setOAuthOutcome, useOAuthOutcome } from './oauthReturn';
import { AdminConsentNotice } from './AdminConsentNotice';
import { RegistrySection } from '@/AIP/harness/RegistrySection';
import type { DirectoryEntry } from '@/hooks/customizeData';

// Settings › AI › Connectors: the outside services the Space's AI can use.
// The first screen answers "what do we have, what needs me, what can we
// add": a search box, what needs attention (drafts to review, connections
// that stopped working), the Space's connections, and the catalog by
// purpose. Everything else — custom connections, website logins, the
// public directory, drafting by AI — sits under "Other ways to connect",
// which a search with no built-in match leads to. Members see everything
// read-only; only owners can connect or change.

const DOCS_URL = 'https://github.com/noajp/clayware/blob/main/docs/mcp.md';

const STATUS_TONES: Record<IntegrationStatus, ServiceCardTone> = {
  connected: 'success',
  reachable: 'muted',
  'not-tested': 'muted',
  off: 'muted',
  'action-needed': 'danger',
};

function hostOf(url: string | null | undefined): string | null {
  try { return url ? new URL(url).host : null; } catch { return null; }
}

export function ConnectorsSettings() {

  const { t } = useI18n();
  const spaceId = useActiveSpaceId();
  const { data: integrations, loading, error, refetch: refetchIntegrations } = useIntegrations(spaceId);
  const draftsQuery = useIntegrationDrafts(spaceId);
  const drafts = draftsQuery.data;
  const [openedDraftId, setOpenedDraftId] = useState<string | null>(null);
  const openedDraft = openedDraftId ? drafts.find((d) => d.id === openedDraftId) ?? null : null;
  const ownerRole = useIsSpaceOwner(spaceId);
  const isOwner = ownerRole === true;
  const [opened, setOpened] = useState<OpenedConnection | null>(null);
  const [siteLoginAddOpen, setSiteLoginAddOpen] = useState(false);
  // Sign-in readiness is the server's fact, shared with the detail
  // dialog: every provider read sits on the one status fetch.
  const googleConfigured = useIntegrationOAuthStatus(true, 'google');
  const githubConfigured = useIntegrationOAuthStatus(true, 'github');
  const microsoftConfigured = useIntegrationOAuthStatus(true, 'microsoft');
  const oauthOutcome = useOAuthOutcome();
  const oauthReturnName = oauthOutcome?.integrationId ? integrations.find((i) => i.id === oauthOutcome.integrationId)?.name ?? null : null;
  // A confirmed sign-in changed the row (account, last test): read it again.
  const queryClient = useQueryClient();
  const oauthStatus = oauthOutcome?.status ?? null;
  useEffect(() => {
    if (oauthStatus === 'ok' || oauthStatus === 'error' || oauthStatus === 'admin_consent') void queryClient.invalidateQueries({ queryKey: ['integrations'] });
  }, [oauthStatus, queryClient]);

  // The search box, and the public directory's copy of it (debounced: the
  // directory is a network search).
  const [query, setQuery] = useState('');
  const q = query.trim();
  const [directoryQuery, setDirectoryQuery] = useState('');
  useEffect(() => { const id = setTimeout(() => setDirectoryQuery(q), 400); return () => clearTimeout(id); }, [q]);

  // "Other ways to connect", and a draft the search asked for.
  const [otherOpen, setOtherOpen] = useState(false);
  const [draftPrefill, setDraftPrefill] = useState<{ name: string; at: number } | null>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (draftPrefill) draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [draftPrefill]);
  const askAiFor = (name: string) => {
    setOtherOpen(true);
    setDraftPrefill({ name, at: Date.now() });
  };

  const installed = useMemo(() => installedPresetIds(integrations), [integrations]);
  // Model connections live in Team settings, under Models — this page's
  // connections are the Space's business connections.
  const connectedRows = useMemo(() => integrations.filter((i) => i.kind !== 'model'), [integrations]);
  const oauthConfigured = useMemo<Record<OAuthProvider, boolean | null>>(
    () => ({ google: googleConfigured, github: githubConfigured, microsoft: microsoftConfigured }),
    [googleConfigured, githubConfigured, microsoftConfigured],
  );
  const categories = useMemo(() => catalogByCategory(INTEGRATION_PRESETS, installed, oauthConfigured), [installed, oauthConfigured]);
  const customPresets = useMemo(() => INTEGRATION_PRESETS.filter((p) => p.custom && p.kind !== 'model'), []);

  // What needs a person: drafts waiting for review, connections that stopped working.
  const reviewDrafts = useMemo(() => drafts.filter((d) => d.status === 'awaiting_review'), [drafts]);
  const brokenRows = useMemo(() => connectedRows.filter((i) => integrationStatus(i) === 'action-needed'), [connectedRows]);

  const matchedConnections = useMemo(() => (q ? connectedRows.filter((i) => {
    const preset = presetById(i.preset);
    return matchesQuery([i.name, i.endpoint, preset?.name, preset ? t(preset.description) : null], q);
  }) : []), [q, connectedRows, t]);
  const matchedPresets = useMemo(() => (q ? [
    ...categories.flatMap((g) => g.cards),
    ...customPresets.map((preset) => ({ preset, state: 'ready' as CatalogCardState })),
  ].filter((c) => presetMatchesQuery(c.preset, q, t)) : []), [q, categories, customPresets, t]);
  const nothingMatched = !!q && matchedConnections.length === 0 && matchedPresets.length === 0;

  const openPreset = (preset: IntegrationPreset) => setOpened(openedForPreset(preset, integrations));
  const openIntegration = (integration: Integration) => setOpened(openedForIntegration(integration));
  const connectedEndpoints = useMemo(() => new Set(integrations.map((i) => i.endpoint)), [integrations]);
  const addFromRegistry = (e: DirectoryEntry) => setOpened(openedForRegistryEntry(e));

  const connectionCard = (i: Integration) => {
    const preset = presetById(i.preset);
    const status = integrationStatus(i);
    const last = readLastTest(i.last_test);
    return (
      <ServiceCard key={i.id} name={i.name} icon={i.icon ?? preset?.icon ?? null}
        description={preset && !preset.custom ? t(preset.description) : hostOf(i.endpoint)}
        badge={{ label: t(INTEGRATION_STATUS_LABELS[status]), tone: STATUS_TONES[status] }}
        footnote={last?.toolCount != null ? t('{count} tools', { count: last.toolCount }) : null}
        onOpen={() => openIntegration(i)} />
    );
  };
  const presetCard = ({ preset, state }: { preset: IntegrationPreset; state: CatalogCardState }) => (
    <ServiceCard key={preset.id} name={t(preset.name)} icon={preset.icon} description={t(preset.description)}
      badge={state === 'setup-needed' ? { label: t('Needs setup'), tone: 'warning' } : null}
      onOpen={() => openPreset(preset)} />
  );

  return (
    <div className="space-y-8">
      {oauthOutcome && (
        <div role="status" className={cn('flex items-start justify-between gap-3 rounded-md px-3 py-2 text-[12px] text-foreground',
          oauthOutcome.status === 'ok' ? 'bg-[var(--status-success-subtle)]'
            : oauthOutcome.status === 'error' ? 'bg-[var(--status-danger-subtle)]'
            : oauthOutcome.status === 'admin_consent' ? 'bg-[var(--status-warning-subtle)]'
            : 'bg-[var(--surface-strong)]')}>
          {oauthOutcome.status === 'admin_consent' ? (
            <AdminConsentNotice key={oauthOutcome.integrationId ?? ''} integrationId={isOwner ? oauthOutcome.integrationId : null} name={oauthReturnName} />
          ) : (
            <span>
              {oauthOutcome.status === 'pending'
                ? t('Finishing sign-in…')
                : oauthOutcome.status === 'ok'
                  ? oauthReturnName ? t('{name} is connected.', { name: oauthReturnName }) : t('Connected')
                  : oauthOutcome.message
                    ? t(oauthOutcome.message)
                    : t('Sign-in did not finish, so nothing was connected. Try again.')}
            </span>
          )}
          {oauthOutcome.status !== 'pending' && (
            <Button variant="ghost" size="xs" onClick={() => setOAuthOutcome(null)}>{t('Dismiss')}</Button>
          )}
        </div>
      )}

      {ownerRole === false && (
        <p className="text-[12px] text-muted-foreground">{t('Only Space owners can connect or change integrations. You can see what is connected.')}</p>
      )}

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Find a service, e.g. Slack or Google Drive')} aria-label={t('Search services')}
            className="h-8 pl-8 text-[13px] md:text-[13px]" />
        </div>
        <Button asChild variant="ghost" size="sm">
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden="true" />
            <span>{t('Docs')}</span>
          </a>
        </Button>
      </div>

      {q ? (
        <section className="space-y-5" aria-live="polite">
          {nothingMatched ? (
            <p className="text-[13px] text-muted-foreground">{t('Nothing built in matches “{query}”.', { query: q })}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {matchedConnections.map(connectionCard)}
              {matchedPresets.map(presetCard)}
            </div>
          )}
          {isOwner && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              {!nothingMatched && <span>{t('Not what you need?')}</span>}
              <Button variant="secondary" size="sm" onClick={() => askAiFor(q)}>{t('Have the AI connect it')}</Button>
            </div>
          )}
          {nothingMatched && directoryQuery && (
            <RegistrySection key={directoryQuery} initialQuery={directoryQuery} connectedEndpoints={connectedEndpoints}
              canAdd={isOwner} onAdd={addFromRegistry} searchable={false}
              title="In the public directory"
              note="Other services that offer a connection for AI. Anyone can list one there, so add only ones you trust." />
          )}
        </section>
      ) : (
        <>
          {(reviewDrafts.length > 0 || brokenRows.length > 0) && (
            <section className="space-y-3">
              <h2 className={`${FONT.lg} text-foreground`}>{t('Needs your attention')}</h2>
              <div className={`${SETTINGS_ISLAND} px-5 py-1.5`}>
                {reviewDrafts.map((d) => (
                  <AttentionRow key={d.id} name={d.name} icon={null} reason={t('Waiting for your review')} tone="warning"
                    onOpen={() => setOpenedDraftId(d.id)} />
                ))}
                {brokenRows.map((i) => {
                  const last = readLastTest(i.last_test);
                  return (
                    <AttentionRow key={i.id} name={i.name} icon={i.icon ?? presetById(i.preset)?.icon ?? null}
                      reason={t(last ? testOutcomeLabel(last.code) : INTEGRATION_STATUS_LABELS['action-needed'])} tone="danger"
                      onOpen={() => openIntegration(i)} />
                  );
                })}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div>
              <h2 className={`${FONT.lg} text-foreground`}>{t('Connected')}</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{t('Services this Space is connected to. Open one to see what AI may do with it.')}</p>
            </div>
            {error ? (
              <p className="text-[13px] text-[var(--status-danger)]">{t("Couldn't load integrations: {error}", { error: error.message })}</p>
            ) : loading ? (
              <p className="text-[13px] text-muted-foreground">{t('Loading…')}</p>
            ) : connectedRows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t('Nothing is connected to this Space yet.')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {connectedRows.map(connectionCard)}
              </div>
            )}
          </section>

          {categories.length > 0 && (
            <section className="space-y-5">
              <h2 className={`${FONT.lg} text-foreground`}>{t('Add a service')}</h2>
              {categories.map((group) => (
                <div key={group.category} className="space-y-3">
                  <h3 className={FONT.label}>{t(CATEGORY_LABELS[group.category])}</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.cards.map(presetCard)}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <section className="space-y-6 border-t border-[var(--border-default)] pt-6">
        <button type="button" onClick={() => setOtherOpen((v) => !v)} aria-expanded={otherOpen}
          className="-mx-2 flex w-[calc(100%+16px)] items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-[var(--surface-strong)] focus-visible:bg-[var(--surface-strong)]">
          <ChevronRight size={14} aria-hidden="true" className={cn('mt-1 shrink-0 text-muted-foreground transition-transform', otherOpen && 'rotate-90')} />
          <span className="min-w-0">
            <span className={`block ${FONT.lg} text-foreground`}>{t('Other ways to connect')}</span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">
              {t('Your own API or MCP server, a website login, the public directory, and connections the AI drafts for you.')}
            </span>
          </span>
        </button>

        {otherOpen && (
          <div className="space-y-8">
            {(customPresets.length > 0 || isOwner) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {customPresets.map((preset) => presetCard({ preset, state: 'ready' }))}
                {isOwner && <WebsiteSignInCard onOpen={() => setSiteLoginAddOpen(true)} />}
              </div>
            )}

            {spaceId && (
              <SiteCredentialsSection spaceId={spaceId} integrations={integrations} isOwner={isOwner} ownerKnown={ownerRole !== null}
                addOpen={siteLoginAddOpen} onAddOpenChange={setSiteLoginAddOpen} />
            )}

            {drafts.length > 0 && (
              <section className="space-y-3">
                <h2 className={`${FONT.lg} text-foreground`}>{t('Drafted connections')}</h2>
                <div>
                  {drafts.map((d) => (
                    <button key={d.id} type="button" onClick={() => setOpenedDraftId(d.id)}
                      className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-[var(--surface-strong)] focus-visible:bg-[var(--surface-strong)]">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-foreground">{d.name}</div>
                        <div className="truncate text-[12px] text-muted-foreground">{d.endpoint ?? t('No definition yet')}</div>
                      </div>
                      <span className={cn('inline-flex shrink-0 items-center text-[11px]',
                        d.status === 'awaiting_review' ? 'text-[var(--status-warning)]' : d.status === 'active' ? 'text-[var(--status-success)]' : 'text-muted-foreground')}>
                        {t(DRAFT_STATUS_LABELS[d.status])}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <RegistrySection connectedEndpoints={connectedEndpoints} canAdd={isOwner} onAdd={addFromRegistry} />

            {spaceId && (
              <div ref={draftRef} className="scroll-mt-6">
                <DraftCreateSection
                  key={draftPrefill?.at ?? 0}
                  initialName={draftPrefill?.name ?? ''}
                  spaceId={spaceId}
                  integrations={integrations}
                  drafts={drafts}
                  onCreated={(draft) => { void draftsQuery.refetch(); setOpenedDraftId(draft.id); }}
                  onOpenDraft={(draft) => setOpenedDraftId(draft.id)}
                />
              </div>
            )}

            {spaceId && <ApprovalModePointerRow spaceId={spaceId} />}
          </div>
        )}
      </section>

      {openedDraft && spaceId && (
        <IntegrationDraftDialog
          draft={openedDraft}
          spaceId={spaceId}
          integrations={integrations}
          canReview={isOwner}
          onClose={() => setOpenedDraftId(null)}
          onChanged={() => { void draftsQuery.refetch(); void refetchIntegrations(); }}
        />
      )}

      {opened && spaceId && (
        <ConnectDialogHost
          spaceId={spaceId}
          opened={opened}
          integrations={integrations}
          canEdit={isOwner}
          onClose={() => setOpened(null)}
          onCreated={(created) => setOpened({ preset: opened.preset, integration: created })}
        />
      )}
    </div>
  );
}

/** One thing that needs a person, as a row: what it is, why, and the way in. */
function AttentionRow({ name, icon, reason, tone, onOpen }: {
  name: string; icon: string | null; reason: string; tone: 'warning' | 'danger'; onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen}
      className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-[var(--surface-strong)] focus-visible:bg-[var(--surface-strong)]">
      <IntegrationIcon name={name} icon={icon} size={24} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">{name}</div>
        <div className={cn('truncate text-[12px]', tone === 'danger' ? 'text-[var(--status-danger)]' : 'text-[var(--status-warning)]')}>{reason}</div>
      </div>
      <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
    </button>
  );
}

/** The approval mode itself lives in the Space settings page, with the
 *  Space's other AI behaviours; this quiet row keeps the move
 *  discoverable from here — the current mode, read-only, and the way
 *  there. */
function ApprovalModePointerRow({ spaceId }: { spaceId: string }) {
  const { t } = useI18n();
  const { mode } = useSpaceApprovalMode(spaceId);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
      <span className="font-medium text-foreground">{t('Approval mode')}</span>
      {mode && <span>{t(APPROVAL_MODE_LABELS[mode])}</span>}
      <button type="button" onClick={() => setActiveSettingsSection('workspace')}
        className="underline underline-offset-2 transition-colors hover:text-foreground">
        {t('Change in Space settings')}
      </button>
    </div>
  );
}

/** The website sign-in entry (secure login's browser route): not a
 *  preset — it opens the Site logins section's add dialog, the one
 *  route to a site credential. Shown to owners, like that section's
 *  own add button. */
function WebsiteSignInCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onOpen}
      className={cn(CARD_FLAT, CARD_HOVER, 'flex min-h-[132px] flex-col gap-3 p-4 text-left outline-none focus-visible:bg-[var(--surface-strong)]')}>
      <IntegrationIcon name={t('Website sign-in')} icon={null} size={32} />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-foreground">{t('Website sign-in')}</div>
        <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{t('For a website with no API: Athena signs in with a login you save.')}</p>
      </div>
    </button>
  );
}

/** Entry C (G4): ask the AI to draft a connection for a service the
 *  catalog and the Registry do not have. The reconcile runs in the open
 *  as the person types — a name that already has a route is never
 *  drafted around, here or on the server (which reconciles again). The
 *  search box hands over the name it was looking for (`initialName`). */
function DraftCreateSection({ spaceId, integrations, drafts, initialName, onCreated, onOpenDraft }: {
  spaceId: string;
  integrations: Integration[];
  drafts: IntegrationDraft[];
  initialName: string;
  onCreated: (draft: IntegrationDraft) => void;
  onOpenDraft: (draft: IntegrationDraft) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [docsUrl, setDocsUrl] = useState('');
  const [purpose, setPurpose] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const knownHost = useMemo(() => {
    try { return docsUrl.trim() ? new URL(docsUrl.trim()).hostname : null; } catch { return null; }
  }, [docsUrl]);
  const outcome = useMemo(
    () => (name.trim() ? reconcileDraftWeb({ name, integrations, drafts, knownHost }) : null),
    [name, integrations, drafts, knownHost],
  );
  const existingDraft = outcome?.kind === 'join' ? drafts.find((d) => d.id === outcome.draftId) ?? null : null;
  const canStart = !!name.trim() && !!purpose.trim() && !starting
    && (outcome?.kind === 'create' || outcome?.kind === 'update');

  const start = async () => {
    if (!canStart) return;
    setStarting(true); setStartError(null);
    try {
      const draft = await createDraft(spaceId, {
        name, purpose: purpose.trim(), docsUrl: docsUrl.trim() || null, entry: 'settings',
      }, drafts);
      setName(''); setDocsUrl(''); setPurpose('');
      onCreated(draft);
    } catch (e) {
      setStartError(formatError(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className={`${FONT.lg} text-foreground`}>{t('Have the AI draft it')}</h2>
        <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">
          {t('For a service with a public API that is not in the catalog: the AI reads the official documentation, drafts the connection definition and tests it. An owner reviews and activates it — nothing connects on its own.')}
        </p>
      </div>
      <div className="grid max-w-xl gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Service name')}
          aria-label={t('Service name')} className="h-8 text-[13px] md:text-[13px]" />
        <Input value={docsUrl} onChange={(e) => setDocsUrl(e.target.value)} placeholder={t('Documentation URL (optional)')}
          aria-label={t('Documentation URL (optional)')} className="h-8 text-[13px] md:text-[13px]" />
        <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)}
          placeholder={t('What will you use it for? e.g. Look up orders and reply to inquiries')}
          aria-label={t('What will you use it for?')} className="min-h-16 text-[13px] md:text-[13px]" />
      </div>
      {outcome?.kind === 'connected' && (
        <p className="text-[12px] text-muted-foreground">{t('Already connected — no draft needed.')}</p>
      )}
      {outcome?.kind === 'preset' && (
        <p className="text-[12px] text-muted-foreground">{t('This service has a built-in connection in the catalog above.')}</p>
      )}
      {outcome?.kind === 'registry' && (
        <p className="text-[12px] text-muted-foreground">{t('This service is listed in the MCP Registry above.')}</p>
      )}
      {outcome?.kind === 'update' && (
        <p className="text-[12px] text-muted-foreground">{t('A connection with this name exists. The draft will update its definition instead; the live connection is not touched until activation.')}</p>
      )}
      {existingDraft && (
        <p className="text-[12px] text-muted-foreground">
          {t('A draft for this service is already open.')}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => onOpenDraft(existingDraft)}>
            {t('Open the draft')}
          </button>
        </p>
      )}
      {startError && <p className="text-[12px] text-[var(--status-danger)]">{startError}</p>}
      <Button size="sm" onClick={() => void start()} disabled={!canStart}>
        {starting ? t('Starting…') : t('Start drafting')}
      </Button>
    </section>
  );
}
