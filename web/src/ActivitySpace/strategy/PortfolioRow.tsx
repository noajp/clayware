'use client';

import { useMemo, type ReactNode } from 'react';
import { NavStrategyIcon } from '@/Frame/sidebar/NavIcons';
import { ContentRow } from '@/Function/shared/ContentRow';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { ProgressBelt } from '@/Function/shared/ProgressBelt';
import { WorkerAvatar } from '@/Function/shared/WorkerAvatar';
import { completionOf } from '@/Function/shared/completion';
import { useWorkers } from '@/hooks/teamData';
import type { Worker } from '@/types/database';

/** Workers by the person they are, to draw who owns or added a thing. */
export function useWorkersByUser(): Map<string, Worker> {
  const { data: workers } = useWorkers();
  return useMemo(() => new Map(workers.filter((w) => w.user_id).map((w) => [w.user_id as string, w])), [workers]);
}

/** The progress cell every row in these sections uses: a belt and a figure. */
function ProgressCell({ pct }: { pct: number }) {
  return (
    <span className="flex w-24 items-center gap-1.5">
      <ProgressBelt value={pct} className="flex-1" />
      <span className="w-7 text-right">{pct}%</span>
    </span>
  );
}

/** One Portfolio in a list on a Vision's or a Portfolio's page: its icon and
 *  name, who owns it and how far its Objects' Elements are done. */
export function PortfolioRow({ portfolio, objects, owner, shows, onOpen, actions }: {
  portfolio: { id: string; name: string; icon: string | null; color: string | null; objectIds: string[] };
  /** Every Object visible, with its Elements, to figure progress from. */
  objects: readonly { id: string; elements?: readonly { status?: string | null }[] }[];
  owner?: Worker;
  shows: (column: string) => boolean;
  onOpen: () => void;
  actions?: ReactNode;
}) {
  const ids = new Set(portfolio.objectIds);
  const pct = completionOf(objects.filter((o) => ids.has(o.id)).flatMap((o) => o.elements ?? [])).pct;
  return (
    <ContentRow icon={<ItemIcon icon={portfolio.icon} color={portfolio.color} size={16} fallback={<NavStrategyIcon size={16} />} />}
      name={portfolio.name} onOpen={onOpen} actions={actions}
      meta={<>
        {shows('progress') && <ProgressCell pct={pct} />}
        {shows('owner') && <span className="flex w-5 justify-center">{owner && <WorkerAvatar worker={owner} size={18} title={owner.name} />}</span>}
      </>} />
  );
}
