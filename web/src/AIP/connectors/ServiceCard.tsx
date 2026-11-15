'use client';

import { CARD_FLAT, CARD_HOVER } from '@/shared/designTokens';
import { cn } from '@/lib/utils';
import { IntegrationIcon } from './IntegrationDetailDialog';

export type ServiceCardTone = 'success' | 'warning' | 'danger' | 'muted';

const BADGE_TONES: Record<ServiceCardTone, string> = {
  success: 'bg-[var(--status-success-subtle)] text-[var(--status-success)]',
  warning: 'bg-[var(--status-warning-subtle)] text-[var(--status-warning)]',
  danger: 'bg-[var(--status-danger-subtle)] text-[var(--status-danger)]',
  muted: 'bg-[var(--surface-strong)] text-muted-foreground',
};

/** One service on Settings › Connectors — the Space's connection or one it
 *  can add — as a card: logo, name, an optional status badge and what the
 *  service is for. How it connects is the dialog's business, not the
 *  card's. Opens the connection's dialog. */
export function ServiceCard({ name, icon, description, badge, footnote, onOpen }: {
  name: string;
  icon: string | null;
  description: string | null;
  badge?: { label: string; tone: ServiceCardTone } | null;
  /** A quiet last line (tool count, address). */
  footnote?: string | null;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen}
      className={cn(CARD_FLAT, CARD_HOVER, 'flex min-h-[132px] flex-col gap-3 p-4 text-left outline-none focus-visible:bg-[var(--surface-strong)]')}>
      <div className="flex items-start justify-between gap-2">
        <IntegrationIcon name={name} icon={icon} size={32} />
        {badge && (
          <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium', BADGE_TONES[badge.tone])}>
            {badge.label}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-foreground">{name}</div>
        {description && <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{description}</p>}
      </div>
      {footnote && <div className="mt-auto truncate text-[11px] text-muted-foreground">{footnote}</div>}
    </button>
  );
}
