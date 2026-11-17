'use client';

import { useMemo } from 'react';
import { Plus } from '@/ui/icons';
import { NavStrategyIcon, NavStrategyModeIcon } from '@/Frame/sidebar/NavIcons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { IslandHeader } from '@/Function/shared/MainIsland';
import { PageHead, PageLayout, PageSection } from '@/Function/shared/PageHead';
import { appDialog } from '@/Function/shared/appDialogStore';
import { formatError } from '@/Function/shared/formatError';
import { EmptyState } from '@/Function/shared/EmptyState';
import { useStrategiesInSpace } from '@/hooks/strategyData';
import { updateVision, useMyVisionRoles, useVisions } from '@/hooks/visionData';

/** A Vision's own page, as a Domain has its overview: its name and what it
 *  aims for, then the Portfolios it holds (the top ones; each opens its own
 *  page, where the nested ones are). */
export function VisionView({ visionId, onOpenPortfolio, onOpenPortfolios, onAddPortfolio }: {
  /** null = the Space's first Vision. */
  visionId: string | null;
  onOpenPortfolio: (strategyId: string, visionId: string) => void;
  onOpenPortfolios: (visionId: string) => void;
  onAddPortfolio: (visionId: string) => void;
}) {
  const { t } = useI18n();
  const { data: visions, loading } = useVisions();
  const vision = visions.find((v) => v.id === visionId) ?? visions[0] ?? null;
  const roles = useMyVisionRoles();
  const canEdit = !!vision && ['owner', 'admin'].includes(roles.get(vision.id) ?? '');
  const { data: strategies } = useStrategiesInSpace();
  const portfolios = useMemo(() => strategies
    .filter((s) => s.vision_id === vision?.id && s.parentIds.every((p) => !strategies.some((o) => o.id === p && o.vision_id === vision?.id)))
    .sort((a, b) => a.name.localeCompare(b.name)), [strategies, vision?.id]);

  if (!vision) {
    return loading ? null : (
      <div className="flex h-full flex-col bg-card">
        <IslandHeader crumbs={[{ id: 'vision', label: t('Vision') }]} />
        <EmptyState art="initiative" title="Create your first Vision"
          description="A Vision is what the Space aims to become. Its Portfolios are the ways to get there." />
      </div>
    );
  }
  const save = (patch: Parameters<typeof updateVision>[1]) =>
    updateVision(vision.id, patch).catch((e) => void appDialog.alert(formatError(e)));

  return (
    <div className="flex h-full flex-col bg-card">
      <IslandHeader crumbs={[{ id: vision.id, label: vision.name, icon: <ItemIcon icon={vision.icon} fallback={<NavStrategyModeIcon size={14} />} /> }]} />
      <div className="flex-1 overflow-auto">
        <PageLayout>
          <PageHead key={vision.id} icon={<ItemIcon icon={vision.icon} fallback={<NavStrategyModeIcon size={20} />} />} title={vision.name} description={vision.description ?? ''} canEdit={canEdit}
            titleLabel={t('Vision name')} titlePlaceholder={t('Vision name')}
            descriptionLabel={t('What this Vision aims for')} descriptionPlaceholder={t('What this Vision aims for…')}
            onSaveTitle={(name) => { if (name.trim() && name !== vision.name) void save({ name: name.trim() }); }}
            onSaveDescription={(description) => void save({ description: description || null })} />
          <PageSection title={t('Portfolio')} action={
            <button type="button" onClick={() => onOpenPortfolios(vision.id)}
              className="rounded px-1.5 py-0.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
              {t('See all')}
            </button>}>
            <div className="-mx-2.5 space-y-px">
              {portfolios.map((s) => (
                <button key={s.id} type="button" onClick={() => onOpenPortfolio(s.id, vision.id)}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted/40">
                  <ItemIcon icon={s.icon} fallback={<NavStrategyIcon size={16} />} />
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
              <button type="button" onClick={() => onAddPortfolio(vision.id)}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
                <Plus size={14} />{t('Add Portfolio')}
              </button>
            </div>
          </PageSection>
        </PageLayout>
      </div>
    </div>
  );
}
