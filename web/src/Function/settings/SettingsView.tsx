'use client';

import { AutomationSettings } from '@/Function/automation/AutomationSettings';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Check } from '@/ui/icons';
import { ProfileSettings } from './ProfileSettings';
import { AccountSettings } from './AccountSettings';
import { CHART_PALETTES } from '@/Function/shared/chartPalette';
import { TypeSettings } from './TypeSettings';
import { StatusSettings } from './StatusSettings';
import { getCachedChartPalette, setCachedChartPalette, usePreference } from './preferencesStore';
import { applyCustomTheme, readCustomTheme } from './customTheme';
import { CustomThemeRows } from './CustomThemeRows';
import { OPTIONS as THEME_OPTIONS, FONT_SIZES, FONT_SIZE_KEY, DEFAULT_FONT_KEY, applyFontSize } from './appearanceOptions';
import { TeamSettings } from './TeamSettings';
import { ActivitySpaceSettings } from './ActivitySpaceSettings';
import { MemberSettings } from './MemberSettings';
import { NotificationSettings } from './NotificationSettings';
import { LabelSettings } from './LabelSettings';
import { ElementTemplateSettings } from './ElementTemplateSettings';
import { ConnectorsSettings } from '@/AIP/connectors/IntegrationsSettings';
import { ClaywareConnectPanel } from '@/AIP/connectors/ClaywareConnectPanel';
import { AssetRelayPanel } from '@/AIP/connectors/AssetRelayPanel';
import { HarnessesPanel } from '@/AIP/harness/HarnessesPanel';
import {
  SETTINGS_NAV, SETTINGS_ITEMS,
  useActiveSettingsSection, useSettingsRevealNonce,
  type SettingsNavItem,
} from './settingsNav';
import { useUserPreferences, type UserPreferences } from './useUserPreferences';
import { LanguageSelect } from '@/Function/i18n/LanguageSelect';
import { SettingsIsland, SettingRow, SelectRow, SegmentedRow, SegmentedControl, ToggleRow } from './SettingsControls';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { StrategySettings } from './StrategySettings';
import { PlanSettings } from './PlanSettings';

// =============================================================
// SettingsView — content pane only. The settings NAV lives in
// the AppSidebar (SettingsSidebarPanel); both share the settingsNav
// store.
//
// One nav row is one page: the page is headed by its name and a one-line
// description, on the island's own ground (bg-card, the sidebar's too) with
// the property islands a step off it, and everything it holds is stacked on it — nothing switches
// inside a page. A reveal (nav click / deep link / restore) opens the
// page at its top.
// =============================================================

/** One-line descriptions for the pages whose panels don't open with one
 *  of their own. */
const AREA_DESCRIPTIONS: Record<string, string> = {
  preferences: 'Language, appearance, and defaults for how Clayware works for you.',
  harnesses: 'How AI carries out a kind of work: the goal, the steps, where it stops and asks, the shape of the result and the connectors it uses.',
  connectors: 'The outside services AI can use when it works in this Space.',
  automation: 'The work that runs by itself — open one to see and change its flow.',
  api: 'Let other AI tools and scripts read and update this Space as you, within your permissions.',
  assets: 'A local app or AI adds one line to its backend and announces itself here. It is recognized when an owner accepts it; from then on what it does is recorded in this Space.',
};

