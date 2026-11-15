// The history drawn as one line, the way a git graph is drawn: only what
// moves the work stands on the line (made, its status, a hand-over to someone
// else, moved, deleted, restored, its direction), and a request for approval
// branches off it until it is decided — approved, it comes back in. The
// newest point is the ring that stands for how the thing is now. The line is
// the thing's, not a person's: who did each change is the name on its point.
// Everything between — dates, people, the title, a word of the description —
// folds into one numbered point that opens to show it, and a field set
// several times in a row shows only where it ended.

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

/** Where a point sits: on the line itself, or on the branch a request for
 *  approval opens until it is decided. */
export type Lane = 'main' | 'branch';

/** What a point does to the branch: asks for approval (opens it, or asks
 *  again on it), is approved (the branch comes back into the line), is sent
 *  back (the work goes on on the branch), or is closed without approval. */
export type BranchRole = 'request' | 'approve' | 'sendBack' | 'close';

/** Pure. The records that only say through what a change was made ("Updated
 *  status — via Claude (MCP · OAuth)"), written just after the change itself:
 *  each is absorbed, and its "via …" goes to that change by the same person. */
export function readVia(entries: readonly Dated[]): { via: Map<string, string>; absorbed: Set<string> } {
  const via = new Map<string, string>();
  const absorbed = new Set<string>();
  entries.forEach((e, i) => {
    if (e.kind !== 'note') return;
    const m = /^(?:Updated|Created) .+ — via (.+)$/.exec(e.detail ?? '');
    if (!m) return;
    absorbed.add(e.id);
    // Newest first: the change it speaks for is the next older record of the same person.
    const change = entries.slice(i + 1).find((x) => x.kind !== 'note' && x.author === e.author);
    if (change && !via.has(change.id)) via.set(change.id, m[1]);
  });
  return { via, absorbed };
}

export type HistoryItem<E> =
  | { type: 'change'; entry: E; small: boolean; lane: Lane; handover?: Handover; role?: BranchRole; via?: string }
  | { type: 'edits'; id: string; entries: E[]; lane: Lane };

/** Pure. Each entry's lane and its part in a review, read oldest first:
 *  going In Review opens a branch; from there, Done brings it back into the
 *  line (approved) and anything short of Done keeps the work on it (sent
 *  back) until it is asked again; Cancelled closes it. Everything recorded
 *  while it is open sits on it. */
export function readBranches(entries: readonly Dated[]): Map<string, { lane: Lane; role?: BranchRole }> {
  const out = new Map<string, { lane: Lane; role?: BranchRole }>();
  let open = false;
  for (const e of [...entries].reverse()) {
    const change = e.kind === 'status' ? readStatusChange(e.detail ?? '') : null;
    if (change) {
      const [from, to] = change;
      if (to === 'review') { open = true; out.set(e.id, { lane: 'branch', role: 'request' }); continue; }
      if (open && to === 'done') { open = false; out.set(e.id, { lane: 'main', role: 'approve' }); continue; }
      if (open && to === 'cancelled') { open = false; out.set(e.id, { lane: 'branch', role: 'close' }); continue; }
      if (open && from === 'review') { out.set(e.id, { lane: 'branch', role: 'sendBack' }); continue; }
    }
    out.set(e.id, { lane: open ? 'branch' : 'main' });
  }
  return out;
}

/** Pure. Entries newest first, with each run of two or more details in a
 *  row folded into one item. */
export function historyLine<E extends Dated>(entries: readonly E[]): HistoryItem<E>[] {
  const { handovers, absorbed } = readHandovers(entries);
  const { via, absorbed: notes } = readVia(entries);
  const branches = readBranches(entries);
  const out: HistoryItem<E>[] = [];
  let run: E[] = [];
  let runLane: Lane = 'main';
  const flush = () => {
    run = settled(run);
    if (run.length === 1) {
      const through = via.get(run[0].id);
      out.push({ type: 'change', entry: run[0], small: true, lane: runLane, ...(through ? { via: through } : {}) });
    }
    else if (run.length > 1) out.push({ type: 'edits', id: `edits:${run[0].id}`, entries: run, lane: runLane });
    run = [];
  };
  for (const e of entries) {
    if (absorbed.has(e.id) || notes.has(e.id)) continue;
    const handover = handovers.get(e.id);
    const through = via.get(e.id);
    const { lane, role } = branches.get(e.id) ?? { lane: 'main' as Lane };
    if (!handover && !role && isSmallEdit(e.kind)) {
      if (run.length && runLane !== lane) flush();
      runLane = lane;
      run.push(e);
      continue;
    }
    flush();
    out.push({ type: 'change', entry: e, small: false, lane, ...(handover ? { handover } : {}), ...(role ? { role } : {}), ...(through ? { via: through } : {}) });
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
