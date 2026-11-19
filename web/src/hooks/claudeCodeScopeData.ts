'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { handoffBlock, type HandoffBlock } from '@/Function/team/claudeCodeHandoff';

// Whether Claude Code can take an Element: the Space of the development
// Domain the dispatcher works from (dev_control.domain_id) against the Space
// of the Element's Object.

export interface ClaudeCodeScope {
  block: HandoffBlock | null;
  /** The development Space's name, to say where the Element has to be. */
  devSpaceName: string | null;
  loading: boolean;
}

export function useClaudeCodeScope(objectId: string | null): ClaudeCodeScope {
  const dev = useQuery({
    queryKey: ['dev-control-space'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('dev_control')
        .select('domain:domains(activity_space_id, space:activity_spaces(name))').eq('id', 1).maybeSingle();
      if (error) throw error;
      const row = data as { domain: { activity_space_id: string; space: { name: string } | null } | null } | null;
      return { id: row?.domain?.activity_space_id ?? null, name: row?.domain?.space?.name ?? null };
    },
  });
  const own = useQuery({
    queryKey: ['object-space', objectId],
    enabled: !!objectId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('objects')
        .select('domain:domains!objects_domain_id_fkey(activity_space_id)').eq('id', objectId!).maybeSingle();
      if (error) throw error;
      return (data as { domain: { activity_space_id: string } | null } | null)?.domain?.activity_space_id ?? null;
    },
  });
  const loading = dev.isPending || (!!objectId && own.isPending);
  return {
    block: loading ? null : handoffBlock({ elementSpaceId: objectId ? own.data ?? null : null, devSpaceId: dev.data?.id ?? null }),
    devSpaceName: dev.data?.name ?? null,
    loading,
  };
}
