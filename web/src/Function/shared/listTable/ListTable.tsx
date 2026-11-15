'use client';

import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DisclosureTriangle } from '@/Function/shared/DisclosureTriangle';
import { Plus } from '@/ui/icons';
import type { ClaywareObjectWithChildren, CustomColumnWithValues, ElementWithDetails, Worker } from '@/hooks/useSupabase';
import { reorderElements, reorderObjects, useElementCommentActivity, useElementBlockers, withCommentActivity } from '@/hooks/useSupabase';
import { type DependencyBlocker } from '@/Function/shared/element/dependencyReadiness';
import { displayIdOf } from '@/Function/shared/element/displayId';
import { DisplayIdChip } from '@/Function/shared/element/DisplayIdChip';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, pointerWithin, type DragEndEvent, type DragStartEvent, type DragMoveEvent, type CollisionDetection } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Json } from '@/types/database';
import { ObjectIcon } from '@/Frame/icons';
import { ElementProgressMark } from '@/Function/shared/ElementProgressMark';
import { getElementProgress } from '@/Function/shared/ElementProgressMark';
import { useListColumns, sortElements, NAME_COL_KEY, type ColumnId, type DataColumn, type ColumnEntity } from '@/Function/shared/listTable/useListColumns';
import { refreshAwaitingAnswers, useAwaitingAnswerElementIds } from '@/hooks/awaitingAnswerData';
import { useQuestionNotificationCount, useUnreadCommentElementIds } from '@/hooks/notificationData';
import { EMPTY_CUSTOM_COLUMNS, EMPTY_ELEMENT_TYPES, EMPTY_WORKERS, EMPTY_ELEMENT_IDS, type ElementUpdate, type ListSection, HEADER_DRAG_PREFIX, OBJECT_DRAG_PREFIX, ROW_ROUND_BASE, STICKY_TINT_HOVER, LEAD_CELL, LEAD_CELL_HOVER, signalsTrackWidth } from './shared';
import { FIRST_ROWS, WINDOW_FROM, splitRange, widenRange, windowRange, type RowRange } from './rowWindow';
import { clampWidth, fittedWidths, NAME_SPEC, tableLayout } from './columnWidths';

/** Runs `then` with what `find` returns as soon as it returns something: a
 *  row scrolled to is drawn a moment after the scroll, not with it. Gives up
 *  after a second and a half. */
function whenDrawn<T>(find: () => T | null, then: (found: T) => void, tries = 40): void {
  const found = find();
  if (found) then(found);
  else if (tries > 0) setTimeout(() => whenDrawn(find, then, tries - 1), 40);
}

/** How wide a cell's content is when nothing cuts it short. An inline box
 *  hugs what it holds (and reports what it hides); one that fills its cell
 *  is as wide as the things in it, first to last. */
function naturalWidth(content: HTMLElement): number {
  const hidden = Math.max(0, content.scrollWidth - content.clientWidth);
  if (getComputedStyle(content).display.startsWith('inline')) return content.getBoundingClientRect().width + hidden;
  const first = content.firstElementChild;
  const last = content.lastElementChild;
  if (!first || !last) return content.scrollWidth;
  return last.getBoundingClientRect().right - first.getBoundingClientRect().left + hidden;
}

// The widths each list's columns were last fitted to, so a list opened
// again starts from them instead of from the usual widths.
const FITTED = new Map<string, Record<string, number>>();
import { ElementRow } from './ElementRow';
import { reorderWithinSections } from './rowReorder';
import { ObjectRow } from './ObjectRow';
import { ColumnHeader, ResizeHandle, FieldsMenu } from './ColumnHeaderMenu';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { fieldDisplayLabel } from '@/Function/property/fieldModel';
import { useOptionalExplorerData } from '@/Function/shared/ExplorerDataContext';

