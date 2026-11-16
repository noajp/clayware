import { nounTable, type SpaceNouns } from './spaceNouns';

// The names the active Space gives Strategy, Object and Element, as the
// translator reads them. The shell sets them when the Space's row arrives
// (hooks/spaceNouns.ts); a copy per Space is kept in this browser, so the
// first paint after a reload already reads the Space's words.

const CACHE_PREFIX = 'clayware:space-nouns:';
const ACTIVE_KEY = 'clayware:active-space';

type Table = Record<string, string> | null;
let table: Table = readCachedTable();
const listeners = new Set<() => void>();

function readCached(spaceId: string | null): SpaceNouns | null {
  if (typeof window === 'undefined' || !spaceId) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + spaceId);
    return raw ? JSON.parse(raw) as SpaceNouns : null;
  } catch { return null; }
}

function readCachedTable(): Table {
  if (typeof window === 'undefined') return null;
  let spaceId: string | null = null;
  try { spaceId = window.localStorage.getItem(ACTIVE_KEY); } catch { /* storage may be disabled */ }
  return nounTable(readCached(spaceId));
}

/** The active Space's names (null: the built-in ones). */
export function getNounTable(): Table {
  return table;
}

export function subscribeNounTable(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Puts a Space's names in force, and keeps them for the next load. */
export function setSpaceNouns(spaceId: string, nouns: SpaceNouns | null): void {
  if (typeof window !== 'undefined') {
    try {
      if (nouns && Object.keys(nouns).length) window.localStorage.setItem(CACHE_PREFIX + spaceId, JSON.stringify(nouns));
      else window.localStorage.removeItem(CACHE_PREFIX + spaceId);
    } catch { /* storage may be disabled */ }
  }
  const next = nounTable(nouns);
  if (JSON.stringify(next) === JSON.stringify(table)) return;
  table = next;
  for (const l of listeners) l();
}

/** The names last seen for a Space, until its row arrives. */
export function cachedSpaceNouns(spaceId: string): SpaceNouns | null {
  return readCached(spaceId);
}
