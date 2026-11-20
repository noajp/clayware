'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from '@/ui/icons';
import { Button, ButtonAppearanceProvider } from '@/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/ui/context-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { NavNoteIcon } from '@/Frame/sidebar/NavIcons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { appDialog } from '@/Function/shared/appDialogStore';
import { IslandHeader } from '@/Function/shared/MainIsland';
import { RenameInput } from '@/Function/shared/RenameInput';
import { ItemIconButton } from '@/Function/shared/itemIcon/IconPicker';
import { formatRelative } from '@/Function/shared/dateUtils';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { notebookRows, type NotebookShelf } from '@/Function/notebook/noteNodes';
import { useNotes } from '@/hooks/useNotesDb';
import { useFolders } from '@/hooks/folderData';
import { ensureArtifactRoot } from '@/hooks/artifactData';
import { useCurrentUserId } from '@/providers/authContext';
import type { NoteNode } from '@/types/notes';

// A list of notebooks: each with how many sections and pages it holds and
// when it last changed. A notebook opens into its sections and their pages.
//
// Two shelves use it. Note opens on one's own notebooks, under its own
// header. A Domain's Note tab lists the notebooks placed in that Domain's
// Artifacts — everyone who sees the Domain sees them — and a new one made
// there goes in the Domain's Artifacts; the Domain page's header carries its
// "New notebook" (it asks through NEW_DOMAIN_NOTEBOOK).

/** Asks the open Domain's Note tab to make a notebook. */
export const NEW_DOMAIN_NOTEBOOK = 'clayware:new-domain-notebook';

