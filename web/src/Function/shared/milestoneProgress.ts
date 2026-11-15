// How far a milestone has come: of the Elements of its Object due by its
// day, the share already done. Cancelled ones are not counted either way.
// A milestone with nothing due by it has not started.

interface ProgressElement {
  status?: string | null;
  due_date?: string | null;
  object_id?: string | null;
  objectIds?: string[];
}

/** Pure. 0..1. */
export function milestoneProgress(milestone: { object_id: string; date: string }, elements: readonly ProgressElement[]): number {
  let total = 0;
  let done = 0;
  for (const el of elements) {
    if (el.status === 'cancelled') continue;
    const inObject = el.object_id === milestone.object_id || (el.objectIds ?? []).includes(milestone.object_id);
    if (!inObject) continue;
    const due = el.due_date?.slice(0, 10);
    if (!due || due > milestone.date) continue;
    total += 1;
    if (el.status === 'done') done += 1;
  }
  return total === 0 ? 0 : done / total;
}
