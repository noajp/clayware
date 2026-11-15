// What a status change does to an Element's progress, so the mark follows:
// Done is 100, To Do and Backlog have not started, and work taken back out
// of Done picks up at 75 — most of it was done, and at 100 it would still
// read as finished. Any other change leaves progress as it is.

/** Where work taken back out of Done picks up. */
export const REOPENED_PROGRESS = 75;

const REOPENED_TO = new Set(['in_progress', 'review', 'blocked']);

/** Pure. The progress to write with a move from `from` to `to`: a number,
 *  null (not started), or undefined to leave it alone. */
export function progressForStatus(from: string | null | undefined, to: string | null | undefined): number | null | undefined {
  if (to === 'done') return 100;
  if (to === 'backlog' || to === 'todo') return null;
  if (from === 'done' && to && REOPENED_TO.has(to)) return REOPENED_PROGRESS;
  return undefined;
}
