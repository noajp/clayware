'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { iconNames } from '@/ui/icons/dynamic';
import { standardIconKey, useStandardIcons } from '@/ui/icons/standardIcons';
import { Search, Upload } from '@/ui/icons';
import { Button } from '@/ui/button';
import { generateIconDrafts } from '@/hooks/iconGeneration';
import { readSvgIcon, MAX_SVG_SOURCE } from './svgIcon';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { CLAYWARE_GLYPHS, ItemIcon } from './ItemIcon';
import {
  ITEM_COLORS, STANDARD_ICON_STROKE, glyphIcon, isPaletteColor, itemColor, lucideIcon, matchesSearch,
  parseItemIcon, readRecentEmoji, rememberEmoji,
} from './itemIconValue';

export interface ItemLook { icon: string | null; color: string | null }

type Tab = 'icons' | 'emoji' | 'custom';

interface EmojiRow { unicode: string; label: string; tags?: string[]; group?: number; order?: number }

/** The emoji groups the picker shows, in Unicode's order (skin tones and
 *  other components are left out). */
const EMOJI_GROUPS: [group: number, label: string][] = [
  [0, 'Smileys & Emotion'], [1, 'People & Body'], [3, 'Animals & Nature'], [4, 'Food & Drink'],
  [5, 'Travel & Places'], [6, 'Activities'], [7, 'Objects'], [8, 'Symbols'], [9, 'Flags'],
];

