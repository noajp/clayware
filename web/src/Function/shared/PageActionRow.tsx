'use client';

import type { ReactNode } from 'react';
import { MoreHorizontal } from '@/ui/icons';
import { ButtonAppearanceProvider } from '@/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { AttachmentList } from '@/Function/shared/attachments/AttachmentList';
import { ReactionChips, ReactionPicker } from '@/Function/shared/ReactionControls';
import { useI18n } from '@/Function/i18n/I18nProvider';
import type { AttachmentOwner, Attachment } from '@/hooks/attachmentData';

const ICON_BUTTON = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground';

/**
 * The one quiet row under a concept page's description — the same on a
 * Vision, a Portfolio, a Domain, an Object and an Element: react (the
 * smile), the "…" of other things to add (a Document, a Slide), then the
 * reactions given; under it, the files already attached. A page passes only
 * what differs: its reactions, whose files to list, and the "…" items.
 */
export function PageActionRow({
  reactions, userId, onReact, filesOf, attachmentActions, moreItems, moreAnchor, trailing, children,
}: {
  /** Omit where the subject takes no reactions yet: the smile is left out. */
  reactions?: readonly { emoji: string; user_id: string }[];
  userId?: string | null;
  onReact?: (emoji: string) => void;
  /** Whose attached files to list under the row; null while not known. */
  filesOf: AttachmentOwner | null;
  /** Per-file actions on the attached files (an import). */
  attachmentActions?: (file: Attachment) => ReactNode;
  /** The "…" menu's `DropdownMenuItem`s; none, no "…". */
  moreItems?: ReactNode;
  /** Anchored under the "…" (a Note picker opened from it). */
  moreAnchor?: ReactNode;
  /** After the "…", before the reactions (an approval's state). */
  trailing?: ReactNode;
  /** Full-width blocks after the attached files (Sub-elements). */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="relative -ml-2.5 flex flex-wrap items-start gap-x-0.5 gap-y-5 [&>*.w-full]:pl-2.5">
      <ButtonAppearanceProvider appearance="inline">
        <div className="flex items-center gap-0.5">
          {onReact && <ReactionPicker onToggle={onReact} />}
          {moreItems && (
            <div className="relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" title={t('More')} aria-label={t('More')} className={ICON_BUTTON}>
                    <MoreHorizontal size={15} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[200px]">{moreItems}</DropdownMenuContent>
              </DropdownMenu>
              {moreAnchor}
            </div>
          )}
          {trailing}
          {onReact && reactions && <ReactionChips reactions={reactions} userId={userId ?? null} onToggle={onReact} />}
        </div>
      </ButtonAppearanceProvider>
      {filesOf && <AttachmentList owner={filesOf} actions={attachmentActions} />}
      {children}
    </div>
  );
}

/** A "…" item of the row: an icon and a name, the size every page uses. */
export const PAGE_MORE_ITEM = 'gap-2.5 py-1.5 text-[13px]';
