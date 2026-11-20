'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// =============================================================
// InlineField — light, calm form primitives (Linear × Asana).
//
// Resting state: quiet --surface-muted ground + hairline --border-subtle.
// Hover: --border-default. Focus: soft --accent-subtle background shift.
// Uniform 32px height (h-8) and 13px text across all inputs & selects.
// =============================================================

const INLINE_FIELD_CLASS = [
  'w-full rounded-[var(--control-field-radius)]',
  'bg-[var(--surface-muted)] border border-[var(--border-subtle)]',
  'hover:border-[var(--border-default)] focus:bg-[var(--accent-subtle)]',
  'text-[13px] text-foreground placeholder:text-muted-foreground/65',
  'transition-[background-color,border-color,color] outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

const INLINE_INPUT_CLASS = `${INLINE_FIELD_CLASS} h-8 px-2.5`;
const INLINE_SELECT_CLASS = `${INLINE_FIELD_CLASS} h-8 px-2.5`;
const INLINE_TEXTAREA_CLASS = `${INLINE_FIELD_CLASS} px-2.5 py-2 leading-[1.45] resize-y`;

export function InlineField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn('block space-y-1.5', className)}>
      <span className="block text-[12px] font-medium text-[var(--text-tertiary)]">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-[11.5px] leading-4 text-muted-foreground">
          {hint}
        </span>
      )}
      {error && (
        <span role="alert" className="block text-[11.5px] leading-4 text-[var(--status-danger)]">
          {error}
        </span>
      )}
    </label>
  );
}

export function InlineInput({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(INLINE_INPUT_CLASS, className)} {...props} />;
}

export function InlineSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(INLINE_SELECT_CLASS, className)} {...props} />;
}

export function InlineTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(INLINE_TEXTAREA_CLASS, className)} {...props} />;
}
