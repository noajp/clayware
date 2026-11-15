// A list's layout — which columns show, in what order, how wide, and the
// sort — and the form it is saved in with the person's preferences.

import type { Json } from '@/types/database';

export interface ListSort {
  id: string;
  direction: 'asc' | 'desc';
}

export interface ListLayout {
  order: string[];
  visibleIds: string[];
  hiddenIds: string[];
  widths: Record<string, number>;
  sort: ListSort | null;
}

export function isSort(v: unknown): v is ListSort {
  if (!v || typeof v !== 'object') return false;
  const s = v as { id?: unknown; direction?: unknown };
  return typeof s.id === 'string' && (s.direction === 'asc' || s.direction === 'desc');
}

/** The version of the width bounds a saved layout's widths were set under. */
const WIDTHS_VERSION = 3;

/** Pure. A layout as it is saved with the person's preferences. */
export function toSavedLayout(snapshot: ListLayout): Json {
  return {
    order: snapshot.order,
    visible: snapshot.visibleIds,
    hidden: snapshot.hiddenIds,
    widths: snapshot.widths,
    sort: snapshot.sort ? { id: snapshot.sort.id, direction: snapshot.sort.direction } : null,
    wv: WIDTHS_VERSION,
  };
}

/** Pure. A saved layout read back, or null when it is not one. Widths set
 *  under other bounds are left behind; the rest still applies. */
export function fromSavedLayout(saved: unknown): ListLayout | null {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const v = saved as Record<string, unknown>;
  const ids = (x: unknown): string[] | null => (Array.isArray(x) ? x.filter((id): id is string => typeof id === 'string') : null);
  const visibleIds = ids(v.visible);
  if (!visibleIds) return null;
  const widths: Record<string, number> = {};
  if (v.wv === WIDTHS_VERSION && v.widths && typeof v.widths === 'object' && !Array.isArray(v.widths)) {
    for (const [id, w] of Object.entries(v.widths)) if (typeof w === 'number' && w > 0) widths[id] = w;
  }
  return { order: ids(v.order) ?? [], visibleIds, hiddenIds: ids(v.hidden) ?? [], widths, sort: isSort(v.sort) ? v.sort : null };
}

