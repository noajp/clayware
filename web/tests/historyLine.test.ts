import { describe, expect, it } from 'vitest';
import { historyLine, readStatusChange } from '@/Function/shared/historyLine';

const e = (id: string, kind: string) => ({ id, kind });

describe('historyLine', () => {
  it('folds a run of small edits and keeps a lone one as a point', () => {
    const items = historyLine([e('1', 'status'), e('2', 'renamed'), e('3', 'due'), e('4', 'assigned'), e('5', 'description'), e('6', 'created')]);
    expect(items.map((i) => i.type === 'edits' ? `edits:${i.entries.length}` : `${i.entry.id}${i.small ? 's' : ''}`))
      .toEqual(['1', 'edits:2', '4', '5s', '6']);
  });
  it('folds a run at the very end', () => {
    expect(historyLine([e('1', 'due'), e('2', 'priority')])).toEqual([{ type: 'edits', id: 'edits:1', entries: [e('1', 'due'), e('2', 'priority')] }]);
  });
});

describe('readStatusChange', () => {
  it('reads the trigger text', () => {
    expect(readStatusChange('in_progress → done')).toEqual(['in_progress', 'done']);
    expect(readStatusChange('— → todo')).toEqual(['—', 'todo']);
    expect(readStatusChange('Marked done by Claude')).toBeNull();
  });
});
