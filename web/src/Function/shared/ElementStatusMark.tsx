'use client';

import { ElementProgressMark } from '@/Function/shared/ElementProgressMark';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { useWorkStatuses } from '@/hooks/workStatuses';
import { useStatusName } from '@/Function/shared/WorkStatusPicker';
import { elementStatusOf, type Status, type StatusRow } from '@/Function/shared/workStatus';
import type { ElementStatus } from '@/types/database';

// An Element's status as a mark. A status with an icon the Space chose shows
// that icon in its colour; every other — a stage's own, or one the Space
// added and left without an icon — is drawn by its stage's designed mark,
// with the progress pie for In Progress.

/** The mark of a status already looked up. */
export function ElementStatusLook({ status, progress = 0, size = 16 }: { status: Status; progress?: number; size?: number }) {
  if (status.icon) return <ItemIcon icon={status.icon} color={status.color} size={size} />;
  return <ElementProgressMark status={status.stage as ElementStatus} progress={progress} size={size} />;
}

/** The statuses of the active Space, read once and shared through the query cache. */
export function useElementStatusRows(): readonly StatusRow[] {
  return useWorkStatuses(useActiveSpaceId()).rows;
}

/** An Element's mark, from its stage and the status within it. */
export function ElementStatusMark({ status, statusId, progress = 0, size = 16 }: {
  status: string | null | undefined;
  statusId: string | null | undefined;
  progress?: number;
  size?: number;
}) {
  const rows = useElementStatusRows();
  return <ElementStatusLook status={elementStatusOf(rows, { status, status_id: statusId })} progress={progress} size={size} />;
}

/** An Element's status name: the Space's name for it, or the stage's built-in
 *  label in the viewer's language. */
export function useElementStatusName(): (element: { status?: string | null; status_id?: string | null }) => string {
  const rows = useElementStatusRows();
  const nameOf = useStatusName();
  return (element) => nameOf(elementStatusOf(rows, element));
}
