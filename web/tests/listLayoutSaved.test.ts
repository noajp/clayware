import { describe, expect, it } from 'vitest';
import { fromSavedLayout, toSavedLayout } from '@/Function/shared/listTable/savedLayout';

describe('saved list layouts', () => {
  const layout = { order: ['type', 'due_date'], visibleIds: ['due_date'], hiddenIds: ['assignee'], widths: { due_date: 120 }, sort: { id: 'due_date', direction: 'asc' as const } };

  it('reads back what it saved', () => {
    expect(fromSavedLayout(toSavedLayout(layout))).toEqual(layout);
  });

  it('leaves behind widths set under other bounds, and refuses what is not a layout', () => {
    const old = { ...(toSavedLayout(layout) as object), wv: 2 };
    expect(fromSavedLayout(old)).toEqual({ ...layout, widths: {} });
    expect(fromSavedLayout(null)).toBeNull();
    expect(fromSavedLayout([])).toBeNull();
    expect(fromSavedLayout({ order: [] })).toBeNull();
  });
});