let emojiCache: Promise<EmojiRow[]> | null = null;
function loadEmoji(): Promise<EmojiRow[]> {
  emojiCache ??= import('emojibase-data/ja/compact.json')
    .then((m) => (m.default as EmojiRow[])
      .filter((e) => e.group !== undefined && e.group !== 2)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    .catch((e) => { emojiCache = null; throw e; });
  return emojiCache;
}

const PAGE = 400;

/** The custom-colour swatch before a colour is chosen: every swatch colour in a ring. */
const RAINBOW = `conic-gradient(${[...ITEM_COLORS.slice(2), ITEM_COLORS[2]].map((c) => c.hex).join(', ')})`;

/**
 * Picks an icon and a colour for a Strategy, Object, Element or status:
 * Clayware's own drawings and the standard set (tinted by the colour above
 * them), an emoji, or a drawing of one's own — an SVG file, or one Athena
 * draws from words. Nothing is saved here — `onChange` gets the new look.
 */
export function IconPicker({ value, onChange, children, defaultIcon, align = 'start' }: {
  value: ItemLook;
  onChange: (next: ItemLook) => void;
  children: ReactNode;
  /** The concept's own icon, shown on the "default" choice. */
  defaultIcon: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    const kind = parseItemIcon(value.icon)?.kind;
    return kind === 'emoji' ? 'emoji' : kind === 'svg' ? 'custom' : 'icons';
  });
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  const pick = (next: Partial<ItemLook>) => onChange({ ...value, ...next });

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setQuery(''); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} aria-label={t('Change icon')} className="w-[372px] p-0" onOpenAutoFocus={(e) => { e.preventDefault(); searchRef.current?.focus(); }}>
        <div className="flex items-center gap-4 border-b border-border px-3 pt-2" role="tablist">
          {(['icons', 'emoji', 'custom'] as const).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setQuery(''); }}
              className={`-mb-px border-b-2 px-0.5 pb-2 text-[13px] transition-colors ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {key === 'icons' ? t('Icons') : key === 'emoji' ? t('Emojis') : t('Custom')}
            </button>
          ))}
          <button type="button" onClick={() => { onChange({ icon: null, color: null }); setOpen(false); }}
            className="ml-auto pb-2 text-[12px] text-muted-foreground hover:text-foreground">
            {t('Reset')}
          </button>
        </div>

        {tab !== 'emoji' && <ColorRow value={value.color} onPick={(color) => pick({ color })} defaultIcon={defaultIcon} />}

        {tab !== 'custom' && (
          <label className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="text-muted-foreground" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'icons' ? t('Search icons…') : t('Search emoji…')}
              className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
        )}

        <div className="h-[300px] overflow-y-auto px-2 pb-2">
          {tab === 'icons'
            ? <IconGrid query={query} value={value} onPick={(icon) => { pick({ icon }); setOpen(false); }} />
            : tab === 'emoji'
              ? <EmojiGrid query={query} onPick={(icon) => { rememberEmoji(icon); pick({ icon }); setOpen(false); }} />
              : <CustomIcon value={value} onPick={(icon) => { pick({ icon }); setOpen(false); }} />}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColorRow({ value, onPick, defaultIcon }: { value: string | null; onPick: (color: string | null) => void; defaultIcon: ReactNode }) {
  const { t } = useI18n();
  const custom = value && !isPaletteColor(value) ? itemColor(value) : null;
  const swatch = 'flex size-6 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-popover transition-transform hover:scale-110 focus-visible:scale-110';
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
      <button type="button" aria-label={t('Default colour')} title={t('Default colour')} onClick={() => onPick(null)}
        className={`${swatch} bg-muted text-muted-foreground ${value ? '' : 'ring-2 ring-foreground/60'}`}>
        <span className="flex scale-75">{defaultIcon}</span>
      </button>
      {ITEM_COLORS.map((c) => (
        <button key={c.key} type="button" aria-label={t(c.label)} title={t(c.label)} onClick={() => onPick(c.key)}
          className={`${swatch} ${value === c.key ? 'ring-2 ring-foreground/60' : ''}`} style={{ background: c.hex }} />
      ))}
      <label title={t('Custom colour')} aria-label={t('Custom colour')}
        className={`${swatch} relative ml-auto cursor-pointer overflow-hidden border border-border ${custom ? 'ring-2 ring-foreground/60' : ''}`}
        style={{ background: custom ?? RAINBOW }}>
        <input type="color" value={custom ?? itemColor(ITEM_COLORS[0].key) ?? undefined} onChange={(e) => onPick(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function IconGrid({ query, value, onPick }: { query: string; value: ItemLook; onPick: (icon: string) => void }) {
  const { t } = useI18n();
  const tone = itemColor(value.color);
  const clayware = useMemo(() => CLAYWARE_GLYPHS.filter(([name]) => matchesSearch(query, name)), [query]);
  const icons = useStandardIcons();
  // Names the loaded set exports (old aliases of the same drawings dropped).
  const standard = useMemo(() => (icons ? iconNames.filter((name) => icons[standardIconKey(name)] && matchesSearch(query, name)) : []), [icons, query]);
  // How many of the standard set are shown, counted per search.
  const [paging, setPaging] = useState({ query, shown: PAGE });
  const shown = paging.query === query ? paging.shown : PAGE;
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setPaging((p) => ({ query, shown: (p.query === query ? p.shown : PAGE) + PAGE }));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [standard.length, query]);

  const cell = (key: string, icon: string, title: string, glyph: ReactNode) => (
    <button key={key} type="button" title={title} aria-label={title} onClick={() => onPick(icon)}
      className={`flex size-8 items-center justify-center rounded-[6px] text-muted-foreground hover:bg-[var(--surface-strong)] hover:text-foreground ${value.icon === icon ? 'bg-[var(--surface-strong)] text-foreground' : ''}`}
      style={tone ? { color: tone } : undefined}>
      {glyph}
    </button>
  );

  return (
    <>
      {clayware.length > 0 && <Section title="Clayware">
        {clayware.map(([name, Glyph]) => cell(`g-${name}`, glyphIcon(name), name, <Glyph size={16} />))}
      </Section>}
      {standard.length > 0 && <Section title={t('Standard')}>
        {icons && standard.slice(0, shown).map((name) => {
          const Icon = icons[standardIconKey(name)];
          return cell(`l-${name}`, lucideIcon(name), name, <Icon size={16} strokeWidth={STANDARD_ICON_STROKE} />);
        })}
      </Section>}
      {shown < standard.length && <div ref={sentinel} className="h-6" />}
      {clayware.length === 0 && standard.length === 0 && <Empty>{t('No icons match.')}</Empty>}
    </>
  );
}

function EmojiGrid({ query, onPick }: { query: string; onPick: (emoji: string) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<EmojiRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [recent] = useState(readRecentEmoji);
  useEffect(() => { loadEmoji().then(setRows, () => setFailed(true)); }, []);

  const matches = useMemo(() => (rows ?? []).filter((e) => matchesSearch(query, e.label, ...(e.tags ?? []))), [rows, query]);
  if (failed) return <Empty>{t('Could not load emoji.')}</Empty>;
  if (!rows) return <Empty>{t('Loading…')}</Empty>;

  const cell = (emoji: string, label: string, key: string) => (
    <button key={key} type="button" title={label} aria-label={label} onClick={() => onPick(emoji)}
      className="flex size-8 items-center justify-center rounded-[6px] text-[20px] leading-none hover:bg-[var(--surface-strong)]">
      {emoji}
    </button>
  );

  if (query.trim()) {
    return matches.length ? <Section title={t('Results')}>{matches.map((e) => cell(e.unicode, e.label, e.unicode))}</Section> : <Empty>{t('No emoji match.')}</Empty>;
  }
  return (
    <>
      {recent.length > 0 && <Section title={t('Frequently used')}>{recent.map((e) => cell(e, e, `r-${e}`))}</Section>}
      {EMOJI_GROUPS.map(([group, label]) => (
        <Section key={group} title={t(label)}>
          {rows.filter((e) => e.group === group).map((e) => cell(e.unicode, e.label, e.unicode))}
        </Section>
      ))}
    </>
  );
}

/** Why an SVG could not be kept, in words. */
function svgProblem(reason: 'empty' | 'invalid' | 'too-large', t: (k: string) => string): string {
  if (reason === 'invalid') return t('This file is not an SVG drawing.');
  if (reason === 'too-large') return t('This drawing is too detailed for an icon.');
  return t('Nothing in this file can be kept as an icon: only shapes are kept.');
}

/** A drawing of one's own: an SVG file, or drafts Athena draws from words. */
function CustomIcon({ value, onPick }: { value: ItemLook; onPick: (icon: string) => void }) {
  const { t } = useI18n();
  const tone = itemColor(value.color);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [slow, setSlow] = useState(false);
  const [drafts, setDrafts] = useState<{ name: string; icon: string }[]>([]);
  // Each request has a number; a stopped or superseded one is ignored when it answers.
  const run = useRef(0);
  useEffect(() => {
    if (!drawing) return;
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, [drawing]);
  const current = parseItemIcon(value.icon)?.kind === 'svg' ? value.icon : null;

  const upload = async (file: File | undefined) => {
    setProblem(null);
    if (!file) return;
    if (file.size > MAX_SVG_SOURCE) { setProblem(t('This drawing is too detailed for an icon.')); return; }
    const check = readSvgIcon(await file.text());
    if (!check.ok) { setProblem(svgProblem(check.reason, t)); return; }
    onPick(check.value);
  };
  const draw = async () => {
    const words = prompt.trim();
    if (!words || drawing) return;
    setProblem(null);
    setSlow(false);
    setDrawing(true);
    const mine = ++run.current;
    try {
      const drafted = await generateIconDrafts(words);
      if (mine !== run.current) return;
      const kept = drafted.flatMap((d) => {
        const check = readSvgIcon(d.svg);
        return check.ok ? [{ name: d.name, icon: check.value }] : [];
      });
      setDrafts(kept);
      if (!kept.length) setProblem(t('No icon came back. Try again, or describe it differently.'));
    } catch (e) {
      if (mine !== run.current) return;
      setProblem(e instanceof Error ? e.message : t('Could not draw the icon. Try again.'));
    } finally {
      if (mine === run.current) setDrawing(false);
    }
  };
  const stop = () => { run.current += 1; setDrawing(false); setSlow(false); };
  const cell = (icon: string, name: string, key: string) => (
    <button key={key} type="button" title={name} aria-label={name} onClick={() => onPick(icon)}
      className={`flex flex-col items-center gap-1.5 rounded-md px-1 py-2 text-muted-foreground hover:bg-accent hover:text-foreground ${value.icon === icon ? 'bg-accent' : ''}`}>
      <span className="flex" style={tone ? { color: tone } : undefined}><ItemIcon icon={icon} size={24} /></span>
      <span className="w-full truncate text-center text-[11px]">{name}</span>
    </button>
  );

  return (
    <div className="space-y-4 pt-3">
      <section className="px-1">
        <h3 className="pb-1.5 text-[12px] font-medium text-muted-foreground">{t('Ask Athenya')}</h3>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void draw(); }}>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={300}
            placeholder={t('e.g. a stamp of approval')} aria-label={t('Describe the icon')}
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:bg-muted/40" />
          {drawing
            ? <Button type="button" size="sm" variant="secondary" onClick={stop}>{t('Stop')}</Button>
            : <Button type="submit" size="sm" variant="secondary" disabled={!prompt.trim()}>{t('Draw')}</Button>}
        </form>
        {drawing && (
          <p role="status" className="pt-1.5 text-[12px] text-muted-foreground">
            {slow ? t('This is taking longer than usual.') : t('Drawing…')}
          </p>
        )}
        {drafts.length > 0 && (
          <div className="grid grid-cols-4 gap-1 pt-2" aria-label={t('Drafts from Athenya')}>{drafts.map((d, i) => cell(d.icon, d.name, `d-${i}`))}</div>
        )}
      </section>
      <section className="px-1">
        <h3 className="pb-1.5 text-[12px] font-medium text-muted-foreground">{t('Upload SVG')}</h3>
        <input ref={fileRef} type="file" accept=".svg,image/svg+xml" className="hidden"
          onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload size={14} />{t('Choose a file')}
        </Button>
        <p className="pt-1.5 text-[12px] text-muted-foreground">{t('Only the shapes are kept. The icon takes the colour chosen above.')}</p>
      </section>
      {problem && <p role="alert" className="px-1 text-[12px] text-[var(--status-danger-text)]">{problem}</p>}
      {current && (
        <section className="px-1">
          <h3 className="pb-1.5 text-[12px] font-medium text-muted-foreground">{t('Current')}</h3>
          <div className="grid grid-cols-4 gap-1">{cell(current, t('Current'), 'current')}</div>
        </section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-2.5">
      <h3 className="px-1 pb-1.5 text-[12px] font-medium text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-10 gap-0.5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">{children}</p>;
}

/**
 * The icon at the head of a concept page, which opens the picker when the
 * viewer may edit it. Saving is the caller's (`onChange`).
 */
export function ItemIconButton({ value, onChange, defaultIcon, size = 18, canEdit = true, label }: {
  value: ItemLook;
  onChange: (next: ItemLook) => void;
  defaultIcon: ReactNode;
  size?: number;
  canEdit?: boolean;
  label?: string;
}) {
  const { t } = useI18n();
  const icon = <ItemIcon icon={value.icon} color={value.color} fallback={defaultIcon} size={size} />;
  if (!canEdit) return icon;
  return (
    <IconPicker value={value} onChange={onChange} defaultIcon={defaultIcon}>
      <button type="button" aria-label={label ?? t('Change icon')} title={label ?? t('Change icon')}
        className="-m-1 rounded-[6px] p-1 outline-none transition-colors hover:bg-[var(--surface-strong)] focus-visible:bg-[var(--surface-strong)]">
        {icon}
      </button>
    </IconPicker>
  );
}

/**
 * A concept's look as shown, kept ahead of the save: the pick shows at once,
 * and goes back to the stored look if saving fails.
 */
export function useItemLook(stored: ItemLook, save: (next: ItemLook) => Promise<unknown>) {
  // The pick waits on top of the stored look it was made over; once the
  // stored look changes (saved, or changed elsewhere) the stored one shows.
  const base = `${stored.icon ?? ''}|${stored.color ?? ''}`;
  const [pending, setPending] = useState<{ base: string; look: ItemLook } | null>(null);
  const look = pending && pending.base === base ? pending.look : stored;
  const change = (next: ItemLook) => {
    setPending({ base, look: next });
    save(next).catch((e) => { console.error('Failed to save icon', e); setPending(null); });
  };
  return [look, change] as const;
}
