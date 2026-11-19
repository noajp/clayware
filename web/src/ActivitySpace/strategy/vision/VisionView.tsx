'use client';

import { useMemo } from 'react';
import { ActionsButton } from '@/Function/shared/ActionMenus';
import { useVisionActions } from './visionActions';
import { DropdownMenuItem } from '@/ui/dropdown-menu';
import { PageActionRow, PAGE_MORE_ITEM } from '@/Function/shared/PageActionRow';
import { NavSlidesIcon } from '@/Frame/sidebar/NavIcons';
import { requestNewDeck } from '@/ActivitySpace/artifacts/slides/newDeckRequest';
import { openInApp } from '@/Function/shared/appNavigation';
import { toggleReaction, useVisionReactions } from '@/hooks/commentData';
import { useAuthContext } from '@/providers/AuthProvider';
import { NavStrategyModeIcon } from '@/Frame/sidebar/NavIcons';
import { useWorkspaceActions } from '@/Frame/WorkspaceActionsContext';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { IslandHeader } from '@/Function/shared/MainIsland';
import { PageHead, PageLayout } from '@/Function/shared/PageHead';
import { ConceptSection } from '@/Function/shared/ConceptSection';
import { useSectionItems } from '@/Function/shared/sectionVisibility';
import { ArtifactsSection } from '../ArtifactsSection';
import { PortfolioRow, useWorkersByUser } from '../PortfolioRow';
import { useObjects } from '@/hooks/useSupabase';
import { appDialog } from '@/Function/shared/appDialogStore';
import { formatError } from '@/Function/shared/formatError';
import { EmptyState } from '@/Function/shared/EmptyState';
import { useStrategiesInSpace } from '@/hooks/strategyData';
import { updateVision, useMyVisionRoles, useVisions } from '@/hooks/visionData';

/** A Vision's own page, as a Domain has its overview: its name and what it
 *  aims for, then the Portfolios it holds (the top ones; each opens its own
 *  page, where the nested ones are). */
export function VisionView({ visionId, onOpenPortfolio, onAddPortfolio }: {
  /** null = the Space's first Vision. */
  visionId: string | null;
  onOpenPortfolio: (strategyId: string, visionId: string) => void;
  onAddPortfolio: (visionId: string) => void;
}) {
  const { t } = useI18n();
  const { openCreate } = useWorkspaceActions();
  const { data: visions, loading } = useVisions();
  const vision = visions.find((v) => v.id === visionId) ?? visions[0] ?? null;
  const roles = useMyVisionRoles();
  const role = vision ? roles.get(vision.id) : undefined;
  const canEdit = role === 'owner' || role === 'admin';
  const canWork = canEdit || role === 'member';
  const { data: explorer } = useObjects(null);
  const objects = explorer.objects;
  const byUser = useWorkersByUser();
  const sectionItems = useSectionItems('vision', [
    { id: 'vision-artifacts', label: t('Artifacts') },
    { id: 'vision-portfolios', label: t('Portfolios') },
  ]);
  const actions = [...useVisionActions(vision, role), ...sectionItems];
  const userId = useAuthContext().user?.id ?? null;
  const { reactions, refresh: refreshReactions } = useVisionReactions(vision?.id ?? null);
  const reactWith = async (emoji: string) => {
    if (!userId || !vision) return;
    try { await toggleReaction({ userId, emoji, visionId: vision.id }); }
    catch (e) { void appDialog.alert(formatError(e)); }
    finally { void refreshReactions(); }
  };
  const { data: strategies } = useStrategiesInSpace();
  const portfolios = useMemo(() => strategies
    .filter((s) => s.vision_id === vision?.id && s.parentIds.every((p) => !strategies.some((o) => o.id === p && o.vision_id === vision?.id)))
    .sort((a, b) => a.name.localeCompare(b.name)), [strategies, vision?.id]);

  if (!vision) {
    return loading ? null : (
      <div className="flex h-full flex-col bg-card">
        <IslandHeader crumbs={[{ id: 'vision', label: t('Vision') }]} />
        <EmptyState art="initiative" title="Create your first Vision"
          description="A Vision is what the Space aims to become. Its Portfolios are the ways to get there."
          cta="Create Vision" onCta={() => openCreate('vision')} />
      </div>
    );
  }
  const save = (patch: Parameters<typeof updateVision>[1]) =>
    updateVision(vision.id, patch).catch((e) => void appDialog.alert(formatError(e)));

  return (
    <div className="flex h-full flex-col bg-card">
      <IslandHeader crumbs={[{ id: vision.id, label: vision.name, icon: <ItemIcon icon={vision.icon} fallback={<NavStrategyModeIcon size={14} />} /> }]}
        menu={<ActionsButton items={actions} label={t('Vision actions')} />}
        follow={{ kind: 'vision', id: vision.id }} />
      <div className="flex-1 overflow-auto">
        <PageLayout>
          <PageHead key={vision.id} icon={<ItemIcon icon={vision.icon} fallback={<NavStrategyModeIcon size={20} />} />} title={vision.name} description={vision.description ?? ''} canEdit={canEdit}
            titleLabel={t('Vision name')} titlePlaceholder={t('Vision name')}
            descriptionLabel={t('Description')} descriptionPlaceholder={t('Describe this Vision…')}
            onSaveTitle={(name) => { if (name.trim() && name !== vision.name) void save({ name: name.trim() }); }}
            onSaveDescription={(description) => void save({ description: description || null })} />
          <PageActionRow reactions={reactions} userId={userId} onReact={(e) => void reactWith(e)} filesOf={null}
            moreItems={
              <DropdownMenuItem onSelect={() => { requestNewDeck(vision.name); openInApp('slides'); }} className={PAGE_MORE_ITEM}>
                <NavSlidesIcon size={15} />{t('Slide')}
              </DropdownMenuItem>
            } />
          <ArtifactsSection subject={{ kind: 'vision', id: vision.id }} canAdd={canWork} />
          <ConceptSection page="vision" id="vision-portfolios" title={t('Portfolios')} count={portfolios.length}
            columns={[{ key: 'progress', label: t('Progress') }, { key: 'owner', label: t('Owner') }]}
            addLabel={t('Add Portfolio')} onAdd={() => onAddPortfolio(vision.id)} empty={portfolios.length === 0}>
            {(shows) => portfolios.map((s) => (
              <PortfolioRow key={s.id} portfolio={s} objects={objects} shows={shows}
                owner={s.created_by ? byUser.get(s.created_by) : undefined}
                onOpen={() => onOpenPortfolio(s.id, vision.id)} />
            ))}
          </ConceptSection>
        </PageLayout>
      </div>
    </div>
  );
}
