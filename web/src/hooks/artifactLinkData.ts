'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { latestVersions } from '@/Function/shared/fileVersions';

// Artifacts placed on a Vision, a Portfolio, a Domain, an Object or an Element (artifact_links): a file, a
// notebook or a slide deck from Artifacts, with who placed it. The artifact
// stays where it lives; a link whose artifact this person cannot see (or that
// was removed) is not listed.

export type ArtifactKind = 'file' | 'notebook' | 'deck';
export type ArtifactSubject = { kind: 'vision' | 'strategy' | 'domain' | 'object' | 'element'; id: string };

export interface LinkedArtifact {
  linkId: string;
  kind: ArtifactKind;
  /** The file, notebook or deck. */
  id: string;
  name: string;
  /** A file's type, for its icon. */
  mime: string | null;
  addedBy: string | null;
  addedAt: string;
}

export interface ArtifactChoice { kind: ArtifactKind; id: string; name: string; mime: string | null; updatedAt: string }

const SUBJECT_COLUMN = { vision: 'vision_id', strategy: 'strategy_id', domain: 'domain_id', object: 'object_id', element: 'element_id' } as const;
const ARTIFACT_COLUMN = { file: 'file_id', notebook: 'note_id', deck: 'deck_id' } as const;
const key = (s: ArtifactSubject) => ['artifact-links', s.kind, s.id] as const;

interface LinkRow {
  id: string; file_id: string | null; note_id: string | null; deck_id: string | null; added_by: string | null; created_at: string;
  file: { name: string; mime_type: string | null; deleted_at: string | null } | null;
  note: { name: string } | null;
  deck: { name: string } | null;
}

/** Pure. The rows a reader can see, oldest first, in one shape. */
export function linkedArtifactsOf(rows: readonly LinkRow[]): LinkedArtifact[] {
  const out: LinkedArtifact[] = [];
  for (const r of rows) {
    const base = { linkId: r.id, addedBy: r.added_by, addedAt: r.created_at };
    if (r.file_id && r.file && !r.file.deleted_at) out.push({ ...base, kind: 'file', id: r.file_id, name: r.file.name, mime: r.file.mime_type });
    else if (r.note_id && r.note) out.push({ ...base, kind: 'notebook', id: r.note_id, name: r.note.name, mime: null });
    else if (r.deck_id && r.deck) out.push({ ...base, kind: 'deck', id: r.deck_id, name: r.deck.name, mime: null });
  }
  return out;
}

export function useArtifactLinks(subject: ArtifactSubject) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: key(subject),
    queryFn: async (): Promise<LinkedArtifact[]> => {
      const { data, error } = await supabase.from('artifact_links')
        .select('id, file_id, note_id, deck_id, added_by, created_at, file:attachments(name, mime_type, deleted_at), note:notes(name), deck:decks(name)')
        .eq(SUBJECT_COLUMN[subject.kind], subject.id).order('created_at');
      if (error) throw error;
      return linkedArtifactsOf((data ?? []) as unknown as LinkRow[]);
    },
  });
  const add = useMutation({
    mutationFn: async (a: { kind: ArtifactKind; id: string }) => {
      const { error } = await supabase.from('artifact_links')
        .insert({ [SUBJECT_COLUMN[subject.kind]]: subject.id, [ARTIFACT_COLUMN[a.kind]]: a.id });
      if (error) throw error;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key(subject) }); },
  });
  const remove = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from('artifact_links').delete().eq('id', linkId);
      if (error) throw error;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key(subject) }); },
  });
  return { artifacts: query.data ?? [], loading: query.isPending, error: query.error, add, remove };
}

/** What can be placed: the Space's Artifacts files (latest versions), the
 *  notebooks this person can see and the Space's decks — newest first. */
export function useArtifactChoices(spaceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['artifact-choices', spaceId],
    enabled: enabled && !!spaceId,
    queryFn: async (): Promise<ArtifactChoice[]> => {
      const [files, notes, decks] = await Promise.all([
        supabase.from('attachments').select('id, name, mime_type, created_at, previous_id, folder:folders!inner(activity_space_id)')
          .not('folder_id', 'is', null).is('deleted_at', null).eq('folder.activity_space_id', spaceId!),
        supabase.from('notes').select('id, name, updated_at').eq('type', 'folder').is('parent_id', null),
        supabase.from('decks').select('id, name, updated_at').eq('activity_space_id', spaceId!),
      ]);
      for (const r of [files, notes, decks]) if (r.error) throw r.error;
      const fileRows = (files.data ?? []) as unknown as { id: string; name: string; mime_type: string | null; created_at: string; previous_id: string | null }[];
      const out: ArtifactChoice[] = [
        ...latestVersions(fileRows).map((f) => ({ kind: 'file' as const, id: f.id, name: f.name, mime: f.mime_type, updatedAt: f.created_at })),
        ...(notes.data ?? []).map((n) => ({ kind: 'notebook' as const, id: n.id as string, name: n.name as string, mime: null, updatedAt: n.updated_at as string })),
        ...(decks.data ?? []).map((d) => ({ kind: 'deck' as const, id: d.id as string, name: d.name as string, mime: null, updatedAt: d.updated_at as string })),
      ];
      return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  });
}
