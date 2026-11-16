'use client';

import { Fragment, type ReactNode } from 'react';
import { Check } from '@/ui/icons';
import { StatusLook, useStatusName } from '@/Function/shared/StatusLook';
import type { StageStatuses, Status } from '@/Function/shared/workStatus';
import { cn } from '@/lib/utils';
import { useI18n } from '@/Function/i18n/I18nProvider';

// The inside of a status picker — the same for an Element, an Object and a
// Strategy. Every stage lists its own status first, then the ones the Space
// added under it, headed by the stage's name when it has any. Each row's
// mark is the one the row will show once picked, and the current one is
// checked.

export function StatusMenu({ groups, isCurrent, onPick, progressOf, extra }: {
  groups: StageStatuses[];
  isCurrent: (status: Status) => boolean;
  onPick: (status: Status) => void;
  /** The share done the In Progress pie shows on a row. */
  progressOf: (status: Status) => number;
  /** Something the row carries in place of the check (the % field on an
   *  Element's In Progress). Its clicks stay its own. */
  extra?: (status: Status) => ReactNode;
}) {
  const { t } = useI18n();
  const nameOf = useStatusName();
  return (
    <>
      <div className="px-2 py-1.5 text-[11.5px] text-muted-foreground">{t('Change status…')}</div>
      <div className="mx-1 mb-1 h-px bg-border" />
      {groups.map((group) => (
        <Fragment key={group.stage}>
          {group.statuses.length > 1 && (
            <div className="px-2 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">{t(group.label)}</div>
          )}
          {group.statuses.map((row) => {
            const current = isCurrent(row);
            const more = extra?.(row);
            // A div with role="button", not a <button>: a row can carry a
            // real <input> (the % field), and an input inside a button is
            // invalid HTML whose clicks the button swallows.
            return (
              <div
                key={row.id ?? row.stage}
                role="button"
                tabIndex={0}
                aria-pressed={current}
                onClick={() => onPick(row)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(row); }
                }}
                className={cn(
                  'flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                  current ? 'bg-accent/60 font-medium text-foreground' : 'text-foreground hover:bg-accent/40 focus-visible:bg-accent/40',
                )}
              >
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                  <StatusLook status={row} progress={row.stage === 'in_progress' ? progressOf(row) : 0} size={17} />
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{nameOf(row)}</span>
                {more ?? (current && <Check size={13} className="text-foreground/80" />)}
              </div>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}
