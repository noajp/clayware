'use client';

import { PageHeader } from '@/Function/shared/PageHeader';
import { type ReactNode } from 'react';

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
}

/** The header: the path, how many things the page lists, its verbs. */
export function IslandHeader({ crumbs, count, after, actions }: {
  crumbs: IslandCrumb[];
  count?: number;
  /** Right after the last crumb (an Object's "⋯"). */
  after?: ReactNode;
  actions?: ReactNode;
}) {
  return <PageHeader crumbs={crumbs} count={count} after={after} controls={actions} />;
}

/** The island with its header; the page fills the rest. */
export function MainIsland({ crumbs, count, after, actions, children }: {
  crumbs: IslandCrumb[];
  count?: number;
  after?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">
      <IslandHeader crumbs={crumbs} count={count} after={after} actions={actions} />
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
