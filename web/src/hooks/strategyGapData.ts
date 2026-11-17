'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Athena's Gap checks on a Strategy (strategy_gap_checks), written only by
// the strategy-gap Edge Function. The tab reads the newest; a check is asked
// for by a person, never on its own.

export type GapFindingKind = 'off_course' | 'obsolete' | 'unclear';

export interface GapFinding {
  target_type: 'strategy' | 'object' | 'element';
  target_id: string;
  label: string;
  kind: GapFindingKind;
  reason: string;
  suggestion: string;
}

export interface GapUncovered { intent_id: string | null; title: string; suggestion: string }

export interface StrategyGapCheck {
  id: string;
  strategy_id: string;
  checked_by: string | null;
  summary: string;
  findings: GapFinding[];
  uncovered: GapUncovered[];
  scope: { strategies?: number; objects?: number; elements?: number; skipped?: number };
  created_at: string;
}

const gapKey = (strategyId: string) => ['strategy-gap-check', strategyId] as const;

/** An Edge Function error with the function's own `error` message when it sent one. */
async function functionError(error: Error): Promise<Error> {
  let message = error.message;
  if ('context' in error && error.context instanceof Response) {
    try { message = (await error.context.json()).error ?? message; } catch { /* keep the transport error */ }
  }
  return new Error(message);
}

export function useStrategyGapCheck(strategyId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: gapKey(strategyId),
    enabled: !!strategyId,
    queryFn: async (): Promise<StrategyGapCheck | null> => {
      const { data, error } = await supabase.from('strategy_gap_checks')
        .select('id, strategy_id, checked_by, summary, findings, uncovered, scope, created_at')
        .eq('strategy_id', strategyId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data as StrategyGapCheck | null) ?? null;
    },
  });

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const { data, error } = await supabase.functions.invoke('strategy-gap', { body: { strategyId } });
      if (error) throw await functionError(error);
      qc.setQueryData(gapKey(strategyId), data as StrategyGapCheck);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [qc, strategyId]);

  return {
    check: query.data ?? null,
    loading: query.isPending && !!strategyId,
    error: (query.error as Error | null) ?? null,
    run,
    running,
    runError,
  };
}
