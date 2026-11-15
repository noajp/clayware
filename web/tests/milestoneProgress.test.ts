import { describe, expect, it } from 'vitest';
import { milestoneProgress } from '@/Function/shared/milestoneProgress';

describe('milestoneProgress', () => {
  const m = { object_id: 'o1', date: '2026-11-30' };
  it('counts the done share of the Object’s Elements due by the day', () => {
    expect(milestoneProgress(m, [
      { object_id: 'o1', due_date: '2026-11-20', status: 'done' },
      { object_id: 'o2', objectIds: ['o1'], due_date: '2026-11-30T00:00:00', status: 'todo' },
      { object_id: 'o1', due_date: '2026-12-01', status: 'done' },
      { object_id: 'o1', due_date: '2026-11-10', status: 'cancelled' },
      { object_id: 'o2', due_date: '2026-11-10', status: 'done' },
      { object_id: 'o1', due_date: null, status: 'done' },
    ])).toBe(0.5);
  });
  it('is 0 with nothing due by it', () => {
    expect(milestoneProgress(m, [])).toBe(0);
  });
});
