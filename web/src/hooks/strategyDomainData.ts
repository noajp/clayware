'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// The Domains a Portfolio holds (strategy_domains), beside its Objects. Read
// where both the Portfolio and the Domain are visible; changed by whoever can
// edit the Portfolio.

const key = (strategyId: string) => ['strategy-domains', strategyId] as const;

export function useStrategyDomains(strategyId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: key(strategyId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('strategy_domains').select('domain_id').eq('strategy_id', strategyId).order('created_at');
      if (error) throw error;
      return (data ?? []).map((r) => r.domain_id as string);
    },
  });
  const add = useMutation({
    mutationFn: async (domainId: string) => {
      const { error } = await supabase.from('strategy_domains').insert({ strategy_id: strategyId, domain_id: domainId });
      if (error) throw error;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key(strategyId) }); },
  });
  const remove = useMutation({
    mutationFn: async (domainId: string) => {
      const { error } = await supabase.from('strategy_domains').delete().eq('strategy_id', strategyId).eq('domain_id', domainId);
      if (error) throw error;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key(strategyId) }); },
  });
  return { domainIds: query.data ?? [], add, remove };
}
