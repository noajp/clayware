'use client';

import { useState } from 'react';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { CONTROL_WELL } from '@/shared/designTokens';
import { SettingRow } from './SettingsControls';
import { applyCustomTheme, normalizeHex, readCustomTheme, type CustomTheme } from './customTheme';

/** Under "Theme" while Custom is chosen: the accent, the backdrop and the
 *  contrast, each applied as it changes. */
export function CustomThemeRows({ onTheme }: { onTheme: (theme: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState<CustomTheme>(readCustomTheme);
  const change = (patch: Partial<CustomTheme>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onTheme(applyCustomTheme(next));
  };
  return (
    <>
      <SettingRow label={t('Accent')} desc={t('Buttons, links, selection and the follow check')}>
        <ColorField label={t('Accent')} value={value.accent} onChange={(accent) => change({ accent })} />
      </SettingRow>
      <SettingRow label={t('Background')} desc={t('The backdrop every surface is mixed from')}>
        <ColorField label={t('Background')} value={value.background} onChange={(background) => change({ background })} />
      </SettingRow>
      <SettingRow label={t('Contrast')} desc={t('How far apart surfaces and text sit')}>
        <div className="flex w-[200px] items-center gap-3">
          <input type="range" min={0} max={100} value={value.contrast} aria-label={t('Contrast')}
            onChange={(e) => change({ contrast: Number(e.target.value) })}
            className="h-1 flex-1 cursor-pointer accent-[var(--accent-default)]" />
          <span className="w-7 text-right text-[12px] tabular-nums text-muted-foreground">{value.contrast}</span>
        </div>
      </SettingRow>
    </>
  );
}

/** A colour: the swatch opens the system picker, the code can be typed. */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value.toUpperCase());
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setDraft(value.toUpperCase()); }
  const commit = () => {
    const hex = normalizeHex(draft);
    if (hex) onChange(hex); else setDraft(value.toUpperCase());
  };
  return (
    <div className={`flex h-7 w-[200px] items-center gap-2 rounded-md px-1.5 ${CONTROL_WELL}`}>
      <input type="color" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}
        className="h-4 w-4 shrink-0 cursor-pointer appearance-none overflow-hidden rounded border-none bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none" />
      <input type="text" value={draft} aria-label={`${label} hex`} spellCheck={false}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="min-w-0 flex-1 bg-transparent text-[12px] font-medium tabular-nums text-foreground focus:outline-none" />
    </div>
  );
}
