import { describe, expect, it } from 'vitest';
import { linkedArtifactsOf } from '@/hooks/artifactLinkData';

const base = { added_by: 'u1', created_at: '2026-11-19T10:00:00Z', file_id: null, note_id: null, deck_id: null, file: null, note: null, deck: null };

describe('linkedArtifactsOf', () => {
  it('reads a file, a notebook and a deck into one shape', () => {
    const out = linkedArtifactsOf([
      { ...base, id: 'l1', file_id: 'f1', file: { name: 'plan.pdf', mime_type: 'application/pdf', deleted_at: null } },
      { ...base, id: 'l2', note_id: 'n1', note: { name: 'Notes' } },
      { ...base, id: 'l3', deck_id: 'd1', deck: { name: 'Pitch' } },
    ]);
    expect(out.map((a) => [a.kind, a.id, a.name])).toEqual([['file', 'f1', 'plan.pdf'], ['notebook', 'n1', 'Notes'], ['deck', 'd1', 'Pitch']]);
    expect(out[0]).toMatchObject({ linkId: 'l1', mime: 'application/pdf', addedBy: 'u1' });
  });
  it('leaves out a trashed file and an artifact the reader cannot see', () => {
    const out = linkedArtifactsOf([
      { ...base, id: 'l1', file_id: 'f1', file: { name: 'old.pdf', mime_type: null, deleted_at: '2026-11-18T00:00:00Z' } },
      { ...base, id: 'l2', note_id: 'n1', note: null },
    ]);
    expect(out).toEqual([]);
  });
});
