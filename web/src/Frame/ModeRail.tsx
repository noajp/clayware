'use client';

import { Fragment, useState } from 'react';
import { RAIL_SECTIONS, type RailSection } from '@/Frame/railSections';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { RailAccount } from '@/Frame/RailAccount';
import { CreateSustainmentDialog } from '@/Frame/CreateSustainmentDialog';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { useSustainments } from '@/hooks/useSustainments';
import { useNotifications } from '@/hooks/useSupabase';
import { useAuthContext } from '@/providers/AuthProvider';
import { AthenaAvatar } from '@/AIP/ai/AthenaAvatar';
import { useCopilotStreaming } from '@/AIP/ai/CopilotProvider';
import { Plus } from '@/ui/icons';
import type { Sustainment } from '@/types/database';

// The thin column at the far left: Athena (the companion portrait medallion,
// anchored at the top like the user's avatar at the bottom), a hairline,
// Inbox, Strategy, Execution and Team; under a second hairline, the Space's
// Sustainments, one button each, and "+" to add one. It is sunk into the
// window's ground, with no frame of its own, beside the one island that
// holds the sidebar and the screen; picking a place swaps what the sidebar
// lists. Icons only; each is named for the screen reader and the tooltip.
// At its foot, Settings and, last, you.

const CELL = 'flex size-10 shrink-0 items-center justify-center rounded-md transition-colors';
const cellTone = (on: boolean) => (on
  ? 'bg-sidebar-accent text-foreground'
  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground');

export function ModeRail({ active, onSelect, activeView, sustainmentId, onOpenSustainment, onOpenView, onSettings, className = '' }: {
  /** The place the open screen is in; null for one under none of them. */
  active: RailSection | null;
  onSelect: (section: RailSection) => void;
  /** The open screen, to mark Settings or the Profile when one is open. */
  activeView: string;
  /** The Sustainment the open screen shows, when it is one. */
  sustainmentId: string | null;
  onOpenSustainment: (id: string) => void;
  /** Open a screen of the person's own (the Profile, Note, My Elements …). */
  onOpenView: (view: string) => void;
  onSettings: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const { data: sustainments, createSustainment } = useSustainments();
  // Inbox's unread count, the same hook and count the notifications read.
  const { user } = useAuthContext();
  const { unreadCount } = useNotifications(user?.id ?? null);
  const athenaWorking = useCopilotStreaming();
  const [creating, setCreating] = useState(false);
  const openId = activeView === 'sustainment' ? sustainmentId : null;
  return (
    <nav aria-label={t('Places')}
      className={`app-sidebar flex w-[52px] shrink-0 flex-col items-center gap-1 overflow-hidden bg-none py-3 ${className}`}>
      {RAIL_SECTIONS.map(({ id, label, icon: Icon }) => {
        const on = active === id;
        const unread = id === 'inbox' && unreadCount > 0;
        const name = unread ? `${t(label)} (${unreadCount})` : t(label);
        if (id === 'assistant') {
          return (
            <Fragment key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-label={name}
                title={name}
                aria-current={on ? 'page' : undefined}
                className="group/athena relative flex size-10 shrink-0 items-center justify-center rounded-full outline-none"
              >
                <AthenaAvatar
                  size="rail"
                  active={on}
                  working={athenaWorking}
                  className="group-hover/athena:scale-[1.05] group-active/athena:scale-[0.98]"
                />
              </button>
              <div role="separator" aria-hidden className="my-1.5 h-px w-5 shrink-0 bg-border/80" />
            </Fragment>
          );
        }
        return (
          <button key={id} type="button" onClick={() => onSelect(id)}
            aria-label={name} title={name} aria-current={on ? 'page' : undefined}
            className={`relative ${CELL} ${cellTone(on)}`}>
            <Icon size={18} />
            {unread && <span aria-hidden className="absolute right-2 top-2 size-2 rounded-full bg-primary" />}
          </button>
        );
      })}
      <div role="separator" aria-hidden className="my-1.5 h-px w-5 shrink-0 bg-border/80" />
      <div className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto">
        {sustainments.map((s) => <SustainmentButton key={s.id} sustainment={s} on={openId === s.id}
          onOpen={() => onOpenSustainment(s.id)} />)}
        <button type="button" onClick={() => setCreating(true)}
          aria-label={t('Create Sustainment')} title={t('Create Sustainment')}
          className={`${CELL} ${cellTone(false)}`}>
          <Plus size={16} />
        </button>
      </div>
      <RailAccount profileOpen={activeView === 'profile'} settingsOpen={activeView === 'settings'}
        onOpenProfile={() => onOpenView('profile')} onOpenView={onOpenView} onSettings={onSettings} />
      {creating && <CreateSustainmentDialog onClose={() => setCreating(false)} onCreate={createSustainment}
        onCreated={(row) => { setCreating(false); onOpenSustainment(row.id); }} />}
    </nav>
  );
}

function SustainmentButton({ sustainment, on, onOpen }: { sustainment: Sustainment; on: boolean; onOpen: () => void }) {
  const initial = Array.from(sustainment.name.trim())[0] ?? '';
  return (
    <button type="button" onClick={onOpen} aria-label={sustainment.name} title={sustainment.name}
      aria-current={on ? 'page' : undefined} className={`${CELL} ${cellTone(on)}`}>
      {/* No icon (or one this build cannot draw): the name's first letter. */}
      <ItemIcon icon={sustainment.icon} size={18}
        fallback={<span className="text-[14px] font-semibold leading-none">{initial}</span>} />
    </button>
  );
}
