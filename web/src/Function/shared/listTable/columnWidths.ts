// How wide each column of a list is, and how the table is laid out.
//
// Every column holds one kind of value, and the kind decides its width: a
// date is a few characters, a person a face and a name, a set of chips more.
// Each kind has a least width (below it the value cannot be read), a usual
// one (what a new column opens at) and a most (past it the column is only
// air). Dragging a column's edge moves within those.
//
// The table is laid out left to right and stays anchored at its left edge:
// the pinned mark, Name, then each column at its own width, the "+" and, if
// the view is wider than all of that, an empty filler that takes the rest.
// Nothing to the left of a column moves when it is resized; the columns to
// its right shift, and the filler (or the horizontal scroll) takes up the
// change. Until Name has been sized it fills what the columns leave of the
// view, within its own bounds.

export interface WidthSpec { min: number; base: number; max: number }

const DATE: WidthSpec = { min: 80, base: 104, max: 160 };
const PERSON: WidthSpec = { min: 96, base: 136, max: 240 };
const CHIPS: WidthSpec = { min: 96, base: 160, max: 320 };
const CHOICE: WidthSpec = { min: 80, base: 112, max: 220 };
const TEXT: WidthSpec = { min: 96, base: 160, max: 400 };
const NUMBER: WidthSpec = { min: 64, base: 88, max: 160 };
const CHECK: WidthSpec = { min: 56, base: 72, max: 104 };
const BAR: WidthSpec = { min: 96, base: 128, max: 240 };
const SIGNAL: WidthSpec = { min: 72, base: 96, max: 160 };
const COUNT: WidthSpec = { min: 64, base: 80, max: 120 };

/** Name: the title, and the row's signals beside it. */
export const NAME_SPEC: WidthSpec = { min: 240, base: 440, max: 1200 };

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
  checkbox: CHECK,
  text: TEXT,
  url: TEXT,
  email: TEXT,
  phone: CHOICE,
};

/** Pure. The width bounds of a column, by the kind of value it holds. */
export function widthSpec(column: { id: string; custom?: { column_type?: string | null } | null }): WidthSpec {
  if (column.custom) return BY_FIELD_TYPE[column.custom.column_type ?? ''] ?? TEXT;
  return BUILTIN[column.id] ?? CHOICE;
}

/** Pure. A width held to its bounds. */
export function clampWidth(width: number, spec: WidthSpec): number {
  return Math.max(spec.min, Math.min(spec.max, Math.round(width)));
}

/** Pure. The table's tracks for a view `view` px wide: Name's width (its set
 *  one, or until set, what the columns leave of the view, within its
 *  bounds), the filler after the last column, and the table's whole width.
 *  `fixed` is the pinned mark plus the "+"; `columns` the data columns' sum. */
export function tableLayout({ view, fixed, columns, name }: { view: number; fixed: number; columns: number; name: number | null }): { name: number; filler: number; width: number } {
  const n = name ?? clampWidth(view > 0 ? view - fixed - columns : NAME_SPEC.base, NAME_SPEC);
  const packed = fixed + n + columns;
  const filler = Math.max(0, view - packed);
  return { name: n, filler, width: packed + filler };
}
