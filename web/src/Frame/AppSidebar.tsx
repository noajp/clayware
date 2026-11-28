'use client';

import { DomainMark } from '@/Function/shared/DomainMark';
import { SidebarFold } from '@/Function/shared/SidebarFold';
import { FollowSection } from '@/Frame/sidebar/FollowSection';
import { VisionList } from '@/Frame/sidebar/VisionList';
import { useStrategies } from '@/hooks/strategyData';
import { requestElementDetail, requestObjectPage } from '@/Function/shared/element/elementDetailRequest';
import { Button, ButtonAppearanceProvider } from '@/ui/button';
import { Input } from '@/ui/input';
import { FONT } from '@/shared/designTokens';

import { DomainAgentSettings } from '@/ActivitySpace/execution/domain/DomainAgentSettings';
import { SettingsModal } from '@/Function/settings/SettingsModal';
import { SegmentedControl, SettingField } from '@/Function/settings/SettingsControls';
import { NavCalendarIcon, NavInboxIcon, NavMyTasksIcon, NavStrategyIcon } from './sidebar/NavIcons';
import { TeamList } from './sidebar/TeamList';
import { railSectionOf, type RailSection } from '@/Frame/railSections';
import { loadSidebarOrder, moveSidebarItem, saveSidebarOrder, type SidebarItem } from './sidebarOrder';
import { DomainNavigationRow } from './sidebar/DomainNavigationRow';
import { useWorkspaceActions } from '@/Frame/WorkspaceActionsContext';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { OPEN_DOMAIN_SETTINGS_EVENT } from '@/Function/shared/appNavigation';
import type { Domain, DomainPrivacy } from '@/hooks/useSupabase';
import { ArrowLeft, Compass, Plus, Bot, Settings, Users, FilePlus, FolderPlus, FileUp } from '@/ui/icons';
import { updateDomain, deleteDomain, leaveDomain, useNotifications } from '@/hooks/useSupabase';
import { useAuthContext } from '@/providers/AuthProvider';
import { domainHasObjectsMessage, useDomainRole, type DomainRole } from '@/hooks/domainData';
import { countDomainObjects } from '@/hooks/useObjectArchive';
import { ConfirmDialog } from '@/Function/shared/ConfirmDialog';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ObjectIcon } from '@/Frame/icons';
import { DomainIcon } from '@/Function/shared/conceptIcons';
import { useDomains, reorderDomains } from '@/hooks/useSupabase';
import { useSustainmentDomains } from '@/hooks/useSustainmentDomains';
import { getActiveDomainId, setActiveDomainId, ACTIVE_DOMAIN_CHANGE_EVENT } from '@/Function/space/domainsStore';
import { SpaceSwitcher } from '@/Function/space/SpaceSwitcher';

import { railModeOf } from '@/Frame/railApps';
import type { RailMode } from '@/Frame/railApps';
import { CREATE_ELEMENT_EVENT, type CreateElementDetail } from '@/Frame/QuickAddElementLauncher';
import { useCalendarDay } from '@/ActivitySpace/calendar/calendarStore';
import { SettingsSidebarPanel } from '@/Function/settings/SettingsSidebarPanel';
import { TeamSettings } from '@/Function/settings/TeamSettings';
import { SidebarRow } from '@/Function/shared/SidebarRow';
import { createDeckHere, createFolderHere, pickDeckFile } from '@/ActivitySpace/artifacts/slides/SlidesSidebar';
import { useSlidesReady } from '@/ActivitySpace/artifacts/slides/sync';
import type { NavigationState } from '@/types/navigation';
import { useI18n } from '@/Function/i18n/I18nProvider';

export type { NavigationState };

interface AppSidebarProps {
  navigation: NavigationState;
  onNavigate: (nav: Partial<NavigationState>) => void;
  activeView: string;
  onViewChange: (view: string) => void;
  /** A followed item opens in a shell tab of its own; without it, it
   *  navigates the active tab in place. */
  onOpenItem?: (view: string, nav?: Partial<NavigationState>) => void;
  /** Settings opens in place; Back returns to the view it came from — see
   *  page.tsx's handleOpenSettings / handleCloseSettings. */
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onRefresh?: () => void;
  width: number;
  collapsed: boolean;
  overlay: boolean;
  onCreateNew?: (type: 'domain' | 'object' | 'note') => void;
  onSearch?: () => void;
  /** Hides the sidebar — reached by dragging its edge left past its least
   *  width (each page's title row and ⌘\\ bring it back). */
  onToggleSidebar?: () => void;
}

/** How far past its least width the edge is dragged before the sidebar closes. */
const SIDEBAR_CLOSE_PULL = 72;


