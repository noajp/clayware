'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/Function/i18n/I18nProvider';

// Diamond milestone marker — a single-date ◇ on a timeline. Originated in
// StrategyTimelineView (Object-band Strategy Timeline); pulled out here so
// the Execution-layer Gantt can draw the same object_milestones rows without
// re-implementing the shape.

interface MilestoneDiamondProps {
  /** X position in the timeline's own pixel scale. Centered on this value. */
  left: number;
  /** Y position in the timeline's own pixel scale (not an offset). */
  top: number;
  label: string | null;
  date: string;
  /** Omit for a read-only marker (no button semantics, no click affordance). */
  onClick?: () => void;
  /** Extra classes on the positioned root — e.g. a stacking override so the
   *  marker paints above same-context siblings regardless of DOM order. */
  className?: string;
}

export function MilestoneDiamond({ left, top, label, date, onClick, className }: MilestoneDiamondProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const base = `${label ?? t('Milestone')} · ${date}`;
  const title = onClick ? t('{label} (click to delete)', { label: base }) : base;
  const diamond = (
    <div
      className="flex items-center justify-center rounded-[2px] shadow-[var(--shadow-card)] transition-transform group-hover/ms:scale-110"
      style={{
        width: 12,
        height: 12,
        transform: 'rotate(45deg)',
        border: '2px solid var(--accent-default)',
        background: 'var(--card)',
      }}
    >
      <span className="size-1 rounded-full bg-[var(--accent-default)]" />
    </div>
  );
  return (
    <div
      className={cn('group/ms absolute flex items-center gap-1.5', className)}
      style={{ left, top, transform: 'translateX(-6px)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {onClick ? (
        <button type="button" onClick={onClick} title={title} aria-label={t('Milestone')} className="block shrink-0 cursor-pointer">
          {diamond}
        </button>
      ) : (
        <div role="img" title={title} aria-label={t('Milestone')} className="shrink-0">
          {diamond}
        </div>
      )}
      {label && (
        <span
          className={cn(
            'pointer-events-none whitespace-nowrap rounded-[5px] border px-1.5 py-0.5 text-[10.5px] font-medium leading-none shadow-[var(--shadow-card)] transition-colors',
            hovered
              ? 'border-[var(--accent-default)] bg-popover text-foreground z-30'
              : 'border-[var(--border-default)] bg-card text-foreground/90',
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
