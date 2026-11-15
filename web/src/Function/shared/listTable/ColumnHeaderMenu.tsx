'use client';

import { FieldVisibility } from '@/Function/property/FieldVisibility';
import { Button } from '@/ui/button';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pencil, ArrowDown, ArrowUp, EyeOff, Plus, X } from '@/ui/icons';
import { useSortable } from '@dnd-kit/sortable';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuItem, MenuCheck } from '@/ui/dropdown-menu';
import { MenuShell, MENU_ROW, MENU_SEPARATOR } from '@/Function/shared/menu';
import { Popover, PopoverTrigger } from '@/ui/popover';
import { type ColumnId, type ColumnSort, type DataColumn } from '@/Function/shared/listTable/useListColumns';
import { HEADER_DRAG_PREFIX } from './shared';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { fieldDisplayLabel } from '@/Function/property/fieldModel';

// A data column's header, as in Asana: the name is a button that opens the
// column's menu (sort, move, edit, hide), and the whole cell is what you
// grab to move the column. A drag never moves the header itself — the
// table draws a floating label under the pointer and a line where the
// column will land, so the columns stay still while you aim. The right edge
// resizes.
export function ColumnHeader({
  column, width, isDragging, dropEdge, sort, onDraft, onCommit, onResizeStart, onAutoFit, onSort, onHide, onEdit, onMoveLeft, onMoveRight,
}: {
  column: DataColumn;
  width: number;
  isDragging: boolean;
  /** Where a column being dragged would land against this one. */
  dropEdge: 'before' | 'after' | null;
  /** 'asc' | 'desc' when this column owns the active sort, else null. */
  sort: ColumnSort['direction'] | null;
  onDraft: (width: number) => number;
  onCommit: (width: number) => void;
  onResizeStart?: () => void;
  onAutoFit?: () => void;
  onSort: (direction: ColumnSort['direction'] | null) => void;
  /** Pass undefined for always-on columns to omit the Hide item. */
  onHide?: () => void;
  onEdit?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}) {
  const { t } = useI18n();
  // Built-in column names are English keys; a Property's name is the user's own.
  const label = fieldDisplayLabel(t, column);
  const { setNodeRef, attributes, listeners } = useSortable({ id: HEADER_DRAG_PREFIX + column.id, animateLayoutChanges: () => false });
  const [open, setOpen] = useState(false);
  // The menu opens on click, not on press: a press may be the start of a
  // drag, and a press that travelled is not a click.
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const SortIcon = sort === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      ref={setNodeRef}
      data-col-id={column.id}
      {...attributes}
      {...listeners}
      className={`table-cell group/col relative px-1 py-1.5 text-left text-[13px] font-normal text-muted-foreground bg-card whitespace-nowrap select-none transition-opacity ${isDragging ? 'opacity-40' : ''}`}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onPointerDown={(e) => { downAt.current = { x: e.clientX, y: e.clientY }; e.preventDefault(); }}
            onClick={(e) => {
              e.stopPropagation();
              const d = downAt.current;
              downAt.current = null;
              if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3) return;
              setOpen(true);
            }}
            title={label}
            // The name starts at the x of the cell text below: th px-1 +
            // px-2 = the cells' 12px. A column of figures is set flush
            // right, its name ending where the figures do.
            className={`flex h-7 w-full min-w-0 items-center gap-1 rounded-md text-muted-foreground/90 transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground focus:outline-none focus-visible:bg-[var(--surface-strong)] data-[state=open]:bg-[var(--surface-strong)] data-[state=open]:text-foreground ${column.align === 'end' ? 'justify-end' : 'justify-start'} px-2`}
          >
            <span className="truncate">{label}</span>
            {sort && <SortIcon size={12} className="shrink-0 text-foreground" />}
          </button>
        </DropdownMenuTrigger>
        <MenuShell as="dropdown" align={column.align === 'end' ? 'end' : 'start'} onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuItem onSelect={() => onSort('asc')}>
            <ArrowUp size={14} />
            <span className="flex-1">{t('Sort ascending')}</span>
            {sort === 'asc' && <MenuCheck />}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSort('desc')}>
            <ArrowDown size={14} />
            <span className="flex-1">{t('Sort descending')}</span>
            {sort === 'desc' && <MenuCheck />}
          </DropdownMenuItem>
          {sort && (
            <DropdownMenuItem onSelect={() => onSort(null)}>
              <X size={14} />{t('Clear sort')}
            </DropdownMenuItem>
          )}
          <div className={MENU_SEPARATOR} />
          <DropdownMenuItem disabled={!onMoveLeft} onSelect={onMoveLeft}><ArrowLeft size={14} />{t('Move left')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!onMoveRight} onSelect={onMoveRight}><ArrowRight size={14} />{t('Move right')}</DropdownMenuItem>
          {(onEdit || onHide) && <div className={MENU_SEPARATOR} />}
          {onEdit && <DropdownMenuItem onSelect={onEdit}><Pencil size={14} />{t('Edit field')}</DropdownMenuItem>}
          {onHide && <DropdownMenuItem onSelect={onHide}><EyeOff size={14} />{t('Hide column')}</DropdownMenuItem>}
        </MenuShell>
      </DropdownMenu>
      {dropEdge && (
        <span aria-hidden className={`pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-full bg-[var(--accent-default)] ${dropEdge === 'before' ? '-left-px' : '-right-px'}`} />
      )}
      <ResizeHandle width={width} onDraft={onDraft} onCommit={onCommit} onResizeStart={onResizeStart} onAutoFit={onAutoFit} />
    </th>
  );
}

