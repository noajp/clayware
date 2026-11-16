'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useAuthContext } from '@/providers/AuthProvider';
import { WorkerAvatar } from '@/Function/shared/WorkerAvatar';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { LogOut, Settings } from '@/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { NavCalendarIcon, NavMyTasksIcon, NavNoteIcon } from '@/Frame/sidebar/NavIcons';
import { ProfileMenu } from '@/Frame/sidebar/ProfileMenu';

// The foot of the ModeRail: the gear to Settings, and under it, last, who
// you are — your face, with a dot for whether this window is connected. The
// face opens the account card (ProfileMenu): the Profile from its header,
// then Note, My Elements and Calendar, then Settings and signing out. Online
// and offline are the browser's own reading of the network, so what it says
// is true of this window.

const subscribe = (fn: () => void) => {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => { window.removeEventListener('online', fn); window.removeEventListener('offline', fn); };
};

export function RailAccount({ profileOpen, settingsOpen, onOpenProfile, onOpenView, onSettings }: {
  /** The Profile is the open screen. */
  profileOpen: boolean;
  /** Settings is the open screen. */
  settingsOpen: boolean;
  onOpenProfile: () => void;
  /** Open one of the person's own screens (Note, My Elements, Calendar). */
  onOpenView: (view: string) => void;
  onSettings: () => void;
}) {
  const { t } = useI18n();
  const { user, profile, signOut } = useAuthContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = profile?.display_name || user?.email?.split('@')[0] || null;
  const avatarUrl = profile?.avatar_url;
  const me = useMemo(() => ({ name, avatar_url: avatarUrl }), [name, avatarUrl]);
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const cell = 'flex size-10 items-center justify-center rounded-md transition-colors';
  const label = `${name ?? t('Profile')} — ${online ? t('Online') : t('Offline')}`;
  return (
    <div className="mt-auto flex flex-col items-center gap-1">
      <button type="button" onClick={onSettings} title={t('Settings')} aria-label={t('Settings')}
        aria-current={settingsOpen ? 'page' : undefined}
        className={`${cell} ${settingsOpen ? 'bg-sidebar-accent text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'}`}>
        <Settings size={18} />
      </button>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-haspopup="menu" aria-current={profileOpen ? 'page' : undefined} title={label} aria-label={label}
            className={`${cell} ${profileOpen ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'}`}>
            <span className="relative">
              <WorkerAvatar worker={me} size={26} />
              <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--sidebar)]"
                style={{ background: online ? 'var(--status-success)' : 'var(--text-tertiary)' }} />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent aria-label={t('Profile')} side="right" align="end" sideOffset={8} className="w-auto border-0 bg-transparent p-0 shadow-none">
          <ProfileMenu
            name={name ?? ''}
            email={user?.email ?? ''}
            avatar={<WorkerAvatar worker={me} size={32} />}
            onOpenProfile={() => { setMenuOpen(false); onOpenProfile(); }}
            items={[
              { id: 'note', label: t('Note'), icon: <NavNoteIcon size={16} />, onSelect: () => { setMenuOpen(false); onOpenView('note'); } },
              { id: 'my-elements', label: t('My Elements'), icon: <NavMyTasksIcon size={16} />, onSelect: () => { setMenuOpen(false); onOpenView('my-elements'); } },
              { id: 'calendar', label: t('Calendar'), icon: <NavCalendarIcon size={16} />, onSelect: () => { setMenuOpen(false); onOpenView('calendar'); } },
              { id: 'settings', label: t('Settings'), icon: <Settings size={16} />, separated: true, onSelect: () => { setMenuOpen(false); onSettings(); } },
              { id: 'sign-out', label: t('Sign out'), icon: <LogOut size={16} />, onSelect: () => { setMenuOpen(false); void signOut(); } },
            ]}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
