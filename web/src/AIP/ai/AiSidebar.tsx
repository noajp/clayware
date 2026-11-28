'use client';

import { useState, type DragEvent } from 'react';
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  SquarePen,
  Trash2,
} from '@/ui/icons';
import { Button } from '@/ui/button';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { appDialog } from '@/Function/shared/appDialogStore';
import { SidebarRow } from '@/Function/shared/SidebarRow';
import { Panel, PanelBody, PanelGroup, PanelHeader, PanelSearch, usePinned } from '@/Function/shared/PanelLayout';
import { useCopilotConversation } from '@/AIP/ai/CopilotProvider';
import type { AiSessionSummary } from '@/hooks/useAiConversations';
import { RenameInput } from '@/Function/shared/RenameInput';
import { formatAge } from '@/Function/shared/dateUtils';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from '@/ui/context-menu';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/ui/dropdown-menu';

const PINNED = 'pinned';
const FOLDERS = 'folders';
const RECENT = 'recent';
const DRAG_SESSION_TYPE = 'application/x-clayware-ai-session';

/**
 * The AI screen's 2-layer conversation library:
 * - Layer 1: Folders (collapsible containers with folder icon, quiet count,
 *   direct "+" to start a chat inside, and drop target for filing chats).
 * - Layer 2: Conversations (files), nested along a crisp tree rail under their
 *   folder or listed under Pinned / Recent, draggable between folders and Recent.
 */
