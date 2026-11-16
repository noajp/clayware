'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { NOUN_KINDS, MAX_NOUN, cleanNouns, nounTable, pluralOf, renameNouns, type NounKey, type SpaceNouns } from '@/Function/i18n/spaceNouns';
import { saveSpaceNouns } from '@/hooks/spaceNouns';
import { NavStrategyIcon, NavObjectsIcon, NavMyTasksIcon } from '@/Frame/sidebar/NavIcons';
import { Button } from '@/ui/button';
import { FIELD, CARD_FLAT } from '@/shared/designTokens';
import { SettingsIsland } from './SettingsControls';

// Settings > Activity space > Names: what this Space calls Strategy, Object
// and Element. The page itself keeps the built-in names (tBuiltIn), so the
// row a name is typed into still says which thing it renames; the preview
// beside it reads the words as typed, before they are saved.

const ICONS = { strategy: NavStrategyIcon, object: NavObjectsIcon, element: NavMyTasksIcon } as const;
// Lines the preview shows: a sidebar's rows and a sentence from the product.
const SAMPLE_LINES = ['Add Elements to this Object', 'Each Strategy is carried out by Objects, and each Object by Elements.'] as const;

export function SpaceNounSettings({ spaceId, nouns, isOwner, onSaved }: {
  spaceId: string;
  nouns: SpaceNouns | undefined;
  isOwner: boolean;
  /** Re-reads the Space, so every screen holding its row has the names. */
  onSaved: () => Promise<void> | void;
}) {
  const { tBuiltIn: t, locale } = useI18n();
  const saved = useMemo(() => cleanNouns(nouns ?? {}), [nouns]);
  const [draft, setDraft] = useState<SpaceNouns>(saved);
  const [failed, setFailed] = useState(false);
  const savedKey = JSON.stringify(saved);
  // The saved names changed (here or elsewhere): the fields show them.
  const [shownKey, setShownKey] = useState(savedKey);
  if (shownKey !== savedKey) { setShownKey(savedKey); setDraft(saved); }

  const table = nounTable(draft);
  const named = (word: string) => renameNouns(word, table, locale);
  const anySet = Object.keys(cleanNouns(draft)).length > 0;

  // Saves run one after another, so a blur's save and the reset that
  // follows it land in the order they were asked for.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const last = useRef(savedKey);
  useEffect(() => { last.current = savedKey; }, [savedKey]);
  const save = (next: SpaceNouns) => {
    if (!isOwner) return;
    const key = JSON.stringify(cleanNouns(next));
    chain.current = chain.current.then(async () => {
      if (key === last.current) return;
      setFailed(false);
      try { await saveSpaceNouns(spaceId, next); last.current = key; await onSaved(); } catch { setFailed(true); }
    });
  };
  const set = (key: NounKey, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <SettingsIsland
      title={t('Names')}
      description={t('The words this Space uses for the three things its work is made of. Every label and sentence uses them; your data and what Athena reads keep the built-in names.')}
    >
      <div className="grid gap-6 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <form onSubmit={(e) => { e.preventDefault(); save(draft); }} className="min-w-0">
          <div className="grid grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
            <span />
            <span id="noun-singular" className="text-[12px] text-muted-foreground">{t('Singular')}</span>
            <span id="noun-plural" className="text-[12px] text-muted-foreground">{t('Plural')}</span>
            {NOUN_KINDS.map((k) => {
              const one = (draft[k.singular] ?? '').trim();
              return (
                <div key={k.singular} className="contents">
                  <span id={`noun-${k.singular}`} className="truncate text-[13px] font-medium text-foreground">{k.one}</span>
                  <input
                    value={draft[k.singular] ?? ''}
                    placeholder={k.one}
                    maxLength={MAX_NOUN}
                    disabled={!isOwner}
                    aria-labelledby={`noun-${k.singular} noun-singular`}
                    onChange={(e) => set(k.singular, e.target.value)}
                    onBlur={() => save(draft)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save(draft); } }}
                    autoComplete="off"
                    className={`h-8 w-full min-w-0 px-2.5 text-[13px] ${FIELD.base} bg-transparent text-foreground`}
                  />
                  <input
                    value={draft[k.plural] ?? ''}
                    placeholder={one ? pluralOf(one) : k.many}
                    maxLength={MAX_NOUN}
                    disabled={!isOwner}
                    aria-labelledby={`noun-${k.singular} noun-plural`}
                    onChange={(e) => set(k.plural, e.target.value)}
                    onBlur={() => save(draft)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save(draft); } }}
                    autoComplete="off"
                    className={`h-8 w-full min-w-0 px-2.5 text-[13px] ${FIELD.base} bg-transparent text-foreground`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
            {isOwner ? (
              <>
                {anySet && (
                  <Button type="button" variant="ghost" onClick={() => { setDraft({}); save({}); }}>
                    {t('Use the built-in names')}
                  </Button>
                )}
                {!anySet && <span className="text-[12px] text-muted-foreground">{t('Leave a field empty to keep the built-in name.')}</span>}
              </>
            ) : (
              <span className="text-[12px] text-muted-foreground">{t('Only the Space owner can change these.')}</span>
            )}
            {failed && <span role="alert" className="text-[12px] text-[var(--status-danger)]">{t('Could not save. Try again.')}</span>}
          </div>
        </form>

        <figure className={`${CARD_FLAT} min-w-0 p-2`} aria-label={t('Preview')}>
          <figcaption className="px-2 pb-1.5 pt-0.5 text-[11px] text-muted-foreground">{t('Preview')}</figcaption>
          <ul className="space-y-0.5">
            {([['strategy', 'Strategy'], ['object', 'Objects'], ['element', 'Elements']] as const).map(([icon, word]) => {
              const Icon = ICONS[icon];
              return (
                <li key={icon} className="flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-[13px] text-foreground">
                  <span className="shrink-0 text-muted-foreground"><Icon size={16} /></span>
                  <span className="truncate">{named(t(word))}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 space-y-1 border-t border-[var(--border-subtle)] px-2 pb-1 pt-2">
            {SAMPLE_LINES.map((line) => (
              <p key={line} className="text-[12px] leading-[18px] text-muted-foreground">{named(t(line))}</p>
            ))}
          </div>
        </figure>
      </div>
    </SettingsIsland>
  );
}
