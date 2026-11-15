// How wide each column of a list is, and how the table is laid out.
//
// Every column holds one kind of value, and the kind decides how wide it
// may be made: a date a little, a set of chips or a text much more.
// Every column opens at the same width (PITCH), so the headings stand
// evenly along the header, close together; a value longer than that ends
// in "…" (the whole of it is in the cell's menu or the Element). That
// width is also the least a column can be. Its edge can be dragged wider,
// up to its kind's most — past which it would only be air — and back; a
// width set by hand is kept.
//
// The table is laid out from the left and stays anchored there: the pinned
// mark, Name, each column at its own width, then the "+", with whatever
// room the view has left over empty at the far right. Every boundary
// belongs to the column on its left and is dragged like any other: left
// narrows that column, right widens it, the boundary stays under the
// pointer, everything after it moves along and nothing before it moves.
// Name is a column like the rest: it opens at its usual width and is
// dragged between its least and its most. When the columns need more than
// the view has, the table scrolls sideways: the title stays pinned and the
// columns slide under its edge, the leftmost first.

export interface WidthSpec {
  min: number;
  base: number;
  max: number;
  /** 'end' sets the header and the values flush right: figures are compared
   *  digit against digit. Everything else reads from the left. */
  align?: 'end';
  /** false when what the column holds fills whatever width it is given (a
   *  bar): there is nothing to fit it to, so it keeps its usual width. */
  fits?: false;
}

/** What the widths depend on besides the kind of value. */
export interface WidthEnv {
  /** The viewer's language: a date is "Nov 24" in one and "11月24日" in another. */
  locale?: string;
  /** Compact rows set their text smaller, so every column needs less. */
  compact?: boolean;
}

/** The width every column opens at, and the least it can be: one pitch for
 *  all of them, so their headings stand evenly along the header. */
const PITCH = 104;

const DATE: WidthSpec = { min: PITCH, base: PITCH, max: 160 };
/** A short date in the languages that write it with 月/日 or 월/일 marks, or
 *  with the month spelled after the day, runs wider than "Nov 24". */
const DATE_WIDE: WidthSpec = { min: PITCH, base: PITCH, max: 168 };
const PERSON: WidthSpec = { min: PITCH, base: PITCH, max: 240 };
const CHIPS: WidthSpec = { min: PITCH, base: PITCH, max: 320 };
const CHOICE: WidthSpec = { min: PITCH, base: PITCH, max: 220 };
const TEXT: WidthSpec = { min: PITCH, base: PITCH, max: 400 };
const NUMBER: WidthSpec = { min: PITCH, base: PITCH, max: 160, align: 'end' };
const CHECK: WidthSpec = { min: PITCH, base: PITCH, max: 104 };
const BAR: WidthSpec = { min: PITCH, base: PITCH, max: 240, fits: false };
const SIGNAL: WidthSpec = { min: PITCH, base: PITCH, max: 160 };
const COUNT: WidthSpec = { min: PITCH, base: PITCH, max: 120, align: 'end' };

/** The least of the title that always shows. The title is pinned: when the
 *  columns need more room than the view has, they scroll and slide under
 *  it at this edge, the leftmost first, and the title itself never gets
 *  narrower than this. */
export const TITLE_MIN = 320;

/** Name: the title, and the row's signals (comments, labels) beside it. Its
 *  least leaves the title its own least and a little for the signals; its
 *  most is as far as it can be dragged to read long titles. */
export const NAME_SPEC: WidthSpec = { min: TITLE_MIN + 80, base: 440, max: 800 };

const BUILTIN: Record<string, WidthSpec> = {
  due_date: DATE,
  assignee: PERSON,
  lead: PERSON,
  objects: CHIPS,
  labels: CHIPS,
  type: CHOICE,
  status: CHOICE,
  priority: CHOICE,
  progress: BAR,
  activity: SIGNAL,
  elements: COUNT,
};

const BY_FIELD_TYPE: Record<string, WidthSpec> = {
  date: DATE,
  person: PERSON,
  relation: CHIPS,
  multi_select: CHIPS,
  files: CHIPS,
  select: CHOICE,
  status: CHOICE,
  number: NUMBER,
  budget: NUMBER,
  progress: BAR,
  checkbox: CHECK,
  text: TEXT,
  url: TEXT,
  email: TEXT,
  phone: CHOICE,
};

/** How much of a comfortable row's width a compact one needs. */
const COMPACT = 0.9;

/** Pure. The width bounds of a column: by the kind of value it holds, the
 *  language its dates are written in, and how tight the rows are set. */
export function widthSpec(column: { id: string; custom?: { column_type?: string | null } | null }, env: WidthEnv = {}): WidthSpec {
  let spec = column.custom ? BY_FIELD_TYPE[column.custom.column_type ?? ''] ?? TEXT : BUILTIN[column.id] ?? CHOICE;
  if (spec === DATE && env.locale && !env.locale.startsWith('en')) spec = DATE_WIDE;
  if (!env.compact) return spec;
  // The most stays: it is a limit on air, not on what the text needs.
  return { ...spec, min: Math.round(spec.min * COMPACT), base: Math.round(spec.base * COMPACT) };
}

/** Pure. A width held to its bounds. */
export function clampWidth(width: number, spec: WidthSpec): number {
  return Math.max(spec.min, Math.min(spec.max, Math.round(width)));
}

/** Pure. The table's tracks for a view `view` px wide: Name at its width,
 *  the columns after it, and whatever the view has left over as an empty
 *  filler after the last of them. `fixed` is the pinned mark plus the "+";
 *  `columns` the data columns' sum. */
export function tableLayout({ view, fixed, columns, name }: { view: number; fixed: number; columns: number; name: number }): { filler: number; width: number } {
  const packed = fixed + name + columns;
  const filler = Math.max(0, view - packed);
  return { filler, width: packed + filler };
}
