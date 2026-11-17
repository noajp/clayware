import type { ApprovalState, ElementStatus } from '@/types/database';

/** Pure. Where a decision moves an Element: only one waiting In Review,
 *  and never for a decision still pending. */
export function statusAfterDecision(status: string | null | undefined, state: ApprovalState): ElementStatus | null {
  if (status !== 'review') return null;
  if (state === 'approved') return 'done';
  if (state === 'changes_requested') return 'in_progress';
  if (state === 'rejected') return 'cancelled';
  return null;
}
