'use client';

import type { ReactNode } from 'react';

// =============================================================
// PropertyRow — fixed 2-column property row for detail & creation views.
//
// Left column:  92px fixed, 12px muted label (--text-tertiary)
// Right column: 13px flat value / interactive picker (surface tint on hover only)
// =============================================================

export function PropertyRow({
  label,
  icon,
  children,
  placeholder = false,
  interactive = true,
  className = '',
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  placeholder?: boolean;
  /** When true, applies a quiet hover tint on the value column so editable pickers read clearly. */
  interactive?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid min-h-[30px] grid-cols-[92px_minmax(0,1fr)] items-center gap-2 px-1.5 text-[13px] ${className}`}>
      <span className="truncate text-left text-[12px] font-normal text-[var(--text-tertiary)]">
        {label}
      </span>
      <div
        className={`flex min-w-0 items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left text-[13px] leading-5 transition-colors ${
          interactive ? 'hover:bg-[var(--surface-strong)]/60' : ''
        } ${placeholder ? 'text-muted-foreground' : 'text-foreground'}`}
      >
        {icon && (
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </div>
    </div>
  );
}
