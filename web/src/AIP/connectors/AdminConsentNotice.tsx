'use client';

import { useState } from 'react';
import { Button } from '@/ui/button';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { formatError } from '@/Function/shared/formatError';
import { CopyField } from './CopyField';
import { fetchAdminConsentUrl } from './data';

// A sign-in that came back refused because the organization's administrator
// must approve Clayware first (integration-oauth's admin_consent return):
// what happened, and the link to send the administrator. The link is made
// on request by the server (POST /admin-consent, Space owners only); once
// the administrator approves, the person connects again as usual.

export function AdminConsentNotice({ integrationId, name }: { integrationId: string | null; name: string | null }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getLink = async () => {
    if (!integrationId) return;
    setLoading(true);
    setError(null);
    try {
      setUrl(await fetchAdminConsentUrl(integrationId));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <p>
        {name
          ? t('{name} could not be connected yet: your organization requires an administrator to approve Clayware first.', { name })
          : t('This connection could not be made yet: your organization requires an administrator to approve Clayware first.')}
      </p>
      <p className="text-muted-foreground">{t('Send the approval link to your IT administrator. Once they approve, connect again.')}</p>
      {url ? (
        <CopyField value={url} label={t('Approval link for your administrator')} />
      ) : integrationId ? (
        <Button variant="secondary" size="xs" onClick={getLink} disabled={loading}>
          {loading ? t('Making the link…') : t('Get the approval link')}
        </Button>
      ) : null}
      {error && <p className="text-[var(--status-danger)]">{t(error)}</p>}
    </div>
  );
}