// Build a type-scoped, pointer-first collision detector. Two reasons it's
// custom:
//  1) All three sortable kinds (column headers, Object rows, Element rows)
//     share ONE DndContext, so we first filter droppables to the same kind
//     as the active item — otherwise a dragged row could match a column
//     header that happened to be nearest.
//  2) For rows we resolve by the POINTER, not the dragged rect's centre.
//     closestCenter compares the full-height dragged rect's centre, which
//     near the list's bottom edge flips to the wrong row (and never lets you
//     target "below the last row"). `pointerWithin` picks the row the cursor
//     is literally inside; when the cursor is past the last row, we fall
//     back to closestCenter so it resolves to that last row (→ drop after).
//  `onPointer` is called with the live pointer so the edge calc in
//  onDragMove can use the cursor position too (Y for rows, X for columns).
function makeRowAwareCollision(onPointer: (x: number, y: number) => void): CollisionDetection {
  return (args) => {
    if (args.pointerCoordinates) onPointer(args.pointerCoordinates.x, args.pointerCoordinates.y);
    const activeId = String(args.active.id);
    const isCol = activeId.startsWith(HEADER_DRAG_PREFIX);
    const isObj = activeId.startsWith(OBJECT_DRAG_PREFIX);
    const droppableContainers = args.droppableContainers.filter((c) => {
      const id = String(c.id);
      if (isCol) return id.startsWith(HEADER_DRAG_PREFIX);
      if (isObj) return id.startsWith(OBJECT_DRAG_PREFIX);
      return !id.startsWith(HEADER_DRAG_PREFIX) && !id.startsWith(OBJECT_DRAG_PREFIX);
    });
    const scoped = { ...args, droppableContainers };
    // Columns drag horizontally — closestCenter reads best there.
    if (isCol) return closestCenter(scoped);
    // Rows: the row the cursor is literally inside.
    const within = pointerWithin(scoped);
    if (within.length > 0) return within;
    // Cursor outside every row (above the first / below the last): pick the
    // row whose vertical midpoint is nearest the cursor Y, so dragging into
    // the empty space below the list still resolves to the last row (→ the
    // edge calc then reads "after"). closestCenter would use the dragged
    // rect's centre here and jump to the wrong row.
    const py = args.pointerCoordinates?.y;
    if (py == null) return closestCenter(scoped);
    let best: (typeof droppableContainers)[number] | null = null;
    let bestDist = Infinity;
    for (const c of droppableContainers) {
      const rect = args.droppableRects.get(c.id);
      if (!rect) continue;
      const dist = Math.abs(py - (rect.top + rect.height / 2));
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    return best ? [{ id: best.id }] : [];
  };
}

interface ListTableProps {
  /** Row height, from the list's Display settings. */
  density?: 'comfortable' | 'compact';
  sections: ListSection[];
  onSelectObject: (id: string) => void;
  onSelectElement?: (id: string) => void;
  /** When set, renders an "Add Object" footer row inside each section. */
  onAddObject?: () => void;
  /** When set, renders a `+` button on the right of every section header
   *  (and the legacy "Add Element" footer row). The section is passed so
   *  callers can route the add to the right Object (or Domain-direct for
   *  the synthetic `__domain__` section). */
  onAddElement?: (section?: ListSection) => void;
  /** Hide the section header row entirely (still groups items underneath). */
  hideSectionHeaders?: boolean;
  /** localStorage key for the element column visibility set. Distinct keys
   *  let Domain root and per-Object views remember their own column choice. */
  colStorageKey?: string;
  /** User-defined columns (custom Properties) — Notion-style. When passed, they render
   *  to the right of the built-in columns and stay in sync with the
   *  Element detail panel via `custom_column_values`. */
  customColumns?: CustomColumnWithValues[];
  /** View-specific built-in columns injected into the catalogue (e.g. My
   *  Elements' "Objects" column). Pass a stable array reference. */
  extraColumns?: DataColumn[];
  /** Column ids visible by default for this view (overrides the global
   *  default). Pass a stable array reference. */
  defaultVisibleColumns?: ColumnId[];
  /** Which entity these rows are — picks the built-in column set + default
   *  visibility ('element' Type/Due/Assignee vs 'object' Type/Due/Lead/
   *  Progress/Elements). Defaults to 'element'. */
  entity?: ColumnEntity;
  /** Domain-shared Element types — option list for the always-on `type`
   *  column. When non-empty and onElementUpdate is set, the cell is an
   *  editable dropdown; otherwise it renders read-only. */
  elementTypes?: string[];
  /** Add a brand-new Element type to the Domain catalogue (from the Type
   *  cell's chip-grid "+"). When omitted, the "+" is hidden. */
  onAddType?: (name: string) => void | Promise<void>;
  /** Remove an Element type from the Domain catalogue (TypeCell edit mode's
   *  per-chip "×"). When omitted, the footer Edit toggle is hidden. */
  onRemoveType?: (name: string) => void | Promise<void>;
  /** Save a custom-column value for an Element. Required when customColumns is set. */
  onCustomColumnValueChange?: (columnId: string, elementId: string, value: Json) => void | Promise<void>;
  /** Save a custom-column value for an Object. Required when the Domain
   *  Object list passes Domain-scoped customColumns. */
  onObjectCustomColumnValueChange?: (columnId: string, objectId: string, value: Json) => void | Promise<void>;
  /** Open the Add-Column modal from the column header's "+" button. When
   *  set, clicking "+" triggers this instead of the built-in toggle menu. */
  onEditColumn?: (column: CustomColumnWithValues) => void;
  onAddColumn?: (anchor?: DOMRect) => void;
  /** Inline-edit Element fields (status / priority / due_date) directly
   *  from list cells. When omitted the cells render read-only. */
  onElementUpdate?: (elementId: string, updates: ElementUpdate) => void | Promise<void>;
  /** Refresh the list after a change that isn't a plain field edit — e.g.
   *  adding/removing an assignee (a junction-table write). Wired to the host's
   *  data reload so the Assignee cell can reflect the new set. */
  onRefresh?: () => void | Promise<void>;
  /** Inline-edit Object fields (type / due_date / lead) directly from list
   *  cells. When omitted, those Object cells render read-only. */
  onObjectUpdate?: (objectId: string, updates: { type?: string | null; due_date?: string | null; lead_id?: string | null }) => void | Promise<void>;
  /** Assignable Workers for the Object Lead cell picker (resolve lead_id →
   *  name + the dropdown options). Pass a stable array reference. */
  objectWorkers?: Worker[];
  /** Unresolved `depends_on` upstreams per Element, keyed by Element id.
   *  Hosts that already fetch this to drive the Ready filter pass it down so
   *  the map is fetched once; when omitted the table fetches its own. */
  blockers?: Record<string, DependencyBlocker[]>;
  /** Multi-select state: ids of currently selected Elements. */
  selectedElementIds?: Set<string>;
  /** Click handler for an Element row that signals selection intent.
   *  - `single`  : Cmd/Ctrl-click — toggle this id only
   *  - `range`   : Shift-click — extend selection to this id from the
   *    most-recent anchor
   *  - `replace` : plain click while another is already selected —
   *    parent decides (typically clears + selects this) */
  onElementRowSelect?: (elementId: string, mode: 'single' | 'range' | 'replace', orderedIds?: string[]) => void;
  /** Multi-select state for Object rows — mirrors selectedElementIds. */
  selectedObjectIds?: Set<string>;
  /** Click handler for Object rows. Same modes/semantics as
   *  onElementRowSelect, just scoped to Object ids. */
  onObjectRowSelect?: (objectId: string, mode: 'single' | 'range' | 'replace', orderedIds?: string[]) => void;
}

/**
 * Unified ListView used wherever Objects / Elements are listed at any
 * hierarchy level. The markup is shared so the Domain Object list and the
 * per-Object item list look identical — column header, optional section
 * header (bold name + count + collapse chevron), Object rows (grip + name),
 * optional Element rows (priority/status/due in extra columns), and inline
 * "Add" footers.
 */
export function ListTable({
  sections,
  onSelectObject,
  onSelectElement,
  onAddObject,
  onAddElement,
  hideSectionHeaders = false,
  colStorageKey,
  customColumns = EMPTY_CUSTOM_COLUMNS,
  extraColumns,
  defaultVisibleColumns,
  entity = 'element',
  elementTypes = EMPTY_ELEMENT_TYPES,
  onAddType,
  onRemoveType,
  onCustomColumnValueChange,
  onObjectCustomColumnValueChange,
  onAddColumn,
  onEditColumn,
  onElementUpdate,
  onObjectUpdate,
  objectWorkers = EMPTY_WORKERS,
  onRefresh,
  blockers,
  selectedElementIds,
  onElementRowSelect,
  selectedObjectIds,
  onObjectRowSelect,
  density = 'comfortable',
}: ListTableProps) {
  const { t } = useI18n();
  const dndId = useId();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // The id column takes the width of the widest id drawn, so the status mark
  // and title start at one x down the whole list (9rem cap = the chip's
  // own max-w-36).
  const tableRef = useRef<HTMLTableElement | null>(null);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Single source of truth for column layout — visibility, order, width.
  // The hook persists each piece under `obj-list-cols:<key>:{visible,order,widths}`
  // and migrates the pre-existing visible-only entry once.
  const cols = useListColumns(colStorageKey, customColumns, {
    extraColumns,
    defaultVisible: defaultVisibleColumns,
    entity,
    density,
  });

  // Show Element-specific data columns only when at least one section
  // carries elements (otherwise the wide layout looks empty when listing
  // Objects only). Object-only views still get the Type column inline on
  // each Object row, so they never see the data-column band.
  // Memoised so the array reference is stable across the common re-render
  // trigger (an element edit changing `sections`) — required for the
  // memoised ElementRow below to actually skip unchanged rows.
  const visibleColumns = useMemo<DataColumn[]>(
    () => cols.visibleColumns,
    [cols.visibleColumns],
  );
  const visibleColumnIds = useMemo(
    () => visibleColumns.map((c) => c.id),
    [visibleColumns],
  );

  // Single source of truth for the on-screen order. Sorting is applied here
  // ONCE so the rendered rows, the range-select id lists, the drop-line edge
  // math, and the drag-end reorder all agree. (Computing it per-section in
  // the render map meant the displayed* refs — built from the raw section
  // arrays — disagreed with what was painted whenever a column sort was
  // active, putting the blue line on the wrong row.)
  // The rollup is fetched for the whole visible set and hung on each Element
  // before sorting, because sorting by Activity has to read it. The id list
  // comes from the unsorted sections — order never changes membership, and
  // taking it from the sorted ones would make the fetch depend on its own
  // result.
  const sectionElementIds = useMemo(
    () => sections.flatMap((s) => (s.elements ?? []).map((e) => e.id)),
    [sections],
  );
  const elementActivity = useElementCommentActivity(sectionElementIds);
  // The Objects column reads each Element's home Objects. Only some loaders
  // resolve them (My Elements); elsewhere they come from the explorer tree,
  // where an Element is listed under every Object it belongs to.
  const explorer = useOptionalExplorerData();
  const homesByElement = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const o of explorer?.objects ?? []) for (const e of o.elements ?? []) {
      const list = m.get(e.id) ?? [];
      if (!list.some((h) => h.id === o.id)) list.push({ id: o.id, name: o.name });
      m.set(e.id, list);
    }
    return m;
  }, [explorer?.objects]);
  const sortedSections = useMemo(
    () => sections.map((s) => ({
      ...s,
      objects: sortElements(s.objects ?? [], cols.sort, customColumns),
      elements: sortElements(
        withCommentActivity(s.elements ?? [], elementActivity).map((e) => (e.objects ? e : { ...e, objects: homesByElement.get(e.id) ?? [] })),
        cols.sort, customColumns),
    })),
    [sections, cols.sort, customColumns, elementActivity, homesByElement],
  );

  // Header-drag tracking — keeps the dragged column dim while it's in flight
  // so the user can see where it'll land.
  const [draggingColId, setDraggingColId] = useState<ColumnId | null>(null);
  // Row drag-and-drop state. Instead of shifting every row to make space
  // (transform on each <tr>, which paints slowly inside a table), we keep
  // rows STATIC and show two cheap things: a floating DragOverlay card that
  // follows the pointer (one GPU-composited element), and a blue insertion
  // line drawn on the row the drop would land against.
  const [activeRow, setActiveRow] = useState<{ kind: 'element' | 'object'; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);
  // Live pointer Y during a drag (fed by the collision detector). The
  // drop-line edge is decided by where the CURSOR sits relative to the
  // hovered row's midline — predictable, unlike the dragged rect's centre.
  const pointerYRef = useRef(0);
  const pointerXRef = useRef(0);
  // A column being dragged: the header it would land against, and on which
  // side — drawn as a vertical line, like the rows' horizontal one.
  const [colDrop, setColDrop] = useState<{ id: ColumnId; edge: 'before' | 'after' } | null>(null);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- Existing ListTable diagnostic retained during mechanical extraction.
  const collisionDetection = useMemo(
  // eslint-disable-next-line react-hooks/refs -- Existing ListTable diagnostic retained during mechanical extraction.
    () => makeRowAwareCollision((x, y) => { pointerXRef.current = x; pointerYRef.current = y; }),
    [],
  );

  // Stable callback singletons via a latest-ref. The row callbacks keep a
  // fixed identity across renders (so React.memo can skip), while always
  // invoking the freshest handler the parent passed. Capability booleans
  // preserve the "read-only when no handler" branches inside the row.
  const cbRef = useRef({ onElementUpdate, onSelectElement, onElementRowSelect, onCustomColumnValueChange, onObjectRowSelect, onSelectObject, onAddType, onRemoveType, onRefresh });
  // eslint-disable-next-line react-hooks/refs -- Existing ListTable diagnostic retained during mechanical extraction.
  cbRef.current = { onElementUpdate, onSelectElement, onElementRowSelect, onCustomColumnValueChange, onObjectRowSelect, onSelectObject, onAddType, onRemoveType, onRefresh };
  // Flattened element ids in DISPLAY order (across all sections) — one
  // source feeding both range-select (Shift-click fills the visible range)
  // and the comment-activity rollup, so the two can never disagree about
  // what "in view" means.
  const displayedElementIds = useMemo(
    () => sortedSections.flatMap((s) => (s.elements ?? []).map((e) => e.id)),
    [sortedSections],
  );
  const displayedIdsRef = useRef<string[]>([]);
  // eslint-disable-next-line react-hooks/refs -- Existing ListTable diagnostic retained during mechanical extraction.
  displayedIdsRef.current = displayedElementIds;
  // Dependency blockers come from the host when it already has them (it needs
  // the same map for the Ready filter); otherwise the table fetches its own.
  // Passing an empty id list is what keeps the second fetch from happening.
  const ownBlockers = useElementBlockers(blockers ? EMPTY_ELEMENT_IDS : displayedElementIds);
  const elementBlockers = blockers ?? ownBlockers;
  // Read here as well as in the rows: the table measures the rows' signals,
  // so it has to know when one of them changes.
  const awaitingAnswer = useAwaitingAnswerElementIds();
  const unreadComments = useUnreadCommentElementIds();
  // A question arriving in the Inbox is the moment a row starts to wait.
  const questionNotices = useQuestionNotificationCount();
  const seenQuestionNotices = useRef(questionNotices);
  useEffect(() => {
    if (seenQuestionNotices.current === questionNotices) return;
    seenQuestionNotices.current = questionNotices;
    refreshAwaitingAnswers();
  }, [questionNotices]);
  const displayedObjectIdsRef = useRef<string[]>([]);
  // eslint-disable-next-line react-hooks/refs -- Existing ListTable diagnostic retained during mechanical extraction.
  displayedObjectIdsRef.current = sortedSections.flatMap((s) => (s.objects ?? []).map((o) => o.id));
  const stableElementUpdate = useCallback((id: string, u: ElementUpdate) => cbRef.current.onElementUpdate?.(id, u), []);
  const stableRefresh = useCallback(() => cbRef.current.onRefresh?.(), []);
  const stableSelectElement = useCallback((id: string) => cbRef.current.onSelectElement?.(id), []);
  const stableRowSelect = useCallback((id: string, mode: 'single' | 'range' | 'replace') => cbRef.current.onElementRowSelect?.(id, mode, displayedIdsRef.current), []);
  const stableObjectRowSelect = useCallback((id: string, mode: 'single' | 'range' | 'replace') => cbRef.current.onObjectRowSelect?.(id, mode, displayedObjectIdsRef.current), []);
  const stableSelectObjectCb = useCallback((id: string) => cbRef.current.onSelectObject?.(id), []);
  const stableCustomColChange = useCallback((cid: string, eid: string, v: Json) => cbRef.current.onCustomColumnValueChange?.(cid, eid, v), []);
  const stableAddType = useCallback((name: string) => cbRef.current.onAddType?.(name), []);
  const canAddType = !!onAddType;
  const stableRemoveType = useCallback((name: string) => cbRef.current.onRemoveType?.(name), []);
  const canRemoveType = !!onRemoveType;
  const canUpdate = !!onElementUpdate;
  const canRowSelect = !!onElementRowSelect;
  const canObjectRowSelect = !!onObjectRowSelect;
  const hasSelection = (selectedElementIds?.size ?? 0) > 0 || (selectedObjectIds?.size ?? 0) > 0;
  // Stable handle to hasSelection for the rows' click logic — passing the
  // boolean directly would re-render all rows on the 0↔1 flip.
  const hasSelectionRef = useRef(hasSelection);
  // eslint-disable-next-line react-hooks/refs -- Existing ListTable diagnostic retained during mechanical extraction.
  hasSelectionRef.current = hasSelection;
  // Name column is always present. Every visible data column (Type, Due
  // date, Assignee, custom Properties) sits to the right of it in the order the
  // user chose. The trailing `+` cell is the column-management affordance.
  const totalDataColumns = 2 /* title + signals */ + visibleColumns.length;
  // Reserve a trailing "+ add column" slot whenever the parent wires up
  // either an element list (anyElements) or a column-creation handler
  // (onAddColumn — used by the Domain Object list).
  const hasTrailingCol = !!colStorageKey;

  // Resolve the dragged row's data for the floating overlay card.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- Existing ListTable diagnostic retained during mechanical extraction.
  const activeRowData = useMemo(() => {
    if (!activeRow) return null;
    for (const s of sections) {
      if (activeRow.kind === 'element') {
        const el = (s.elements ?? []).find((e) => e.id === activeRow.id);
        if (el) return { kind: 'element' as const, el };
      } else {
        const obj = (s.objects ?? []).find((o) => o.id === activeRow.id);
        if (obj) return { kind: 'object' as const, obj };
      }
    }
    return null;
  }, [activeRow, sections]);

  // Drag-to-reorder. PointerSensor with a small activation distance so a
  // click still selects / opens — only a real drag (>3px) starts a sort.
  // 3px is tight enough to feel immediate (the previous 6px made every
  // drag start with a noticeable "hitch") while still distinguishing a
  // genuine click. All three sortable contexts (header, object rows,
  // element rows) share this DndContext; the handler routes by id prefix.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith(HEADER_DRAG_PREFIX)) {
      setDraggingColId(id.slice(HEADER_DRAG_PREFIX.length));
    } else if (id.startsWith(OBJECT_DRAG_PREFIX)) {
      setActiveRow({ kind: 'object', id: id.slice(OBJECT_DRAG_PREFIX.length) });
    } else {
      setActiveRow({ kind: 'element', id });
    }
  };
  // Track the row the pointer is over and which edge the drop would land on,
  // so the blue line renders in the right place. Uses onDragMove (fires on
  // every move, unlike onDragOver which only fires when `over` changes) so
  // the edge flips live as the cursor crosses a row's midline — including
  // moving within the same row. The setState is a no-op when {id,edge} is
  // unchanged, so rows only re-render when the line actually moves. Columns
  // keep their own in-place feedback and are ignored here.
  const handleDragMove = (e: DragMoveEvent) => {
    const { active, over } = e;
    const a = String(active.id);
    if (a.startsWith(HEADER_DRAG_PREFIX)) {
      const o = over ? String(over.id) : null;
      if (!o || !o.startsWith(HEADER_DRAG_PREFIX) || o === a || !over?.rect) { setColDrop(null); return; }
      const id = o.slice(HEADER_DRAG_PREFIX.length);
      const edge = pointerXRef.current < over.rect.left + over.rect.width / 2 ? 'before' : 'after';
      setColDrop((prev) => (prev && prev.id === id && prev.edge === edge) ? prev : { id, edge });
      return;
    }
    if (!over) { setDropTarget(null); return; }
    const o = String(over.id);
    if (a === o) { setDropTarget(null); return; }
    const isObj = a.startsWith(OBJECT_DRAG_PREFIX);
    // Active and over must be the same row kind (object vs element).
    if (isObj !== o.startsWith(OBJECT_DRAG_PREFIX)) { setDropTarget(null); return; }
    // Edge is decided geometrically: compare the dragged row's current
    // (translated) center to the hovered row's center. Above the midline →
    // the line goes before the row; below → after. This needs no index
    // lookup, so it's immune to display-order vs raw-order drift.
    // Edge from the cursor: above the hovered row's midline → line before it,
    // below → after. Cursor-based so dropping past the last row's midpoint
    // (or below it entirely) reliably reads as "after the last row".
    const overRect = over.rect;
    let edge: 'before' | 'after' = 'after';
    if (overRect) {
      const overMid = overRect.top + overRect.height / 2;
      edge = pointerYRef.current < overMid ? 'before' : 'after';
    }
    setDropTarget((prev) => (prev && prev.id === o && prev.edge === edge) ? prev : { id: o, edge });
  };
  const handleDragCancel = () => {
    setDraggingColId(null);
    setColDrop(null);
    setActiveRow(null);
    setDropTarget(null);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const drop = colDrop;
    setDraggingColId(null);
    setColDrop(null);
    setActiveRow(null);
    setDropTarget(null);
    const activeId = String(active.id);
    // Column reorder: land on the side of the header the line was drawn on.
    // The new place is named by the visible column it now precedes (null =
    // last), so hidden columns keep their own places in the saved order.
    if (activeId.startsWith(HEADER_DRAG_PREFIX)) {
      if (!drop) return;
      const moving = activeId.slice(HEADER_DRAG_PREFIX.length);
      const rest = visibleColumnIds.filter((id) => id !== moving);
      const at = rest.indexOf(drop.id);
      if (at === -1) return;
      cols.moveColumn(moving, rest[drop.edge === 'before' ? at : at + 1] ?? null);
      return;
    }
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    // Object row reorder branch — scoped to within the section that holds
    // both rows; persisted to objects.order_index. Object ids carry the
    // `obj:` prefix so this branch only fires for drags between two
    // Object rows (header→header and element→element are caught above).
    if (activeId.startsWith(OBJECT_DRAG_PREFIX) && overId.startsWith(OBJECT_DRAG_PREFIX)) {
      const aId = activeId.slice(OBJECT_DRAG_PREFIX.length);
      const oId = overId.slice(OBJECT_DRAG_PREFIX.length);
      // Reorder against the DISPLAYED (sorted) order so the new order_index
      // matches where the user dropped, not the raw fetch order.
      const updates = reorderWithinSections(sortedSections.map((sec) => sec.objects ?? []), aId, oId);
      // A refused write rolls the rows back to where they were.
      if (updates) reorderObjects(updates).catch(err => console.error('Failed to reorder Objects:', err));
      return;
    }
    // Element row reorder branch — scoped to within the section that holds
    // both rows; persisted to elements.order_index (which the explorer RPC
    // sorts by). Element ids are raw UUIDs (no prefix).
    if (!activeId.startsWith(HEADER_DRAG_PREFIX) && !overId.startsWith(HEADER_DRAG_PREFIX) &&
        !activeId.startsWith(OBJECT_DRAG_PREFIX) && !overId.startsWith(OBJECT_DRAG_PREFIX)) {
      const updates = reorderWithinSections(sortedSections.map((sec) => sec.elements ?? []), activeId, overId);
      if (updates) reorderElements(updates).catch(err => console.error('Failed to reorder Elements:', err));
    }
  };

  // The table's layout (columnWidths): anchored at its left edge — the mark,
  // Name, each column at its own width, then the "+" track, which also takes
  // whatever the view has left over. Resizing a column moves nothing to its
  // left. Until Name is sized it fills what the columns leave of the view;
  // the first resize of anything fixes it at the width it is drawn at, so
  // from then on the slack goes to the end, not into Name.
  const nameFluid = !cols.isSized(NAME_COL_KEY);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [viewWidth, setViewWidth] = useState(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    ro.observe(el);
    // The observer reports with the next frame; the width is known now, and
    // a list opened in a tab not yet drawn would otherwise wait for it.
    queueMicrotask(() => setViewWidth(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  // The trailing "+" (which fields show) is one 28px button.
  const TRAILING_COL_WIDTH = 40;
  // A column not sized by hand is exactly as wide as the widest thing in
  // it — its values and its heading (columnWidths), measured off the rows
  // once they are drawn, below — so the columns sit as close as their
  // cells' padding allows. One sized by hand keeps the width it was given.
  const [fitted, setFitted] = useState<Record<string, number>>(() => (colStorageKey ? FITTED.get(colStorageKey) ?? {} : {}));
  const drawnWidth = (c: DataColumn) => (cols.isSized(c.id) ? cols.widthFor(c.id) : fitted[c.id] ?? cols.widthFor(c.id));
  const dataWidth = visibleColumns.reduce((sum, c) => sum + drawnWidth(c), 0);
  const fixedWidth = 52 + (hasTrailingCol ? TRAILING_COL_WIDTH : 0);
  // Name is pinned while the rest scrolls under it, so a set Name wider than
  // the pane would hide every column for good: it is drawn no wider than
  // leaves the first stretch of columns (up to 240px) in view, and its set
  // width comes back when the pane is wide enough again.
  const setName = nameFluid ? null : (viewWidth
    ? Math.min(cols.widthFor(NAME_COL_KEY), Math.max(NAME_SPEC.min, viewWidth - fixedWidth - Math.min(dataWidth, 240)))
    : cols.widthFor(NAME_COL_KEY));
  const layout = tableLayout({ view: viewWidth, fixed: fixedWidth, columns: dataWidth, name: setName });
  // Without a "+" track the leftover goes to Name.
  const nameWidth = hasTrailingCol ? layout.name : layout.name + layout.filler;
  const trailingWidth = TRAILING_COL_WIDTH + layout.filler;
  const freezeName = () => { if (nameFluid) cols.setWidth(NAME_COL_KEY, nameWidth); };
  const titleWidth = `calc(${nameWidth}px - var(--signals-w, 0px))`;

  // ─── Row window (rowWindow) ───────────────────────────────────────────────
  // A long list draws only the rows in and near the view; spacers stand in
  // for the rest. Where each section's rows sit is read off the page (its
  // top spacer's place), on every scroll and whenever the scroller or the
  // table changes size — which is also what a row added, removed, folded
  // away or set tighter does.
  const totalRows = useMemo(
    () => sortedSections.reduce((sum, sec) => sum + (collapsed.has(sec.id) ? 0 : sec.objects.length + (sec.elements?.length ?? 0)), 0),
    [sortedSections, collapsed],
  );
  const windowed = totalRows > WINDOW_FROM;
  const [rowHeight, setRowHeight] = useState(density === 'compact' ? 26 : 46);
  const [ranges, setRanges] = useState<Record<string, RowRange>>({});
  useEffect(() => {
    const scroller = scrollerRef.current;
    const table = tableRef.current;
    if (!scroller || !table || !windowed) return;
    // Read on the scroll itself, not a frame later: a frame is long enough
    // for a fast scroll to show the spacer where rows should be.
    const measure = () => {
      const row = table.querySelector<HTMLElement>('tbody tr[data-row]');
      const h = row ? row.getBoundingClientRect().height : 0;
      if (h > 0) setRowHeight((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
      const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
      const inHand = table.hasAttribute('data-row-in-hand');
      const next: Record<string, RowRange> = {};
      table.querySelectorAll<HTMLElement>('tbody tr[data-space-top]').forEach((spacer) => {
        next[spacer.dataset.spaceTop ?? ''] = windowRange({
          top: spacer.getBoundingClientRect().top - origin,
          rowHeight: h > 0 ? h : Number(spacer.dataset.rowHeight) || 46,
          count: Number(spacer.dataset.count) || 0,
          scrollTop: scroller.scrollTop,
          viewHeight: scroller.clientHeight,
        });
      });
      setRanges((prev) => {
        const merged = inHand ? Object.fromEntries(Object.entries(next).map(([id, r]) => [id, widenRange(prev[id], r)])) : next;
        const ids = Object.keys(merged);
        const same = ids.length === Object.keys(prev).length && ids.every((id) => prev[id]?.[0] === merged[id][0] && prev[id]?.[1] === merged[id][1]);
        return same ? prev : merged;
      });
    };
    scroller.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    ro.observe(table);
    return () => { scroller.removeEventListener('scroll', measure); ro.disconnect(); };
  }, [windowed]);
  // Name is two tracks: the pinned title, then the rows' signals (comments,
  // labels…), which scroll with the data columns. The signals track is as
  // wide as the widest row's signals — measured once the rows are drawn and
  // handed over as --signals-w — but the title keeps at least half of Name
  // (signalsTrackWidth): a row is read for its title first.
  const signalsSeen = useRef<{ rows: unknown; width: number }>({ rows: null, width: 0 });
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    let w = 0;
    table.querySelectorAll<HTMLElement>('[data-row-signals]').forEach((el) => { w = Math.max(w, el.scrollWidth); });
    // A windowed list measures the rows drawn; the track keeps the widest
    // it has seen for these rows, so it does not narrow and widen as rows
    // scroll through.
    const seen = signalsSeen.current;
    if (seen.rows === sortedSections) w = Math.max(w, seen.width);
    signalsSeen.current = { rows: sortedSections, width: w };
    table.style.setProperty('--signals-w', `${signalsTrackWidth(w, nameWidth)}px`);
    // The rows' own signals arrive after the rows do (who waits on the
    // viewer, unread comments, blockers): each is measured again when it
    // lands, or a mark that came late would sit in a track of the old width.
  }, [sortedSections, visibleColumns, nameWidth, awaitingAnswer, unreadComments, elementBlockers, ranges]);
  // Measure what each column holds, right after the rows are drawn; the widest seen is kept while the same rows are shown, so a
  // long list does not change its columns as it scrolls.
  const fitSeen = useRef<{ rows: unknown; widths: Record<string, number> } | null>(null);
  const specFor = cols.specFor;
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    let stale = false;
    queueMicrotask(() => {
      if (stale) return;
      const measured: Record<string, number> = {};
      visibleColumns.forEach((c, index) => {
        let need = 0;
        // The lead mark, the title and the signals come before the data columns.
        table.querySelectorAll<HTMLElement>(`tbody tr[data-row] > td:nth-child(${index + 4})`).forEach((cell) => {
          const content = cell.firstElementChild as HTMLElement | null;
          if (!content) return;
          const style = getComputedStyle(cell);
          need = Math.max(need, naturalWidth(content) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight));
        });
        // The heading: its word (the button around it fills the cell, so
        // the word itself is measured), the button's and the cell's
        // padding, and the sort arrow when it holds the sort.
        const label = table.querySelector<HTMLElement>(`thead th[data-col-id="${CSS.escape(c.id)}"] button > span`);
        if (label) need = Math.max(need, label.scrollWidth + 24 + (cols.sort?.id === c.id ? 16 : 0));
        if (need > 0) measured[c.id] = Math.ceil(need) + 2;
      });
      const before = fitSeen.current?.rows === sortedSections ? fitSeen.current.widths : null;
      const next = fittedWidths(measured, before, specFor);
      fitSeen.current = { rows: sortedSections, widths: next };
      if (colStorageKey) FITTED.set(colStorageKey, next);
      setFitted((prev) => {
        const ids = Object.keys(next);
        return ids.length === Object.keys(prev).length && ids.every((id) => prev[id] === next[id]) ? prev : next;
      });
    });
    return () => { stale = true; };
  }, [sortedSections, visibleColumns, ranges, density, specFor, colStorageKey, cols.sort?.id]);

  // Per section: which of its rows to draw (all of them in a short list;
  // before a windowed one is measured, the first few, shared across the
  // sections), and where its first row counts for assistive tech (from 1,
  // the header row first).
  const plans: { range: RowRange; firstAriaRow: number }[] = [];
  {
    let unmeasured = FIRST_ROWS;
    let ariaRow = 1;
    for (const sec of sortedSections) {
      const count = sec.objects.length + (sec.elements?.length ?? 0);
      const folded = collapsed.has(sec.id);
      let range: RowRange = [0, count];
      if (folded) range = [0, 0];
      else if (windowed) {
        const known = ranges[sec.id];
        if (known) range = [Math.min(known[0], count), Math.min(known[1], count)];
        else { range = [0, Math.min(count, unmeasured)]; unmeasured -= range[1]; }
      }
      if (!hideSectionHeaders) ariaRow += 1;
      plans.push({ range, firstAriaRow: ariaRow + 1 });
      ariaRow += folded ? 0 : count + (onAddObject ? 1 : 0);
    }
  }

  // Arrow keys move through the grid: up and down between rows (keeping the
  // cell the focus is in), left and right between a row and the controls in
  // it, Home and End to the first and last row. A row not drawn yet is
  // scrolled to first.
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || activeRowData) return;
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const row = target.closest<HTMLTableRowElement>('tr[data-row]');
    const scroller = scrollerRef.current;
    if (!row || !scroller) return;
    const stopsIn = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((c) => c.offsetParent !== null);
    e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const stops = stopsIn(row);
      const at = stops.indexOf(target);
      const next = e.key === 'ArrowRight' ? stops[at + 1] : at <= 0 ? row : stops[at - 1];
      next?.focus();
      return;
    }
    const cellIndex = target === row ? -1 : (target.closest('td') as HTMLTableCellElement | null)?.cellIndex ?? -1;
    const focusRow = (r: HTMLTableRowElement) => {
      const cell = cellIndex >= 0 ? r.cells.item(cellIndex) : null;
      ((cell && stopsIn(cell)[0]) || r).focus();
      r.scrollIntoView({ block: 'nearest' });
    };
    const body = e.currentTarget;
    if (e.key === 'Home' || e.key === 'End') {
      const home = e.key === 'Home';
      scroller.scrollTop = home ? 0 : scroller.scrollHeight;
      // The rows at that end are drawn once the scroll has been read: wait
      // until no spacer stands between the end and its row.
      whenDrawn(() => {
        const rows = body.querySelectorAll<HTMLTableRowElement>('tr[data-row]');
        const r = home ? rows[0] : rows[rows.length - 1];
        if (!r) return null;
        let el = home ? r.previousElementSibling : r.nextElementSibling;
        while (el) {
          if (el.matches('tr[data-space]') && el.getBoundingClientRect().height > 0) return null;
          el = home ? el.previousElementSibling : el.nextElementSibling;
        }
        return r;
      }, focusRow);
      return;
    }
    const down = e.key === 'ArrowDown';
    const step = (from: Element): { row?: HTMLTableRowElement; gap: boolean } => {
      let el = down ? from.nextElementSibling : from.previousElementSibling;
      let gap = false;
      while (el) {
        if (el.matches('tr[data-row]')) return { row: el as HTMLTableRowElement, gap };
        if (el.matches('tr[data-space]') && el.getBoundingClientRect().height > 0) gap = true;
        el = down ? el.nextElementSibling : el.previousElementSibling;
      }
      return { gap };
    };
    const found = step(row);
    if (found.row && !found.gap) { focusRow(found.row); return; }
    if (!found.gap) return;
    // The next row is behind a spacer: bring it onto the page, then step.
    const id = row.dataset.rowId;
    scroller.scrollTop += (down ? 1 : -1) * rowHeight * 6;
    whenDrawn(() => {
      const again = id ? body.querySelector<HTMLTableRowElement>(`tr[data-row-id="${CSS.escape(id)}"]`) : null;
      const next = again ? step(again) : null;
      return next?.row && !next.gap ? next.row : null;
    }, focusRow);
  };

  // A width being dragged is drawn straight onto the table's tracks — the
  // column's, the "+" track's (which gives up or takes the difference) and
  // the table's own — without rendering the rows again; it is saved once,
  // when the drag ends (ResizeHandle). Returns the width drawn.
  const drawWidth = (id: ColumnId, raw: number): number => {
    const table = tableRef.current;
    const w = clampWidth(raw, cols.specFor(id));
    if (!table) return w;
    const isName = id === NAME_COL_KEY;
    const next = tableLayout({
      view: viewWidth,
      fixed: fixedWidth,
      columns: isName ? dataWidth : dataWidth - (visibleColumns.some((c) => c.id === id) ? drawnWidth(visibleColumns.find((c) => c.id === id)!) : 0) + w,
      name: isName ? w : layout.name,
    });
    const set = (col: HTMLElement | null, width: string) => { if (col) { col.style.width = width; col.style.minWidth = width; } };
    set(table.querySelector<HTMLElement>(`col[data-col="${CSS.escape(id)}"]`), isName ? `calc(${w}px - var(--signals-w, 0px))` : `${w}px`);
    set(table.querySelector<HTMLElement>('col[data-col="+"]'), `${TRAILING_COL_WIDTH + next.filler}px`);
    table.style.width = `${next.width}px`;
    table.style.minWidth = `${next.width}px`;
    return w;
  };
  // Fits a column to what it holds (a double click on its edge).
  const fitColumn = (id: ColumnId) => {
    const table = tableRef.current;
    if (!table) return;
    freezeName();
    if (id === NAME_COL_KEY) {
      let need = 0;
      table.querySelectorAll<HTMLElement>('tbody .list-row-title').forEach((title) => {
        const cell = title.closest('td');
        if (cell) need = Math.max(need, title.getBoundingClientRect().left - cell.getBoundingClientRect().left + title.scrollWidth + 12);
      });
      const signals = parseFloat(getComputedStyle(table).getPropertyValue('--signals-w')) || 0;
      if (need > 0) cols.setWidth(NAME_COL_KEY, need + signals);
      return;
    }
    // A column already measures what it holds: fitting it is setting it
    // to that.
    const fit = fitted[id] ?? cols.specFor(id).base;
    cols.setWidth(id, fit);
    drawWidth(id, fit);
  };

  // With no rows the table is its header alone, and a horizontal scrollbar
  // (when the columns are wider than the pane) would sit right under it as a
  // stray bar. Nothing is there to scroll to, so an empty list does not scroll.
  const empty = sections.every((s) => s.objects.length === 0 && (s.elements?.length ?? 0) === 0);

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
    <div
      ref={scrollerRef}
      data-list-scroller className={`${empty ? 'overflow-x-hidden' : 'overflow-x-auto'} h-full [overflow-anchor:none]`}>
      <table
        ref={tableRef}
        // Every track has a definite width and the table is exactly their
        // sum (columnWidths.tableLayout), so the browser never spreads
        // slack across the columns on its own.
        style={{ width: layout.width, minWidth: layout.width }}
        // Compact packs the rows tight (Display > Row height): no cell
        // padding, a shorter row box, a smaller and lighter title.
        className={`group/list min-w-full table-fixed bg-card border-separate border-spacing-0 text-[14px] [--cell-text:14px] ${density === 'compact'
          ? '[--cell-text:12.5px] [&_tbody_td]:!py-0 [&_.list-row-inner]:!min-h-[1.625rem] [&_.list-row-title]:!text-[13px] [&_.list-row-title]:!font-normal'
          : ''}`}
        data-density={density}
        data-has-selection={hasSelection ? '' : undefined}
        data-row-in-hand={activeRowData ? '' : undefined}
        // A windowed list tells assistive tech how many rows there are in
        // all, since only some of them are on the page.
        aria-rowcount={windowed ? 1 + totalRows + (hideSectionHeaders ? 0 : sortedSections.length) + (onAddObject ? sortedSections.length : 0) : undefined}
      >
        {/* Every track at its own width; the "+" track takes the slack. */}
        <colgroup>
          <col style={{ width: 52, minWidth: 52 }} />
          <col data-col={NAME_COL_KEY} style={{ width: titleWidth, minWidth: titleWidth }} />
          <col style={{ width: 'var(--signals-w, 0px)', minWidth: 'var(--signals-w, 0px)' }} />
          {visibleColumns.map((c) => {
            const w = drawnWidth(c);
            // Match the data cells' `table-cell` so the column track
            // isn't reserved below md — otherwise the hidden data columns leave
            // an empty gap and force horizontal scroll in narrow panels.
            return <col key={c.id} data-col={c.id} className="table-column" style={{ width: w, minWidth: w }} />;
          })}
          {hasTrailingCol && <col data-col="+" className="table-column" style={{ width: trailingWidth, minWidth: trailingWidth }} />}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-card">
          <tr>
            {/* "Name" heads the pinned columns (the status mark or Object
                icon, then the title); the icons start where the word does,
                30px in. Both `top-0` (from thead) and `left-0` keep it in
                place: it is the intersection corner, so z-30 keeps it above
                the row's sticky-left cells and any data column header
                scrolling under. The signals track's header after it is
                blank and scrolls; Name's resize edge is at its end. */}
            <th colSpan={2} className="sticky top-0 left-0 z-30 relative pl-7.5 pr-3 py-2.5 text-left text-[13px] font-normal text-muted-foreground bg-card">
              {t('Name')}
            </th>
            <th className="relative p-0 bg-card" aria-label={t('More')}>
              {/* Name is resizable too — same handle as the data columns,
                  persisted under NAME_COL_KEY. Fixed on the Object list
                  instead (see the colgroup above), so no handle there. */}
              {entity !== 'object' && (
                <ResizeHandle
                  width={nameWidth}
                  onResizeStart={freezeName}
                  onDraft={(w) => drawWidth(NAME_COL_KEY, w)}
                  onCommit={(w) => cols.setWidth(NAME_COL_KEY, w)}
                  onAutoFit={() => fitColumn(NAME_COL_KEY)}
                />
              )}
            </th>
            <SortableContext items={visibleColumnIds.map((id) => HEADER_DRAG_PREFIX + id)} strategy={horizontalListSortingStrategy}>
              {visibleColumns.map((col) => (
                <ColumnHeader
                  key={col.id}
                  column={col}
                  width={drawnWidth(col)}
                  isDragging={draggingColId === col.id}
                  dropEdge={colDrop?.id === col.id ? colDrop.edge : null}
                  sort={cols.sort && cols.sort.id === col.id ? cols.sort.direction : null}
                  onResizeStart={freezeName}
                  onDraft={(w) => drawWidth(col.id, w)}
                  onCommit={(w) => cols.setWidth(col.id, w)}
                  onAutoFit={() => fitColumn(col.id)}
                  onSort={(direction) => cols.setSort(direction ? { id: col.id, direction } : null)}
                  onEdit={col.custom && onEditColumn ? () => onEditColumn(col.custom!) : undefined}
                  onMoveLeft={visibleColumns.indexOf(col) > 0 ? () => cols.moveColumn(col.id, visibleColumns[visibleColumns.indexOf(col) - 1].id) : undefined}
                  onMoveRight={visibleColumns.indexOf(col) < visibleColumns.length - 1 ? () => cols.moveColumn(col.id, visibleColumns[visibleColumns.indexOf(col) + 2]?.id ?? null) : undefined}
                  onHide={col.toggleable ? () => cols.toggleVisible(col.id) : undefined}
                />
              ))}
            </SortableContext>
            {hasTrailingCol && (
              // Keep column controls at the right edge of the flexible spacer,
              // and pinned there while the list slides sideways (z-30 above
              // the data column headers scrolling under it).
              <th className="table-cell sticky top-0 right-0 z-30 w-8 px-1 py-2.5 bg-card text-center">
                {/* Trailing "+": which fields show as columns, and a new
                    field where the list has a scope to create one in. */}
                <div className="flex items-center justify-end">
                  <FieldsMenu allColumns={cols.allColumns} isVisible={cols.isVisible} onToggle={cols.toggleVisible} onCreate={onAddColumn} />
                </div>
              </th>
            )}
          </tr>
        </thead>
        <tbody onKeyDown={onGridKeyDown}>
          {sortedSections.map((section, sectionIndex) => {
            const isCollapsed = collapsed.has(section.id);
            // Already sorted by `sortedSections` (the single display-order
            // source). When no sort is active the natural order_index order
            // shines through and drag-to-reorder persists into it.
            const sectionObjects = section.objects ?? [];
            const sectionElements = section.elements ?? [];
            const itemCount = sectionObjects.length + sectionElements.length;
            // The rows of this section to draw (all of them in a short list),
            // and the spacers standing in for the rest.
            const { range, firstAriaRow } = plans[sectionIndex];
            const drawn = splitRange(range, sectionObjects.length, sectionElements.length);
            const spanAll = 1 + totalDataColumns + (hasTrailingCol ? 1 : 0);
            const spacer = (rows: number, top: boolean) => (
              <tr aria-hidden data-space {...(top ? { 'data-space-top': section.id, 'data-count': itemCount, 'data-row-height': rowHeight } : {})} style={{ height: rows * rowHeight }}>
                <td colSpan={spanAll} className="!p-0" style={{ height: rows * rowHeight }} />
              </tr>
            );
            return (
              <Fragment key={section.id}>
                {!hideSectionHeaders && (
                  <tr className="group">
                    {/* Section band — pinned to the left edge so the section
                        name stays readable during horizontal scroll. The
                        leading cell (left:0) holds the chevron near the edge
                        and the section icon 30px in, under "Name" and the
                        rows' marks; the band cell (left:52) starts the name
                        where the rows' names start, and its bg-card layer
                        hides the data columns scrolling underneath. */}
                    <td className={`sticky left-0 z-10 bg-card w-13 pl-1 pb-0 ${sectionIndex === 0 ? 'pt-0' : 'pt-1.5'}`}>
                      {/* Chevron lives inside the band visually — same
                          bg-muted as the colspan td next to it, with only
                          the outer corner rounded so the two tds join. */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggle(section.id); }}
                        className="relative w-full min-h-[2.625rem] flex items-center bg-muted/70 group-hover:bg-muted rounded-l-lg text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={isCollapsed ? t('Expand') : t('Collapse')}
                      >
                        <span className="absolute left-2 flex items-center"><DisclosureTriangle open={!isCollapsed} /></span>
                        <span className="absolute left-6.5 flex items-center text-foreground/70">{section.icon}</span>
                      </button>
                    </td>
                    <td colSpan={totalDataColumns + (hasTrailingCol ? 1 : 0)} className={`bg-card pr-1 pb-0 ${sectionIndex === 0 ? 'pt-0' : 'pt-1.5'}`}>
                      {/* The band toggles from anywhere on it (the button laid
                          over it), and its "+" is a control of its own above
                          that button — not a control inside another. */}
                      <div className="relative w-full min-h-[2.625rem] flex items-center min-w-0 pl-3.5 pr-1 py-1.5 bg-muted/70 group-hover:bg-muted rounded-r-lg transition-colors text-left">
                        {/* The band spans the whole table, wider than the pane,
                            and a cell that wide cannot stick — so the name
                            and count stick inside it instead, at the x the
                            row titles stay at. */}
                        <span className="sticky left-[66px] flex min-w-0 items-center">
                          <span className="text-[15px] font-medium text-foreground min-w-0 truncate">
                            {section.name}
                          </span>
                          <span className="text-muted-foreground/60 font-normal tabular-nums text-[15px] ml-2">
                            {itemCount}
                          </span>
                        </span>
                        <span className="flex-1" />
                        <button
                          type="button"
                          onClick={() => toggle(section.id)}
                          aria-expanded={!isCollapsed}
                          aria-label={`${section.name}: ${isCollapsed ? t('Expand') : t('Collapse')}`}
                          className="absolute inset-0 rounded-r-lg"
                        />
                        {onAddElement && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onAddElement(section); }}
                            className="relative z-10 inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title={t('Add Element to {name}', { name: section.name })}
                            aria-label={t('Add Element to {name}', { name: section.name })}
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {!isCollapsed && windowed && spacer(range[0], true)}
                {!isCollapsed && (
                  // Object rows: drag-to-reorder + multi-select checkbox.
                  // Same dnd-kit context the headers and elements share; the
                  // `obj:` id prefix routes drops to reorderObjects.
                  <SortableContext
                    items={sectionObjects.map((o) => OBJECT_DRAG_PREFIX + o.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sectionObjects.slice(drawn.objects[0], drawn.objects[1]).map((obj, k) => {
                      const i = drawn.objects[0] + k;
                      const sel = selectedObjectIds?.has(obj.id) ?? false;
                      return (
                      <ObjectRow
                        key={`obj-${obj.id}`}
                        obj={obj}
                        ariaRowIndex={windowed ? firstAriaRow + i : undefined}
                        isSelected={sel}
                        hasSelectionRef={hasSelectionRef}
                        visibleColumns={visibleColumns}
                        hasTrailingCol={hasTrailingCol}
                        elementTypes={elementTypes}
                        canRowSelect={canObjectRowSelect}
                        onAddType={canAddType ? stableAddType : undefined}
                        onRemoveType={canRemoveType ? stableRemoveType : undefined}
                        dropEdge={dropTarget?.id === OBJECT_DRAG_PREFIX + obj.id ? dropTarget.edge : undefined}
                        selPrev={sel && i > 0 && (selectedObjectIds?.has(sectionObjects[i - 1].id) ?? false)}
                        selNext={sel && i < sectionObjects.length - 1 && (selectedObjectIds?.has(sectionObjects[i + 1].id) ?? false)}
                        onSelectObject={stableSelectObjectCb}
                        onRowSelect={stableObjectRowSelect}
                        onObjectUpdate={onObjectUpdate}
                        objectWorkers={objectWorkers}
                        onObjectCustomColumnValueChange={onObjectCustomColumnValueChange}
                      />
                      );
                    })}
                  </SortableContext>
                )}
                {!isCollapsed && (
                  <SortableContext
                    items={sectionElements.map((e) => e.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sectionElements.slice(drawn.elements[0], drawn.elements[1]).map((el, k) => {
                      const i = drawn.elements[0] + k;
                      const sel = selectedElementIds?.has(el.id) ?? false;
                      return (
                      <ElementRow
                        key={`el-${el.id}`}
                        el={el}
                        ariaRowIndex={windowed ? firstAriaRow + sectionObjects.length + i : undefined}
                        isSelected={sel}
                        hasSelectionRef={hasSelectionRef}
                        elementTypes={elementTypes}
                        visibleColumns={visibleColumns}
                        hasTrailingCol={hasTrailingCol}
                        canUpdate={canUpdate}
                        canRowSelect={canRowSelect}
                        canAddType={canAddType}
                        onAddType={stableAddType}
                        canRemoveType={canRemoveType}
                        onRemoveType={stableRemoveType}
                        dropEdge={dropTarget?.id === el.id ? dropTarget.edge : undefined}
                        selPrev={sel && i > 0 && (selectedElementIds?.has(sectionElements[i - 1].id) ?? false)}
                        selNext={sel && i < sectionElements.length - 1 && (selectedElementIds?.has(sectionElements[i + 1].id) ?? false)}
                        onElementUpdate={stableElementUpdate}
                        onRefresh={stableRefresh}
                        onSelectElement={stableSelectElement}
                        onRowSelect={stableRowSelect}
                        onCustomColumnValueChange={stableCustomColChange}
                        allCustomColumns={customColumns}
                        blockers={elementBlockers[el.id]}
                      />
                      );
                    })}
                  </SortableContext>
                )}
                {!isCollapsed && windowed && spacer(itemCount - range[1], false)}
                {!isCollapsed && onAddObject && (
                  <tr
                    className={`group cursor-pointer [&>td]:transition-colors ${ROW_ROUND_BASE} [&:hover>td:not(.sticky):not(:last-child)]:bg-foreground/[0.06] ${STICKY_TINT_HOVER}`}
                    onClick={onAddObject}
                  >
                    <td className={`sticky left-0 z-10 bg-card w-13 pl-7.5 pr-1.5 py-2 ${LEAD_CELL} ${LEAD_CELL_HOVER}`}>
                      <div className="flex items-center text-muted-foreground">
                        <ObjectIcon size={16} />
                      </div>
                    </td>
                    <td colSpan={totalDataColumns + (hasTrailingCol ? 1 : 0)} className="bg-card pl-3.5 pr-0.5 py-2 min-w-0">
                      <div className="sticky left-[66px] flex w-fit items-center min-w-0 min-h-[1.875rem] text-muted-foreground">
                        <span className="text-[14px] group-hover:text-foreground transition-colors">
                          {t('Add Object')}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    {/* Floating drag preview — a single GPU-composited element that follows
        the pointer. Replaces the old per-row transform shuffle, so the list
        stays still and only this card moves. Rendered only for row drags;
        column drags keep their in-place feedback. */}
    <DragOverlay dropAnimation={null}>
      {activeRowData ? <DragCard data={activeRowData} /> : draggingColId ? (
        <div className="inline-flex h-7 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-overlay)] px-2.5 text-[13px] text-foreground shadow-lg">
          {fieldDisplayLabel(t, cols.allColumns.find((c) => c.id === draggingColId) ?? { id: draggingColId, label: draggingColId })}
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}

// Floating drag-preview card rendered inside DragOverlay. A compact, self-
// contained chip (not a table row) showing just enough to recognise the
// item being moved — status mark + display id + title for Elements, icon +
// name for Objects.
function DragCard({
  data,
}: {
  data: { kind: 'element'; el: ElementWithDetails } | { kind: 'object'; obj: ClaywareObjectWithChildren };
}) {
  const elementId = data.kind === 'element' ? displayIdOf(data.el) : null;
  return (
    <div className="flex items-center gap-2 max-w-[360px] rounded-lg bg-popover/95 backdrop-blur-md shadow-2xl ring-1 ring-border px-3 py-2 text-[13px] cursor-grabbing">
      {data.kind === 'element' ? (
        <>
          <span className="shrink-0 flex items-center">
            <ElementProgressMark
              status={data.el.status}
              progress={getElementProgress(data.el)}
              size={16}
            />
          </span>
          <DisplayIdChip id={elementId} fit="full" />
          <span className="font-semibold text-foreground truncate">{data.el.title}</span>
        </>
      ) : (
        <>
          <span className="shrink-0 flex items-center justify-center text-muted-foreground/70">
            <ItemIcon icon={data.obj.icon} color={data.obj.color} size={14} fallback={<ObjectIcon size={14} />} />
          </span>
          <span className="font-semibold text-foreground truncate">{data.obj.name}</span>
        </>
      )}
    </div>
  );
}
