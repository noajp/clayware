'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { handoffBlock, type HandoffBlock } from '@/Function/team/claudeCodeHandoff';

// Whether Claude Code can take an Element: the development Domain the
// dispatcher works in (dev_control.domain_id) against the Domain of the
// Element's Object.

export interface ClaudeCodeScope {
  block: HandoffBlock | null;
  /** The development Domain's name, to say where the Element has to be. */
  devDomainName: string | null;
  loading: boolean;
}

export function useClaudeCodeScope(objectId: string | null): ClaudeCodeScope {
  const dev = useQuery({
    queryKey: ['dev-control-domain'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('dev_control').select('domain_id, domain:domains(name)').eq('id', 1).maybeSingle();
      if (error) throw error;
      const row = data as { domain_id: string | null; domain: { name: string } | null } | null;
      return { id: row?.domain_id ?? null, name: row?.domain?.name ?? null };
    },
  });
  const own = useQuery({
    queryKey: ['object-domain', objectId],
    enabled: !!objectId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('objects').select('domain_id').eq('id', objectId!).maybeSingle();
      if (error) throw error;
      return (data?.domain_id as string | null) ?? null;
    },
  });
  const loading = dev.isPending || (!!objectId && own.isPending);
  return {
    block: loading ? null : handoffBlock({ elementDomainId: objectId ? own.data ?? null : null, devDomainId: dev.data?.id ?? null }),
    devDomainName: dev.data?.name ?? null,
    loading,
  };
}
