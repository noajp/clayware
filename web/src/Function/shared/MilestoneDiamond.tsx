'use client';

import { useId, useState } from 'react';
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
      style={{
        width: 11,
        height: 11,
        transform: 'rotate(45deg)',
        border: '2px solid var(--status-danger)',
        background: 'var(--card)',
      }}
    />
  );
  return (
    <div
      className={cn('absolute', className)}
      style={{ left, top, transform: 'translateX(-50%)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {onClick ? (
        <button type="button" onClick={onClick} title={title} aria-label={t('Milestone')} className="block cursor-pointer">
          {diamond}
        </button>
      ) : (
        <div role="img" title={title} aria-label={t('Milestone')}>
          {diamond}
        </div>
      )}
      {hovered && label && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-5 px-1.5 py-0.5 text-[10px] text-foreground bg-popover border border-border rounded shadow whitespace-nowrap z-30">
          {label}
        </div>
      )}
    </div>
  );
}

/**
 * A milestone's mark: a diamond outlined in the key red, filled clockwise
 * from the top as its work is done (`progress` 0..1) — an empty outline
 * before anything is done, solid when all of it is.
 */
export function ProgressDiamond({ progress = 0, size = 20, className }: { progress?: number; size?: number; className?: string }) {
  const clip = useId();
  const p = Math.max(0, Math.min(1, progress));
  // A rhombus taller than it is wide, inside a 16-unit box.
  const shape = 'M8 0.9 L12.6 8 L8 15.1 L3.4 8 Z';
  // The wedge swept so far, from 12 o'clock clockwise around the center.
  const angle = p * 2 * Math.PI;
  const r = 12;
  const x = 8 + r * Math.sin(angle);
  const y = 8 - r * Math.cos(angle);
  const wedge = p >= 1 ? null : `M8 8 L8 ${8 - r} A${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cn('shrink-0', className)} aria-hidden>
      <defs><clipPath id={clip}><path d={shape} /></clipPath></defs>
      {p > 0 && (p >= 1
        ? <path d={shape} style={{ fill: 'var(--status-danger)' }} />
        : <path d={wedge ?? ''} clipPath={`url(#${clip})`} style={{ fill: 'var(--status-danger)' }} />)}
      <path d={shape} strokeLinejoin="round" style={{ fill: 'none', stroke: 'var(--status-danger)', strokeWidth: 1.8 }} />
    </svg>
  );
}
