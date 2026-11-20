'use client';

import { StatusLook } from '@/Function/shared/StatusLook';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { useWorkStatuses } from '@/hooks/workStatuses';
import { useStatusName } from '@/Function/shared/StatusLook';
import { elementStatusOf, type StatusRow } from '@/Function/shared/workStatus';

// An Element's status as a mark (StatusLook), read from its stage and the
// status within it.

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
  return <StatusLook status={elementStatusOf(rows, { status, status_id: statusId })} progress={progress} size={size} />;
}

/** An Element's status name: the Space's name for it, or the stage's built-in
 *  label in the viewer's language. */
export function useElementStatusName(): (element: { status?: string | null; status_id?: string | null }) => string {
  const rows = useElementStatusRows();
  const nameOf = useStatusName();
  return (element) => nameOf(elementStatusOf(rows, element));
}
