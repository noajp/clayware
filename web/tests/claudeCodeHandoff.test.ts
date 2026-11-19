import { describe, expect, it } from 'vitest';
import { claudeCodeState, handoffBlock } from '@/Function/team/claudeCodeHandoff';

const NOW = Date.parse('2026-11-20T00:00:00Z');
const base = {
  labels: ['dispatch'], status: 'todo', claimedBy: null, claimExpiresAt: null,
  hasClaudeCodeAssignee: true, block: null,
} as const;

describe('handoffBlock', () => {
  it('blocks an Element outside the development Domain', () => {
    expect(handoffBlock({ elementDomainId: 'gtm', devDomainId: 'dev' })).toBe('outside-dev-domain');
    expect(handoffBlock({ elementDomainId: null, devDomainId: 'dev' })).toBe('outside-dev-domain');
  });
  it('blocks when no development Domain is set', () => {
    expect(handoffBlock({ elementDomainId: 'dev', devDomainId: null })).toBe('no-dev-domain');
  });
  it('lets an Element in the development Domain through', () => {
    expect(handoffBlock({ elementDomainId: 'dev', devDomainId: 'dev' })).toBeNull();
  });
});

describe('claudeCodeState', () => {
  it('is nothing until the Element is handed over', () => {
    expect(claudeCodeState({ ...base, labels: [] }, NOW)).toBeNull();
  });
  it('waits for the dispatcher when everything is in place', () => {
    expect(claudeCodeState(base, NOW)).toBe('waiting');
  });
  it('is working while a session holds a live lease', () => {
    expect(claudeCodeState({ ...base, status: 'in_progress', claimedBy: 'agent', claimExpiresAt: '2026-11-20T00:10:00Z' }, NOW)).toBe('working');
  });
  it('waits again once the lease has lapsed', () => {
    expect(claudeCodeState({ ...base, claimedBy: 'agent', claimExpiresAt: '2026-11-19T23:00:00Z' }, NOW)).toBe('waiting');
  });
  it('is stuck when the dispatcher would never take it', () => {
    expect(claudeCodeState({ ...base, block: 'outside-dev-domain' }, NOW)).toBe('stuck');
    expect(claudeCodeState({ ...base, hasClaudeCodeAssignee: false }, NOW)).toBe('stuck');
    expect(claudeCodeState({ ...base, status: 'blocked' }, NOW)).toBe('stuck');
  });
  it('is done once the Element is closed', () => {
    expect(claudeCodeState({ ...base, status: 'done' }, NOW)).toBe('done');
  });
});
