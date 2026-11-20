'use client';

import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { StatusLook } from '@/Function/shared/StatusLook';
import { StatusMenu } from '@/Function/shared/StatusMenu';
import { stageOf, statusOf, statusesByStage, type Status, type StatusRow, type StatusScope } from '@/Function/shared/workStatus';

/** An Object's or a Strategy's status as a mark — the same marks an
 *  Element's status shows. `progress` fills the In Progress pie. */
export function WorkStatusMark({ status, progress = 0, size = 14 }: { status: Status; progress?: number; size?: number }) {
  return <StatusLook status={status} progress={progress} size={size} />;
}

/**
 * Picks the status an Object or a Strategy stands in — the same list an
 * Element's status picker shows (StatusMenu): every stage with its own
 * status, and the ones the Space added under it. `onChange` gets the stage
 * and the status within it (null for the stage's own). How far the work has
 * come is the Elements' (`progress`), not set here.
 */
export function WorkStatusPicker({ scope, rows, stage, statusId, progress = 0, onChange, children }: {
  scope: StatusScope;
  rows: readonly StatusRow[];
  stage: string | null | undefined;
  statusId: string | null | undefined;
  /** The share of its work done, for the In Progress pie. */
  progress?: number;
  onChange: (next: { stage: string; statusId: string | null }) => void;
  /** The trigger: what the row shows for the current status. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = statusOf(scope, rows, stageOf(stage), statusId);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-60 rounded-lg p-1" onClick={(e) => e.stopPropagation()}>
        <StatusMenu
          groups={statusesByStage(scope, rows)}
          isCurrent={(row) => current.stage === row.stage && current.id === row.id}
          onPick={(row) => { onChange({ stage: row.stage, statusId: row.id }); setOpen(false); }}
          progressOf={() => progress}
        />
      </PopoverContent>
    </Popover>
  );
}
