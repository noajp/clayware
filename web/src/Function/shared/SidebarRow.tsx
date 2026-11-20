'use client';

import type { ComponentProps, ReactNode, Ref } from 'react';

// =============================================================
// SidebarRow — the one row every sidebar list is made of (Domains, Strategy,
// Notebook, Tables, Audit, Settings).
//
// The ROW is the hover and selection target, not the button inside it. A row
// with trailing controls (a Domain's chevron and "…") therefore lights up as
// one piece, edge to edge; the controls paint no ground of their own and only
// brighten their glyph. Keyboard focus on anything in the row grounds the row
// the same way hover does — globals.css draws no focus ring.
//
// Anatomy, left to right: 16px icon slot · label (truncates) · meta (a count,
// a sum — small and muted) · actions. Every sidebar shares the geometry, so
// names start on one edge whichever list they are in.
// =============================================================

const STATE = {
  active: 'bg-sidebar-accent text-foreground shadow-[inset_0_0_0_1px_var(--border-subtle)]',
  idle: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground has-[:focus-visible]:bg-sidebar-accent/60 has-[:focus-visible]:text-foreground',
};

export function SidebarRow({
  active = false,
  icon,
  label,
  meta,
  actions,
  size = 'md',
  title,
  onClick,
  disabled = false,
  buttonProps,
  children,
  className = '',
  ref,
  ...rest
}: {
  active?: boolean;
  icon?: ReactNode;
  label?: ReactNode;
  /** Right-aligned detail inside the button — a count, an amount. */
  meta?: ReactNode;
  /** Trailing controls, outside the button (use SidebarRowAction). */
  actions?: ReactNode;
  /** md: a list entry (32px, medium). sm: an entry nested under one (32px, regular).
   *  tall: an entry with a second line (a SKU under a name) — 32px or more. */
  size?: 'md' | 'sm' | 'tall';
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Extra props for the row's button — drag listeners, aria overrides. */
  buttonProps?: ComponentProps<'button'>;
  /** Replaces the label with the caller's own control (e.g. a rename input
   *  or a button wired to a context menu). The icon slot and padding stay. */
  children?: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
} & Omit<ComponentProps<'div'>, 'children' | 'title' | 'onClick' | 'ref'>) {
  const type = size === 'sm' ? 'h-[30px] text-[13px] font-normal'
    : size === 'tall' ? 'min-h-9 py-1.5 text-[13px] font-medium'
    : 'h-[30px] text-[13px] font-medium';
  const body = (
    <>
      {icon && (
        <span className={`flex w-4 shrink-0 items-center justify-center transition-colors ${active ? 'text-foreground' : 'text-muted-foreground group-hover/srow:text-foreground'}`}>
          {icon}
        </span>
      )}
      {children ?? <span className="min-w-0 flex-1 truncate">{label}</span>}
      {meta !== undefined && meta !== null && meta !== false && (
        <span className={`shrink-0 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1.5 text-[11px] font-medium tabular-nums ${
          typeof meta === 'number' && meta > 0
            ? 'bg-[var(--accent-subtle)] text-[var(--accent-default)]'
            : 'text-muted-foreground/75'
        }`}>{meta}</span>
      )}
    </>
  );
  return (
    <div
      ref={ref}
      {...rest}
      className={`group/srow flex w-full min-w-0 items-center rounded-[6px] transition-colors duration-100 ${type} ${
        disabled ? 'text-muted-foreground opacity-50' : active ? STATE.active : STATE.idle
      } ${className}`}
    >
      {children !== undefined ? (
        <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-2">{body}</div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={title}
          aria-current={active ? 'page' : undefined}
          {...buttonProps}
          className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 text-left outline-none disabled:cursor-not-allowed ${buttonProps?.className ?? ''}`}
        >
          {body}
        </button>
      )}
      {actions && <span className="flex shrink-0 items-center gap-0.5 pr-1">{actions}</span>}
    </div>
  );
}

/** A trailing control in a SidebarRow — a chevron, a "…". No ground of its
 *  own: the row is already lit, so the glyph brightens instead. */
export function SidebarRowAction({ label, onClick, children, className = '', ...rest }: {
  label: string;
  onClick: () => void;
  children: ReactNode;
} & Omit<ComponentProps<'button'>, 'onClick' | 'children'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...rest}
      className={`flex size-6 items-center justify-center rounded-[5px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground ${className}`}
    >
      {children}
    </button>
  );
}

/** The small heading over a sidebar list ("Table", "Locations"). */
export function SidebarSectionLabel({ children, className = 'mt-5' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mb-0.5 flex h-7 items-center px-2.5 text-[12px] font-medium text-muted-foreground/80 ${className}`}>
      {children}
    </div>
  );
}
