// Handing an Element to Claude Code, and where that hand-over stands.
//
// The dispatcher on the developer's Mac (.claude/ops/dispatch.mjs) starts a
// Claude Code session for an Element only when its Object is in the
// development Domain (dev_control.domain_id), it is labelled 'dispatch', its
// status is To Do or In Progress and a Claude Code Worker is assigned. These
// rules let the Element page say so before it claims a hand-over, and show
// what the dispatcher is doing with it afterwards. Pure.

export const DISPATCH_LABEL = 'dispatch';

/** Why the dispatcher would not take this Element; null when it would. */
export type HandoffBlock = 'no-dev-domain' | 'outside-dev-domain';

export function handoffBlock(scope: { elementDomainId: string | null; devDomainId: string | null }): HandoffBlock | null {
  if (!scope.devDomainId) return 'no-dev-domain';
  if (scope.elementDomainId !== scope.devDomainId) return 'outside-dev-domain';
  return null;
}

/** Where a hand-over stands: not handed, waiting for the dispatcher, a session
 *  holding it, finished, or handed but never to be picked up. */
export type ClaudeCodeState = 'waiting' | 'working' | 'done' | 'stuck';

export function claudeCodeState(e: {
  labels: readonly string[] | null | undefined;
  status: string | null | undefined;
  claimedBy: string | null | undefined;
  claimExpiresAt: string | null | undefined;
  hasClaudeCodeAssignee: boolean;
  block: HandoffBlock | null;
}, now: number): ClaudeCodeState | null {
  if (!(e.labels ?? []).includes(DISPATCH_LABEL)) return null;
  if (e.status === 'done' || e.status === 'cancelled') return 'done';
  if (e.claimedBy && e.claimExpiresAt && Date.parse(e.claimExpiresAt) > now) return 'working';
  if (e.block || !e.hasClaudeCodeAssignee || (e.status !== 'todo' && e.status !== 'in_progress')) return 'stuck';
  return 'waiting';
}
