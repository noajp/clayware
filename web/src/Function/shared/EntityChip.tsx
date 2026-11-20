'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// =============================================================
// EntityChip & TagBadge — distinct visual grammar for Objects vs Tags.
//
// - EntityChip (Object / Domain / Entity reference): borderless icon + text,
//   quiet and scan-friendly so titles & status remain the visual lead.
// - TagBadge (Labels / Tags): low-saturation dot + concise text on a quiet
//   surface, never loud rounded-full bordered capsules.
// =============================================================

export function EntityChip({
  icon,
  label,
  title,
  onClick,
  className,
}: {
  icon?: ReactNode;
  label: ReactNode;
  title?: string;
  onClick?: () => void;
  className?: string;
}) {
  const base = cn(
    'inline-flex min-w-0 max-w-[160px] items-center gap-1.5 rounded-[5px] px-1 py-0.5 text-[12px] font-normal text-muted-foreground transition-colors',
    onClick ? 'hover:bg-[var(--surface-strong)]/60 hover:text-foreground' : '',
    className,
  );
  const content = (
    <>
      {icon && <span className="inline-flex shrink-0 items-center justify-center opacity-80">{icon}</span>}
      <span className="truncate">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={base}>
        {content}
      </button>
    );
  }
  return (
    <span title={title} className={base}>
      {content}
    </span>
  );
}

export function TagBadge({
  label,
  color,
  title,
  trailing,
  className,
}: {
  label: ReactNode;
  /** CSS color string for the subtle leading dot (e.g. from labelColor()). */
  color: string;
  title?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title ?? (typeof label === 'string' ? label : undefined)}
      className={cn(
        'inline-flex h-[20px] max-w-[140px] shrink-0 items-center gap-1.5 rounded-[5px] bg-[var(--surface-muted)] px-1.5 text-[11.5px] font-normal text-[var(--text-secondary)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full opacity-85"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{label}</span>
      {trailing}
    </span>
  );
}
