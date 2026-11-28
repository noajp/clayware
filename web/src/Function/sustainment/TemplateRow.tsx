'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from '@/ui/icons';

/** One choice in a template list: icon, name, what it holds; picking it
 *  moves on. Used by the Create Sustainment and Add function dialogs. */
export function TemplateRow({ icon, title, detail, onClick }: {
  icon: ReactNode; title: string; detail: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 text-left outline-none transition-colors hover:bg-[var(--surface-strong)] focus-visible:bg-[var(--surface-strong)]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-foreground">{title}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight size={14} aria-hidden className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}