// The sidebar lists what the ModeRail's place holds: Athena's (Inbox, the
// Agent, your Elements and Calendar, what you follow), Strategy (the
// Strategies), Execution (the Domain tree, whose rows carry the D/O/E
// surfaces) or Team (the units and who is in them). A screen under none
// of them (Settings, a tool) keeps the place last chosen.

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_WIDTH_KEY = 'clayware:sidebarWidth';




export function AppSidebar({
  navigation,
  onNavigate,
  activeView,
  onViewChange,
  onOpenItem,
  onOpenSettings,
  onCloseSettings,
  collapsed,
  overlay,
  onCreateNew,
  onSearch,
  onToggleSidebar,
}: AppSidebarProps) {
  const { openCreate } = useWorkspaceActions();
  const { t } = useI18n();
  // The Inbox row's unread count — the same hook and count the StatusBar's
  // badge reads (useNotifications over the signed-in user), projected as a
  // plain number in the row's meta slot.
  const { user } = useAuthContext();
  const { unreadCount } = useNotifications(user?.id ?? null);
  const { guestDomains, refetch: refetchMemberDomains } = useDomains();
  const { data: visibleDomains, refetch: refetchVisibleDomains } = useSustainmentDomains();
  const domains = useMemo(() => [...visibleDomains].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)), [visibleDomains]);
  const refetchDomains = useCallback(async () => {
    await Promise.all([refetchMemberDomains(), refetchVisibleDomains()]);
  }, [refetchMemberDomains, refetchVisibleDomains]);
  // Locally-mirrored Domain order so a drag-reorder applies instantly on drop.
  // Without this the list would snap back to the server order for the frame
  // between releasing and refetchDomains() resolving — a visible flicker.
  // Kept in sync with the hook's data whenever it changes.
  // The fixed rows' order, this person's, kept in this browser.
  const [sidebarOrder, setSidebarOrder] = useState<SidebarItem[]>(loadSidebarOrder);
  const [draggedRow, setDraggedRow] = useState<SidebarItem | null>(null);
  const [rowDrop, setRowDrop] = useState<{ item: SidebarItem; place: 'before' | 'after' } | null>(null);
  const [orderedDomains, setOrderedDomains] = useState<Domain[]>(domains);
  // Synced while rendering rather than in an effect: the mirror and the list
  // it mirrors then reach the screen in the same commit, instead of the list
  // painting once with the old order and again with the new one.
  const [syncedDomains, setSyncedDomains] = useState<Domain[]>(domains);
  if (syncedDomains !== domains) {
    setSyncedDomains(domains);
    setOrderedDomains(domains);
  }
  const [activeDomainId, setActiveDomainIdState] = useState<string>(
    () => getActiveDomainId() ?? domains[0]?.id ?? ''
  );
  // Each Domain has its own expanded state — opening one no longer collapses the others.
  const [expandedDomainIds, setExpandedDomainIds] = useState<Set<string>>(
    () => new Set(activeDomainId ? [activeDomainId] : [])
  );
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPos, setCreateMenuPos] = useState({ top: 0, left: 0 });
  const [settingsDomain, setSettingsDomain] = useState<Domain | null>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const railMode = railModeOf(activeView);
  // The rail's place: the open screen's, else the last one shown.
  const viewSection = railSectionOf(activeView);
  const [lastSection, setLastSection] = useState<RailSection>(viewSection ?? 'assistant');
  if (viewSection && viewSection !== lastSection) setLastSection(viewSection);
  const section = viewSection ?? lastSection;
  const [draggingDomain, setDraggingDomain] = useState<Domain | null>(null);
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_MIN_WIDTH;
    const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= SIDEBAR_MIN_WIDTH && saved <= SIDEBAR_MAX_WIDTH
      ? saved
      : SIDEBAR_MIN_WIDTH;
  });
  const [resizing, setResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    // The panel inside the main island (Inbox's list, the AI's chats)
    // takes the sidebar's width from this.
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  }, [width]);

  // The "+" at the top of the sidebar creates whatever the current mode is
  // about: a Notebook, a Table, a scheduled Element, or (in the Workspace)
  // a Strategy, Domain or Object from a small menu. Modes with nothing to
  // create show no "+".
  const calendarDay = useCalendarDay();
  // One row lights for the open screen: the one it was opened from. A
  // Strategy or an Object opened from Following lights there, and the rows
  // that reach the same screen (Strategy, the Domain's Objects) stay dark;
  // once that screen is left, the pick is forgotten.
  const [followPick, setFollowPick] = useState<{ kind: 'strategy' | 'object' | 'element'; id: string } | null>(null);
  const followPickOpen = !!followPick && (followPick.kind === 'strategy'
    ? activeView === 'strategy' && navigation.strategyId === followPick.id
    : activeView === 'objects' && navigation.objectId === followPick.id);
  if (followPick && !followPickOpen) setFollowPick(null);
  const treeView = followPickOpen ? '' : activeView;
  // Slides makes nothing until the Space's decks are loaded; the load would replace it.
  const slidesReady = useSlidesReady();
  // Team makes its units in its own list (owners only), so it has no "+".
  const createLabel = section === 'team' ? undefined
    : section === 'strategy' ? 'New Vision'
    : ({
      notebook: 'Add Notebook', tables: 'Add Table', slides: 'Create new',
      calendar: 'Add schedule', workspace: 'Create new',
    } as Partial<Record<RailMode, string>>)[railMode ?? 'workspace'];
  // The Vision the open Strategy screen is in: the open Portfolio's, else
  // the one navigated to.
  const { data: allStrategies } = useStrategies();
  const openVisionId = (activeView === 'strategy' && navigation.strategyId
    ? allStrategies.find((st) => st.id === navigation.strategyId)?.vision_id : undefined) ?? navigation.visionId ?? null;
  const openCreateMenu = () => {
    if (section === 'strategy') { openCreate('vision'); return; }
    if (railMode === 'tables') { openCreate('table'); return; }
    if (railMode === 'notebook') { openCreate('notebook'); return; }
    if (railMode === 'calendar') {
      window.dispatchEvent(new CustomEvent<CreateElementDetail>(CREATE_ELEMENT_EVENT, { detail: { dueDate: calendarDay } }));
      return;
    }
    const rect = createBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setCreateMenuPos({ top: rect.bottom + 4, left: rect.left });
    } else {
      setCreateMenuPos({ top: window.innerHeight - 250, left: 46 });
    }
    setCreateMenuOpen(true);
  };

  // The create menu answers the keyboard as a menu does: it opens with its
  // first item focused, the arrows move through it, Escape or Tab closes it
  // and focus goes back to the "+".
  const closeCreateMenu = () => { setCreateMenuOpen(false); createBtnRef.current?.focus(); };
  useEffect(() => {
    if (!createMenuOpen) return;
    createMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [createMenuOpen]);
  const onCreateMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeCreateMenu(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    setResizing(true);
    // Resize by writing the width straight to the DOM during the drag.
    // Driving it through React state re-rendered the whole sidebar tree
    // on every pointermove, which made the drag stutter — commit to state
    // just once on release (that re-sync also persists to localStorage).
    let next = startW;
    // Dragged well past its least width, the island takes the sidebar's
    // place: the sidebar closes, at the width it had.
    let closing = false;
    const onMove = (ev: PointerEvent) => {
      const raw = startW + (ev.clientX - startX);
      closing = !!onToggleSidebar && raw < SIDEBAR_MIN_WIDTH - SIDEBAR_CLOSE_PULL;
      next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, raw));
      const el = sidebarRef.current;
      if (el) {
        el.style.width = `${next}px`;
        el.style.opacity = closing ? '0.5' : '';
      }
      document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
    };
    const onUp = () => {
      setResizing(false);
      const el = sidebarRef.current;
      if (el) el.style.opacity = '';
      if (closing) {
        if (el) el.style.width = `${startW}px`;
        document.documentElement.style.setProperty('--sidebar-width', `${startW}px`);
        onToggleSidebar?.();
      }
      else setWidth(next);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const activeDomain = [...domains, ...guestDomains].find((d) => d.id === activeDomainId) ?? domains[0];

  // A Domain's own page asks for its settings from its "…".
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<{ domainId: string }>).detail?.domainId;
      const domain = [...domains, ...guestDomains].find((d) => d.id === id);
      if (domain) setSettingsDomain(domain);
    };
    window.addEventListener(OPEN_DOMAIN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_DOMAIN_SETTINGS_EVENT, open);
  }, [domains, guestDomains]);

  // Same reason as the order mirror above: the open dialog picks up the row
  // it is editing as it is rendered, not a frame later.
  if (settingsDomain) {
    const fresh = [...domains, ...guestDomains].find((d) => d.id === settingsDomain.id);
    if (fresh && fresh !== settingsDomain) setSettingsDomain(fresh);
  }

  // The handler is declared outside the effect so the state it sets belongs to
  // an event, which is what it is — a Domain chosen on another surface.
  const onActiveDomainChanged = useCallback((e: Event) => {
    const id = (e as CustomEvent<string>).detail;
    if (id) setActiveDomainIdState(id);
  }, []);
  useEffect(() => {
    window.addEventListener(ACTIVE_DOMAIN_CHANGE_EVENT, onActiveDomainChanged as EventListener);
    return () => window.removeEventListener(ACTIVE_DOMAIN_CHANGE_EVENT, onActiveDomainChanged as EventListener);
  }, [onActiveDomainChanged]);

  // First-time / signed-in-fresh users start on the Individual Domain
  // (it's sorted to the top of `domains` by useDomains).
  // First-time / signed-in-fresh users start on the Individual Domain (it is
  // sorted to the top of `domains` by useDomains). The choice is made while
  // rendering so the list never paints with nothing selected.
  if (!activeDomainId && domains[0]) {
    const first = domains[0].id;
    setActiveDomainIdState(first);
    setExpandedDomainIds((prev) => (prev.has(first) ? prev : new Set(prev).add(first)));
  }
  // The choice also has to reach the shared store, which every other surface
  // reads. It cannot ride the render above: React throws away a render that
  // sets state during it, and effects are only queued from the render that
  // commits — so an effect keyed on that transient value would never run at
  // all. Keyed on the settled Domain instead, and silent when the store
  // already agrees, which is the case whenever the user picked it themselves.
  useEffect(() => {
    if (activeDomainId && getActiveDomainId() !== activeDomainId) setActiveDomainId(activeDomainId);
  }, [activeDomainId]);

  // When the active Domain changes (e.g. via DomainsView or another tab),
  // expand it additively — never collapse the rows the user already opened.
  const [expandedFor, setExpandedFor] = useState(activeDomainId);
  if (activeDomainId && expandedFor !== activeDomainId) {
    setExpandedFor(activeDomainId);
    setExpandedDomainIds((prev) => (prev.has(activeDomainId) ? prev : new Set(prev).add(activeDomainId)));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string } | undefined;
    if (data?.type === 'domain') {
      setDraggingDomain(orderedDomains.find((d) => d.id === event.active.id) ?? null);
      return;
    }
  };
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    // ── Domain reorder branch ──
    if ((active.data.current as { type?: string } | undefined)?.type === 'domain') {
      setDraggingDomain(null);
      if (over && active.id !== over.id) {
        const oldIndex = orderedDomains.findIndex((d) => d.id === active.id);
        const newIndex = orderedDomains.findIndex((d) => d.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(orderedDomains, oldIndex, newIndex);
          setOrderedDomains(reordered); // optimistic — instant, no flicker
          try {
            await reorderDomains(reordered.map((d, i) => ({ id: d.id, order_index: i })));
            void refetchDomains();
          } catch (err) {
            console.error('Failed to reorder domains:', err);
            void refetchDomains(); // roll back to server order on failure
          }
        }
      }
      return;
    }

  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingDomain(null)}
    >
      <div
        ref={sidebarRef}
        style={{
          width,
          transform: collapsed && !overlay ? 'translateX(-100%)' : 'translateX(0)',
        }}
        className={`app-sidebar island-sidebar flex flex-col flex-shrink-0 overflow-hidden ${
          collapsed
            ? 'absolute inset-y-0 left-0 z-50 h-full bg-white dark:bg-card shadow-xl'
            : 'relative'
        } ${resizing ? '' : 'transition-transform duration-200 ease-out'}`}
      >
        {/* Header — fixed; only the navigation under it scrolls. The same
            height as the main island's header (50px), so the Space name and
            the island's title sit on one line. */}
        <ButtonAppearanceProvider appearance="navigation">
        <div className="flex h-12 shrink-0 items-center pl-1 pr-2">
          {activeView === 'settings' ? (
            <Button variant="ghost" size="sm" align="start" onClick={onCloseSettings} className="text-muted-foreground">
              <ArrowLeft size={14} />{t('Back')}
            </Button>
          ) : (
            <div className="flex w-full items-center gap-1">
            <div className="min-w-0 flex-1">
              <SpaceSwitcher onSettings={onOpenSettings} />
            </div>
            {onSearch && (
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                onClick={onSearch}
                title={t('Discover Domains and Objects')}
                aria-label={t('Discover')}
                className="text-muted-foreground hover:text-foreground"
              >
                <Compass size={14} />
              </Button>
            )}
            {createLabel && (
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground"
                ref={createBtnRef}
                type="button"
                aria-haspopup={section === 'strategy' || railMode === 'tables' || railMode === 'notebook' || railMode === 'calendar' ? undefined : 'menu'}
                aria-expanded={createMenuOpen || undefined}
                onClick={openCreateMenu}
                title={t(createLabel)}
                aria-label={t(createLabel)}
              >
                <Plus size={15} />
              </Button>
            )}
          </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 pt-0.5">

          {activeView === 'settings' ? (
            <SettingsSidebarPanel />
          ) : (
          <>
          {section === 'assistant' && <>
          {/* Athena's place: the person's own rows, in their order (drag a
              row to move it). */}
          <div className="mt-3 space-y-0.5">
            {sidebarOrder.map((item) => {
              const row = (() => {
                switch (item) {
                  case 'inbox':
                    return <SidebarRow active={activeView === 'inbox'} icon={<NavInboxIcon size={16} />} label={t('Inbox')}
                      meta={unreadCount > 0 ? unreadCount : undefined}
                      onClick={() => onViewChange('inbox')} />;
                  case 'my-elements':
                    return <SidebarRow active={activeView === 'my-elements'} icon={<NavMyTasksIcon size={16} />} label={t('My Elements')}
                      onClick={() => onViewChange('my-elements')} />;
                  case 'calendar':
                    return <SidebarRow active={activeView === 'calendar' || activeView === 'schedule'} icon={<NavCalendarIcon size={16} />} label={t('Calendar')}
                      onClick={() => onViewChange('calendar')} />;
                }
              })();
              const over = rowDrop?.item === item && draggedRow !== null && draggedRow !== item ? rowDrop.place : null;
              return (
                <div key={item} draggable className="relative"
                  // Alt+↑ / Alt+↓ moves the focused row, the keyboard's drag.
                  onKeyDown={(e) => {
                    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                    const at = sidebarOrder.indexOf(item);
                    const target = sidebarOrder[e.key === 'ArrowUp' ? at - 1 : at + 1];
                    if (!target) return;
                    e.preventDefault();
                    const next = moveSidebarItem(sidebarOrder, item, target, e.key === 'ArrowUp' ? 'before' : 'after');
                    setSidebarOrder(next);
                    saveSidebarOrder(next);
                  }}
                  onDragStart={(e) => { setDraggedRow(item); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item); }}
                  onDragEnd={() => { setDraggedRow(null); setRowDrop(null); }}
                  onDragOver={(e) => {
                    if (!draggedRow) return;
                    e.preventDefault();
                    const box = e.currentTarget.getBoundingClientRect();
                    const place = e.clientY < box.top + box.height / 2 ? 'before' : 'after';
                    if (rowDrop?.item !== item || rowDrop.place !== place) setRowDrop({ item, place });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedRow && rowDrop) {
                      const next = moveSidebarItem(sidebarOrder, draggedRow, rowDrop.item, rowDrop.place);
                      setSidebarOrder(next);
                      saveSidebarOrder(next);
                    }
                    setDraggedRow(null); setRowDrop(null);
                  }}>
                  {over && <div aria-hidden className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary ${over === 'before' ? '-top-px' : '-bottom-px'}`} />}
                  {row}
                </div>
              );
            })}
          </div>

          </>}

          {section === 'team' && (
            <TeamList navigation={activeView === 'team' || activeView === 'workload' ? navigation : undefined}
              onOpen={(nav) => { onNavigate(nav); onViewChange('team'); }} />
          )}

          {section === 'strategy' && <>
          <div className="mt-5" />
          <VisionList activeView={treeView} visionId={openVisionId}
            onOpenVision={(id) => { onNavigate({ visionId: id, strategyId: null }); onViewChange('vision'); }}
            onOpenPortfolios={(id) => { onNavigate({ visionId: id, strategyId: null }); onViewChange('strategy'); }}
            onCreate={() => openCreate('vision')} />
          </>}

          {section === 'execution' && <>
          <div className="mt-5" />
          {/* Execution: what this person starred, then the Domains. */}
          <FollowSection kinds={['vision', 'strategy', 'domain', 'object', 'element']}
            activeId={followPickOpen ? followPick!.id : null} onOpen={(f) => {
            // A Vision and a Domain have their own rows below; those light.
            if (f.kind === 'vision') { onNavigate({ visionId: f.id, strategyId: null }); onViewChange('vision'); return; }
            if (f.kind === 'domain') {
              setActiveDomainId(f.id); onNavigate({ objectId: null, landOnTab: 'overview' }); onViewChange('domain-overview'); return;
            }
            if (f.kind !== 'element') setFollowPick({ kind: f.kind, id: f.id });
            if (f.kind === 'strategy') {
              onNavigate({ strategyId: f.id, visionId: allStrategies.find((st) => st.id === f.id)?.vision_id ?? null });
              onViewChange('strategy'); return;
            }
            if (f.domainId) setActiveDomainId(f.domainId);
            if (f.kind === 'element') requestElementDetail(f.id); else requestObjectPage();
            const nav = { objectId: f.objectId, objectDomainId: f.domainId ?? undefined };
            if (onOpenItem) onOpenItem('objects', nav);
            else { onNavigate(nav); onViewChange('objects'); }
          }} />
          <SidebarFold id="execution-domains" label={t('Your Execution')}>

          {/* All domains — the name opens the overview; the chevron expands the tree.
              Opening one does NOT collapse the others (multiple expanded at a time).
              The fixed "Individual Domain" is sorted to the top by useDomains and gets a
              fixed person icon + "Individual Domain" label so it reads as locked / non-editable. */}
          <SortableContext items={orderedDomains.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              {orderedDomains.map((d) => (
                <SortableDomainRow
                  key={d.id}
                  domain={d}
                  isActive={d.id === activeDomain?.id}
                  expanded={expandedDomainIds.has(d.id)}
                  activeView={treeView}
                  onOpen={() => {
                    setActiveDomainId(d.id);
                    onNavigate({ objectId: null, landOnTab: 'overview' });
                    onViewChange('domain-overview');
                  }}
                  onToggle={() => setExpandedDomainIds(prev => {
                    const next = new Set(prev);
                    if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                    return next;
                  })}
                  onOpenSettings={() => setSettingsDomain(d)}
                  onSelectExecItem={(viewId) => {
                    if (d.id !== activeDomain?.id) setActiveDomainId(d.id);
                    onNavigate({ objectId: null, ...(viewId === 'objects' ? { landOnTab: 'elements' as const } : {}) });
                    onViewChange(viewId);
                  }}
                />
              ))}
            </SortableContext>

          {/* Guest Domains — ones you were invited to individually (a domain
              member but NOT a member of their ActivitySpace). Listed inline with
              the active Space's Domains; a Domain invite never exposes the rest
              of a Space. */}
          {guestDomains.map(d => <DomainNavigationRow key={d.id} name={d.name} mark={<DomainMark domain={d} size={16} />}
            active={d.id === activeDomain?.id} expanded={expandedDomainIds.has(d.id)} activeView={treeView}
            onOpen={() => { setActiveDomainId(d.id); onNavigate({ objectId: null, landOnTab: 'overview' }); onViewChange('domain-overview'); }}
            onToggle={() => setExpandedDomainIds(prev => {
              const next = new Set(prev);
              if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
              return next;
            })}
            onSelect={view => { setActiveDomainId(d.id); onNavigate({ objectId: null, ...(view === 'objects' ? { landOnTab: 'elements' as const } : {}) }); onViewChange(view); }}
            onSettings={() => setSettingsDomain(d)}
          />)}
          </SidebarFold>
          </>}

          </>
          )}
        </nav></ButtonAppearanceProvider>



        {!collapsed && (
          <div
            onPointerDown={startResize}
            className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-border/40 active:bg-border/60"
            title={t('Drag to resize')}
          />
        )}
      </div>

      {/* Create menu popup — context-aware. Note mode lists File / Folder
          (driven through useNotes here); everything else keeps
          the original Domain / Object / Note menu. */}
      {createMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setCreateMenuOpen(false)} />
          <div
            ref={createMenuRef}
            role="menu"
            aria-label={t(createLabel ?? 'Create new')}
            onKeyDown={onCreateMenuKey}
            className="gloss-overlay fixed z-50 w-60 overflow-hidden rounded-[10px] p-1 text-popover-foreground"
            style={{ top: createMenuPos.top, left: createMenuPos.left }}
          >
            {railMode === 'slides' ? (
              <>
                {/* Slides: a deck in the open deck's folder, a folder, or a deck from a file. */}
                <CreateMenuItem
                  icon={<FilePlus size={16} />}
                  label={t('New deck')}
                  desc={t('In the open deck’s folder, or the first one')}
                  disabled={!slidesReady}
                  onClick={() => { setCreateMenuOpen(false); createDeckHere(); onViewChange('slides'); }}
                />
                <CreateMenuItem
                  icon={<FolderPlus size={16} />}
                  label={t('New folder')}
                  desc={t('A place to keep decks together')}
                  disabled={!slidesReady}
                  onClick={() => { setCreateMenuOpen(false); createFolderHere(); }}
                />
                <CreateMenuItem
                  icon={<FileUp size={16} />}
                  label={t('Open a deck file')}
                  desc={t('A .kata.json file, as a new deck')}
                  disabled={!slidesReady}
                  onClick={() => { setCreateMenuOpen(false); pickDeckFile(); onViewChange('slides'); }}
                />
              </>
            ) : (
              <>
                {/* A Strategy at the top; the page opens its create card once
                    mounted. */}
                <CreateMenuItem
                  icon={<NavStrategyIcon size={16} />}
                  label={t('Strategy')}
                  desc={t('What this Space aims for, and how it wins')}
                  onClick={() => { setCreateMenuOpen(false); onNavigate({ strategyId: null, strategyCreate: true }); onViewChange('strategy'); }}
                />
                <div className="my-1 h-px bg-border" />
                <CreateMenuItem
                  icon={<DomainIcon size={16} />}
                  label={t('Domain')}
                  desc={t('Top-level container')}
                  onClick={() => { setCreateMenuOpen(false); onCreateNew?.('domain'); }}
                />
                <CreateMenuItem
                  icon={<ObjectIcon size={14} />}
                  label={t('Object')}
                  desc={t('Mid-level structural unit')}
                  onClick={() => { setCreateMenuOpen(false); onCreateNew?.('object'); }}
                />
              </>
            )}
          </div>
        </>
      )}

      {settingsDomain && (
        <DomainSettingsModal
          domain={settingsDomain}
          onClose={() => setSettingsDomain(null)}
          onUpdated={(domain) => {
            setSettingsDomain(domain);
            void refetchDomains();
          }}
          onDeleted={() => {
            setSettingsDomain(null);
            void refetchDomains();
          }}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {draggingDomain && (
          <div className="flex items-center gap-2.5 h-8 px-2.5 bg-sidebar-accent rounded-md shadow-xl shadow-black/30 scale-[1.03] cursor-grabbing">
            <DomainMark domain={draggingDomain} size={16} />
            <span className="text-[12px] font-semibold text-foreground">{draggingDomain.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// A draggable Domain row in the Workspace's Domains section. Whole row is the drag
// handle (PointerSensor's 4px activation distance keeps a plain click as a
// click). Reordering is persisted on drag end by the parent's handleDragEnd.
function SortableDomainRow({
  domain: d,
  isActive,
  expanded,
  activeView,
  onOpen,
  onToggle,
  onOpenSettings,
  onSelectExecItem,
}: {
  domain: Domain;
  isActive: boolean;
  expanded: boolean;
  activeView: string;
  onOpen: () => void;
  onToggle: () => void;
  onOpenSettings: () => void;
  onSelectExecItem: (viewId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: d.id,
    data: { type: 'domain' },
    // Snappier-but-smooth slide as neighbours shift out of the way.
    transition: { duration: 180, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // The lifted copy lives in the DragOverlay; collapse the source to a clean
    // gap so neighbours have a clear slot to slide into.
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/domain relative"
    >
      <DomainNavigationRow name={d.name} mark={<DomainMark domain={d} size={16} />}
        active={isActive} expanded={expanded} activeView={activeView}
        onOpen={onOpen} onToggle={onToggle} onSelect={onSelectExecItem} onSettings={onOpenSettings}
        dragProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function DomainSettingsModal({
  domain,
  onClose,
  onUpdated,
  onDeleted,
}: {
  domain: Domain;
  onClose: () => void;
  onUpdated: (domain: Domain) => void;
  /** The Domain is gone for this viewer — deleted, or they left it. */
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'general' | 'members' | 'agent'>('general');
  // The viewer's own seat, read once for every tab. It answers the same
  // question RLS answers on write: owner/admin may change the Domain, only
  // an owner may delete it, and anyone else is a guest who can only leave.
  const role = useDomainRole(domain.id).data ?? null;
  const canEdit = role === 'owner' || role === 'admin';

  return (
    <SettingsModal
      mark={<DomainMark domain={domain} size={24} />}
      title={domain.name}
      subtitle={t('Domain settings')}
      onClose={onClose}
      sections={[
        { id: 'general', icon: <Settings size={15} />, title: t('General'), description: t(canEdit ? 'Name and privacy' : 'Name and membership') },
        { id: 'members', icon: <Users size={15} />, title: t('Members'), description: t('Manage team members') },
        { id: 'agent', icon: <Bot size={15} />, title: t('AI agent'), description: t('Execution settings') },
      ]}
      active={tab}
      onSelect={(id) => setTab(id as 'general' | 'members' | 'agent')}
    >
      {tab === 'general' ? (
        <DomainGeneralSettings domain={domain} role={role} onUpdated={onUpdated} onDeleted={onDeleted} />
      ) : tab === 'agent' ? (
        <DomainAgentSettings key={domain.id} domain={domain} canEdit={canEdit} />
      ) : (
        <TeamSettings domainId={domain.id} />
      )}
    </SettingsModal>
  );
}

function DomainGeneralSettings({
  domain,
  role,
  onUpdated,
  onDeleted,
}: {
  domain: Domain;
  role: DomainRole | null;
  onUpdated: (domain: Domain) => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const isOwner = role === 'owner';
  const canEdit = isOwner || role === 'admin';
  const [name, setName] = useState(domain.name);
  const [identifier, setIdentifier] = useState(domain.identifier ?? '');
  const [privacy, setPrivacy] = useState<DomainPrivacy>(domain.privacy ?? 'workspace');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyed on domain.id, not the domain object itself: onUpdated hands a new
  // `domain` object back down as this same prop after every save, and
  // resyncing on object identity would discard edits still in the fields.
  const [seededFor, setSeededFor] = useState(domain.id);
  if (seededFor !== domain.id) {
    setSeededFor(domain.id);
    setName(domain.name);
    setIdentifier(domain.identifier ?? '');
    setPrivacy(domain.privacy ?? 'workspace');
  }

  const canSave =
    name.trim() !== domain.name ||
    identifier.trim() !== (domain.identifier ?? '') ||
    privacy !== (domain.privacy ?? 'workspace');

  // Delete is offered to owners only, Leave to everyone else with a seat —
  // the same gates RLS applies, so nobody sees a button the database would
  // refuse.
  const [confirming, setConfirming] = useState<'delete' | 'leave' | null>(null);
  const [busy, setBusy] = useState(false);

  // A Domain that still has Objects (archived ones included) cannot be
  // deleted; say how many before asking to confirm. The database refuses it
  // too (domains_delete_guard), with the same message from deleteDomain.
  const askDelete = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const remaining = await countDomainObjects(domain.id);
      if (remaining > 0) setError(domainHasObjectsMessage(remaining));
      else setConfirming('delete');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('The Domain could not be deleted. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const runConfirmed = async () => {
    if (busy || !confirming) return;
    setBusy(true);
    setError(null);
    try {
      if (confirming === 'delete') await deleteDomain(domain.id);
      else await leaveDomain(domain.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : t(confirming === 'delete' ? 'The Domain could not be deleted. Try again.' : 'Could not leave the Domain. Try again.'));
      setBusy(false);
      setConfirming(null);
    }
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateDomain(domain.id, {
        name: name.trim() || domain.name,
        identifier: identifier.trim() || null,
        privacy,
      });
      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not update the Domain. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-5">
        <h3 className={`${FONT.lg} text-foreground`}>{t('General')}</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t(canEdit
            ? 'Configure this Domain’s name, identifier, and access mode.'
            : 'You were invited to this Domain. Only its owner or admin can change these settings.')}
        </p>
      </div>

      <fieldset disabled={!canEdit} className="space-y-5">
        <SettingField flush label={t('Name')} htmlFor="domain-settings-name">
          <Input id="domain-settings-name" value={name} onChange={(e) => setName(e.target.value)} />
        </SettingField>

        <SettingField flush label={t('Identifier')} htmlFor="domain-settings-identifier">
          <Input id="domain-settings-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t('e.g. MKT')} />
        </SettingField>

        <SettingField flush label={t('Privacy')}>
          <SegmentedControl
            label={t('Privacy')}
            value={privacy === 'workspace' ? 'Workspace' : 'Private'}
            options={['Workspace', 'Private']}
            onChange={(label) => setPrivacy(label === 'Workspace' ? 'workspace' : 'private')}
          />
        </SettingField>

        {error && (
          <p role="alert" className="text-[12px] text-[var(--status-danger)]">{error}</p>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
              {t(saving ? 'Saving…' : 'Save changes')}
            </Button>
          </div>
        )}
      </fieldset>

      {/* Outside the fieldset: a guest's one available action must stay enabled. */}
      {isOwner ? (
        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-foreground">{t('Delete Domain')}</div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {t('Permanently delete this Domain for every member. Move or delete its Objects first.')}
            </p>
          </div>
          <Button variant="danger" className="shrink-0" onClick={() => { void askDelete(); }} disabled={busy}>
            {t('Delete')}
          </Button>
        </div>
      ) : role ? (
        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-foreground">{t('Leave Domain')}</div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {t('Remove yourself. The Domain and your past work stay as they are.')}
            </p>
          </div>
          <Button variant="danger" className="shrink-0" onClick={() => setConfirming('leave')} disabled={busy}>
            {t('Leave Domain')}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming === 'delete'}
        title={t('Delete “{name}”?', { name: domain.name })}
        description={t('Its members, Phases, and templates are deleted. Tables stay but are no longer in any Domain. This can’t be undone.')}
        busy={busy}
        onConfirm={() => { void runConfirmed(); }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === 'leave'}
        title={t('Leave “{name}”?', { name: domain.name })}
        description={t('You lose access to this Domain until someone invites you again.')}
        confirmLabel={t('Leave Domain')}
        busy={busy}
        onConfirm={() => { void runConfirmed(); }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}


function CreateMenuItem({ icon, label, desc, onClick, disabled = false }: {
  icon: React.ReactNode; label: string; desc: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="group/citem flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-strong)] focus-visible:bg-[var(--surface-strong)] disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-muted-foreground transition-colors group-hover/citem:text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
