'use client';

import { AlertTriangle, Clock, Loader2 } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { useNowMinute } from '@/Function/shared/useNow';
import { runsInClaudeCode } from '@/Function/team/agentModel';
import { claudeCodeState } from '@/Function/team/claudeCodeHandoff';
import type { ClaudeCodeScope } from '@/hooks/claudeCodeScopeData';
import type { ElementWithDetails } from '@/types/database';

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Why Claude Code cannot take this Element, in a sentence; null when it can. */
export function claudeCodeBlockMessage(scope: ClaudeCodeScope, t: T): string | null {
  if (scope.block === 'outside-dev-space') {
    return scope.devSpaceName
      ? t('Claude Code works only in the {space} Space.', { space: scope.devSpaceName })
      : t('Claude Code works only in Clayware’s own Space.');
  }
  if (scope.block === 'no-dev-space') return t('No development Domain is set for Claude Code.');
  return null;
}

/** Where an Element handed to Claude Code stands, in the place the Clayware
 *  agent's run shows: waiting for the dispatcher on the developer's Mac, a
 *  session working on it, or handed but never to be picked up (and why).
 *  Once it is done, its PR shows under Code changes. */
export function ClaudeCodeStatus({ element, scope }: { element: ElementWithDetails; scope: ClaudeCodeScope }) {
  const { t } = useI18n();
  const now = useNowMinute(true);
  if (scope.loading) return null;
  const hasClaudeCodeAssignee = (element.assignees ?? []).some((a) => a.role !== 'reviewer' && runsInClaudeCode(a.worker?.ai_config));
  const state = claudeCodeState({
    labels: element.labels, status: element.status,
    claimedBy: element.claimed_by, claimExpiresAt: element.claim_expires_at,
    hasClaudeCodeAssignee, block: scope.block,
  }, now);
  if (!state || state === 'done') return null;

  const why = state !== 'stuck' ? null
    : claudeCodeBlockMessage(scope, t)
      ?? (!hasClaudeCodeAssignee ? t('No Claude Code Worker is assigned to it.') : t('Claude Code takes only To Do or In Progress Elements.'));
  const row = {
    waiting: { glyph: <Clock size={15} className="text-muted-foreground" />, line: t('Waiting for Claude Code to pick it up'), word: t('Waiting'), tone: 'text-muted-foreground' },
    working: { glyph: <Loader2 size={15} className="animate-spin text-[var(--accent-default)]" />, line: t('Claude Code is working on it'), word: t('Working'), tone: 'text-[var(--accent-default)]' },
    stuck: { glyph: <AlertTriangle size={15} className="text-[var(--status-danger)]" />, line: t('Handed to Claude Code, but it will not be picked up'), word: t('Not picked up'), tone: 'text-[var(--status-danger)]' },
  }[state];

  return (
    <section>
      <div role="status" aria-live="polite" className="flex min-h-9 items-center gap-2.5 px-1 py-1.5">
        {row.glyph}
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">{row.line}</span>
        {state === 'working' && element.branch && (
          <span className="max-w-[40%] shrink truncate rounded-md border border-border bg-muted/40 px-1.5 py-px font-mono text-[11px] text-foreground/80">{element.branch}</span>
        )}
        <span className={`shrink-0 text-[12px] ${row.tone}`}>{row.word}</span>
      </div>
      <p className="px-1 text-[12px] text-muted-foreground">
        {state === 'waiting' ? t('The dispatcher on the developer’s Mac looks every minute; this changes when a session takes it.')
          : state === 'working' ? t('Its progress arrives as comments below, and its pull request under Code changes.')
          : why}
      </p>
    </section>
  );
}
