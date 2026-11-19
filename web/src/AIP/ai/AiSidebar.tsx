'use client';

import { useState } from 'react';
import { ChevronRight, Folder as FolderIcon, FolderInput, FolderPlus, MoreHorizontal, Pencil, Pin, Plus, Search, SquarePen, Trash2 } from '@/ui/icons';
import { Button } from '@/ui/button';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { appDialog } from '@/Function/shared/appDialogStore';
import { SidebarRow } from '@/Function/shared/SidebarRow';
import { Panel, PanelBody, PanelGroup, PanelHeader, PanelSearch, usePinned } from '@/Function/shared/PanelLayout';
import { useCopilotConversation } from '@/AIP/ai/CopilotProvider';
import type { AiSessionSummary } from '@/hooks/useAiConversations';
import { RenameInput } from '@/Function/shared/RenameInput';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from '@/ui/context-menu';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/ui/dropdown-menu';

const PINNED = 'pinned';
const RECENT = 'recent';

/**
 * The AI screen's list: its title, then New / Search / Folder; then the
 * conversations — pinned first, then each folder (a section), then the rest
 * by time, newest first. Picking one opens it on the AI screen; each row
 * carries its actions on a right-click (pin, rename, move, delete).
 */
export function AiSidebar({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const { library, sessionId, openSession, newConversation } = useCopilotConversation();
  const { folders, sessions } = library;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const pins = usePinned('ai');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  // Radix hands focus back to the trigger as the menu closes; renaming after
  // that lets the field keep it.
  const startRename = (id: string) => { window.setTimeout(() => setRenaming(id), 0); };

  const startChat = (folderId: string | null = null) => { newConversation(folderId); onOpen(); };
  const open = (id: string) => { void openSession(id); onOpen(); };
  const addFolder = async () => {
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
    if (sessions.some((s) => s.folder_id === id && s.id === sessionId)) newConversation();
    void library.deleteFolder(id);
  };
  const deleteSession = async (session: AiSessionSummary) => {
    const name = session.title || t('Untitled');
    if (!(await appDialog.confirm(t('Delete the conversation "{name}"? This cannot be undone.', { name })))) return;
    if (session.id === sessionId) newConversation();
    void library.deleteSession(session.id);
  };

  const nameOrInput = (id: string, name: string, commit: (v: string) => void, onClick: () => void) => renaming === id ? (
    <RenameInput
      initial={name}
      onCommit={(v) => { if (v && v !== name) commit(v); setRenaming(null); }}
      onCancel={() => setRenaming(null)}
      className="min-w-0 flex-1 bg-transparent text-foreground"
    />
  ) : (
    <button type="button" onClick={onClick} onDoubleClick={() => startRename(id)} title={name} className="h-full min-w-0 flex-1 truncate text-left outline-none">
      {name}
    </button>
  );

  const sessionRow = (session: AiSessionSummary, nested: boolean) => (
    <ContextMenu key={session.id}>
      <ContextMenuTrigger asChild>
        {/* No icon: every row here is a conversation, and a mark that is the
            same on all of them says nothing. The name starts the row; one
            inside a folder starts a step right of the folder's own name. */}
        <SidebarRow
          active={session.id === sessionId}
          size={nested ? 'sm' : 'md'}
          className={nested ? 'pl-11' : undefined}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t('More options')}
                  className="flex size-5 items-center justify-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity hover:bg-[var(--surface-strong)] hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
          }
        >
          {nameOrInput(session.id, session.title || t('Untitled'), (v) => void library.renameSession(session.id, v), () => open(session.id))}
        </SidebarRow>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <ContextMenuItem onSelect={() => pins.toggle(session.id)}><Pin /> {t(pins.isPinned(session.id) ? 'Unpin' : 'Pin')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => startRename(session.id)}><Pencil /> {t('Rename')}</ContextMenuItem>
        {(folders.length > 0) && (
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

  // Search narrows every list below to the conversations whose title has it.
  const q = query.trim().toLowerCase();
  const shown = q ? sessions.filter((s) => (s.title || '').toLowerCase().includes(q)) : sessions;
  const pinnedSessions = pins.pinned.map((id) => shown.find((s) => s.id === id)).filter((s): s is AiSessionSummary => !!s);
  // The rest by time, newest first: the conversations in no folder.
  const recent = shown.filter((s) => !s.folder_id && !pins.isPinned(s.id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const groupIds = [...folders.map((f) => f.id), RECENT];

  return (
    <Panel label={t('Agent')}>
      <PanelHeader
        title={t('Agent')}
        count={sessions.length || undefined}
        actions={
          <>
            <Button variant={searching ? 'secondary' : 'ghost'} size="icon-xs" aria-pressed={searching} onClick={() => { setSearching((v) => !v); setQuery(''); }} title={t('Search')} aria-label={t('Search')}>
              <Search size={13} />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => void addFolder()} title={t('New folder')} aria-label={t('New folder')}>
              <FolderPlus size={13} />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => startChat()} title={t('New chat')} aria-label={t('New chat')}>
              <SquarePen size={13} />
            </Button>
          </>
        }
      />
      <PanelBody>
      <div className="mb-2">
        <Button variant="secondary" size="sm" onClick={() => startChat()} className="w-full justify-start gap-2">
          <Plus size={14} />
          <span>{t('New conversation')}</span>
        </Button>
      </div>
      {searching && <div className="mb-1.5"><PanelSearch value={query} onChange={setQuery} placeholder={t('Search conversations')} /></div>}

      {/* Pinned exists once something is pinned: an empty group is a heading
          about nothing. Pinning itself is on every conversation's menu. */}
      {pinnedSessions.length > 0 && (
        <PanelGroup title={t('Pinned')} open={!closed.has(PINNED)} onToggle={() => toggle(PINNED)} menu={[
          { label: t('New section'), onSelect: () => void addFolder() },
          { label: t('Collapse others'), onSelect: () => setClosed(new Set(groupIds)) },
        ]}>
          {pinnedSessions.map((s) => sessionRow(s, false))}
        </PanelGroup>
      )}

      <div className="mt-3 flex flex-col">
        {folders.map((folder) => {
          const inside = shown.filter((s) => s.folder_id === folder.id && !pins.isPinned(s.id));
          const isOpen = q ? true : !closed.has(folder.id);
          return (
            <div key={folder.id}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <SidebarRow
                    icon={<ChevronRight size={13} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
                    meta={inside.length || undefined}
                    actions={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={t('More options')}
                            className="flex size-5 items-center justify-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity hover:bg-[var(--surface-strong)] hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
                    }>
                    {nameOrInput(folder.id, folder.name, (v) => void library.renameFolder(folder.id, v), () => toggle(folder.id))}
                  </SidebarRow>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <ContextMenuItem onSelect={() => startChat(folder.id)}><SquarePen /> {t('New chat')}</ContextMenuItem>
                  <ContextMenuItem onSelect={() => startRename(folder.id)}><Pencil /> {t('Rename')}</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onSelect={() => void deleteFolder(folder.id, folder.name, inside.length)}><Trash2 /> {t('Delete folder')}</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              {isOpen && inside.map((s) => sessionRow(s, true))}
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <PanelGroup title={t('Recent')} open={q ? true : !closed.has(RECENT)} onToggle={() => toggle(RECENT)}>
          {recent.map((s) => sessionRow(s, false))}
        </PanelGroup>
      )}
      {q && shown.length === 0 && (
        <p className="px-2.5 py-6 text-center text-[12px] text-muted-foreground">{t('No results.')}</p>
      )}
      {library.error && <p role="alert" className="px-2.5 pt-2 text-[12px] text-[var(--status-danger)]">{library.error}</p>}
      </PanelBody>
    </Panel>
  );
}
