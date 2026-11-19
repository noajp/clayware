'use client';

import { AutomationSettings } from '@/Function/automation/AutomationSettings';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Check } from '@/ui/icons';
import { ProfileSettings } from './ProfileSettings';
import { AccountSettings } from './AccountSettings';
import { CHART_PALETTES } from '@/Function/shared/chartPalette';
import { TypeSettings } from './TypeSettings';
import { getCachedChartPalette, setCachedChartPalette, usePreference } from './preferencesStore';
import { OPTIONS as THEME_OPTIONS, FONT_SIZES, FONT_SIZE_KEY, DEFAULT_FONT_KEY, applyFontSize, POINTER_CURSOR_KEY } from './appearanceOptions';
import { TeamSettings } from './TeamSettings';
import { ActivitySpaceSettings } from './ActivitySpaceSettings';
import { MemberSettings } from './MemberSettings';
import { NotificationSettings } from './NotificationSettings';
import { LabelSettings } from './LabelSettings';
import { ElementTemplateSettings } from './ElementTemplateSettings';
import { IntegrationsSettings } from '@/AIP/connectors/IntegrationsSettings';
import {
  SETTINGS_NAV, SETTINGS_ITEMS,
  useActiveSettingsSection, useActiveSettingsTab, useSettingsRevealNonce,
  setActiveSettingsSection,
  type SettingsNavItem,
} from './settingsNav';
import { useUserPreferences, type UserPreferences } from './useUserPreferences';
import { LanguageSelect } from '@/Function/i18n/LanguageSelect';
import { SettingsIsland, SettingRow, SelectRow, SegmentedRow, SegmentedControl, ToggleRow, SettingsComingSoon } from './SettingsControls';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { InitiativeJudgementSettings, PhaseDefaultsSettings } from './StrategySettingsPanels';

// =============================================================
// SettingsView — content pane only. The settings NAV lives in
// the AppSidebar (SettingsSidebarPanel); both share the settingsNav
// store.
//
// One area per page: the area the nav names is the page, headed by its
// name and one-line description, on the page ground (bg-background) so
// the property islands float. A reveal (nav click / deep link / restore)
// switches the page and lands it at the top. Areas that subdivide (AI,
// API & access, Elements) swap their body behind an in-area segmented
// control; their per-area tab state lives here, seeded by reveals.
//
// Alcon's vocabulary replaces Linear's: Issues → Elements,
// Projects → Objects, Team(s) → Domain(s).
// =============================================================

/** One-line descriptions for the areas whose panels don't carry one of
 *  their own yet (redesign §7); the rest gain theirs as their panels
 *  convert in PR3/PR4a. */
const AREA_DESCRIPTIONS: Record<string, string> = {
  integrations: 'The harnesses Athena works by, and the services connected to this Space.',
  access: 'Tokens, endpoints and connected machines — the ways other tools work with Alcon.',
  automation: 'The work that runs by itself — open one to see and change its flow.',
  elements: 'Labels and templates for Elements, set per Domain.',
  preferences: 'Language, appearance, and defaults for how Alcon works for you.',
};

