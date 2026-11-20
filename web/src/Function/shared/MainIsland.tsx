'use client';

import { PageHeader } from '@/Function/shared/PageHeader';
import { type ReactNode } from 'react';
import { FollowButton } from '@/Function/shared/FollowButton';
import type { FollowKind } from '@/hooks/followData';

// The main island — the pane right of the sidebar — drawn the same way in
// every app (Execution, Audit, Files, Table): a 48px PageHeader naming where
// you are as a path (Domain › Folders › a folder), the page's controls/verbs at
// its right, then the page. A list page puts its column heads right under it.

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
  const trailing = menu || follow || after ? (
    <>
      {menu}
      {follow && <FollowButton kind={follow.kind} id={follow.id} />}
      {after}
    </>
  ) : undefined;
  return <PageHeader crumbs={crumbs} count={count} after={trailing} controls={actions} />;
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
