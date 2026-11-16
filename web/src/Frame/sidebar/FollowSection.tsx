'use client';

import { useI18n } from '@/Function/i18n/I18nProvider';
import { SidebarFold } from '@/Function/shared/SidebarFold';
import { SidebarRow } from '@/Function/shared/SidebarRow';
import { ElementProgressMark } from '@/Function/shared/ElementProgressMark';
import { ObjectIcon } from '@/Frame/icons';
import { NavStrategyIcon } from '@/Frame/sidebar/NavIcons';
import { useFollows, type FollowKind, type Followed } from '@/hooks/followData';
import type { ElementWithDetails } from '@/hooks/useSupabase';

/** "Following ▾": what this person starred (the star beside a page's "…"),
 *  of the kinds this place lists — Strategies in the Strategy place, Objects
 *  and Elements in Execution; each opens where it lives. Absent until they
 *  star something. */
export function FollowSection({ kinds, activeId, onOpen }: {
  kinds: readonly FollowKind[];
  /** The open Strategy or Object, to mark its row. */
  activeId: string | null;
  onOpen: (item: Followed) => void;
}) {
  const { t } = useI18n();
  const { follows, loading } = useFollows();
  const shown = follows.filter((f) => kinds.includes(f.kind));
  if (loading || !shown.length) return null;
  return (
    <SidebarFold id={`following-${kinds.join('-')}`} label={t('Following')}>
      <div className="space-y-px">
        {shown.map((f) => (
          <SidebarRow key={`${f.kind}:${f.id}`} label={f.label} title={f.label}
            active={f.kind !== 'element' && f.id === activeId}
            icon={f.kind === 'strategy' ? <NavStrategyIcon size={16} />
              : f.kind === 'object' ? <ObjectIcon size={16} />
              : <ElementProgressMark status={f.status as ElementWithDetails['status']} size={16} />}
            onClick={() => onOpen(f)} />
        ))}
      </div>
    </SidebarFold>
  );
}
