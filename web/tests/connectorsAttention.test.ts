import { describe, expect, it } from 'vitest';
import { attentionItems } from '@/AIP/connectors/connectorsAttention';

// What the top of Settings › Connectors lists as waiting on a person.

const draft = (id: string, status: string) => ({ id, name: `Draft ${id}`, status }) as never;
const conn = (over: Record<string, unknown>) => ({
  id: 'c', name: 'Conn', kind: 'http', preset: null, icon: null, enabled: true,
  last_test: { ok: true, code: 'connected' }, auth_type: 'bearer', secret_id: 's', ...over,
}) as never;
const login = (over: Record<string, unknown>) => ({
  id: 'l', origin: 'https://portal.example.com', label: null, secret_id: 's', last_test: null, ...over,
}) as never;

const pick = (items: ReturnType<typeof attentionItems>) => items.map((i) => [i.kind, i.id, i.reason]);

describe('attentionItems', () => {
  it('lists a draft whose AI is asking, then one waiting for review, and skips drafts still working', () => {
    const items = attentionItems({
      drafts: [draft('r', 'awaiting_review'), draft('q', 'awaiting_input'), draft('w', 'drafting'), draft('t', 'testing'), draft('a', 'active')],
      integrations: [], siteLogins: [], isOwner: true,
    });
    expect(pick(items)).toEqual([
      ['draft-question', 'q', 'The AI is asking you something'],
      ['draft-review', 'r', 'Waiting for your review'],
    ]);
  });

  it('tells a member who the draft waits on instead of asking them', () => {
    const items = attentionItems({
      drafts: [draft('q', 'awaiting_input'), draft('r', 'awaiting_review')], integrations: [], siteLogins: [], isOwner: false,
    });
    expect(items.map((i) => i.reason)).toEqual(['The AI is waiting for an owner’s answer', 'Waiting for an owner’s review']);
  });

  it('lists a connection that stopped working, with the test’s reason', () => {
    const items = attentionItems({
      drafts: [], siteLogins: [], isOwner: true,
      integrations: [
        conn({ id: 'ok' }),
        conn({ id: 'bad', last_test: { ok: false, code: 'auth_failed' } }),
        conn({ id: 'off', enabled: false, last_test: { ok: false, code: 'auth_failed' } }),
        conn({ id: 'model', kind: 'model', last_test: { ok: false, code: 'auth_failed' } }),
      ],
    });
    expect(pick(items)).toEqual([['connection', 'bad', 'Authentication failed']]);
  });

  it('lists a sign-in connection that holds no token as a sign-in that has not finished', () => {
    const items = attentionItems({
      drafts: [], siteLogins: [], isOwner: true,
      integrations: [
        conn({ id: 'abandoned', auth_type: 'oauth', secret_id: null, last_test: null }),
        conn({ id: 'signed-in', auth_type: 'oauth', secret_id: 'tok' }),
        conn({ id: 'key-not-set', auth_type: 'bearer', secret_id: null, last_test: null }),
      ],
    });
    expect(pick(items)).toEqual([['connection', 'abandoned', 'Sign-in hasn’t finished']]);
  });

  it('lists a site login whose sign-in was refused, by its label or origin', () => {
    const items = attentionItems({
      drafts: [], integrations: [], isOwner: true,
      siteLogins: [
        login({ id: 'fine' }),
        login({ id: 'refused', last_test: { ok: false, code: 'auth_failed' } }),
        login({ id: 'named', label: 'Supplier portal', last_test: { ok: false, code: 'auth_failed' } }),
      ],
    });
    expect(items.map((i) => [i.kind, i.id, i.name])).toEqual([
      ['site-login', 'refused', 'https://portal.example.com'],
      ['site-login', 'named', 'Supplier portal'],
    ]);
  });

  it('is empty when nothing waits on a person', () => {
    expect(attentionItems({ drafts: [draft('a', 'active')], integrations: [conn({})], siteLogins: [login({})], isOwner: true })).toEqual([]);
  });
});
