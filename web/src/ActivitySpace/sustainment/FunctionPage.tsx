'use client';

import { useState } from 'react';
import { Button } from '@/ui/button';
import { Textarea } from '@/ui/textarea';
import { Box } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { ConfirmDialog } from '@/Function/shared/ConfirmDialog';
import { ElementProgressMark } from '@/Function/shared/ElementProgressMark';
import { DetailPage, PageHead } from '@/Function/shared/PageHead';
import { formatElementDate } from '@/Function/shared/dateUtils';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import {
  DEFINITION_SECTIONS, SECTION_META, publishGaps, readDefinition, withSection, type FunctionStatus,
} from '@/Function/sustainment/definition';
import type { FunctionPatch } from '@/hooks/useSustainmentFunctions';
import type { SustainmentFunction } from '@/types/database';
import { SectionLines } from './SectionLines';

// One function's page: its name and what it is for, then its definition,
// section by section. A draft is edited in place. Publishing checks that
// the definition says enough, and a published function is read-only until
// it is taken back to a draft.

/** Draft or Published, as the mark every status uses and its word. */
export function FunctionStatusMark({ status, size = 14 }: { status: FunctionStatus; size?: number }) {
  return <ElementProgressMark status={status === 'published' ? 'done' : 'backlog'} progress={status === 'published' ? 100 : 0} size={size} />;
}

export function FunctionPage({ fn, onUpdate, onRemove }: {
  fn: SustainmentFunction;
  onUpdate: (patch: FunctionPatch) => Promise<void>;
  /** Removes it; the page then goes back to the Sustainment. */
  onRemove: () => Promise<void>;
}) {
  const { t } = useI18n();
  const def = readDefinition(fn.definition);
  const draft = fn.status === 'draft';
  const [gaps, setGaps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [differences, setDifferences] = useState(fn.differences ?? '');
  const [seenDifferences, setSeenDifferences] = useState(fn.differences ?? '');
  if ((fn.differences ?? '') !== seenDifferences) {
    setSeenDifferences(fn.differences ?? '');
    setDifferences(fn.differences ?? '');
  }

  // What went wrong, in the person's language (the hooks report in English).
  const reason = (e: unknown) => t(e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? "Couldn't save");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try { await work(); } catch (e) { setFailure(reason(e)); } finally { setBusy(false); }
  };
  /** A save the page head reports itself: it shows what is thrown. */
  const saved = (work: Promise<void>) => work.catch((e) => { throw new Error(reason(e)); });
  const publish = () => {
    const missing = publishGaps(def);
    setGaps(missing);
    if (missing.length === 0) void run(() => onUpdate({ status: 'published' }));
  };

  return (
    <DetailPage
      head={
        <PageHead
          icon={<ItemIcon icon={fn.icon} size={20} fallback={<Box size={20} />} />}
          title={fn.name} description={def.intent} canEdit={draft}
          titleLabel={t('Function name')} titlePlaceholder={t('Function name')}
          descriptionLabel={t('What it is for')}
          descriptionPlaceholder={t('Who uses it, and what must always be right')}
          emptyDescription={t('Nothing written')}
          onSaveTitle={(name) => saved(onUpdate({ name }))}
          onSaveDescription={(intent) => saved(onUpdate({ definition: { ...def, intent } }))}
          under={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <FunctionStatusMark status={fn.status} />
                {draft ? t('Draft') : fn.published_at
                  ? t('Published {date}', { date: formatElementDate(fn.published_at) ?? '' })
                  : t('Published')}
              </span>
              {draft
                ? <Button type="button" variant="primary" size="sm" disabled={busy} onClick={publish}>{t('Publish')}</Button>
                : <Button type="button" variant="secondary" size="sm" disabled={busy}
                    onClick={() => void run(() => onUpdate({ status: 'draft' }))}>{t('Edit as draft')}</Button>}
              <Button type="button" variant="ghost" size="sm" disabled={busy} className="text-muted-foreground"
                onClick={() => setConfirmDelete(true)}>{t('Delete')}</Button>
            </div>
          }
        />
      }>
      {(gaps.length > 0 || failure) && (
        <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-3 py-2 text-[13px] text-[var(--status-danger)]">
          {failure ?? (
            <>
              <p className="font-medium">{t('Not published yet. It still needs:')}</p>
              <ul className="mt-1 list-disc pl-5">{gaps.map((g) => <li key={g}>{t(g)}</li>)}</ul>
            </>
          )}
        </div>
      )}

      {/* Only a function that started from a template has something to differ from. */}
      {((draft && fn.template_key) || differences.trim()) && (
        <section aria-label={t('What differs for your company')}>
          <SectionHeading label={t('What differs for your company')}
            hint={t('In your own words. Then change the lines below to match.')} />
          {draft ? (
            <Textarea value={differences} rows={2} aria-label={t('What differs for your company')}
              onChange={(e) => setDifferences(e.target.value)}
              onBlur={() => {
                const next = differences.trim();
                if (next !== (fn.differences ?? '').trim()) void run(() => onUpdate({ differences: next || null }));
              }}
              placeholder={t('e.g. A different closing day, an extra approval step, other names for things')} />
          ) : <p className="whitespace-pre-wrap text-[13px] leading-[20px] text-foreground">{differences}</p>}
        </section>
      )}

      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        {DEFINITION_SECTIONS.map((section) => {
          const meta = SECTION_META[section];
          // A published function shows only what it defines.
          if (!draft && def.sections[section].length === 0) return null;
          return (
            <section key={section} aria-label={t(meta.label)} className="min-w-0">
              <SectionHeading label={t(meta.label)} hint={t(meta.hint)} />
              <SectionLines label={t(meta.label)} lines={def.sections[section]} readOnly={!draft}
                onChange={(next) => void run(() => onUpdate({ definition: withSection(def, section, next) }))} />
            </section>
          );
        })}
      </div>

      <ConfirmDialog open={confirmDelete} title={t('Delete “{name}”?', { name: fn.name })}
        description={t('Its definition is removed for everyone in this Space. This cannot be undone.')}
        busy={busy} onCancel={() => setConfirmDelete(false)}
        // Refused or not, the question is answered: a refusal shows on the page.
        onConfirm={() => void run(async () => { try { await onRemove(); } finally { setConfirmDelete(false); } })} />
    </DetailPage>
  );
}

function SectionHeading({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="mb-1.5">
      <h2 className="text-[13px] font-semibold leading-[20px] text-foreground">{label}</h2>
      <p className="text-[12px] leading-[16px] text-muted-foreground">{hint}</p>
    </div>
  );
}
