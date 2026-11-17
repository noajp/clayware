import { describe, expect, it } from 'vitest';
import { statusAfterDecision } from '@/ActivitySpace/execution/element/approvalDecision';

describe('statusAfterDecision', () => {
  it('moves an Element in review on by the decision', () => {
    expect(statusAfterDecision('review', 'approved')).toBe('done');
    expect(statusAfterDecision('review', 'changes_requested')).toBe('in_progress');
    expect(statusAfterDecision('review', 'rejected')).toBe('cancelled');
  });
  it('leaves a pending decision and an Element not in review alone', () => {
    expect(statusAfterDecision('review', 'pending')).toBeNull();
    expect(statusAfterDecision('in_progress', 'approved')).toBeNull();
    expect(statusAfterDecision(null, 'approved')).toBeNull();
  });
});
