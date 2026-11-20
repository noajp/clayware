'use client';

import { RAIL_SECTIONS, type RailSection } from '@/Frame/railSections';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { RailAccount } from '@/Frame/RailAccount';

// The thin column at the far left: Home, Strategy, Execution and Team. It
// is sunk into the window's ground, with no frame of its own, beside the one
// island that holds the sidebar and the screen; picking a place swaps what
// the sidebar lists. Icons only; each is named for the
// screen reader and the tooltip. At its foot, Settings and, last, you.

export function ModeRail({ active, onSelect, activeView, onOpenView, onSettings, className = '' }: {
  /** The place the open screen is in; null for one under none of them. */
  active: RailSection | null;
  onSelect: (section: RailSection) => void;
  /** The open screen, to mark Settings or the Profile when one is open. */
  activeView: string;
  /** Open a screen of the person's own (the Profile, Note, My Elements …). */
  onOpenView: (view: string) => void;
  onSettings: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('Places')}
      className={`app-sidebar flex w-12 shrink-0 flex-col items-center gap-1 overflow-hidden bg-none py-3 ${className}`}>
      {RAIL_SECTIONS.map(({ id, label, icon: Icon }) => {
        const on = active === id;
        return (
          <button key={id} type="button" onClick={() => onSelect(id)}
            aria-label={t(label)} title={t(label)} aria-current={on ? 'page' : undefined}
            className={`flex size-10 items-center justify-center rounded-md transition-colors ${on
              ? 'bg-sidebar-accent text-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'}`}>
            <Icon size={18} />
          </button>
        );
      })}
      <RailAccount profileOpen={activeView === 'profile'} settingsOpen={activeView === 'settings'}
        onOpenProfile={() => onOpenView('profile')} onOpenView={onOpenView} onSettings={onSettings} />
    </nav>
  );
}
