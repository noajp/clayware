'use client';

import { useExplorerData } from '@/Function/shared/ExplorerDataContext';
import { useMemo } from 'react';
import { LayoutGrid } from '@/ui/icons';
import {
  useBoard,
  WidgetSurface,
  WidgetZone,
  HOME_BOARD,
  type WidgetHost,
  type Zone,
} from '@/Function/widget';
// Shared, and deduped: an Element multi-homed into two Objects appears twice
// in a naive walk, which is what crashed the Board.
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { collectAllElements } from '@/ActivitySpace/execution/object/ObjectsView';
import { PageHeader } from '@/Function/shared/PageHeader';
import { useI18n } from '@/Function/i18n/I18nProvider';

/** Home is a band and a two-column board — no rail. */
const SURFACE_ZONES: Zone[] = ['band', 'main'];

/** Home dashboard — the one board whose subject is the viewer rather than a
 *  row: `me`, scoped to everything they can see. */
export function HomeView() {
  const { t } = useI18n();
  const explorerData = useExplorerData();
  const allElements = useMemo(
    () => [...collectAllElements(explorerData.objects), ...(explorerData.rootElements ?? [])],
    [explorerData],
  );

  const spaceId = useActiveSpaceId();
  const board = useBoard('home', HOME_BOARD, spaceId ?? 'me');

  const host = useMemo<WidgetHost>(
    () => ({ subject: { kind: 'me', id: null }, elements: allElements, explorerData }),
    [allElements, explorerData],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-card">
      <PageHeader
        title={t('Dashboard')}
        icon={<LayoutGrid size={15} />}
        after={
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {t('{elements} Elements across {objects} Objects', { elements: allElements.length, objects: explorerData.objects.length })}
          </span>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-5 space-y-4">
          <WidgetSurface board={board} host={host} zones={SURFACE_ZONES}>
            <WidgetZone zone="band" className="mb-4" />
            <WidgetZone zone="main" columns={2} />
          </WidgetSurface>
        </div>
      </div>
    </div>
  );
}
