'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { Check } from '@/ui/icons';
import type { ActionItem } from '@/Function/shared/ActionMenus';

// Which sections of a concept's page this person has hidden — a Vision's
// Artifacts, a Portfolio's Domains & Objects… Hidden from a section's own
// "…", shown again from the page's "…" beside its name. Kept in this
// browser, per kind of page, so hiding a section on one Portfolio hides it
// on every Portfolio.

const EVENT = 'clayware:section-visibility';
const storageKey = (page: string) => `clayware.hiddenSections.${page}`;
const EMPTY = '[]';

function read(page: string): string {
  try { return window.localStorage.getItem(storageKey(page)) ?? EMPTY; } catch { return EMPTY; }
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener); };
}

/** Pure. The hidden set after turning one section on or off. */
export function toggledSections(hidden: readonly string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}

function write(page: string, hidden: string[]) {
  try { window.localStorage.setItem(storageKey(page), JSON.stringify(hidden)); } catch { /* private window */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useHiddenSections(page: string) {
  const raw = useSyncExternalStore(subscribe, () => read(page), () => EMPTY);
  const hidden = useMemo(() => { try { return JSON.parse(raw) as string[]; } catch { return []; } }, [raw]);
  return {
    isHidden: (id: string) => hidden.includes(id),
    toggle: (id: string) => write(page, toggledSections(hidden, id)),
  };
}

/** The page "…"'s list of its sections: each checked while shown; choosing
 *  one hides or shows it. */
export function useSectionItems(page: string, sections: readonly { id: string; label: string }[]): ActionItem[] {
  const { isHidden, toggle } = useHiddenSections(page);
  return sections.map((s, i) => ({
    key: `section-${s.id}`,
    label: s.label,
    icon: <span className="flex size-3.5 items-center justify-center">{!isHidden(s.id) && <Check size={14} />}</span>,
    onSelect: () => toggle(s.id),
    separatorBefore: i === 0,
  }));
}
