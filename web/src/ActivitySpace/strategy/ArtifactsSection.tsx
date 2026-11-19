'use client';

import { useMemo, useState } from 'react';
import { Search, X } from '@/ui/icons';
import { NavNoteIcon, NavSlidesIcon } from '@/Frame/sidebar/NavIcons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { ConceptSection } from '@/Function/shared/ConceptSection';
import { ContentRow, ContentRowAction } from '@/Function/shared/ContentRow';
import { WorkerAvatar } from '@/Function/shared/WorkerAvatar';
import { appDialog } from '@/Function/shared/appDialogStore';
import { openInApp } from '@/Function/shared/appNavigation';
import { formatError } from '@/Function/shared/formatError';
import { formatDateOnly } from '@/Function/shared/dateUtils';
import { FileTypeIcon } from '@/Function/office/fileTypeIcon';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { openDeck } from '@/ActivitySpace/artifacts/slides/artifactDecks';
import { latestVersionOf } from '@/hooks/attachmentData';
import { useWorkers } from '@/hooks/teamData';
import {
  useArtifactChoices, useArtifactLinks,
  type ArtifactKind, type ArtifactSubject, type LinkedArtifact,
} from '@/hooks/artifactLinkData';

/** The icon an artifact shows everywhere: a file by its type, a notebook,
 *  a slide deck. */
function ArtifactIcon({ kind, name, mime }: { kind: ArtifactKind; name: string; mime: string | null }) {
  if (kind === 'notebook') return <NavNoteIcon size={15} />;
  if (kind === 'deck') return <NavSlidesIcon size={15} />;
  return <FileTypeIcon name={name} mime={mime} size={15} />;
}

/** Opens an artifact where it lives: a file in Files (its latest version), a
 *  notebook in Notes, a deck in Slides. */
async function openArtifact(a: { kind: ArtifactKind; id: string }) {
  if (a.kind === 'notebook') { openInApp('note', { noteFolderId: a.id, noteSectionId: null, noteId: null }); return; }
  if (a.kind === 'deck') { openInApp('slides'); void openDeck(a.id); return; }
  const latest = await latestVersionOf(a.id);
  if (latest) openInApp('files', { files: { fileId: latest.id } });
  else void appDialog.alert('This file is no longer available.');
}

/** The page a subject's Artifacts section is on, for hiding it. */
const ARTIFACT_PAGE = { vision: 'vision', strategy: 'portfolio', domain: 'domain', object: 'object', element: 'element' } as const;

/** A Vision's or a Portfolio's Artifacts: files, notebooks and decks from
 *  Artifacts placed on it, with who placed them and when. */
export function ArtifactsSection({ subject, canAdd }: { subject: ArtifactSubject; canAdd: boolean }) {
  const { t, locale } = useI18n();
  const { artifacts, add, remove } = useArtifactLinks(subject);
  const { data: workers } = useWorkers();
  const byUser = useMemo(() => new Map(workers.filter((w) => w.user_id).map((w) => [w.user_id as string, w])), [workers]);
  const [picking, setPicking] = useState(false);

  const place = (a: { kind: ArtifactKind; id: string }) =>
    add.mutate(a, { onSuccess: () => setPicking(false), onError: (e) => void appDialog.alert(formatError(e)) });
  const takeOff = (a: LinkedArtifact) =>
    remove.mutate(a.linkId, { onError: (e) => void appDialog.alert(formatError(e)) });

  return (
    <ConceptSection page={ARTIFACT_PAGE[subject.kind]} id={`${ARTIFACT_PAGE[subject.kind]}-artifacts`} title={t('Artifacts')} count={artifacts.length}
      columns={[{ key: 'addedBy', label: t('Added by') }, { key: 'added', label: t('Added') }]}
      addLabel={t('Add Artifact')} onAdd={canAdd ? () => setPicking(true) : undefined}
      addAnchor={picking && (
        <ArtifactPicker placed={artifacts} onPick={place} onClose={() => setPicking(false)} />
      )}
      empty={artifacts.length === 0}>
      {(shows) => artifacts.map((a) => {
        const by = a.addedBy ? byUser.get(a.addedBy) : undefined;
        return (
          <ContentRow key={a.linkId} icon={<ArtifactIcon kind={a.kind} name={a.name} mime={a.mime} />} name={a.name}
            onOpen={() => void openArtifact(a)}
            meta={<>
              {shows('added') && <span className="w-14 text-right">{formatDateOnly(a.addedAt.slice(0, 10), locale)}</span>}
              {shows('addedBy') && <span className="flex w-5 justify-center">{by && <WorkerAvatar worker={by} size={18} title={by.name} />}</span>}
            </>}
            actions={canAdd ? (
              <ContentRowAction label={t('Remove {name}', { name: a.name })} onClick={() => takeOff(a)}><X size={12} /></ContentRowAction>
            ) : undefined} />
        );
      })}
    </ConceptSection>
  );
}

/** Search the Space's Artifacts and place one. */
function ArtifactPicker({ placed, onPick, onClose }: {
  placed: LinkedArtifact[];
  onPick: (a: { kind: ArtifactKind; id: string }) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const spaceId = useActiveSpaceId();
  const { data: choices = [], isPending } = useArtifactChoices(spaceId, true);
  const [query, setQuery] = useState('');
  const placedKeys = new Set(placed.map((a) => `${a.kind}:${a.id}`));
  const q = query.trim().toLowerCase();
  const shown = choices.filter((c) => !placedKeys.has(`${c.kind}:${c.id}`) && (!q || c.name.toLowerCase().includes(q))).slice(0, 50);
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
        <Search size={12} className="text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
          aria-label={t('Search Artifacts…')} placeholder={t('Search Artifacts…')}
          className="flex-1 bg-transparent text-[13px] outline-none" />
        <button type="button" onClick={onClose} aria-label={t('Close')} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
      </div>
      <div className="max-h-72 overflow-auto">
        {!isPending && shown.length === 0 && <div className="px-3 py-3 text-[12px] text-muted-foreground">{t('No Artifacts match.')}</div>}
        {shown.map((c) => (
          <button key={`${c.kind}:${c.id}`} type="button" onClick={() => onPick(c)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-muted/40">
            <span className="flex w-4 shrink-0 justify-center text-muted-foreground"><ArtifactIcon kind={c.kind} name={c.name} mime={c.mime} /></span>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
