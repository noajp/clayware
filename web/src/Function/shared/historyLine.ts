// The history drawn as one line, the way a git graph is drawn: only what
// moves the work stands on the line (made, its status, moved, deleted,
// restored, its direction), the newest as the ring that stands for how the
// thing is now. Everything between — dates, people, the title, a word of the
// description — folds into one numbered point that opens to show it, and a
// field set several times in a row shows only where it ended.

/** What moves the work; the rest is detail between those points. */
const LINE_KINDS = new Set(['created', 'status', 'moved', 'deleted', 'restored', 'direction']);

function isSmallEdit(kind: string): boolean {
  return !LINE_KINDS.has(kind);
}

/** Fields whose newest value replaces the ones set just before it. */
const REPLACED_KINDS = new Set(['renamed', 'description', 'priority', 'due', 'estimate']);

/** Pure. A run of details, newest first, without the values the same field
 *  held for a moment before it was set again (people are added one by one,
 *  so those all stay). */
function settled<E extends { kind: string; detail?: string }>(run: E[]): E[] {
  const seen = new Set<string>();
  return run.filter((e) => {
    if (!REPLACED_KINDS.has(e.kind)) return true;
    const field = e.kind === 'due' && e.detail?.startsWith('Start date') ? 'start' : e.kind;
    if (seen.has(field)) return false;
    seen.add(field);
    return true;
  });
}

export type HistoryItem<E> =
  | { type: 'change'; entry: E; small: boolean }
  | { type: 'edits'; id: string; entries: E[] };

/** Pure. Entries newest first, with each run of two or more details in a
 *  row folded into one item. */
export function historyLine<E extends { id: string; kind: string; detail?: string }>(entries: readonly E[]): HistoryItem<E>[] {
  const out: HistoryItem<E>[] = [];
  let run: E[] = [];
  const flush = () => {
    run = settled(run);
    if (run.length === 1) out.push({ type: 'change', entry: run[0], small: true });
    else if (run.length > 1) out.push({ type: 'edits', id: `edits:${run[0].id}`, entries: run });
    run = [];
  };
  for (const e of entries) {
    if (isSmallEdit(e.kind)) { run.push(e); continue; }
    flush();
    out.push({ type: 'change', entry: e, small: false });
  }
  flush();
  return out;
}

/** Pure. The two statuses of a status change as the database writes it
 *  ("in_progress → done"), or null when the text is something else. */
export function readStatusChange(detail: string): [from: string, to: string] | null {
  const m = /^([a-z_—]+) → ([a-z_—]+)$/.exec(detail.trim());
  return m ? [m[1], m[2]] : null;
}

/** Pure. A recorded value as one reads it: a date without the midnight the
 *  database writes after it. */
export function readableDetail(detail: string): string {
  return detail.replace(/(\d{4}-\d{2}-\d{2})[ T]00:00:00(?:\.0+)?(?:\+00(?::00)?|Z)?/g, '$1');
}
