import { describe, expect, it } from 'vitest';
import { clampWidth, NAME_SPEC, tableLayout, widthSpec } from '@/Function/shared/listTable/columnWidths';

describe('column widths', () => {
  it('opens every column at one width and lets each grow to its kind’s most', () => {
    const ids = ['due_date', 'assignee', 'objects', 'type', 'activity'];
    expect(new Set(ids.map((id) => widthSpec({ id }).base)).size).toBe(1);
    expect(widthSpec({ id: 'cc:1', custom: { column_type: 'checkbox' } }).base).toBe(widthSpec({ id: 'objects' }).base);
    // The opening width is the least; the most depends on what the column holds.
    const date = widthSpec({ id: 'due_date' });
    const chips = widthSpec({ id: 'objects' });
    expect(clampWidth(10, date)).toBe(date.base);
    expect(date.max).toBeLessThan(chips.max);
    expect(clampWidth(900, chips)).toBe(chips.max);
  });

  it('gives Name whatever the columns leave of the view', () => {
    expect(tableLayout({ view: 1200, fixed: 92, columns: 400 })).toEqual({ name: 708, width: 1200 });
    // Narrower than everything: Name stays at its least and the table scrolls.
    expect(tableLayout({ view: 600, fixed: 92, columns: 400 })).toEqual({ name: NAME_SPEC.min, width: 92 + NAME_SPEC.min + 400 });
  });

  it('keeps the columns packed to the right when one is resized', () => {
    const before = tableLayout({ view: 1200, fixed: 92, columns: 400 });
    const after = tableLayout({ view: 1200, fixed: 92, columns: 340 });
    // Name takes the difference; the table still ends at the view's edge.
    expect(after.name).toBe(before.name + 60);
    expect(after.width).toBe(before.width);
  });
});

describe('column widths by language, density and kind', () => {
  it('lets a date grow further where it is written longer, and opens narrower in compact rows', () => {
    expect(widthSpec({ id: 'due_date' }, { locale: 'ja' }).max).toBeGreaterThan(widthSpec({ id: 'due_date' }, { locale: 'en' }).max);
    const compact = widthSpec({ id: 'assignee' }, { compact: true });
    const comfortable = widthSpec({ id: 'assignee' });
    expect(compact.base).toBeLessThan(comfortable.base);
    expect(compact.max).toBe(comfortable.max);
  });

  it('sets figures flush right and everything else from the left', () => {
    expect(widthSpec({ id: 'cc:n', custom: { column_type: 'number' } }).align).toBe('end');
    expect(widthSpec({ id: 'elements' }).align).toBe('end');
    expect(widthSpec({ id: 'due_date' }).align).toBeUndefined();
    expect(widthSpec({ id: 'cc:t', custom: { column_type: 'text' } }).align).toBeUndefined();
  });
});
