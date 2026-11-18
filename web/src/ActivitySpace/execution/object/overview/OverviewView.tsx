'use client';

import { appDialog } from '@/Function/shared/appDialogStore';
import { formatError } from '@/Function/shared/formatError';
import { setActiveDomainId } from '@/Function/space/domainsStore';

import { useExplorerData } from '@/Function/shared/ExplorerDataContext';

import { useMemo, useState } from 'react';
import type { ElementWithDetails, ClaywareObjectWithChildren } from '@/hooks/useSupabase';
import { toggleReaction, updateObject, useWorkers } from '@/hooks/useSupabase';
import { useObjectReactions } from '@/hooks/commentData';
import { useAuthContext } from '@/providers/AuthProvider';
import { Button } from '@/ui/button';
import { FileText, Plus } from '@/ui/icons';
import { DropdownMenuItem } from '@/ui/dropdown-menu';
import { PageActionRow, PAGE_MORE_ITEM } from '@/Function/shared/PageActionRow';
import { NavSlidesIcon } from '@/Frame/sidebar/NavIcons';
import { requestNewDeck } from '@/ActivitySpace/artifacts/slides/newDeckRequest';
import { openInApp } from '@/Function/shared/appNavigation';
import { NotePicker } from '@/ActivitySpace/artifacts/notebook/NotePicker';
import { LinkedNoteEmbed } from '@/ActivitySpace/artifacts/notebook/LinkedNoteEmbed';
import { MilestoneList } from '@/Function/widget/widgets/MilestonesWidget';
import { ObjectCommentsPanel } from '../ObjectCommentsPanel';
import { ObjectIcon } from '@/Frame/icons';
import { PageHead, PageSection, PAGE_FRAME } from '@/Function/shared/PageHead';
import { ItemIconButton, useItemLook } from '@/Function/shared/itemIcon/IconPicker';
import { useI18n } from '@/Function/i18n/I18nProvider';
import {
  useBoard,
  WidgetSurface,
  WidgetZone,
  OBJECT_OVERVIEW_BOARD,
  type WidgetHost,
  type Zone,
} from '@/Function/widget';

/** The rail beside; the document column is fixed, as on an Element's page.
 *  Nothing sits under the name, so there is no band. */
const SURFACE_ZONES: Zone[] = ['main', 'rail'];
const CANVAS_ONLY = ['generated-app'];

// =============================================================
// Object Overview — read like an Element's page.
//
// The document column is fixed: the Object's icon and name, its
// description, one quiet row (reactions, attaching a file) with the
// attached files right under it, its Milestones, then its Updates — the
// thread people and agents leave on it. The rail beside (Properties,
// Strategy intent, …) stays a widget board.
// =============================================================

interface OverviewViewProps {
  elements: ElementWithDetails[];
  object: ClaywareObjectWithChildren;
  onRefresh?: () => void;
  onNavigate?: (nav: { objectId?: string | null; strategyId?: string }) => void;
  /** Switch the active top-level activity — the Strategy rows use this to
   *  jump out to the Strategy surface. */
  onViewChange?: (view: string) => void;
}

