'use client';

import { useState } from 'react';
import { Button } from '@/ui/button';
import { InlineField, InlineInput } from '@/Function/shared/InlineField';
import { useI18n } from '@/Function/i18n/I18nProvider';

/**
 * Full-screen first-run onboarding card (Linear "Create a workspace" shape).
 * Reused for the two empty states that otherwise dead-ended new users:
 *   - 0 ActivitySpaces → create your Space
 *   - a Space with 0 Domains → create your first Domain
 * One name field + a primary CTA; submit on Enter or click.
 */
export function OnboardingCreate({
  title,
  subtitle,
  label,
  placeholder,
  cta,
  onCreate,
  children,
}: {
  title: string;
  subtitle: string;
  label: string;
  placeholder: string;
  cta: string;
  onCreate: (name: string) => Promise<void>;
  /** Shown under the form — e.g. invitations to join an existing Space. */
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const next = name.trim();
    if (!next || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(next);
    } catch (e) {
      console.error('Onboarding create failed', e);
      setError(e instanceof Error ? e.message : t('Something went wrong'));
      setBusy(false); // leave the form usable on error; success unmounts us
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--content-bg)] px-6">
      <div className="w-full max-w-sm rounded-lg border border-border/40 bg-card p-8 shadow-[var(--shadow-island)]">
        <h1 className="text-center text-[19px] font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mb-6 mt-1.5 text-center text-[13px] text-muted-foreground">{subtitle}</p>

        <InlineField label={label}>
          <InlineInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
            }}
            placeholder={placeholder}
            className="h-9"
          />
        </InlineField>

        {error && (
          <p role="alert" className="mt-2.5 text-[12px] text-[var(--status-danger)]">{error}</p>
        )}

        <Button
          variant="primary"
          size="lg"
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || busy}
          className="mt-5 w-full"
        >
          {busy ? t('Creating…') : cta}
        </Button>
        {children}
      </div>
    </div>
  );
}
