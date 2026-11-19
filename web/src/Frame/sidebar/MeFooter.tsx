'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useAuthContext } from '@/providers/AuthProvider';
import { WorkerAvatar } from '@/Function/shared/WorkerAvatar';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { LogOut, Settings } from '@/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { NavCalendarIcon, NavMyTasksIcon, NavNoteIcon } from './NavIcons';
import { ProfileMenu } from './ProfileMenu';

// The foot of the sidebar: who you are and whether this window is connected
// — it opens the account card (ProfileMenu): the Profile from its header,
// then Note, My Elements and Calendar, then Settings and signing out — and beside
// it, the gear to Settings. Online and
// offline are the browser's own reading of the network, so what it says is
// true of this window.

const subscribe = (fn: () => void) => {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => { window.removeEventListener('online', fn); window.removeEventListener('offline', fn); };
};

export function MeFooter({ active, onOpen, onOpenView, onSettings }: {
  active: boolean;
  /** Open the Profile. */
  onOpen: () => void;
  /** Open one of the person's own screens (Note, My Elements). */
  onOpenView: (view: string) => void;
  onSettings?: () => void;
}) {
  const { t } = useI18n();
  const { user, profile, signOut } = useAuthContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = profile?.display_name || user?.email?.split('@')[0] || null;
  const avatarUrl = profile?.avatar_url;
  const me = useMemo(() => ({ name, avatar_url: avatarUrl }), [name, avatarUrl]);
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <div className="flex shrink-0 items-center gap-1 border-t border-[var(--border-subtle)] px-2 py-2">
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
    <PopoverTrigger asChild>
    <button type="button" aria-pressed={active} aria-haspopup="menu" title={t('Profile')}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1.5 py-1 text-left transition-colors ${active ? 'bg-sidebar-accent shadow-[inset_0_0_0_1px_var(--border-subtle)]' : 'hover:bg-sidebar-accent/60'}`}>
      <span className="relative shrink-0">
        <WorkerAvatar worker={me} size={24} />
        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-[1.5px] border-[var(--sidebar)]"
          style={{ background: online ? 'var(--status-success)' : 'var(--text-tertiary)' }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium leading-tight text-foreground">{name ?? t('Profile')}</span>
        <span className="block text-[10.5px] leading-tight text-muted-foreground">{online ? t('Online') : t('Offline')}</span>
      </span>
    </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" sideOffset={6} className="w-auto border-0 bg-transparent p-0 shadow-none">
      <ProfileMenu
        name={name ?? ''}
        email={user?.email ?? ''}
        avatar={<WorkerAvatar worker={me} size={32} />}
        onOpenProfile={() => { setMenuOpen(false); onOpen(); }}
        items={[
          { id: 'note', label: t('Note'), icon: <NavNoteIcon size={16} />, onSelect: () => { setMenuOpen(false); onOpenView('note'); } },
          { id: 'my-elements', label: t('My Elements'), icon: <NavMyTasksIcon size={16} />, onSelect: () => { setMenuOpen(false); onOpenView('my-elements'); } },
          { id: 'calendar', label: t('Calendar'), icon: <NavCalendarIcon size={16} />, onSelect: () => { setMenuOpen(false); onOpenView('calendar'); } },
          ...(onSettings ? [{ id: 'settings', label: t('Settings'), icon: <Settings size={16} />, separated: true, onSelect: () => { setMenuOpen(false); onSettings(); } }] : []),
          { id: 'sign-out', label: t('Sign out'), icon: <LogOut size={16} />, separated: !onSettings, onSelect: () => { setMenuOpen(false); void signOut(); } },
        ]}
      />
    </PopoverContent>
    </Popover>
    {onSettings && (
      <button type="button" onClick={onSettings} title={t('Settings')} aria-label={t('Settings')}
        className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground">
        <Settings size={15} />
      </button>
    )}
    </div>
  );
}
