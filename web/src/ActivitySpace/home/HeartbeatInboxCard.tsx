'use client';

import { useI18n } from '@/Function/i18n/I18nProvider';
import { AiGraph } from '@/ui/icons';
import { MarkdownLite } from '@/Function/shared/MarkdownLite';
import { readableBody } from './inboxRow';
import { WakeSteps } from '@/Function/settings/HeartbeatSettings';

/** A heartbeat digest in the reader: what the wake said, with the
 *  wake's own record under it. Judgement happens on each item's own
 *  screen — the wake only speaks, so this card decides nothing and
 *  offers no approval of its own. */
export function HeartbeatInboxCard({ runId, title, body }: {
  runId: string | null;
  title: string;
  body: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <section className="ai-surface p-5">
        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--accent-default)]">
          <AiGraph size={13} />
          <span>{t('Agent')}</span>
        </div>
        <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-foreground">{title}</h1>
        {body && (() => {
          const readable = readableBody(body, t);
          return readable ? (
            <div className="mt-4 text-[13.5px] leading-relaxed text-foreground/95">
              <MarkdownLite text={readable} />
            </div>
          ) : null;
        })()}
        <p className="mt-4 border-t border-[var(--border-subtle)] pt-3 text-[12px] text-muted-foreground">
          {t('This digest came from a heartbeat wake. Each item is decided on its own screen; the wake only speaks.')}
        </p>
      </section>
      {runId && (
        <div>
          <h2 className="text-[13px] font-medium text-foreground">{t('The wake’s record')}</h2>
          <div className="mt-2">
            <WakeSteps runId={runId} />
          </div>
        </div>
      )}
    </div>
  );
}
