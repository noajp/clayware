// The history drawn as one line, the way a git graph is drawn: only what
// moves the work stands on the line (made, its status, a hand-over to someone
// else, moved, deleted, restored, its direction), the newest as the ring that
// stands for how the thing is now. The line is the thing's, not a person's:
// who did each change is the name on its point. Everything between — dates, people, the title, a word of the
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

/** A hand-over: the work went to `to`, from `from` when someone gave it up
 *  for them. */
export interface Handover { from?: string; to: string }

/** Two records this close by the same person are one hand-over: taken off
 *  one, put on another. */
const HANDOVER_PAIR_MS = 5 * 60_000;

type Dated = { id: string; kind: string; detail?: string; author?: string; createdAt?: Date };

/** The assignee a person record names, or null for a reviewer or a
 *  collaborator (helping is not taking the work over). */
function assigneeName(e: Dated): string | null {
  const m = /^(?:Assigned|Unassigned) (.+)$/.exec(e.detail ?? '');
  if (!m || / as (?:reviewer|collaborator)$/.test(m[1])) return null;
  return m[1];
}

/** Pure. Which assignments hand the work over, read from the records oldest
 *  first: the first assignee when nobody had it, or someone put on just
 *  after someone else was taken off by the same person (that removal is the
 *  same hand-over, so it is absorbed). Returns the hand-overs by entry id and
 *  the ids absorbed. Read only over the records loaded, so a history longer
 *  than that starts counting from its oldest loaded record. */
export function readHandovers(entries: readonly Dated[]): { handovers: Map<string, Handover>; absorbed: Set<string> } {
  const handovers = new Map<string, Handover>();
  const absorbed = new Set<string>();
  const holders = new Set<string>();
  let lastOff: { entry: Dated; name: string } | null = null;
  for (const e of [...entries].reverse()) {
    const name = (e.kind === 'assigned' || e.kind === 'unassigned') ? assigneeName(e) : null;
    if (!name) continue;
    if (e.kind === 'unassigned') {
      holders.delete(name);
      lastOff = { entry: e, name };
      continue;
    }
    const paired = lastOff && lastOff.entry.author === e.author
      && Math.abs((e.createdAt?.getTime() ?? 0) - (lastOff.entry.createdAt?.getTime() ?? 0)) <= HANDOVER_PAIR_MS;
    if (paired && lastOff) {
      handovers.set(e.id, { from: lastOff.name, to: name });
      absorbed.add(lastOff.entry.id);
    } else if (holders.size === 0) {
      handovers.set(e.id, { to: name });
    }
    lastOff = null;
    holders.add(name);
  }
  return { handovers, absorbed };
}

export type HistoryItem<E> =
  | { type: 'change'; entry: E; small: boolean; handover?: Handover }
  | { type: 'edits'; id: string; entries: E[] };

/** Pure. Entries newest first, with each run of two or more details in a
 *  row folded into one item. */
export function historyLine<E extends Dated>(entries: readonly E[]): HistoryItem<E>[] {
  const { handovers, absorbed } = readHandovers(entries);
  const out: HistoryItem<E>[] = [];
  let run: E[] = [];
  const flush = () => {
    run = settled(run);
    if (run.length === 1) out.push({ type: 'change', entry: run[0], small: true });
    else if (run.length > 1) out.push({ type: 'edits', id: `edits:${run[0].id}`, entries: run });
    run = [];
  };
  for (const e of entries) {
    if (absorbed.has(e.id)) continue;
    const handover = handovers.get(e.id);
    if (!handover && isSmallEdit(e.kind)) { run.push(e); continue; }
    flush();
    out.push(handover ? { type: 'change', entry: e, small: false, handover } : { type: 'change', entry: e, small: false });
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
