import { describe, expect, it } from 'vitest';
import { clampWidth, fittedWidths, NAME_SPEC, tableLayout, widthSpec } from '@/Function/shared/listTable/columnWidths';

describe('column widths', () => {
  it('sizes a column by the kind of value it holds', () => {
    expect(widthSpec({ id: 'due_date' }).base).toBeLessThan(widthSpec({ id: 'objects' }).base);
    expect(widthSpec({ id: 'cc:1', custom: { column_type: 'date' } })).toEqual(widthSpec({ id: 'due_date' }));
    expect(widthSpec({ id: 'cc:2', custom: { column_type: 'checkbox' } }).max).toBeLessThan(widthSpec({ id: 'objects' }).min + 10);
    expect(clampWidth(40, widthSpec({ id: 'due_date' }))).toBe(widthSpec({ id: 'due_date' }).min);
    expect(clampWidth(900, widthSpec({ id: 'objects' }))).toBe(widthSpec({ id: 'objects' }).max);
  });

  it('lets an unsized Name fill the view and a sized one leave a filler', () => {
    expect(tableLayout({ view: 1200, fixed: 92, columns: 400, name: null })).toEqual({ name: 708, filler: 0, width: 1200 });
    expect(tableLayout({ view: 1200, fixed: 92, columns: 400, name: 500 })).toEqual({ name: 500, filler: 208, width: 1200 });
    // Narrower than everything: no filler, the table scrolls.
    expect(tableLayout({ view: 600, fixed: 92, columns: 400, name: null })).toEqual({ name: NAME_SPEC.min, filler: 0, width: 92 + NAME_SPEC.min + 400 });
  });

  it('keeps everything left of a resized column where it was', () => {
    const before = tableLayout({ view: 1200, fixed: 92, columns: 400, name: 500 });
    const after = tableLayout({ view: 1200, fixed: 92, columns: 340, name: 500 });
    expect(after.name).toBe(before.name);
    expect(after.filler).toBe(before.filler + 60);
  });
});

describe('column widths by language, density and kind', () => {
  it('gives a date more room where it is written longer, and less in compact rows', () => {
    const en = widthSpec({ id: 'due_date' }, { locale: 'en' });
    const ja = widthSpec({ id: 'due_date' }, { locale: 'ja' });
    expect(ja.min).toBeGreaterThan(en.min);
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

describe('fitted widths', () => {
  const spec = (id: string) => widthSpec({ id });
  it('holds what was measured to the column’s bounds and leaves bars alone', () => {
    expect(fittedWidths({ objects: 129, due_date: 40, assignee: 900, progress: 300 }, null, spec)).toEqual({
      objects: 129,
      due_date: widthSpec({ id: 'due_date' }).min,
      assignee: widthSpec({ id: 'assignee' }).max,
    });
  });
  it('keeps the widest seen while the same rows scroll through', () => {
    expect(fittedWidths({ objects: 110 }, { objects: 129 }, spec)).toEqual({ objects: 129 });
    expect(fittedWidths({ objects: 110 }, null, spec)).toEqual({ objects: 110 });
  });
});
