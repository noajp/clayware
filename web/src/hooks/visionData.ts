'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getQueryClient } from '@/lib/queryClient';
import { getCurrentUserId, supabase } from '@/lib/supabase';
import { getActiveSpaceId, useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { visionsOfSpace } from '@/Function/strategy/visionOrder';
import type { Vision } from '@/types/database';

// Visions: the top of Strategy, each holding its Portfolios (strategies).
// One query for the viewer's Visions in every Space; the hooks narrow it to
// the open Space, in the order the Space keeps them.

const VISIONS_KEY = ['visions'] as const;
const EMPTY: Vision[] = [];

/** The open Space's Visions, in order. */
export function useVisions() {
  const spaceId = useActiveSpaceId();
  const query = useQuery({
    queryKey: VISIONS_KEY,
    queryFn: async (): Promise<Vision[]> => {
      const { data, error } = await supabase.from('visions').select('*');
      if (error) throw error;
      return (data ?? []) as Vision[];
    },
  });
  const all = query.data ?? EMPTY;
  const data = useMemo(() => visionsOfSpace(all, spaceId), [all, spaceId]);
  return { data, loading: query.isPending };
}

/** The viewer's role in each Vision they are a member of (owner, admin,
 *  member, viewer); one they only see through the Space has none. */
export function useMyVisionRoles(): Map<string, string> {
  const query = useQuery({
    queryKey: [...VISIONS_KEY, 'my-roles'],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) return [];
      const { data, error } = await supabase.from('vision_members').select('vision_id, role').eq('user_id', userId);
      if (error) throw error;
      return data ?? [];
    },
  });
  return useMemo(() => new Map((query.data ?? []).map((r) => [r.vision_id, r.role])), [query.data]);
}

function refresh() {
  void getQueryClient().invalidateQueries({ queryKey: VISIONS_KEY });
}

export async function createVision(name: string, description: string | null = null): Promise<Vision> {
  const createdBy = await getCurrentUserId();
  const spaceId = getActiveSpaceId();
  if (!createdBy || !spaceId) throw new Error('Not signed in');
  const { data, error } = await supabase.from('visions')
    .insert({ name, description, activity_space_id: spaceId, created_by: createdBy, order_index: Date.now() })
    .select().single();
  if (error) throw error;
  refresh();
  return data as Vision;
}

export async function updateVision(id: string, patch: Partial<Pick<Vision, 'name' | 'description' | 'icon' | 'color' | 'privacy' | 'order_index'>>): Promise<void> {
  const { error } = await supabase.from('visions').update(patch).eq('id', id);
  if (error) throw error;
  refresh();
}

/** Refused by the database while the Vision still holds Portfolios. */
export async function deleteVision(id: string): Promise<void> {
  const { error } = await supabase.from('visions').delete().eq('id', id);
  if (error) throw error;
  refresh();
}
