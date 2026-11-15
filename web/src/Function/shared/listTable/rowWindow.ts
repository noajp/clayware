// A long list draws only the rows in and near the view. Every row of a list
// is the same height, so a section's rows that are not drawn are stood in
// for by one spacer above and one below the drawn ones, each as tall as the
// rows it replaces: the scrollbar, the section bands and every row's place
// stay exactly where they would be with all of them drawn.

/** Lists shorter than this draw every row: there is nothing to save. */
export const WINDOW_FROM = 80;
/** How far past the view, above and below, rows are kept drawn (px). */
const OVERSCAN = 600;
/** Rows a windowed list draws before it has measured where it is. */
export const FIRST_ROWS = 60;

export type RowRange = readonly [from: number, to: number];

/** Pure. Which of a section's `count` rows to draw: those from `from` up to
 *  (not including) `to` that fall within the view plus the overscan.
 *  `top` is where the section's first row would sit in the scrolled
 *  content; `scrollTop` and `viewHeight` are the scroller's. */
export function windowRange({ top, rowHeight, count, scrollTop, viewHeight, overscan = OVERSCAN }: {
  top: number; rowHeight: number; count: number; scrollTop: number; viewHeight: number; overscan?: number;
}): RowRange {
  if (count <= 0 || rowHeight <= 0) return [0, 0];
  const clamp = (n: number) => Math.max(0, Math.min(count, n));
  const from = clamp(Math.floor((scrollTop - overscan - top) / rowHeight));
  const to = clamp(Math.ceil((scrollTop + viewHeight + overscan - top) / rowHeight));
  return [from, Math.max(from, to)];
}

/** Pure. The range kept while a row is being dragged: it only grows, so
 *  the row in hand is never taken off the page under the pointer. */
export function widenRange(prev: RowRange | undefined, next: RowRange): RowRange {
  return prev ? [Math.min(prev[0], next[0]), Math.max(prev[1], next[1])] : next;
}

/** Pure. A section's rows split as they are listed — Objects, then Elements —
 *  for a range over the two together. */
export function splitRange(range: RowRange, objects: number, elements: number): { objects: RowRange; elements: RowRange } {
  const [from, to] = range;
  const cut = (n: number, max: number) => Math.max(0, Math.min(max, n));
  return {
    objects: [cut(from, objects), cut(to, objects)],
    elements: [cut(from - objects, elements), cut(to - objects, elements)],
  };
}
