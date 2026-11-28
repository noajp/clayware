import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elementFor, moveFor, openLine, showText } from '../../.claude/ops/vessel.mjs';

describe('elementFor', () => {
  it('hands a gap to the runner ahead of the next simulation', () => {
    const gap = elementFor('gap', { title: ' 型に関係を持てない ', description: 'x' });
    expect(gap).toMatchObject({ title: '型に関係を持てない', status: 'todo', priority: 'high', labels: ['vessel', 'dispatch'] });
    const sim = elementFor('sim', { title: 'シミュレーション: S002', description: '' });
    expect(sim).toMatchObject({ priority: 'low', labels: ['simulate', 'dispatch'] });
  });

  it('files a held Element without the dispatch label', () => {
    expect(elementFor('gap', { title: 't', description: '', hold: true }).labels).toEqual(['vessel']);
  });

  it('never dispatches a decision, and keeps it out of the loop\'s own work', () => {
    const d = elementFor('decision', { title: 't', description: '', hold: false });
    expect(d.labels).toEqual(['decision']);
    expect(d).toMatchObject({ is_approval: true, approval_state: 'pending' });
  });

  it('refuses an unknown kind or an empty title', () => {
    expect(() => elementFor('task' as never, { title: 't', description: '' })).toThrow();
    expect(() => elementFor('gap', { title: '  ', description: '' })).toThrow();
  });
});

describe('moveFor', () => {
  it('closes an Element so the dispatcher never starts it again', () => {
    expect(moveFor('done', ['simulate', 'dispatch'])).toEqual({ status: 'done', progress: 100, labels: ['simulate'] });
    expect(moveFor('block', ['vessel', 'dispatch'])).toEqual({ status: 'blocked', labels: ['vessel'] });
  });

  it('marks a closed gap for the next simulation to re-check, whatever order things closed in', () => {
    const closed = moveFor('done', ['vessel', 'dispatch']);
    expect(closed).toEqual({ status: 'done', progress: 100, labels: ['vessel', 'recheck'] });
    expect(moveFor('checked', closed.labels)).toEqual({ labels: ['vessel'] });
    // △: reopened, fixed again, closed again — marked again.
    const reopened = moveFor('reopen', closed.labels);
    expect(reopened).toEqual({ status: 'todo', labels: ['vessel', 'dispatch'] });
    expect(moveFor('done', reopened.labels).labels).toEqual(['vessel', 'recheck']);
  });

  it('hands an Element back with one dispatch label', () => {
    expect(moveFor('reopen', ['vessel'])).toEqual({ status: 'todo', labels: ['vessel', 'dispatch'] });
    expect(moveFor('go', ['vessel', 'dispatch'])).toEqual({ labels: ['vessel', 'dispatch'] });
    expect(moveFor('go', null)).toEqual({ labels: ['dispatch'] });
  });

  it('never moves a decision: a person decides it', () => {
    for (const move of ['go', 'done', 'block', 'reopen', 'checked'] as const) expect(() => moveFor(move, ['decision'])).toThrow();
  });
});

describe('showText', () => {
  const el = { display_id: 'ELE_VES-001', title: '器の原則', status: 'todo', priority: 'high', labels: ['vessel', 'dispatch'], description: '## 観察\n本文' };

  it('gives a session everything it was handed: state, description, comments in order', () => {
    const text = showText(el, [
      { created_at: '2026-11-28T09:00:00Z', author_name: 'Claude', content: '● 進捗 — 一' },
      { created_at: '2026-11-28T10:00:00Z', author_name: 'TAKA', content: '二' },
    ]);
    expect(text).toContain('# ELE_VES-001 器の原則');
    expect(text).toContain('labels: vessel, dispatch');
    expect(text).toContain('## 観察\n本文');
    expect(text.indexOf('● 進捗 — 一')).toBeLessThan(text.indexOf('二'));
  });

  it('says so when there is no description or comment', () => {
    const text = showText({ ...el, description: null, labels: null }, []);
    expect(text).toContain('(no description)');
    expect(text).toContain('(none)');
  });
});

describe('openLine', () => {
  it('shows the id, status, labels and who holds it', () => {
    expect(openLine({ display_id: 'ELE_VES-001', status: 'in_progress', labels: ['vessel', 'dispatch'], claimed_by: 'agent-ele_ves-001', title: 'x' }))
      .toBe('ELE_VES-001\tin_progress\t[vessel,dispatch] held:agent-ele_ves-001\tx');
  });
});

describe('the catalog', () => {
  const catalog = readFileSync(new URL('../../.claude/vessel/catalog.md', import.meta.url), 'utf8');
  const rows = catalog.split('\n').filter((l) => /^\| S\d{3} \|/.test(l)).map((l) => l.split('|').map((c) => c.trim()));

  it('gives every simulation a unique id and a known status', () => {
    const ids = rows.map((r) => r[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rows) expect(['未着手', '済']).toContain(r[6]);
  });

  it('keeps enough simulations ahead for the loop to run', () => {
    expect(rows.filter((r) => r[6] === '未着手').length).toBeGreaterThanOrEqual(3);
  });
});
