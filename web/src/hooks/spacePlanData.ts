'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { planOf, type SpacePlan } from '@/Function/space/spacePlan';

// A Space's plan, and how many Domains and members it holds, as the person can see them.
// The plan is read-only here: it moves only through the service. The count is
// what RLS shows this person (a private Domain they are not in is not
// counted), so the screen's limit is a guide; the server's count decides.

export interface SpacePlanState {
  plan: SpacePlan | null;
  domainCount: number;
  memberCount: number;
  loading: boolean;
}

const spacePlanKey = (spaceId: string | null) => ['space-plan', spaceId] as const;

export function useSpacePlan(spaceId: string | null): SpacePlanState {
  const query = useQuery({
    queryKey: spacePlanKey(spaceId),
    queryFn: async () => {
      const [space, domains, members] = await Promise.all([
        supabase.from('activity_spaces').select('plan').eq('id', spaceId!).maybeSingle(),
        supabase.from('domains').select('id', { count: 'exact', head: true }).eq('activity_space_id', spaceId!),
        supabase.from('activity_space_members').select('user_id', { count: 'exact', head: true }).eq('activity_space_id', spaceId!),
      ]);
      if (space.error) throw space.error;
      return {
        plan: space.data ? planOf((space.data as { plan?: unknown }).plan) : null,
        domainCount: domains.count ?? 0,
        memberCount: members.count ?? 0,
      };
    },
    enabled: !!spaceId,
    staleTime: 30_000,
  });
  return {
    plan: query.data?.plan ?? null,
    domainCount: query.data?.domainCount ?? 0,
    memberCount: query.data?.memberCount ?? 0,
    loading: !!spaceId && query.isPending,
  };
}