export function OverviewView({
  elements,
  object,
  onRefresh,
  onNavigate,
  onViewChange,
}: OverviewViewProps) {
  const { t } = useI18n();
  const explorerData = useExplorerData();
  const [look, changeLook] = useItemLook({ icon: object.icon ?? null, color: object.color },
    async (next) => { await updateObject(object.id, next); onRefresh?.(); });

  // The name and description are edited in place by the shared PageHead,
  // which reports a failed save under the title.
  const handleTitleSave = async (name: string) => {
    await updateObject(object.id, { name });
    onRefresh?.();
  };

  const handleDescriptionSave = async (description: string) => {
    await updateObject(object.id, { description: description || null });
    onRefresh?.();
  };

  const board = useBoard('object-overview', OBJECT_OVERVIEW_BOARD, object.id);
  const { user } = useAuthContext();
  const userId = user?.id ?? null;
  const { reactions, refresh: refreshReactions } = useObjectReactions(object.id);
  const reactWith = async (emoji: string) => {
    if (!userId) return;
    try {
      await toggleReaction({ userId, emoji, objectId: object.id });
      await refreshReactions();
    } catch (err) {
      console.error('Failed to react:', err);
    }
  };
  const { data: workers } = useWorkers();
  const [addingMilestone, setAddingMilestone] = useState(false);
  const milestoneIds = useMemo(() => [object.id], [object.id]);
  const milestoneNames = useMemo(() => new Map([[object.id, object.name]]), [object.id, object.name]);

  const host = useMemo<WidgetHost>(
    () => ({
      subject: { kind: 'object', id: object.id },
      elements,
      object,
      explorerData,
      onRefresh,
      onNavigate: nav => {
        if (nav.domainId && !nav.objectId) {
          setActiveDomainId(nav.domainId);
          onNavigate?.({ objectId: null });
          onViewChange?.('domain-overview');
        } else onNavigate?.(nav);
      },
      onViewChange,
    }),
    [object, elements, explorerData, onRefresh, onNavigate, onViewChange],
  );

  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const linkNote = async (noteId: string | null) => {
    try { await updateObject(object.id, { note_id: noteId }); onRefresh?.(); }
    catch (e) { await appDialog.alert(formatError(e)); }
  };

  return (
    <div className="h-full overflow-y-auto bg-card">
      <div className={PAGE_FRAME}>
        <WidgetSurface board={board} host={host} zones={SURFACE_ZONES}>
          {/* items-start: don't let the (often taller) rail stretch the main
              column. A stretched block column was the layout that made the
              title/description textareas mis-measure and balloon. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
            {/* ───────────── Main column ───────────── */}
            {/* pl-6: indent the editorial content off the left rail so it
                reads as a document rather than flush against the sidebar. */}
            <div className="space-y-6 min-w-0">
              <PageHead key={object.id}
                icon={<ItemIconButton value={look} onChange={changeLook} defaultIcon={<ObjectIcon size={18} />} />}
                title={object.name} description={object.description ?? ''} canEdit
                titleLabel={t('Object name')} titlePlaceholder={t('Object name')}
                descriptionLabel={t('Description')} descriptionPlaceholder={t('Describe this Object…')}
                onSaveTitle={handleTitleSave} onSaveDescription={handleDescriptionSave} />

              <PageActionRow reactions={reactions} userId={userId} onReact={(e) => void reactWith(e)}
                filesOf={{ kind: 'object', id: object.id }}
                moreItems={<>
                  {!object.note_id && (
                    <DropdownMenuItem onSelect={() => setTimeout(() => setNotePickerOpen(true), 0)} className={PAGE_MORE_ITEM}>
                      <FileText size={15} className="text-muted-foreground" />{t('Document')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => { requestNewDeck(object.name); openInApp('slides'); }} className={PAGE_MORE_ITEM}>
                    <NavSlidesIcon size={15} />{t('Slide')}
                  </DropdownMenuItem>
                </>}
                moreAnchor={<NotePicker open={notePickerOpen} onClose={() => setNotePickerOpen(false)}
                  onPick={(noteId) => { setNotePickerOpen(false); void linkNote(noteId); }}
                  anchorClassName="absolute top-full left-0 mt-1" />} />

              {/* The Note pinned to this Object, shown in place. */}
              {object.note_id && <LinkedNoteEmbed noteId={object.note_id} onUnlink={() => void linkNote(null)} />}

              {/* Canvases: what was asked to be drawn for this Object. */}
              {board.layout.main.some((w) => w.type === 'generated-app') && <WidgetZone zone="main" only={CANVAS_ONLY} />}

              <PageSection title={t('Milestones')} action={
                <Button variant="ghost" size="icon-xs" aria-label={t('Add milestone')} onClick={() => setAddingMilestone(true)}>
                  <Plus size={14} />
                </Button>
              }>
                <MilestoneList ids={milestoneIds} names={milestoneNames} objectId={object.id} editable
                  adding={addingMilestone} onAddingChange={setAddingMilestone} elements={elements} />
              </PageSection>

              <PageSection title={t('Updates')}>
                <ObjectCommentsPanel objectId={object.id} objectName={object.name} workers={workers} />
              </PageSection>
            </div>

            {/* ───────────── Side column ───────────── */}
            <aside className="min-w-0 space-y-3">
              <WidgetZone zone="rail" />
            </aside>
          </div>
        </WidgetSurface>
      </div>
    </div>
  );
}
