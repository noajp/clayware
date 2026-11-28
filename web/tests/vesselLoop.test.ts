import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elementFor, openLine } from '../../.claude/ops/vessel.mjs';

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

  it('never dispatches a decision: a person decides it', () => {
    const d = elementFor('decision', { title: 't', description: '', hold: false });
    expect(d.labels).not.toContain('dispatch');
    expect(d).toMatchObject({ is_approval: true, approval_state: 'pending' });
  });

  it('refuses an unknown kind or an empty title', () => {
    expect(() => elementFor('task' as never, { title: 't', description: '' })).toThrow();
    expect(() => elementFor('gap', { title: '  ', description: '' })).toThrow();
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