export function AiSidebar({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const { library, sessionId, draftFolderId, openSession, newConversation } = useCopilotConversation();
  const { folders, sessions } = library;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const pins = usePinned('ai');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Radix hands focus back to the trigger as the menu closes; renaming after
  // that lets the field keep it.
  const startRename = (id: string) => { window.setTimeout(() => setRenaming(id), 0); };

  const startChat = (folderId: string | null = null) => {
    if (folderId) {
      setClosed((prev) => {
        if (!prev.has(folderId)) return prev;
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
    }
    newConversation(folderId);
    onOpen();
  };
  const open = (id: string) => { void openSession(id); onOpen(); };
  const addFolder = async () => {
    setClosed((prev) => {
      if (!prev.has(FOLDERS)) return prev;
      const next = new Set(prev);
      next.delete(FOLDERS);
      return next;
    });
    const id = await library.createFolder(t('New folder'));
    if (id) startRename(id);
  };
  const toggle = (id: string) => setClosed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const deleteFolder = async (id: string, name: string, count: number) => {
    const message = count === 0
      ? t('Delete the folder "{name}"? This cannot be undone.', { name })
      : t('Delete the folder "{name}" and its {count} conversations? This cannot be undone.', { name, count });
    if (!(await appDialog.confirm(message))) return;
    if (sessions.some((s) => s.folder_id === id && s.id === sessionId) || draftFolderId === id) newConversation();
    void library.deleteFolder(id);
  };
  const deleteSession = async (session: AiSessionSummary) => {
    const name = session.title || t('Untitled');
    if (!(await appDialog.confirm(t('Delete the conversation "{name}"? This cannot be undone.', { name })))) return;
    if (session.id === sessionId) newConversation();
    void library.deleteSession(session.id);
  };

  const handleDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData(DRAG_SESSION_TYPE, id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedSessionId(id);
  };
  const handleDragEnd = () => {
    setDraggedSessionId(null);
    setDropTarget(null);
  };
  const handleDragOverTarget = (e: DragEvent, targetKey: string) => {
    if (!draggedSessionId && !e.dataTransfer.types.includes(DRAG_SESSION_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== targetKey) setDropTarget(targetKey);
  };
  const handleDropOnTarget = (e: DragEvent, folderId: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_SESSION_TYPE) || draggedSessionId;
    setDraggedSessionId(null);
    setDropTarget(null);
    if (!id) return;
    const current = sessions.find((s) => s.id === id);
    if (!current || current.folder_id === folderId) return;
    if (folderId) {
      setClosed((prev) => {
        if (!prev.has(folderId)) return prev;
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
    }
    void library.moveSession(id, folderId);
  };

  const renameInput = (name: string, commit: (v: string) => void) => (
    <RenameInput
      initial={name}
      onCommit={(v) => { if (v && v !== name) commit(v); setRenaming(null); }}
      onCancel={() => setRenaming(null)}
      className="min-w-0 flex-1 bg-transparent text-foreground"
    />
  );

  const sessionRow = (session: AiSessionSummary, nested: boolean) => {
    const isActive = session.id === sessionId;
    const isDragging = draggedSessionId === session.id;
    const isRenaming = renaming === session.id;
    const age = session.updated_at ? formatAge(new Date(session.updated_at), true) : null;
    const title = session.title || t('Untitled');
    return (
      <ContextMenu key={session.id}>
        <ContextMenuTrigger asChild>
          <SidebarRow
            active={isActive}
            size={nested ? 'sm' : 'md'}
            draggable={!isRenaming}
            onDragStart={(e) => handleDragStart(e, session.id)}
            onDragEnd={handleDragEnd}
            className={isDragging ? 'opacity-45' : undefined}
            actions={
              <div className="relative flex items-center">
                {age && (
                  <span className="pr-1 text-[11px] tabular-nums text-muted-foreground/55 transition-opacity group-hover/srow:opacity-0 group-focus-within/srow:opacity-0 group-has-[[data-state=open]]/srow:opacity-0">
                    {age}
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t('More options')}
                      className="absolute right-0 flex size-5 items-center justify-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity hover:bg-[var(--surface-strong)] hover:text-foreground group-hover/srow:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <DropdownMenuItem onSelect={() => pins.toggle(session.id)}><Pin /> {t(pins.isPinned(session.id) ? 'Unpin' : 'Pin')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => startRename(session.id)}><Pencil /> {t('Rename')}</DropdownMenuItem>
                    {folders.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger><FolderInput /> {t('Move to')}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-[160px]">
                          {folders.filter((f) => f.id !== session.folder_id).map((f) => (
                            <DropdownMenuItem key={f.id} onSelect={() => void library.moveSession(session.id, f.id)}><FolderIcon /> {f.name}</DropdownMenuItem>
                          ))}
                          {session.folder_id && (
                            <DropdownMenuItem onSelect={() => void library.moveSession(session.id, null)}>{t('No folder')}</DropdownMenuItem>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void deleteSession(session)}><Trash2 /> {t('Delete conversation')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          >
            {isRenaming ? (
              <>
                <MessageSquare size={13} className="shrink-0 text-muted-foreground/70" />
                {renameInput(title, (v) => void library.renameSession(session.id, v))}
              </>
            ) : (
              <button
                type="button"
                onClick={() => open(session.id)}
                onDoubleClick={() => startRename(session.id)}
                title={title}
                aria-current={isActive ? 'page' : undefined}
                className="flex h-full min-w-0 flex-1 items-center gap-2 text-left outline-none"
              >
                <MessageSquare
                  size={13}
                  className={`shrink-0 transition-colors ${isActive ? 'text-[var(--accent-text)]' : 'text-muted-foreground/70 group-hover/srow:text-foreground/80'}`}
                />
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </button>
            )}
          </SidebarRow>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem onSelect={() => pins.toggle(session.id)}><Pin /> {t(pins.isPinned(session.id) ? 'Unpin' : 'Pin')}</ContextMenuItem>
          <ContextMenuItem onSelect={() => startRename(session.id)}><Pencil /> {t('Rename')}</ContextMenuItem>
          {folders.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger><FolderInput /> {t('Move to')}</ContextMenuSubTrigger>
              <ContextMenuSubContent className="min-w-[160px]">
                {folders.filter((f) => f.id !== session.folder_id).map((f) => (
                  <ContextMenuItem key={f.id} onSelect={() => void library.moveSession(session.id, f.id)}><FolderIcon /> {f.name}</ContextMenuItem>
                ))}
                {session.folder_id && (
                  <ContextMenuItem onSelect={() => void library.moveSession(session.id, null)}>{t('No folder')}</ContextMenuItem>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => void deleteSession(session)}><Trash2 /> {t('Delete conversation')}</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // Search narrows every list below to the conversations whose title has it.
  const q = query.trim().toLowerCase();
  const shown = q ? sessions.filter((s) => (s.title || '').toLowerCase().includes(q)) : sessions;
  const pinnedSessions = pins.pinned.map((id) => shown.find((s) => s.id === id)).filter((s): s is AiSessionSummary => !!s);
  // The rest by time, newest first: the conversations in no folder.
  const recent = shown.filter((s) => !s.folder_id && !pins.isPinned(s.id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const groupIds = [...folders.map((f) => f.id), RECENT];
  const onFreshRootChat = sessionId === null && draftFolderId === null;
  const foldersSectionOpen = q ? true : !closed.has(FOLDERS);

  return (
    <Panel label={t('Athenya')}>
      <PanelHeader
        title={t('Athenya')}
        actions={
          <>
            <Button
              variant={searching ? 'secondary' : 'ghost'}
              size="icon-xs"
              aria-pressed={searching}
              onClick={() => { setSearching((v) => !v); setQuery(''); }}
              title={t('Search')}
              aria-label={t('Search')}
            >
              <Search size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void addFolder()}
              title={t('New folder')}
              aria-label={t('New folder')}
            >
              <FolderPlus size={13} />
            </Button>
          </>
        }
      />
      <PanelBody>
        <div className="mb-2 px-0.5">
          <button
            type="button"
            onClick={() => startChat()}
            className={`flex h-8 w-full items-center gap-2 rounded-[7px] border px-2.5 text-[13px] font-medium transition-colors ${
              onFreshRootChat
                ? 'border-[var(--border-default)] bg-sidebar-accent text-foreground'
                : 'border-[var(--border-subtle)] bg-[var(--surface-well)] text-foreground/85 hover:border-[var(--border-default)] hover:bg-sidebar-accent/70 hover:text-foreground'
            }`}
          >
            <SquarePen size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{t('New conversation')}</span>
          </button>
        </div>

        {searching && (
          <div className="mb-2 px-0.5">
            <PanelSearch value={query} onChange={setQuery} placeholder={t('Search conversations')} />
          </div>
        )}

        {/* Pinned exists once something is pinned: an empty group is a heading about nothing. */}
        {pinnedSessions.length > 0 && (
          <PanelGroup
            title={t('Pinned')}
            open={!closed.has(PINNED)}
            onToggle={() => toggle(PINNED)}
            menu={[
              { label: t('New folder'), onSelect: () => void addFolder() },
              { label: t('Collapse others'), onSelect: () => setClosed(new Set(groupIds)) },
            ]}
          >
            {pinnedSessions.map((s) => sessionRow(s, false))}
          </PanelGroup>
        )}

        {/* Layer 1 + Layer 2: Folders with nested conversation trees */}
        {folders.length > 0 && (
          <div className="mt-3">
            <div className="group/fsec flex h-7 items-center gap-1 pl-2 pr-1">
              <button
                type="button"
                onClick={() => toggle(FOLDERS)}
                aria-expanded={foldersSectionOpen}
                className="flex min-w-0 items-center gap-1 rounded-md text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="truncate">{t('Folders')}</span>
                <ChevronRight size={11} className={`shrink-0 transition-transform ${foldersSectionOpen ? 'rotate-90' : ''}`} />
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => void addFolder()}
                title={t('New folder')}
                aria-label={t('New folder')}
                className="flex size-5 items-center justify-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity hover:bg-[var(--surface-strong)] hover:text-foreground group-hover/fsec:opacity-100 focus-visible:opacity-100"
              >
                <Plus size={12} />
              </button>
            </div>

            {foldersSectionOpen && (
              <div className="flex flex-col gap-0.5">
                {folders.map((folder) => {
                  const inside = shown.filter((s) => s.folder_id === folder.id && !pins.isPinned(s.id));
                  const hasDraft = sessionId === null && draftFolderId === folder.id;
                  const containsActive = hasDraft || inside.some((s) => s.id === sessionId);
                  const isOpen = q ? true : !closed.has(folder.id);
                  const isDropOver = dropTarget === folder.id;
                  return (
                    <div
                      key={folder.id}
                      onDragOver={(e) => handleDragOverTarget(e, folder.id)}
                      onDragLeave={() => { if (dropTarget === folder.id) setDropTarget(null); }}
                      onDrop={(e) => handleDropOnTarget(e, folder.id)}
                      className={`rounded-[7px] transition-colors ${isDropOver ? 'bg-[var(--accent-subtle)]' : ''}`}
                    >
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <SidebarRow
                            size="md"
                            className={containsActive && !isOpen ? 'text-foreground' : undefined}
                            actions={
                              <div className="flex items-center gap-0.5">
                                {inside.length > 0 && (
                                  <span className="px-1 text-[11px] tabular-nums text-muted-foreground/60 transition-opacity group-hover/srow:hidden group-focus-within/srow:hidden group-has-[[data-state=open]]/srow:hidden">
                                    {inside.length}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); startChat(folder.id); }}
                                  title={t('New chat in folder')}
                                  aria-label={t('New chat in folder')}
                                  className="hidden size-5 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground group-hover/srow:flex group-focus-within/srow:flex group-has-[[data-state=open]]/srow:flex"
                                >
                                  <Plus size={12} />
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label={t('More options')}
                                      className="hidden size-5 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground group-hover/srow:flex group-focus-within/srow:flex data-[state=open]:flex"
                                    >
                                      <MoreHorizontal size={13} />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
                                    <DropdownMenuItem onSelect={() => startChat(folder.id)}><SquarePen /> {t('New chat')}</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => startRename(folder.id)}><Pencil /> {t('Rename')}</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onSelect={() => void deleteFolder(folder.id, folder.name, inside.length)}><Trash2 /> {t('Delete folder')}</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            }
                          >
                            {renaming === folder.id ? (
                              <>
                                <ChevronRight
                                  size={11}
                                  className={`shrink-0 text-muted-foreground/75 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                                />
                                <FolderIcon size={14} className="shrink-0 text-foreground/75" />
                                {renameInput(folder.name, (v) => void library.renameFolder(folder.id, v))}
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggle(folder.id)}
                                onDoubleClick={() => startRename(folder.id)}
                                aria-expanded={isOpen}
                                title={folder.name}
                                className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
                              >
                                <ChevronRight
                                  size={11}
                                  className={`shrink-0 text-muted-foreground/75 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                                />
                                <FolderIcon
                                  size={14}
                                  className={`shrink-0 transition-colors ${
                                    isDropOver || containsActive
                                      ? 'text-[var(--accent-text)]'
                                      : isOpen
                                        ? 'text-foreground/75'
                                        : 'text-muted-foreground/80'
                                  }`}
                                />
                                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                              </button>
                            )}
                          </SidebarRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
                          <ContextMenuItem onSelect={() => startChat(folder.id)}><SquarePen /> {t('New chat')}</ContextMenuItem>
                          <ContextMenuItem onSelect={() => startRename(folder.id)}><Pencil /> {t('Rename')}</ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem variant="destructive" onSelect={() => void deleteFolder(folder.id, folder.name, inside.length)}><Trash2 /> {t('Delete folder')}</ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>

                      {isOpen && (
                        <div className="ml-[13px] mt-0.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2">
                          {hasDraft && (
                            <SidebarRow
                              active
                              size="sm"
                              icon={<MessageSquare size={13} className="text-[var(--accent-text)]" />}
                              label={t('New conversation')}
                            />
                          )}
                          {inside.map((s) => sessionRow(s, true))}
                          {inside.length === 0 && !hasDraft && !q && (
                            <button
                              type="button"
                              onClick={() => startChat(folder.id)}
                              className="flex h-[28px] items-center gap-1.5 rounded-[6px] px-2 text-left text-[12px] text-muted-foreground/65 transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
                            >
                              <Plus size={12} className="shrink-0" />
                              <span className="truncate">{t('Start a chat…')}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Loose / Recent conversations — also a drop target to unfile from a folder */}
        {(recent.length > 0 || draggedSessionId !== null) && (
          <div
            onDragOver={(e) => handleDragOverTarget(e, RECENT)}
            onDragLeave={() => { if (dropTarget === RECENT) setDropTarget(null); }}
            onDrop={(e) => handleDropOnTarget(e, null)}
            className={`rounded-[7px] transition-colors ${dropTarget === RECENT ? 'bg-[var(--accent-subtle)]' : ''}`}
          >
            <PanelGroup title={t('Recent')} open={q ? true : !closed.has(RECENT)} onToggle={() => toggle(RECENT)}>
              {recent.map((s) => sessionRow(s, false))}
              {recent.length === 0 && draggedSessionId !== null && (
                <div className="px-2.5 py-2 text-[12px] text-muted-foreground/75">{t('Move to Recent')}</div>
              )}
            </PanelGroup>
          </div>
        )}

        {!q && folders.length === 0 && sessions.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-1.5 px-3 text-center">
            <p className="text-[12px] text-muted-foreground/75">{t('No conversations yet')}</p>
            <button
              type="button"
              onClick={() => void addFolder()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <FolderPlus size={12} />
              <span>{t('New folder')}</span>
            </button>
          </div>
        )}

        {q && shown.length === 0 && (
          <p className="px-2.5 py-6 text-center text-[12px] text-muted-foreground">{t('No results.')}</p>
        )}
        {library.error && <p role="alert" className="px-2.5 pt-2 text-[12px] text-[var(--status-danger)]">{library.error}</p>}
      </PanelBody>
    </Panel>
  );
}