export function NotebookList({ onOpenBook, domainId }: {
  onOpenBook: (folderId: string) => void;
  /** The Domain whose notebooks to list; none lists one's own. */
  domainId?: string | null;
}) {
  const { t } = useI18n();
  const me = useCurrentUserId();
  const spaceId = useActiveSpaceId();
  const { nodes, loading, createNode, renameNode, deleteNode, setNodeIcon } = useNotes();
  const { data: folders } = useFolders('files');
  const [renaming, setRenaming] = useState<string | null>(null);

  const shelf = useMemo<NotebookShelf>(() => domainId
    ? { folderIds: new Set(folders.filter((f) => f.scope === 'domain' && f.domain_id === domainId).map((f) => f.id)) }
    : { mine: me }, [domainId, folders, me]);
  const books = useMemo(() => notebookRows(nodes, shelf), [nodes, shelf]);

  const addBook = useCallback(async () => {
    try {
      // A Domain's notebook sits in the Domain's Artifacts, so its people see it.
      const folderId = domainId && spaceId ? await ensureArtifactRoot(spaceId, { scope: 'domain', domainId }) : null;
      const book = await createNode('folder', t('New notebook'), null, { folderId });
      // A notebook always has a Section: pages live in Sections, never loose.
      const section = await createNode('section', t('Section 1'), book.id);
      await createNode('file', t('Untitled'), section.id);
      setRenaming(book.id);
    } catch (e) {
      console.error('Failed to create notebook', e);
      void appDialog.alert(t('The notebook could not be created. Please try again.'));
    }
  }, [createNode, domainId, spaceId, t]);

  useEffect(() => {
    if (!domainId) return;
    const onAsk = () => { void addBook(); };
    window.addEventListener(NEW_DOMAIN_NOTEBOOK, onAsk);
    return () => window.removeEventListener(NEW_DOMAIN_NOTEBOOK, onAsk);
  }, [addBook, domainId]);

  const removeBook = async (book: NoteNode, sections: number, pages: number) => {
    const message = sections > 0 || pages > 0
      ? t('Delete the notebook “{name}” and its {sections} sections and {pages} pages? This cannot be undone.', { name: book.name, sections, pages })
      : t('Delete the notebook “{name}”? This cannot be undone.', { name: book.name });
    if (!await appDialog.confirm(message)) return;
    try { await deleteNode(book.id); } catch (e) { console.error('Failed to delete notebook', e); }
  };
  const when = (iso: string | null | undefined) => (iso ? formatRelative(iso) : '');

  const table = (
    <div className="flex-1 overflow-auto">
      {/* The same table on both shelves, its headings shown even when empty. */}
      {(
        <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
          <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 160 }} /><col style={{ width: 44 }} /></colgroup>
          <thead>
            <tr className="text-left text-[12px] text-muted-foreground">
              <th className="px-[30px] py-2.5 font-normal">{t('Name')}</th>
              <th className="px-3 py-2.5 font-normal">{t('Sections')}</th>
              <th className="px-3 py-2.5 font-normal">{t('Pages')}</th>
              <th className="px-3 py-2.5 font-normal">{t('Updated')}</th>
              <th className="py-2.5 pr-4 font-normal" aria-label={t('Actions')} />
            </tr>
          </thead>
          <tbody>
            {books.map(({ book, sections, pages, changed }) => {
              // Renaming, the icon and deleting stay with whoever made the notebook.
              const own = !book.createdBy || book.createdBy === me;
              return (
                <ContextMenu key={book.id}>
                  <ContextMenuTrigger asChild disabled={!own}>
                    <tr className="group/nb cursor-pointer transition-colors hover:bg-foreground/[0.04]" onClick={() => { if (renaming !== book.id) onOpenBook(book.id); }}>
                      <td className="px-[30px] py-2.5">
                        <span className="flex min-w-0 items-center gap-3">
                          {/* The notebook's own icon; a click on it changes it (and does not open the notebook). */}
                          <span className="flex shrink-0 text-muted-foreground" onClick={(e) => { if (own) e.stopPropagation(); }}>
                            <ItemIconButton size={16} canEdit={own} value={{ icon: book.icon ?? null, color: null }} defaultIcon={<NavNoteIcon size={16} />}
                              onChange={(next) => void setNodeIcon(book.id, next.icon).catch((e) => console.error('Failed to set notebook icon', e))} />
                          </span>
                          {renaming === book.id ? (
                            <RenameInput initial={book.name}
                              onCommit={(v) => { if (v && v !== book.name) void renameNode(book.id, v); setRenaming(null); }}
                              onCancel={() => setRenaming(null)}
                              className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-foreground" />
                          ) : <span className="min-w-0 truncate text-[15px] font-medium text-foreground">{book.name}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{sections}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{pages}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{when(changed)}</td>
                      <td className="py-2.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        {own && (
                          <DropdownMenu>
                            <ButtonAppearanceProvider appearance="navigation">
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={t('Notebook actions')}
                                  className="opacity-0 transition-opacity group-hover/nb:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                >
                                  <MoreHorizontal size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                            </ButtonAppearanceProvider>
                            <DropdownMenuContent align="end" className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
                              <DropdownMenuItem onSelect={() => window.setTimeout(() => setRenaming(book.id), 0)}><Pencil /> {t('Rename')}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => void removeBook(book, sections, pages)}><Trash2 /> {t('Delete notebook')}</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <ContextMenuItem onSelect={() => window.setTimeout(() => setRenaming(book.id), 0)}><Pencil /> {t('Rename')}</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => void removeBook(book, sections, pages)}><Trash2 /> {t('Delete notebook')}</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </tbody>
        </table>
      )}
      {!loading && books.length === 0 && (
        <p className="px-[30px] py-3 text-[13px] text-muted-foreground">{t(domainId ? 'No notebooks in this Domain yet' : 'No notebooks yet.')}</p>
      )}
    </div>
  );

  // A Domain's tab sits under the Domain page's own header.
  if (domainId) return <div className="flex flex-1 flex-col overflow-hidden">{table}</div>;
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-card">
      <IslandHeader crumbs={[{ id: 'note', label: t('Note') }]} actions={
        <Button variant="primary" size="sm" onClick={() => void addBook()}><Plus size={14} />{t('New notebook')}</Button>
      } />
      {table}
    </div>
  );
}
