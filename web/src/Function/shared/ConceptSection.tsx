'use client';

import { useState, type ReactNode } from 'react';
import { Plus, SlidersHorizontal } from '@/ui/icons';
import { DisclosureTriangle } from '@/Function/shared/DisclosureTriangle';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { FONT } from '@/shared/designTokens';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/ui/dropdown-menu';

// =============================================================
// A section of a concept's page that holds things added to it — a Vision's
// Artifacts and Portfolios, a Portfolio's Artifacts, Portfolios, Domains &
// Objects. One shape for all of them:
//
//   Title ▶ 3                                  [display] +
//   rows…            (empty: the heading alone)
//
// The title folds the section. "Display" picks which columns the rows show
// (kept in this browser per section); "+" adds — directly, or from a menu
// when there is more than one way.
// =============================================================

export interface SectionColumn { key: string; label: string }

const storageKey = (id: string) => `clayware.section.${id}`;

function readHidden(id: string, fallback: readonly string[]): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* private window */ }
  return new Set(fallback);
}

const HEADER_BUTTON = 'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground';

export function ConceptSection({
  id, title, count, columns = [], defaultHidden = [], addLabel, onAdd, addMenu, addAnchor, empty, children,
}: {
  /** Names the section in this browser's display settings. */
  id: string;
  title: string;
  count?: number;
  /** The columns "Display" can show or hide. */
  columns?: SectionColumn[];
  defaultHidden?: string[];
  /** What adding does, in words ("Add Artifact"): the "+" button's name. */
  addLabel: string;
  /** "+" adds at once. */
  onAdd?: () => void;
  /** "+" opens these `DropdownMenuItem`s instead. */
  addMenu?: ReactNode;
  /** Anchored under the header (a picker opened from "+"). */
  addAnchor?: ReactNode;
  /** Nothing is in it yet: no rows, and no "Display". */
  empty: boolean;
  /** The rows, told which columns to show. */
  children: (shows: (column: string) => boolean) => ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(id, defaultHidden));
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { window.localStorage.setItem(storageKey(id), JSON.stringify([...next])); } catch { /* private window */ }
    return next;
  });
  const canAdd = !!onAdd || !!addMenu;

  const addTrigger = (button: ReactNode) => addMenu ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">{addMenu}</DropdownMenuContent>
    </DropdownMenu>
  ) : button;

  return (
    <section className="relative w-full" aria-label={title}>
      <div className="mb-1 flex h-8 items-center gap-1">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex min-w-0 items-center gap-2 rounded-md text-foreground">
          <h2 className={`${FONT.lg} truncate text-foreground`}>{title}</h2>
          <DisclosureTriangle open={open} className="text-muted-foreground" />
        </button>
        {!!count && <span className="ml-1 text-[12px] tabular-nums text-muted-foreground">{count}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          {columns.length > 0 && !empty && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={t('Display')} title={t('Display')} className={HEADER_BUTTON}>
                  <SlidersHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{t('Show')}</DropdownMenuLabel>
                {columns.map((c) => (
                  <DropdownMenuCheckboxItem key={c.key} checked={!hidden.has(c.key)} className="text-[13px]"
                    onCheckedChange={() => toggle(c.key)} onSelect={(e) => e.preventDefault()}>
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canAdd && addTrigger(
            <button type="button" aria-label={addLabel} title={addLabel} onClick={onAdd} className={HEADER_BUTTON}>
              <Plus size={15} />
            </button>,
          )}
        </div>
      </div>
      {addAnchor}
      {/* Empty, the section is its heading alone: "+" is the way in. */}
      {open && !empty && <div className="-mx-2">{children((key) => !hidden.has(key))}</div>}
    </section>
  );
}
