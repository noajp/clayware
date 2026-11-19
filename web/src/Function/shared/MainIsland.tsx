'use client';

import { SidebarReveal } from '@/Function/shared/SidebarReveal';
import { Fragment, type ReactNode } from 'react';
import { ChevronRight } from '@/ui/icons';
import { FollowButton } from '@/Function/shared/FollowButton';
import type { FollowKind } from '@/hooks/followData';

// The main island — the pane right of the sidebar — drawn the same way in
// every app (Execution, Audit, Files, Table): a 50px header naming where you
// are as a path (Domain › Folders › a folder), the page's verbs at its
// right, then the page. A list page puts its column heads right under it.

export interface IslandCrumb {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Opens that level. The current page (the last crumb) has none. */
  onClick?: () => void;
  /** Names a crumb whose label is only an icon (a "Back" chevron). */
  title?: string;
}

/** The header: the path, how many things the page lists, its verbs.
 *
 *  A concept's own page (Vision, Portfolio, Domain, Object, Element) names
 *  its place from the top down — Vision › Portfolio…, Domain › Object ›
 *  Element — and puts the same two controls right after its own name: the
 *  "⋯" of what can be done to it (`menu`), then the check that follows it
 *  (`follow`). */
export function IslandHeader({ crumbs, count, menu, follow, after, actions }: {
  crumbs: IslandCrumb[];
  count?: number;
  /** The page's own "⋯", right after the last crumb. */
  menu?: ReactNode;
  /** The star after the "⋯": follow this page's subject. */
  follow?: { kind: FollowKind; id: string };
  /** After those (a "Read-only" note). */
  after?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // pl-6: with the crumb's own px-1.5 the path starts 30px in, where the
    // list's first column heading does.
    <header className="gloss-bar flex h-[50px] flex-shrink-0 items-center gap-1 bg-card pl-6 pr-2">
      <SidebarReveal />
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={c.id}>
            {i > 0 && <ChevronRight size={12} className="flex-shrink-0 text-muted-foreground/50" />}
            {c.onClick ? (
              <button type="button" onClick={c.onClick} aria-label={c.title} title={c.title}
                className="flex max-w-[220px] shrink-0 items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
                {c.icon}<span className="truncate">{c.label}</span>
              </button>
            ) : (
              (() => { const Tag = last ? 'h1' : 'span'; return (
              <Tag className={`flex max-w-[260px] shrink-0 items-center gap-1 truncate px-1.5 py-0.5 ${last ? 'text-[13px] font-semibold text-foreground' : 'text-[13px] font-medium text-muted-foreground'}`}>
                {c.icon}<span className="truncate">{c.label}</span>
              </Tag>);
              })()
            )}
          </Fragment>
        );
      })}
      {count !== undefined && <span className="ml-0.5 text-[12px] tabular-nums text-muted-foreground">{count}</span>}
      {menu}
      {follow && <FollowButton kind={follow.kind} id={follow.id} />}
      {after}
      {/* The path keeps its room; on a narrow pane the verbs give way first. */}
      {actions && <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5 overflow-hidden pl-3">{actions}</div>}
    </header>
  );
}

/** The island with its header; the page fills the rest. */
export function MainIsland({ crumbs, count, menu, follow, after, actions, children }: {
  crumbs: IslandCrumb[];
  count?: number;
  menu?: ReactNode;
  follow?: { kind: FollowKind; id: string };
  after?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">
      <IslandHeader crumbs={crumbs} count={count} menu={menu} follow={follow} after={after} actions={actions} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** A list's column heads, as Execution's lists have them. */
export function IslandColumns({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 py-2.5 pl-[30px] pr-[30px] text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
