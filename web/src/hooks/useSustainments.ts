'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { supabase } from '@/lib/supabase';
import { useCurrentUserId } from '@/providers/authContext';
import type { Sustainment } from '@/types/database';

/** True for a read of a table the database does not have yet (its migration
 *  not run): PostgREST's PGRST205, or Postgres's 42P01. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01'
    || /relation .* does not exist|could not find the table/i.test(error.message ?? '');
}

/** The order_index that puts a new Sustainment after the last one. */
export function nextSustainmentOrder(rows: readonly Pick<Sustainment, 'order_index'>[]): number {
  let last = 0;
  for (const r of rows) if (r.order_index != null && r.order_index > last) last = r.order_index;
  return last + 1;
}

/** A Space's Sustainments, in their order. A Space whose database has no
 *  sustainments table yet has none, rather than an error. */
async function fetchSustainments(spaceId: string, signal?: AbortSignal): Promise<Sustainment[]> {
  let query = supabase.from('sustainments').select('*')
    .eq('activity_space_id', spaceId)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []) as Sustainment[];
}

const EMPTY: Sustainment[] = [];
const sustainmentsKey = (userId: string | null, spaceId: string | null) => ['sustainments', userId, spaceId] as const;

/** The active Space's Sustainments, and a way to add one. */
export function useSustainments() {
  const userId = useCurrentUserId();
  const spaceId = useActiveSpaceId();
  const enabled = Boolean(userId && spaceId);
  const qc = useQueryClient();
  const key = sustainmentsKey(userId, spaceId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchSustainments(spaceId!, signal),
    enabled,
    staleTime: 30_000,
  });
  const data = enabled ? query.data ?? EMPTY : EMPTY;

  const create = useMutation({
    // The create dialog shows this failure inline.
    meta: { silent: true },
    mutationFn: async ({ name, icon }: { name: string; icon: string | null }): Promise<Sustainment> => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('A name is required.');
      if (!userId || !spaceId) throw new Error('No Space is open.');
      const { data: row, error } = await supabase.from('sustainments').insert({
        activity_space_id: spaceId,
        name: trimmed,
        icon,
        order_index: nextSustainmentOrder(data),
        created_by: userId,
      }).select('*').single();
      if (error) throw error;
      return row as Sustainment;
    },
    onSuccess: (row) => {
      qc.setQueryData<Sustainment[]>(key, (rows) => [...(rows ?? []), row]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sustainments'] }),
  });

  return {
    data,
    loading: enabled && query.isPending,
    error: enabled ? query.error : null,
    createSustainment: create.mutateAsync,
    creating: create.isPending,
  };
}