export function SettingsView() {
  const section = useActiveSettingsSection();
  const nonce = useSettingsRevealNonce();
  const scrollRef = useRef<HTMLDivElement>(null);

  // A reveal starts the page at its top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [nonce]);

  const renderArea = (item: SettingsNavItem) => {
    switch (item.id) {
      case 'preferences': return <PreferencesPanel />;
      case 'profile': return <ProfileSettings />;
      case 'notifications': return <NotificationSettings />;
      case 'security': return <AccountSettings />;
      case 'strategy': return <StrategySettings />;
      case 'element-types': return <TypeSettings kind="element" />;
      case 'element-labels': return <LabelSettings />;
      case 'element-templates': return <ElementTemplateSettings />;
      case 'objects': return <TypeSettings kind="object" />;
      case 'work-statuses': return <StatusSettings scope="work" />;
      case 'element-statuses': return <StatusSettings scope="element" />;
      case 'harnesses': return <HarnessesPanel />;
      case 'connectors': return <ConnectorsSettings />;
      case 'automation': return <AutomationSettings />;
      case 'workspace': return <ActivitySpaceSettings />;
      case 'members': return <MemberSettings />;
      case 'domain': return <TeamSettings />;
      case 'api': return <ClaywareConnectPanel />;
      case 'assets': return <AssetRelayPanel />;
      case 'plans': return <PlanSettings />;
      default: return null;
    }
  };

  const item = SETTINGS_ITEMS[section] ?? SETTINGS_NAV[0].items[0];
  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-card">
      <div className={`mx-auto px-10 py-10 ${item.id === 'automation' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <AreaShell key={item.id} item={item} description={AREA_DESCRIPTIONS[item.id]}>
          {renderArea(item)}
        </AreaShell>
      </div>
    </div>
  );
}

// =============================================================
// Area shell — the page's heading: its icon, name and one-line description
// above its body (the heading sits outside the islands).
// =============================================================
function AreaShell({
  item, description, children,
}: {
  item: SettingsNavItem; description?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const Icon = item.icon;
  const title = t(item.title ?? item.label);
  return (
    <section data-settings-area={item.id} aria-label={title}>
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/80 text-foreground/85">
            <Icon size={16} />
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
        {description && (
          <p className="mt-2 text-[13px] text-muted-foreground">{t(description)}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// =============================================================
// Preferences — General persists to `user_preferences` (owner-scoped)
// via useUserPreferences; Theme, Font size and Chart colors are
// device-local (next-themes / localStorage). Every row here is read
// somewhere in the app. Its heading is the area shell's — the panel
// itself starts at its islands.
// =============================================================
function PreferencesPanel() {
  const { t } = useI18n();
  const { preferences, error, savePreference } = useUserPreferences();

  // Real Theme + Font size, wired to next-themes and the UI-zoom store.
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [fontKey, setFontKey] = useState(DEFAULT_FONT_KEY);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of stored prefs after mount
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(FONT_SIZE_KEY);
      if (saved && FONT_SIZES.some((f) => f.key === saved)) setFontKey(saved);
    } catch { /* ignore */ }
  }, []);

  const isCustom = theme === 'custom-dark' || theme === 'custom-light';
  const activeThemeValue = !mounted ? 'system' : isCustom ? 'custom' : (theme ?? 'system');
  const selectThemeValue = (value: string) => {
    if (value === 'custom') setTheme(applyCustomTheme(readCustomTheme()));
    else setTheme(value);
  };
  const chartPalette = usePreference(getCachedChartPalette);
  const activeChartPalette = CHART_PALETTES.find((p) => p.key === chartPalette) ?? CHART_PALETTES[0];
  const fontLabel = FONT_SIZES.find((f) => f.key === fontKey)?.label ?? 'Default';
  const setFontByLabel = (label: string) => {
    const f = FONT_SIZES.find((x) => x.label === label);
    if (!f) return;
    setFontKey(f.key);
    applyFontSize(f.scale);
    try { window.localStorage.setItem(FONT_SIZE_KEY, f.key); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="text-[12px] text-destructive px-1">
          {t("Couldn't save: {error}", { error })}
        </div>
      )}

      <SettingsIsland title={t('General')}>
        <SettingRow label={t('Language')} desc={t('Choose the language used across Clayware')}>
          <LanguageSelect field />
        </SettingRow>
        <SegmentedRow
          label={t('Default home view')}
          desc={t('Select which view to open when launching Clayware')}
          value={preferences.home_view}
          options={['My Elements', 'Inbox', 'Calendar']}
          onChange={(v) => savePreference('home_view', v as UserPreferences['home_view'])}
        />
        <SegmentedRow
          label={t('Display names')}
          desc={t('How names are shown across the interface')}
          value={preferences.display_names}
          options={['Full name', 'Short name', 'Username']}
          onChange={(v) => savePreference('display_names', v as UserPreferences['display_names'])}
        />
        <ToggleRow
          label={t('Convert text emoticons into emojis')}
          desc={t('Strings like :) will be converted to 🙂')}
          value={preferences.convert_emoticons}
          onChange={(v) => savePreference('convert_emoticons', v)}
        />
        <SegmentedRow
          label={t('Send comment on…')}
          desc={t('Which key press submits a comment')}
          value={preferences.send_comment_shortcut}
          options={['⌘+Enter', 'Enter']}
          onChange={(v) => savePreference('send_comment_shortcut', v as UserPreferences['send_comment_shortcut'])}
        />
      </SettingsIsland>

      <SettingsIsland title={t('Interface and theme')}>
        {/* Visual Theme Swatch Grid — 1-click surface preview for every theme */}
        <div className="px-5 py-4">
          <div className="mb-3">
            <div className="text-[13px] font-medium text-foreground">{t('Theme')}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{t('Match the system or pick a colour theme')}</div>
          </div>
          <div role="radiogroup" aria-label={t('Theme')} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {THEME_OPTIONS.map((opt) => {
              const selected = activeThemeValue === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectThemeValue(opt.value)}
                  className={`group flex flex-col items-start gap-1.5 rounded-[7px] border p-1.5 text-left transition-colors ${
                    selected
                      ? 'border-[var(--accent-default)] bg-[var(--accent-subtle)]/50'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 hover:border-[var(--border-default)] hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="relative flex h-9 w-full items-end justify-end overflow-hidden rounded-[4px] border border-[var(--border-subtle)] p-1"
                    style={
                      opt.split
                        ? { background: `linear-gradient(135deg, ${opt.split[0]} 50%, ${opt.split[1]} 50%)` }
                        : { backgroundColor: opt.swatch?.bg }
                    }
                  >
                    {opt.swatch && (
                      <span
                        className="h-5 w-3/4 rounded-[3px] border border-black/10"
                        style={{ backgroundColor: opt.swatch.island }}
                      />
                    )}
                    {selected && (
                      <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-[var(--accent-default)] text-white">
                        <Check size={9} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className={`w-full truncate px-0.5 text-[11.5px] font-medium ${selected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                    {t(opt.label)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {mounted && isCustom && <CustomThemeRows onTheme={setTheme} />}
        <SelectRow
          label={t('Font size')}
          desc={t('Adjust the size of text across the app')}
          value={fontLabel}
          options={FONT_SIZES.map((f) => f.label)}
          onChange={setFontByLabel}
        />
        <SettingRow label={t('Chart colors')} desc={t('The colors charts draw in, across the app')}>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1 sm:inline-flex" aria-hidden="true">
              {activeChartPalette.colors.slice(0, 4).map((c, idx) => (
                <span key={idx} className="size-2.5 rounded-full border border-black/10" style={{ backgroundColor: c }} />
              ))}
            </span>
            <SegmentedControl
              label={t('Chart colors')}
              value={activeChartPalette.label}
              options={CHART_PALETTES.map((p) => p.label)}
              onChange={(label) => { const p = CHART_PALETTES.find((x) => x.label === label); if (p) setCachedChartPalette(p.key); }}
            />
          </div>
        </SettingRow>
      </SettingsIsland>
    </div>
  );
}