/** The column's right edge. Dragging it changes this column's width and
 *  nothing else. While the pointer is down the width is only drawn
 *  (`onDraft`, which the table applies straight to its tracks without
 *  rendering its rows again); it is saved once, on release (`onCommit`).
 *  A double click fits the column to what it holds. */
export function ResizeHandle({
  width, onDraft, onCommit, onResizeStart, onAutoFit,
}: {
  /** The column's width as drawn, where a drag starts from. */
  width: number;
  /** A width being dragged: draw it, do not save it. Returns the width
   *  actually drawn (held to the column's bounds). */
  onDraft: (w: number) => number;
  /** The width to keep. */
  onCommit: (w: number) => void;
  onResizeStart?: () => void;
  onAutoFit?: () => void;
}) {
  const { t } = useI18n();
  const startRef = useRef<{ x: number; w: number; last: number } | null>(null);
  const [active, setActive] = useState(false);
  const end = (commit: boolean) => {
    const drag = startRef.current;
    startRef.current = null;
    setActive(false);
    if (!drag) return;
    // A drag given up puts the drawn width back.
    if (commit) onCommit(drag.last); else onDraft(drag.w);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize column')}
      tabIndex={0}
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={1200}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault(); e.stopPropagation(); onResizeStart?.(); onCommit(width + (e.key === 'ArrowRight' ? 16 : -16));
        }
      }}
      onPointerCancel={() => end(false)}
      onLostPointerCapture={() => end(false)}
      // A wide transparent grab area centred on the edge; the visible
      // feedback is the hairline in the middle, accent while dragging.
      className="group/resize absolute top-0 -right-1.5 z-30 h-full w-3 touch-none cursor-col-resize"
      onPointerDown={(e) => {
        // The second press of a double click fits the column instead.
        if (e.detail >= 2) return;
        onResizeStart?.();
        startRef.current = { x: e.clientX, w: width, last: width };
        setActive(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        const drag = startRef.current;
        if (!drag) return;
        drag.last = onDraft(drag.w + (e.clientX - drag.x));
      }}
      onPointerUp={(e) => {
        if (!startRef.current) return;
        end(true);
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* fine */ }
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); onAutoFit?.(); }}
      title={onAutoFit ? t('Drag to resize. Double-click to fit.') : undefined}
    >
      <span className={`absolute inset-y-1.5 left-1/2 w-px -translate-x-1/2 transition-colors ${active ? 'bg-[var(--accent-default)]' : 'bg-transparent group-hover/resize:bg-[var(--border-strong)]'}`} />
    </div>
  );
}

/** The trailing "+" of the header: which fields show as columns (a switch
 *  each, searchable), and — where the list has a scope to create one in —
 *  a new field. */
export function FieldsMenu({
  allColumns, isVisible, onToggle, onCreate,
}: {
  allColumns: DataColumn[];
  isVisible: (id: ColumnId) => boolean;
  onToggle: (id: ColumnId) => void;
  onCreate?: (anchor?: DOMRect) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} type="button" variant="ghost" size="icon-sm" aria-label={t('Fields')} title={t('Fields')}><Plus size={14} /></Button>
    </PopoverTrigger>
    <MenuShell align="end" width="wide">
      <FieldVisibility columns={allColumns} isVisible={isVisible} onToggle={onToggle} />
      {onCreate && <>
        <div className={MENU_SEPARATOR} />
        <button type="button" className={`${MENU_ROW} text-muted-foreground hover:text-foreground`}
          onClick={() => { setOpen(false); onCreate(triggerRef.current?.getBoundingClientRect()); }}>
          <Plus size={14} />{t('Create field')}
        </button>
      </>}
    </MenuShell>
  </Popover>;
}
