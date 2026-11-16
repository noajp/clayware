import { describe, expect, it } from 'vitest';
import { elementStatusOf, elementStatusWrite, nextOrderIndex, stagesOf, statusOf, statusesByStage, type StatusRow } from '@/Function/shared/workStatus';

const row = (over: Partial<StatusRow>): StatusRow => ({ id: 'x', scope: 'work', stage: 'planned', builtin: false, name: 'X', icon: null, color: null, order_index: 1, ...over });

describe('work statuses', () => {
  it('lists every stage with its own status when the Space saved nothing', () => {
    const all = statusesByStage('work', []);
    expect(all.map((g) => g.stage)).toEqual(['backlog', 'planned', 'in_progress', 'completed', 'canceled']);
    expect(all.every((g) => g.statuses.length === 1 && g.statuses[0].id === null && g.statuses[0].builtin && g.statuses[0].nameIsLabel)).toBe(true);
    expect(statusesByStage('element', []).map((g) => g.stage)).toEqual(stagesOf('element').map((s) => s.stage));
  });

  it('puts a stage’s own status first, re-dressed, then the ones added in order', () => {
    const rows = [
      row({ id: 'b', name: 'Waiting on legal', order_index: 2 }),
      row({ id: 'a', name: 'Scoping', order_index: 1, icon: '🧭' }),
      row({ id: 'own', builtin: true, name: 'Ready', icon: 'lucide:flag', color: 'teal' }),
      row({ id: 'el', scope: 'element', stage: 'review', name: 'QA' }),
    ];
    const planned = statusesByStage('work', rows).find((g) => g.stage === 'planned')!;
    expect(planned.statuses.map((s) => [s.id, s.name, s.builtin])).toEqual([[null, 'Ready', true], ['a', 'Scoping', false], ['b', 'Waiting on legal', false]]);
    expect(planned.statuses[0]).toMatchObject({ rowId: 'own', icon: 'lucide:flag', color: 'teal', nameIsLabel: false });
    // One added without an icon wears its stage's.
    expect(planned.statuses[2].icon).toBe(stagesOf('work')[1].icon);
    expect(statusesByStage('element', rows).find((g) => g.stage === 'review')!.statuses.map((s) => s.name)).toEqual(['In Review', 'QA']);
  });

  it('reads the status a row stands in, falling back to its stage’s own', () => {
    const rows = [row({ id: 'a', name: 'Scoping' })];
    expect(statusOf('work', rows, 'planned', 'a').name).toBe('Scoping');
    // A status of another stage, or one that is gone, does not apply.
    expect(statusOf('work', rows, 'completed', 'a')).toMatchObject({ id: null, stage: 'completed' });
    expect(statusOf('work', rows, 'planned', 'gone')).toMatchObject({ id: null, stage: 'planned' });
    expect(statusOf('work', rows, null, null).stage).toBe('backlog');
  });

  it('adds a new status after the last of its stage', () => {
    expect(nextOrderIndex([row({ order_index: 3 }), row({ builtin: true, order_index: 9 }), row({ stage: 'backlog', order_index: 7 })], 'work', 'planned')).toBe(4);
    expect(nextOrderIndex([], 'work', 'planned')).toBe(1);
  });
});

describe('Element statuses', () => {
  const er = (over: Partial<StatusRow>): StatusRow => row({ scope: 'element', stage: 'review', ...over });
  it('an Element stands in the status named within its stage, else the stage own', () => {
    const rows = [er({ id: 'legal', name: 'Waiting on legal' })];
    expect(elementStatusOf(rows, { status: 'review', status_id: 'legal' })).toMatchObject({ id: 'legal', stage: 'review', name: 'Waiting on legal' });
    expect(elementStatusOf(rows, { status: 'review', status_id: null })).toMatchObject({ id: null, stage: 'review', name: 'In Review' });
    // A status of another stage does not apply.
    expect(elementStatusOf(rows, { status: 'done', status_id: 'legal' })).toMatchObject({ id: null, stage: 'done' });
  });
  it('an Element stage own status has no icon of its own: its designed mark draws it', () => {
    expect(elementStatusOf([], { status: 'in_progress' }).icon).toBeNull();
    expect(elementStatusOf([er({ id: 'x', icon: 'lucide:scale' })], { status: 'review', status_id: 'x' }).icon).toBe('lucide:scale');
  });
  it('a move is always written with its stage', () => {
    expect(elementStatusWrite({ id: 'legal', stage: 'review' })).toEqual({ status: 'review', status_id: 'legal' });
    expect(elementStatusWrite({ id: null, stage: 'done' })).toEqual({ status: 'done', status_id: null });
  });
});
