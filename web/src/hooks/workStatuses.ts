'use client';

// The statuses a Space defines for itself (work_statuses): read once per
// Space and kept in the query cache, written one row at a time. What the
// rows mean is Function/shared/workStatus.

import { useQuery } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { nextOrderIndex, type StatusRow, type StatusScope } from '@/Function/shared/workStatus';

const KEY = (spaceId: string) => ['workStatuses', spaceId] as const;

async function fetchWorkStatuses(spaceId: string): Promise<StatusRow[]> {
  const { data, error } = await supabase
    .from('work_statuses')
    .select('id, scope, stage, builtin, name, icon, color, order_index')
    .eq('activity_space_id', spaceId)
    .order('order_index');
  if (error) throw error;
  return (data ?? []) as StatusRow[];
}

const NONE: StatusRow[] = [];

/** Every status the Space saved, of both scopes. Empty until read, and when
 *  the Space saved none: each stage then shows its own status. */
export function useWorkStatuses(spaceId: string | null | undefined): { rows: StatusRow[]; loading: boolean } {
  const query = useQuery({
    queryKey: KEY(spaceId ?? ''),
    enabled: !!spaceId,
    staleTime: 60_000,
    queryFn: () => fetchWorkStatuses(spaceId!),
  });
  return { rows: query.data ?? NONE, loading: !!spaceId && query.isPending };
}

function refresh(spaceId: string): Promise<void> {
  return getQueryClient().invalidateQueries({ queryKey: KEY(spaceId) });
}

/** Adds a status of the Space's own to a stage, after the last one there. */
export async function createWorkStatus(spaceId: string, scope: StatusScope, stage: string, name: string): Promise<void> {
  const rows = getQueryClient().getQueryData<StatusRow[]>(KEY(spaceId)) ?? [];
  const { error } = await supabase.from('work_statuses').insert({
    activity_space_id: spaceId, scope, stage, name: name.trim(), builtin: false,
    order_index: nextOrderIndex(rows, scope, stage),
  });
  if (error) throw error;
  await refresh(spaceId);
}

/** Changes a status's name, icon or colour. A stage's own status has no row
 *  until it is first changed (`rowId` null): the row is made then, starting
 *  from the look it had (`current`). */
export async function saveWorkStatusLook(
  spaceId: string,
  target: { rowId: string | null; scope: StatusScope; stage: string },
  current: { name: string; icon: string | null; color: string | null },
  patch: { name?: string; icon?: string | null; color?: string | null },
): Promise<void> {
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  const { error } = target.rowId
    ? await supabase.from('work_statuses').update(next).eq('id', target.rowId)
    : await supabase.from('work_statuses').insert({ activity_space_id: spaceId, scope: target.scope, stage: target.stage, builtin: true, ...next });
  if (error) throw error;
  await refresh(spaceId);
}

/** Removes a status the Space added — or, for a stage's own status, the look
 *  the Space gave it. Whatever stood in it falls back to its stage's own. */
export async function deleteWorkStatus(spaceId: string, rowId: string): Promise<void> {
  const { error } = await supabase.from('work_statuses').delete().eq('id', rowId);
  if (error) throw error;
  await refresh(spaceId);
}

/** How many Objects and Strategies of the Space stand in each status, keyed
 *  `<stage>` for a stage's own and `<status id>` for one the Space added. */
export function useWorkStatusCounts(spaceId: string | null | undefined): Record<string, { objects: number; strategies: number }> {
  const query = useQuery({
    queryKey: ['workStatusCounts', spaceId ?? ''],
    enabled: !!spaceId,
    staleTime: 30_000,
    queryFn: async () => {
      // An Object belongs to the Space through its Domain.
      const domains = await supabase.from('domains').select('id').eq('activity_space_id', spaceId!);
      if (domains.error) throw domains.error;
      const domainIds = (domains.data ?? []).map((d) => d.id);
      const [objects, strategies] = await Promise.all([
        domainIds.length
          ? supabase.from('objects').select('work_stage, work_status_id').in('domain_id', domainIds).is('archived_at', null)
          : Promise.resolve({ data: [] as { work_stage: string; work_status_id: string | null }[], error: null }),
        supabase.from('strategies').select('work_stage, work_status_id').eq('activity_space_id', spaceId!),
      ]);
      if (objects.error) throw objects.error;
      if (strategies.error) throw strategies.error;
      const out: Record<string, { objects: number; strategies: number }> = {};
      const add = (row: { work_stage: string; work_status_id: string | null }, kind: 'objects' | 'strategies') => {
        const key = row.work_status_id ?? row.work_stage;
        (out[key] ??= { objects: 0, strategies: 0 })[kind] += 1;
      };
      for (const row of objects.data ?? []) add(row, 'objects');
      for (const row of strategies.data ?? []) add(row, 'strategies');
      return out;
    },
  });
  return query.data ?? NO_COUNTS;
}
const NO_COUNTS: Record<string, { objects: number; strategies: number }> = {};
