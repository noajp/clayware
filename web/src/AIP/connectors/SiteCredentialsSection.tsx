'use client';

import { FONT } from '@/shared/designTokens';
import { cn } from '@/lib/utils';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { readLastTest, testOutcomeLabel } from './catalog';
import type { SiteCredentialRow } from './siteCredentialData';
import { SITE_CREDENTIAL_STATUS_LABELS, siteCredentialStatus } from './siteCredentialModel';

// Settings › Connectors: the Space's site logins, beside its connections
// (secure-login PR1). A site login is the credential for a website that
// has no connection — the agent signs in with the saved username/password
// pair on that origin only. They are things the Space already has, so they
// sit on the first screen once one exists; adding one is under "Other ways
// to connect", and the page owns the dialog both open. Members see which
// sites have one; saving, replacing and deleting are the owner's acts, and
// the password itself is never shown (no read path exists for it).

export function SiteCredentialsSection({ credentials, loading, error, isOwner, ownerKnown, onOpen }: {
  credentials: SiteCredentialRow[];
  loading: boolean;
  error: Error | null;
  isOwner: boolean;
  ownerKnown: boolean;
  onOpen: (credential: SiteCredentialRow) => void;
}) {
  const { t } = useI18n();
  // Nothing saved: nothing to show here.
  if (!error && !loading && credentials.length === 0) return null;
  if (!error && loading) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className={`${FONT.lg} text-foreground`}>{t('Site logins')}</h2>
        <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">
          {t('Sign-ins for websites that have no connection. The saved username and password are used only on that site, and the password is never shown back.')}
        </p>
      </div>

      {ownerKnown && !isOwner && (
        <p className="text-[12px] text-muted-foreground">{t('Only Space owners can save or change site logins. You can see which sites have one.')}</p>
      )}

      {error ? (
        <p className="text-[12px] text-[var(--status-danger)]">{t("Couldn't load site logins: {error}", { error: error.message })}</p>
      ) : (
        <div>
          {credentials.map((c) => (
            <SiteCredentialRowView key={c.id} credential={c} onOpen={() => onOpen(c)} />
          ))}
        </div>
      )}
    </section>
  );
}

function SiteCredentialRowView({ credential, onOpen }: { credential: SiteCredentialRow; onOpen: () => void }) {
  const { t, locale } = useI18n();
  const status = siteCredentialStatus(credential);
  const last = readLastTest(credential.last_test);
  const meta = [
    credential.label,
    credential.username,
    last && !last.ok ? t(testOutcomeLabel(last.code)) : null,
    credential.last_used_at
      ? t('Last used {when}', { when: new Date(credential.last_used_at).toLocaleDateString(locale) })
      : null,
  ].filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={onOpen}
      className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-[var(--surface-strong)] focus-visible:bg-[var(--surface-strong)]">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[13px] font-medium text-foreground">{credential.origin}</div>
        {meta && <div className="truncate text-[12px] text-muted-foreground">{meta}</div>}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full',
          status === 'saved' ? 'bg-[var(--status-success)]'
            : status === 'action-needed' ? 'bg-[var(--status-danger)]'
            : 'bg-[var(--text-muted)]')} />
        {t(SITE_CREDENTIAL_STATUS_LABELS[status])}
      </span>
    </button>
  );
}
