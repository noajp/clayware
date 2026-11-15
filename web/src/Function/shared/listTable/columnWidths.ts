// How wide each column of a list is, and how the table is laid out.
//
// Every column holds one kind of value, and the kind decides its width: a
// date is a few characters, a person a face and a name, a set of chips more.
// Each kind has a least width, a usual one and a most (past it the column is
// only air, and a value longer than it ends in "…"). A column opens as wide
// as the widest thing in it — its values and its heading — held to those
// bounds, so the gap from one column to the next is the same everywhere;
// before that is measured, and for a column with nothing to measure (a
// bar), it is its usual width. That fitted width is also the least a column
// can be dragged to; dragged wider, it stops at its kind's most.
//
// The table is laid out left to right and stays anchored at its left edge:
// the pinned mark, Name, then each column at its own width, the "+" and, if
// the view is wider than all of that, an empty filler that takes the rest.
// Nothing to the left of a column moves when it is resized; the columns to
// its right shift, and the filler (or the horizontal scroll) takes up the
// change. Until Name has been sized it fills what the columns leave of the
// view, within its own bounds.

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

const DATE: WidthSpec = { min: 80, base: 104, max: 160 };
/** A short date in the languages that write it with 月/日 or 월/일 marks, or
 *  with the month spelled after the day, runs wider than "Nov 24". */
const DATE_WIDE: WidthSpec = { min: 92, base: 112, max: 168 };
const PERSON: WidthSpec = { min: 96, base: 136, max: 240 };
const CHIPS: WidthSpec = { min: 96, base: 160, max: 320 };
const CHOICE: WidthSpec = { min: 80, base: 112, max: 220 };
const TEXT: WidthSpec = { min: 96, base: 160, max: 400 };
const NUMBER: WidthSpec = { min: 64, base: 88, max: 160, align: 'end' };
const CHECK: WidthSpec = { min: 56, base: 72, max: 104 };
const BAR: WidthSpec = { min: 96, base: 128, max: 240, fits: false };
const SIGNAL: WidthSpec = { min: 72, base: 96, max: 160 };
const COUNT: WidthSpec = { min: 64, base: 80, max: 120, align: 'end' };

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

/** Pure. The widths the columns fit to: for each, the widest of
 *  what was measured in it now and — while the same rows are shown, as a
 *  long list scrolls through them — what was measured before. */
export function fittedWidths(
  measured: Record<string, number>,
  before: Record<string, number> | null,
  specFor: (id: string) => WidthSpec,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, w] of Object.entries(measured)) {
    const spec = specFor(id);
    if (spec.fits === false) continue;
    out[id] = clampWidth(Math.max(w, before?.[id] ?? 0), spec);
  }
  return out;
}
