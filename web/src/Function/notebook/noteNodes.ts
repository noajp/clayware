import type { NoteNode } from '@/types/notes';

// Pure helpers over the Note tree as loaded: one's own Notes joined with the
// notebooks others placed in an Artifacts folder one sees, and the rows of a
// notebook list.

/** One's own Notes, then the shared ones not already among them. */
export function mergeNoteNodes(own: NoteNode[], shared: NoteNode[]): NoteNode[] {
  const seen = new Set(own.map((n) => n.id));
  return [...own, ...shared.filter((n) => !seen.has(n.id) && (seen.add(n.id), true))];
}

/** A row of a notebook list: how many sections and pages the notebook holds
 *  and when anything in it last changed. */
export interface NotebookRow {
  book: NoteNode;
  sections: number;
  pages: number;
  changed: string | null;
}

/** Which notebooks a list shows: one's own (the Note screen) or those placed
 *  in any of a Domain's Artifacts folders (the Domain's Note tab). */
export type NotebookShelf = { mine: string | null } | { folderIds: ReadonlySet<string> };

function onShelf(book: NoteNode, shelf: NotebookShelf): boolean {
  if ('folderIds' in shelf) return !!book.folderId && shelf.folderIds.has(book.folderId);
  // Before the user is known, the list is everything loaded (all one's own).
  return shelf.mine === null || book.createdBy === shelf.mine;
}

/** The notebooks on a shelf, by name, each with its counts. Pages count
 *  whether they sit in a section or directly in the notebook. */
export function notebookRows(nodes: NoteNode[], shelf: NotebookShelf): NotebookRow[] {
  const children = new Map<string, NoteNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId);
    if (list) list.push(n); else children.set(n.parentId, [n]);
  }
  return nodes
    .filter((n) => n.type === 'folder' && !n.parentId && onShelf(n, shelf))
    .map((book) => {
      const under = children.get(book.id) ?? [];
      const sections = under.filter((n) => n.type === 'section');
      const pages = [
        ...under.filter((n) => n.type === 'file'),
        ...sections.flatMap((s) => (children.get(s.id) ?? []).filter((n) => n.type === 'file')),
      ];
      const changed = [book.updatedAt, ...pages.map((p) => p.updatedAt)]
        .filter((x): x is string => !!x).sort().at(-1) ?? null;
      return { book, sections: sections.length, pages: pages.length, changed };
    })
    .sort((a, b) => a.book.name.localeCompare(b.book.name));
}
