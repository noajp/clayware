'use client';

import { NotebookList } from '@/ActivitySpace/artifacts/notebook/NotebookList';
import type { NavigationState } from '@/types/navigation';

// The Domain's Note: the Domain's notebooks — how it works, what it has
// agreed, its minutes — each with sections and pages. A notebook made here
// sits in the Domain's Artifacts, so everyone who can see the Domain reads
// it; its members write it. A notebook opens in Note.

export function DomainNote({ domainId, onNavigate, onViewChange }: {
  domainId: string | null;
  onNavigate: (nav: Partial<NavigationState>) => void;
  onViewChange?: (view: string) => void;
}) {
  if (!domainId) return null;
  return (
    <NotebookList
      domainId={domainId}
      onOpenBook={(id) => { onNavigate({ noteFolderId: id, noteSectionId: null, noteId: null }); onViewChange?.('note'); }}
    />
  );
}
