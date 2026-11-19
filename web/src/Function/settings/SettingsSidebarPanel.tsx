'use client';

import { useMemo, useState } from 'react';
import { Search, X } from '@/ui/icons';
import {
  SETTINGS_NAV,
  useActiveSettingsSection,
  setActiveSettingsSection,
  type SettingsNavItem,
} from './settingsNav';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { SidebarRow, SidebarSectionLabel } from '@/Function/shared/SidebarRow';


/** A page listed in the nav — opened on `tab` when the search matched one of its tabs. */
interface NavHit { item: SettingsNavItem; tab?: string }

// The Settings navigation rendered INSIDE the AppSidebar (it replaces the
// Activity Space tree while Settings mode is active). Settings is one page:
// selecting an item reveals its area (SettingsView scrolls it into view),
// and the highlighted row follows SettingsView's scroll-spy as the reader
// moves down the page.
export function SettingsSidebarPanel() {
  const { t } = useI18n();
  const stored = useActiveSettingsSection();
  const active = stored;
  const [query, setQuery] = useState('');

  // Search matches a page by its own label or by one of its tabs, so
  // "Labels" still finds Objects and Elements; picking such a hit opens
  // the page on that tab.
  const filtered = useMemo((): { title: string; items: NavHit[] }[] => {
    const q = query.trim().toLowerCase();
    const nav = SETTINGS_NAV;
    if (!q) return nav.map((s) => ({ title: s.title, items: s.items.map((item) => ({ item })) }));
    return nav
      .map((s) => ({
        title: s.title,
        items: s.items.flatMap((item): NavHit[] => {
          if (t(item.label).toLowerCase().includes(q)) return [{ item }];
          const tab = item.tabs?.find((x) => t(x.label).toLowerCase().includes(q));
          return tab ? [{ item, tab: tab.id }] : [];
        }),
      }))
      .filter((s) => s.items.length > 0);
  }, [query, t]);

  return (
    <div className="pt-1">
      <div className="pb-2.5">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/75" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search settings…')}
            aria-label={t('Search settings…')}
            className="h-[30px] w-full rounded-[6px] border border-[var(--border-subtle)] bg-[var(--surface-well)] pl-7 pr-7 text-[12.5px] text-foreground placeholder:text-muted-foreground/65 transition-colors hover:border-[var(--border-default)] focus:bg-[var(--accent-subtle)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('Clear')}
              className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">{t('No results.')}</p>
      ) : filtered.map((section) => (
        <div key={section.title} className="mb-3">
          <SidebarSectionLabel className="mb-0.5 mt-1">{t(section.title)}</SidebarSectionLabel>
          <div className="space-y-0.5">
            {section.items.map(({ item, tab }) => {
              const Icon = item.icon;
              return (
                <SidebarRow
                  key={item.id}
                  active={active === item.id}
                  icon={<Icon size={15} />}
                  label={t(item.label)}
                  meta={tab ? t(item.tabs!.find((x) => x.id === tab)!.label) : undefined}
                  onClick={() => setActiveSettingsSection(item.id, tab)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
