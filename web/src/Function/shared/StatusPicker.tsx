'use client';

import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp } from '@/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { getElementProgress } from '@/Function/shared/ElementProgressMark';
import { ElementStatusLook, ElementStatusMark, useElementStatusRows } from '@/Function/shared/ElementStatusMark';
import { useStatusName } from '@/Function/shared/WorkStatusPicker';
import { elementStatusWrite, statusesByStage, type Status } from '@/Function/shared/workStatus';
import { updateElement } from '@/hooks/useSupabase';
import type { ElementWithDetails } from '@/hooks/useSupabase';
import type { ElementStatus } from '@/types/database';
import { cn } from '@/lib/utils';
import { stepProgress } from '@/Function/shared/progressStep';
import { progressForStatus } from '@/Function/shared/statusProgress';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { notifyError } from '@/Function/shared/toastStore';

// Linear-style status picker — opens from the progress ○ mark. Each row's
// icon is the same mark the list shows, so the preview matches the eventual
// state. Every stage lists its own status first, then the ones the Space
// added under it (Settings › Elements › Statuses), headed by the stage's name
// when it has any. The In Progress row also exposes a 0–100 number field that
// writes directly to elements.progress; reaching 100% flips the element to Done.

interface StatusPickerProps {
  element: ElementWithDetails;
  /** Trigger mark size; defaults to 16. */
  size?: number;
  /** Override progress used to render the trigger mark (e.g. when the
   *  parent has already merged in custom-column values). */
  progress?: number;
  /** Custom trigger. When omitted, the default ○-mark button is used —
   *  lets other surfaces (e.g. the Element-detail Properties row) open
   *  this exact menu from their own control. */
  trigger?: ReactNode;
  /** Fired after a status change is persisted, so callers can run extra
   *  side effects (activity log, notifications, refresh). */
  onChanged?: (status: ElementStatus) => void;
}

