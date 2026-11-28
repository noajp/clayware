'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { nextOrder, statusPatch, type FunctionDefinition, type FunctionStatus } from '@/Function/sustainment/definition';
import { assertChanged, isMissingTable, type NewFunctionInput } from '@/hooks/useSustainments';
import { supabase } from '@/lib/supabase';
import { useCurrentUserId } from '@/providers/authContext';
import type { SustainmentFunction } from '@/types/database';
import type { Json } from '@/types/supabase';

/** A Sustainment's functions, in their order. A database without the
 *  table yet has none, rather than an error. */
async function fetchFunctions(sustainmentId: string, signal?: AbortSignal): Promise<SustainmentFunction[]> {
  let query = supabase.from('sustainment_functions').select('*')
    .eq('sustainment_id', sustainmentId)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []) as SustainmentFunction[];
}

const EMPTY: SustainmentFunction[] = [];

export type FunctionPatch = Partial<{
  name: string;
  icon: string | null;
  differences: string | null;
  definition: FunctionDefinition;
  status: FunctionStatus;
}>;

/** One Sustainment's functions, and ways to add, change and remove them. */
export function useSustainmentFunctions(sustainmentId: string | null) {
  const userId = useCurrentUserId();
  const spaceId = useActiveSpaceId();
  const enabled = Boolean(userId && spaceId && sustainmentId);
  const qc = useQueryClient();
  const key = ['sustainment-functions', userId, sustainmentId] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchFunctions(sustainmentId!, signal),
    enabled,
    staleTime: 30_000,
  });
  const data = enabled ? query.data ?? EMPTY : EMPTY;

  const create = useMutation({
    meta: { silent: true },
    mutationFn: async (input: NewFunctionInput): Promise<SustainmentFunction> => {
      const name = input.name.trim();
      if (!name) throw new Error('A name is required.');
      if (!userId || !spaceId || !sustainmentId) throw new Error('No Sustainment is open.');
      const { data: row, error } = await supabase.from('sustainment_functions').insert({
        activity_space_id: spaceId,
        sustainment_id: sustainmentId,
        name,
        icon: input.icon,
        template_key: input.templateKey,
        differences: input.differences?.trim() || null,
        definition: input.definition as unknown as Json,
        order_index: nextOrder(data),
        created_by: userId,
      }).select('*').single();
      if (error) throw error;
      return row as SustainmentFunction;
    },
    onSuccess: (row) => qc.setQueryData<SustainmentFunction[]>(key, (rows) => [...(rows ?? []), row]),
    onSettled: () => qc.invalidateQueries({ queryKey: ['sustainment-functions'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: FunctionPatch }) => {
      const { status, definition, ...rest } = patch;
      const row = {
        ...rest,
        ...(definition ? { definition: definition as unknown as Json } : {}),
        ...(status ? statusPatch(status) : {}),
      };
      const { data: rows, error } = await supabase.from('sustainment_functions').update(row).eq('id', id).select('id');
      if (error) throw error;
      assertChanged(rows);
    },
    onMutate: ({ id, patch }) => {
      const { status, ...rest } = patch;
      qc.setQueryData<SustainmentFunction[]>(key, (rows) => rows?.map((r) => (r.id === id
        ? { ...r, ...rest, ...(status ? statusPatch(status) : {}) } : r)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sustainment-functions'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: rows, error } = await supabase.from('sustainment_functions').delete().eq('id', id).select('id');
      if (error) throw error;
      assertChanged(rows);
    },
    onSuccess: (_, id) => qc.setQueryData<SustainmentFunction[]>(key, (rows) => rows?.filter((r) => r.id !== id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['sustainment-functions'] }),
  });

  return {
    data,
    loading: enabled && query.isPending,
    error: enabled ? query.error : null,
    createFunction: create.mutateAsync,
    updateFunction: update.mutateAsync,
    removeFunction: remove.mutateAsync,
  };
}
