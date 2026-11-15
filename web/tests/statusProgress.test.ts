import { describe, expect, it } from 'vitest';
import { progressForStatus, REOPENED_PROGRESS } from '@/Function/shared/statusProgress';

describe('progressForStatus', () => {
  it('takes work out of Done at 75 and leaves other moves alone', () => {
    expect(progressForStatus('in_progress', 'done')).toBe(100);
    expect(progressForStatus('done', 'todo')).toBeNull();
    expect(progressForStatus('done', 'in_progress')).toBe(REOPENED_PROGRESS);
    expect(progressForStatus('done', 'review')).toBe(REOPENED_PROGRESS);
    expect(progressForStatus('todo', 'in_progress')).toBeUndefined();
    expect(progressForStatus(undefined, 'in_progress')).toBeUndefined();
    expect(progressForStatus('done', 'cancelled')).toBeUndefined();
  });
});
