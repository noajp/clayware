'use client';

import { Fragment, type ReactNode } from 'react';
import { ChevronRight } from '@/ui/icons';
import { SidebarReveal } from '@/Function/shared/SidebarReveal';
import type { IslandCrumb } from '@/Function/shared/MainIsland';

// =============================================================
// PageHeader — the unified 48px header for every main island pane.
//
// Layout (Linear × Asana):
//   Left:  SidebarReveal · breadcrumb path or title (+ optional count badge) · after
//   Right: controls (display / filter) │ primaryAction · overflow ("…")
//
// Destructive actions (delete, trash) never sit permanently in the header;
// they belong in the overflow menu or a selection bulk bar.
// =============================================================

export interface PageHeaderProps {
  /** Breadcrumb segments. When omitted, `title` is rendered as a single leaf crumb. */
  crumbs?: IslandCrumb[];
  /** Simple title when no multi-level breadcrumb is needed. */
  title?: ReactNode;
  /** Optional leading icon for the simple `title` form. */
  icon?: ReactNode;
  /** Numeric or short count badge rendered beside the title with tabular-nums. */
  count?: ReactNode;
  /** Inline metadata or actions directly following the last crumb (e.g. Follow, entity "…"). */
  after?: ReactNode;
  /** View / filter / display controls (left side of the right action cluster). */
  controls?: ReactNode;
  /** Single primary CTA button (right of the divider). */
  primaryAction?: ReactNode;
  /** Overflow menu trigger ("…") or secondary trailing slot. */
  more?: ReactNode;
  className?: string;
}

export function PageHeader({
  crumbs,
  title,
  icon,
  count,
  after,
  controls,
  primaryAction,
  more,
  className = '',
}: PageHeaderProps) {
  const resolvedCrumbs: IslandCrumb[] = crumbs ?? (
    title !== undefined ? [{ id: 'title', label: title, icon }] : []
  );

  return (
    <header className={`gloss-bar flex h-12 flex-shrink-0 items-center gap-1.5 bg-card pl-6 pr-3 ${className}`}>
      <SidebarReveal />
      <div className="flex min-w-0 items-center gap-1">
        {resolvedCrumbs.map((c, i) => {
          const last = i === resolvedCrumbs.length - 1;
          return (
            <Fragment key={c.id}>
              {i > 0 && <ChevronRight size={12} className="flex-shrink-0 text-muted-foreground/45" />}
              {c.onClick ? (
                <button
                  type="button"
                  onClick={c.onClick}
                  className="flex max-w-[220px] shrink-0 items-center gap-1.5 truncate rounded-[5px] px-1.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground [&_svg]:shrink-0"
                >
                  {c.icon}
                  <span className="truncate">{c.label}</span>
                </button>
              ) : (
                <span
                  className={`flex max-w-[260px] shrink-0 items-center gap-1.5 truncate px-1.5 py-1 [&_svg]:shrink-0 ${
                    last ? 'text-[13px] font-semibold text-foreground' : 'text-[13px] font-medium text-muted-foreground'
                  }`}
                >
                  {c.icon && <span className="text-muted-foreground">{c.icon}</span>}
                  <span className="truncate">{c.label}</span>
                </span>
              )}
            </Fragment>
          );
        })}
        {count !== undefined && count !== null && count !== false && (
          <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--surface-muted)] px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        {after && <div className="ml-0.5 flex shrink-0 items-center gap-1">{after}</div>}
      </div>

      {(controls || primaryAction || more) && (
        <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5 pl-3">
          {controls && <div className="flex items-center gap-1">{controls}</div>}
          {primaryAction}
          {more}
        </div>
      )}
    </header>
  );
}