export function SettingsView() {
  const { t } = useI18n();
  const section = useActiveSettingsSection();
  const revealTab = useActiveSettingsTab();
  const nonce = useSettingsRevealNonce();
  const scrollRef = useRef<HTMLDivElement>(null);
  const handledNonce = useRef(-1);
  // Per-area in-area tab state, seeded by reveals. Segmented clicks
  // write here only.
  const [areaTabs, setAreaTabs] = useState<Record<string, string>>({});

  const tabFor = (item: SettingsNavItem): string | null => {
    if (!item.tabs) return null;
    const chosen = areaTabs[item.id];
    return chosen && item.tabs.some((x) => x.id === chosen) ? chosen : item.tabs[0].id;
  };

  // A reveal: seed the area's tab, and start the page at its top.
  useEffect(() => {
    if (handledNonce.current === nonce) return;
    handledNonce.current = nonce;
    const item = SETTINGS_ITEMS[section];
    if (item?.tabs && revealTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync reveal tab from settingsNav store
      setAreaTabs((prev) => (prev[section] === revealTab ? prev : { ...prev, [section]: revealTab }));
    }
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [nonce, section, revealTab]);

  const renderArea = (item: SettingsNavItem) => {
    switch (item.id) {
      case 'workspace': return <ActivitySpaceSettings />;
      case 'members': return <MemberSettings />;
      case 'integrations':
      case 'access': {
        const tab = tabFor(item);
        return (
          <>
            <AreaTabs item={item} value={tab} onChange={(next) => setAreaTabs((prev) => ({ ...prev, [item.id]: next }))} />
            <IntegrationsSettings tab={tab} />
          </>
        );
      }
      case 'automation': return <AutomationSettings />;
      case 'initiative': return <InitiativeJudgementSettings />;
      case 'phase': return <PhaseDefaultsSettings />;
      case 'domain': return <TeamSettings />;
      case 'objects': return <TypeSettings kind="object" />;
      case 'elements': {
        const tab = tabFor(item);
        return (
          <>
            <AreaTabs item={item} value={tab} onChange={(next) => setAreaTabs((prev) => ({ ...prev, [item.id]: next }))} />
            {tab === 'templates' ? <ElementTemplateSettings /> : tab === 'labels' ? <LabelSettings /> : <TypeSettings kind="element" />}
            <SlaPointerRow />
          </>
        );
      }
      case 'preferences': return <PreferencesPanel />;
      case 'profile': return <ProfileSettings />;
      case 'notifications': return <NotificationSettings />;
      case 'security': return <AccountSettings />;
      // Objects and the Sustainment/Connected stubs: one compact
      // placeholder island each (redesign §2.1).
      default: return <PlaceholderIsland title={t(item.label)} />;
    }
  };

  const item = SETTINGS_ITEMS[section] ?? SETTINGS_NAV[0].items[0];
  const group = SETTINGS_NAV.find((g) => g.items.some((i) => i.id === item.id));
  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-background">
      <div className={`mx-auto px-8 py-8 ${item.id === 'automation' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <AreaShell key={item.id} item={item} group={group ? t(group.title) : undefined} description={AREA_DESCRIPTIONS[item.id]}>
          {renderArea(item)}
        </AreaShell>
      </div>
    </div>
  );
}

// =============================================================
// Area shell — the page's heading: the nav group it sits in, the
// area's icon + name and one-line description above its body.
// =============================================================
function AreaShell({
  item, group, description, children,
}: {
  item: SettingsNavItem; group?: string; description?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const Icon = item.icon;
  return (
    <section data-settings-area={item.id} aria-label={t(item.label)}>
      <div className="mb-6">
        {group && <div className="text-[11.5px] font-medium text-muted-foreground/80">{group}</div>}
        <div className="mt-1.5 flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/80 text-foreground/85">
            <Icon size={16} />
          </span>
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.015em] text-foreground">{t(item.label)}</h1>
        </div>
        {description && (
          <p className="mt-2 text-[13px] text-muted-foreground">{t(description)}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** The in-area subdivision as a segmented control (redesign §2.3): it
 *  swaps only this area's body; the page and every other area stay put. */
function AreaTabs({
  item, value, onChange,
}: { item: SettingsNavItem; value: string | null; onChange: (tab: string) => void }) {
  const { t } = useI18n();
  const tabs = item.tabs!;
  const current = tabs.find((x) => x.id === value) ?? tabs[0];
  return (
    <div className="mb-5">
      <SegmentedControl
        label={t(item.label)}
        value={current.label}
        options={tabs.map((x) => x.label)}
        onChange={(label) => {
          const next = tabs.find((x) => x.label === label);
          if (next) onChange(next.id);
        }}
      />
    </div>
  );
}

/** A settings surface that has nothing to set yet, as one compact
 *  island: the coming-soon line is the island's only row. */
function PlaceholderIsland({ title }: { title: string }) {
  return (
    <SettingsIsland>
      <div className="px-5">
        <SettingsComingSoon title={title} />
      </div>
    </SettingsIsland>
  );
}

/** The risk thresholds (SLAs) have ONE home, under Strategy; this
 *  quiet row points there from Elements, in the shape the approval
 *  mode's pointer row set (redesign §2.4). */
function SlaPointerRow() {
  const { t } = useI18n();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
      <span className="font-medium text-foreground">{t('Risk thresholds')}</span>
      <span>{t('Set under Strategy')}</span>
      <button type="button" onClick={() => setActiveSettingsSection('initiative')}
        className="underline underline-offset-2 transition-colors hover:text-foreground">
        {t('Go to Strategy settings')}
      </button>
    </div>
  );
}

// =============================================================
// Preferences — the rich General + Interface/theme panel, and the pilot
// for the settings redesign's primitives: groups render as property
// islands, short enums as segmented controls, booleans on the shared
// Switch. The General group persists to `user_preferences`
// (owner_user-scoped) via useUserPreferences; Theme, Font size and
// pointer cursors are device-local (next-themes / localStorage); the
// App sidebar row is still a placeholder action. Its heading is the
// area shell's — the panel itself starts at its islands.
// =============================================================
function PreferencesPanel() {
  const { t } = useI18n();
  const { preferences, error, savePreference } = useUserPreferences();
  const [pointerCursors, setPointerCursors] = useState(false);

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
      const pointer = window.localStorage.getItem(POINTER_CURSOR_KEY) === '1';
      setPointerCursors(pointer);
      document.documentElement.dataset.pointerCursors = pointer ? '1' : '';
    } catch { /* ignore */ }
  }, []);

  const setPointerCursorsPersisted = (v: boolean) => {
    setPointerCursors(v);
    document.documentElement.dataset.pointerCursors = v ? '1' : '';
    try { window.localStorage.setItem(POINTER_CURSOR_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  };

  const activeThemeValue = mounted ? (theme ?? 'system') : 'system';
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
        <SettingRow label={t('Language')} desc={t('Choose the language used across Alcon')}>
          <LanguageSelect />
        </SettingRow>
        <SegmentedRow
          label={t('Default home view')}
          desc={t('Select which view to open when launching Alcon')}
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
        <SegmentedRow
          label={t('First day of the week')}
          desc={t('Used for date pickers')}
          value={preferences.first_day_of_week}
          options={['Monday', 'Sunday', 'Saturday']}
          onChange={(v) => savePreference('first_day_of_week', v as UserPreferences['first_day_of_week'])}
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
                  onClick={() => setTheme(opt.value)}
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
        <ToggleRow
          label={t('Use pointer cursors')}
          desc={t('Change the cursor to a pointer over interactive elements')}
          value={pointerCursors}
          onChange={setPointerCursorsPersisted}
        />
      </SettingsIsland>
    </div>
  );
}
