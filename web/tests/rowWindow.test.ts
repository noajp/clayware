import { describe, expect, it } from 'vitest';
import { splitRange, widenRange, windowRange } from '@/Function/shared/listTable/rowWindow';

describe('row window', () => {
  it('draws the rows in view and the overscan around them', () => {
    // 1000 rows of 40px from y=100; a 600px view scrolled to 4000, 200px overscan.
    expect(windowRange({ top: 100, rowHeight: 40, count: 1000, scrollTop: 4000, viewHeight: 600, overscan: 200 })).toEqual([92, 118]);
    // At the top nothing above is drawn.
    expect(windowRange({ top: 100, rowHeight: 40, count: 1000, scrollTop: 0, viewHeight: 600, overscan: 200 })).toEqual([0, 18]);
    // A section far below the view draws nothing; one far above neither.
    expect(windowRange({ top: 90000, rowHeight: 40, count: 50, scrollTop: 0, viewHeight: 600, overscan: 200 })).toEqual([0, 0]);
    expect(windowRange({ top: 0, rowHeight: 40, count: 50, scrollTop: 90000, viewHeight: 600, overscan: 200 })).toEqual([50, 50]);
    expect(windowRange({ top: 0, rowHeight: 40, count: 0, scrollTop: 0, viewHeight: 600 })).toEqual([0, 0]);
  });

  it('only grows while a row is in hand', () => {
    expect(widenRange([10, 30], [20, 50])).toEqual([10, 50]);
    expect(widenRange(undefined, [20, 50])).toEqual([20, 50]);
  });

  it('splits a range over a section’s Objects then Elements', () => {
    expect(splitRange([2, 7], 4, 10)).toEqual({ objects: [2, 4], elements: [0, 3] });
    expect(splitRange([6, 9], 4, 10)).toEqual({ objects: [4, 4], elements: [2, 5] });
    expect(splitRange([0, 3], 0, 10)).toEqual({ objects: [0, 0], elements: [0, 3] });
  });
});
