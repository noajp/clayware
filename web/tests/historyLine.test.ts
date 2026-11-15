import { describe, expect, it } from 'vitest';
import { historyLine, readableDetail, readHandovers, readStatusChange } from '@/Function/shared/historyLine';

const e = (id: string, kind: string, detail = '') => ({ id, kind, detail });
const shape = (items: ReturnType<typeof historyLine<ReturnType<typeof e>>>) =>
  items.map((i) => i.type === 'edits' ? `edits:${i.entries.map((x) => x.id).join('')}` : `${i.entry.id}${i.small ? 's' : ''}`);

describe('historyLine', () => {
  it('keeps what moves the work on the line and folds the details between', () => {
    expect(shape(historyLine([e('1', 'status'), e('2', 'renamed'), e('3', 'assigned'), e('4', 'moved'), e('5', 'description'), e('6', 'created')])))
      .toEqual(['1', 'edits:23', '4', '5s', '6']);
  });
  it('shows only where a field set again and again ended', () => {
    expect(shape(historyLine([
      e('1', 'status'), e('2', 'due', 'Due date → 2026-11-18'), e('3', 'due', 'Due date → 2026-11-15'),
      e('4', 'due', 'Start date → 2026-11-14'), e('5', 'assigned'), e('6', 'assigned'), e('7', 'created'),
    ]))).toEqual(['1', 'edits:2456', '7']);
  });
  it('folds a run at the very end', () => {
    expect(historyLine([e('1', 'due'), e('2', 'priority')])).toEqual([{ type: 'edits', id: 'edits:1', entries: [e('1', 'due'), e('2', 'priority')] }]);
  });
});

describe('readableDetail', () => {
  it('drops the midnight after a date', () => {
    expect(readableDetail('Start date → 2026-11-14 00:00:00+00')).toBe('Start date → 2026-11-14');
  });
});

describe('readStatusChange', () => {
  it('reads the trigger text', () => {
    expect(readStatusChange('in_progress → done')).toEqual(['in_progress', 'done']);
    expect(readStatusChange('— → todo')).toEqual(['—', 'todo']);
    expect(readStatusChange('Marked done by Claude')).toBeNull();
  });
});

describe('readHandovers', () => {
  const at = (id: string, kind: string, detail: string, author: string, min: number) =>
    ({ id, kind, detail, author, createdAt: new Date(2026, 10, 15, 9, min) });
  it('reads the first assignee and a swap by one person as hand-overs, and helpers as neither', () => {
    // Newest first, as the rail holds them.
    const entries = [
      at('5', 'assigned', 'Assigned Sato as collaborator', 'Sato', 30),
      at('4', 'assigned', 'Assigned Sato', 'Temp', 20),
      at('3', 'unassigned', 'Unassigned Temp', 'Temp', 19),
      at('2', 'assigned', 'Assigned Kato', 'Temp', 2),
      at('1', 'assigned', 'Assigned Temp', 'Temp', 1),
    ];
    const { handovers, absorbed } = readHandovers(entries);
    expect([...handovers]).toEqual([['1', { to: 'Temp' }], ['4', { from: 'Temp', to: 'Sato' }]]);
    expect([...absorbed]).toEqual(['3']);
    const items = historyLine(entries);
    expect(items.map((i) => i.type === 'edits' ? 'edits' : i.entry.id)).toEqual(['5', '4', '2', '1']);
    expect(items[1]).toMatchObject({ type: 'change', handover: { from: 'Temp', to: 'Sato' } });
  });
});