export function StatusPicker({ element, size = 16, progress: progressOverride, trigger, onChanged }: StatusPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rows = useElementStatusRows();
  const nameOf = useStatusName();
  const groups = statusesByStage('element', rows);

  // Local draft for the number input so typing feels instant. Initialised
  // from the element; we don't re-sync on external prop changes (rare) to
  // avoid clobbering an in-flight edit — the trigger mark + menu icons
  // still update via realtime.
  const [progressDraft, setProgressDraft] = useState<string>(
    element.progress != null ? String(element.progress) : '',
  );

  // Single source of truth for the progress value — same precedence as every
  // list / board / rail mark. Callers that have already merged custom-column
  // progress pass `progressOverride`; otherwise defer to getElementProgress
  // (done→100, then element.progress).
  const triggerProgress = progressOverride ?? getElementProgress(element);
  // The In Progress row's mark follows the % being typed, so the pie is a
  // live preview of what committing will show.
  const draftProgress = (() => {
    const parsed = parseInt(progressDraft, 10);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : triggerProgress;
  })();

  const applyStatus = async (picked: Status) => {
    // Picking In Progress while progress is already 100% is effectively
    // Done — snap to Done so the mark and status stay aligned. Taken back
    // out of Done, it picks up at 75 instead.
    const newStatus = picked.stage as ElementStatus;
    const snapsToDone = newStatus === 'in_progress' && element.status !== 'done' && (element.progress ?? 0) >= 100;
    const resolved: ElementStatus = snapsToDone ? 'done' : newStatus;
    const write = elementStatusWrite(snapsToDone ? { id: null, stage: 'done' } : picked);
    const updates: { status: ElementStatus; status_id: string | null; progress?: number | null } = { status: resolved, status_id: write.status_id };
    const progress = progressForStatus(element.status, resolved);
    if (progress !== undefined) updates.progress = progress;
    try {
      await updateElement(element.id, updates);
      lastCommitted.current = null;
      setOpen(false);
      onChanged?.(resolved);
    } catch (e) {
      notifyError(e, t('Could not change the status.'));
    }
  };

  // Enter commits and leaves the field focused, so the blur that follows a
  // later dismissal would commit the same value again — a second write and,
  // through onChanged, a second round of assignee notifications. The last
  // committed value short-circuits that.
  const lastCommitted = useRef<{ progress: number; status: ElementStatus | null } | null>(null);
  const commitProgress = async (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(100, parsed));
    // What the field shows is what was saved, never the raw keystrokes.
    setProgressDraft(String(clamped));
    try {
      const updates: { progress: number; status?: ElementStatus; status_id?: null } = { progress: clamped };
      // 100% snaps to Done; anything else lands in In Progress — including a
      // Done Element, which can't legitimately sit below 100%. In Review is
      // left alone since it's a deliberate workflow phase, not a progress
      // bucket. A move of stage lets go of a status the Space added.
      if (clamped >= 100) { updates.status = 'done'; updates.status_id = null; }
      else if (element.status !== 'in_progress' && element.status !== 'review') {
        updates.status = 'in_progress'; updates.status_id = null;
      }
      const next = { progress: clamped, status: updates.status ?? element.status ?? null };
      if (lastCommitted.current && lastCommitted.current.progress === next.progress && lastCommitted.current.status === next.status) return;
      lastCommitted.current = next;
      await updateElement(element.id, updates);
      // Fire onChanged even on a progress-only update so callers (e.g. the
      // Element-detail view) refresh their trigger mark instead of showing
      // a stale percentage.
      onChanged?.(updates.status ?? element.status ?? 'todo');
    } catch (e) {
      // A failed write must not count as committed, or retrying the same
      // value would be swallowed by the guard above.
      lastCommitted.current = null;
      console.error('Failed to update progress', e);
    }
  };

  return (
    <Popover open={open} onOpenChange={(next) => {
      // Opening reads the Element as it is now (Done reads 100); it is
      // picking In Progress that moves a Done one to 75.
      if (next) setProgressDraft(String(triggerProgress));
      setOpen(next);
    }}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex size-5 items-center justify-center rounded-full transition-colors hover:bg-muted/40"
            aria-label={t('Change status')}
          >
            <ElementStatusMark
              status={element.status}
              statusId={element.status_id}
              progress={triggerProgress}
              size={size}
            />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-60 rounded-lg p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1.5 text-[11.5px] text-muted-foreground">{t('Change status…')}</div>
        <div className="h-px bg-border mx-1 mb-1" />
        {groups.map((group) => (
          <Fragment key={group.stage}>
          {group.statuses.length > 1 && (
            <div className="px-2 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">{t(group.label)}</div>
          )}
          {group.statuses.map((row) => {
          const isCurrent = element.status === row.stage && (element.status_id ?? null) === row.id;
          // The number field sits on In Progress's own row only.
          const hasProgressField = row.stage === 'in_progress' && row.builtin;
          // Use a div with role="button" instead of a <button> so the
          // In Progress row can nest a real <input> for the % field —
          // <input> inside <button> is invalid HTML and browsers swallow
          // the input's clicks back into the button's onClick, which was
          // making the % field essentially un-clickable.
          return (
            <div
              key={row.id ?? row.stage}
              role="button"
              tabIndex={0}
              onClick={() => applyStatus(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  applyStatus(row);
                }
              }}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors cursor-pointer select-none',
                isCurrent ? 'bg-accent/60 text-foreground' : 'text-foreground hover:bg-accent/40 focus-visible:bg-accent/40',
              )}
            >
              <span className="flex items-center justify-center w-[18px] h-[18px] shrink-0">
                <ElementStatusLook status={row} progress={row.stage === 'in_progress' ? draftProgress : 0} size={17} />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{nameOf(row)}</span>
              {hasProgressField && (
                // Stop bubbling on the whole input cluster so clicks /
                // pointer events inside don't trigger applyStatus on the
                // surrounding row.
                // No box: the number is typed in place, and the arrows beside
                // the % (or ↑/↓ in the field) step it — 5% up to 80%, then 2%,
                // then 1% from 90% (stepProgress).
                <span
                  className="inline-flex items-center"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="number"
                    aria-label={t('Progress')}
                    min={0}
                    max={100}
                    value={progressDraft}
                    placeholder="0"
                    onChange={(e) => setProgressDraft(e.target.value)}
                    onBlur={(e) => commitProgress(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        void commitProgress(String(stepProgress(parseInt(progressDraft, 10) || 0, e.key === 'ArrowUp' ? 1 : -1)));
                        return;
                      }
                      // Enter commits and keeps the menu open: the mark
                      // and the trigger update in place, and the person
                      // can keep adjusting or pick another status.
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitProgress((e.target as HTMLInputElement).value);
                      }
                    }}
                    className="w-8 rounded text-[11.5px] tabular-nums bg-transparent text-right outline-none transition-colors hover:bg-muted/40 focus:bg-muted/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[11.5px] text-muted-foreground ml-0.5">%</span>
                  <span className="ml-1 flex flex-col">
                    <button type="button" aria-label={t('Increase progress')} tabIndex={-1}
                      onClick={() => { void commitProgress(String(stepProgress(parseInt(progressDraft, 10) || 0, 1))); }}
                      className="flex h-2.5 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                      <ChevronUp size={10} strokeWidth={2.5} />
                    </button>
                    <button type="button" aria-label={t('Decrease progress')} tabIndex={-1}
                      onClick={() => { void commitProgress(String(stepProgress(parseInt(progressDraft, 10) || 0, -1))); }}
                      className="flex h-2.5 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                      <ChevronDown size={10} strokeWidth={2.5} />
                    </button>
                  </span>
                </span>
              )}
              {isCurrent && !hasProgressField && (
                <Check size={13} className="text-foreground/80" />
              )}
            </div>
          );
        })}
          </Fragment>
        ))}
      </PopoverContent>
    </Popover>
  );
}
