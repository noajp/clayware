'use client';

import { useMemo } from 'react';
import { NavStrategyIcon } from '@/Frame/sidebar/NavIcons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { SidebarRow, SidebarSectionLabel } from '@/Function/shared/SidebarRow';
import { useStrategiesInSpace } from '@/hooks/strategyData';

/** The Strategy place in the sidebar: under a plain "Strategy" heading,
 *  the top-level Strategies, each opening its own page. */
export function StrategyList({ activeStrategyId, onOpen }: {
  /** The open Strategy on the Strategy screen; null for the list. */
  activeStrategyId: string | null | undefined;
  onOpen: (strategyId: string) => void;
}) {
  const { t } = useI18n();
  const { data, loading } = useStrategiesInSpace();
  const top = useMemo(() => data.filter((s) => s.parentIds.length === 0), [data]);
  return (
    <div className="mt-5">
      <SidebarSectionLabel className="mt-1">{t('Strategy')}</SidebarSectionLabel>
      <div className="space-y-px">
        {top.map((s) => (
          <SidebarRow key={s.id} active={activeStrategyId === s.id} title={s.name}
            icon={<ItemIcon icon={s.icon} fallback={<NavStrategyIcon size={16} />} />} label={s.name}
            onClick={() => onOpen(s.id)} />
        ))}
      </div>
      {!loading && top.length === 0 && <p className="px-2.5 py-1.5 text-[12px] text-muted-foreground">{t('No Strategy yet.')}</p>}
    </div>
  );
}
