import { describe, expect, it } from 'vitest';
import { clampWidth, NAME_SPEC, tableLayout, widthSpec } from '@/Function/shared/listTable/columnWidths';

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
