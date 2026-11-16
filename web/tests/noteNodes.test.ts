import { describe, expect, it } from 'vitest';
import { mergeNoteNodes, notebookRows } from '@/Function/notebook/noteNodes';
import type { NoteNode } from '@/types/notes';

const node = (id: string, type: NoteNode['type'], parentId: string | null, extra: Partial<NoteNode> = {}): NoteNode =>
  ({ id, type, name: id, parentId, createdBy: 'me', ...extra });

describe('mergeNoteNodes', () => {
  it('keeps one’s own notes first and adds shared ones once', () => {
    const own = [node('a', 'folder', null)];
    const shared = [node('a', 'folder', null, { createdBy: 'x' }), node('b', 'folder', null, { createdBy: 'x' }), node('b', 'folder', null)];
    expect(mergeNoteNodes(own, shared).map((n) => `${n.id}:${n.createdBy}`)).toEqual(['a:me', 'b:x']);
  });
});

describe('notebookRows', () => {
  const nodes: NoteNode[] = [
    node('mine', 'folder', null, { updatedAt: '2026-11-01T00:00:00Z' }),
    node('s1', 'section', 'mine'),
    node('p1', 'file', 's1', { updatedAt: '2026-11-05T00:00:00Z' }),
    node('loose', 'file', 'mine'),
    node('dom', 'folder', null, { createdBy: 'x', folderId: 'f-dom', name: 'Domain book' }),
    node('other', 'folder', null, { createdBy: 'x', folderId: 'f-elsewhere' }),
  ];

  it('lists one’s own notebooks with their sections, pages and last change', () => {
    expect(notebookRows(nodes, { mine: 'me' })).toEqual([
      { book: nodes[0], sections: 1, pages: 2, changed: '2026-11-05T00:00:00Z' },
    ]);
  });

  it('lists a Domain’s notebooks by the folders they sit in, whoever made them', () => {
    const rows = notebookRows(nodes, { folderIds: new Set(['f-dom']) });
    expect(rows.map((r) => r.book.id)).toEqual(['dom']);
    expect(rows[0]).toMatchObject({ sections: 0, pages: 0, changed: null });
  });

  it('lists everything loaded before the user is known', () => {
    expect(notebookRows(nodes, { mine: null }).map((r) => r.book.id)).toEqual(['dom', 'mine', 'other']);
  });
});
