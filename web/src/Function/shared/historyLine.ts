// The history drawn as one line, the way a git graph is drawn: every change
// is a point on the line, the newest is the ring that stands for how the
// thing is now, and a run of small rewrites (a title, a date, a word of the
// description) folds into one numbered point that opens to show them.

/** Rewrites of a field that do not change where the work stands. */
const SMALL_KINDS = new Set(['renamed', 'description', 'priority', 'due', 'estimate']);

function isSmallEdit(kind: string): boolean {
  return SMALL_KINDS.has(kind);
}

export type HistoryItem<E> =
  | { type: 'change'; entry: E; small: boolean }
  | { type: 'edits'; id: string; entries: E[] };

/** Pure. Entries newest first, with each run of two or more small edits in a
 *  row folded into one item. */
export function historyLine<E extends { id: string; kind: string }>(entries: readonly E[]): HistoryItem<E>[] {
  const out: HistoryItem<E>[] = [];
  let run: E[] = [];
  const flush = () => {
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
