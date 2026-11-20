import { describe, expect, it } from 'vitest';
import { buildGapReport, isCheckStale, standingOf } from '../src/ActivitySpace/strategy/initiative/gapModel';
import type { Intent, IntentBinding } from '../src/types/database';

const brief = await import(new URL('../../supabase/functions/strategy-gap/gapBrief.ts', import.meta.url).pathname) as typeof import('../../supabase/functions/strategy-gap/gapBrief');

const intent = (over: Partial<Intent>): Intent => ({
  id: 'i', strategy_id: 's', parent_intent_id: 'root', kind: 'decision', target_value: null, actual_value: null, unit: null,
  measured_at: null, direction: null, slug: null, title: 'x', subtitle: null, captured_dimensions: [], uncaptured_dimensions: [],
  abandoned: null, horizon: null, status: 'on_track', decided_by_name: null, decided_by_role: null, decided_at: null,
  superseded_by_intent_id: null, verdict: null, order_index: 0, created_by: 'u', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...over,
} as Intent);
const bind = (intent_id: string, target_id: string): IntentBinding => ({
  id: `${intent_id}-${target_id}`, intent_id, target_type: 'element', target_id, relationship_type: 'delivers', note: null, created_at: '',
});

describe('buildGapReport', () => {
  const reversed = intent({ id: 'd1', superseded_by_intent_id: 'd2' });
  const standing = intent({ id: 'd2' });
  const rejected = intent({ id: 'a1', kind: 'assumption', verdict: 'rejected' });
  const metMeasure = intent({ id: 'm1', kind: 'measure', target_value: 10, actual_value: 12, direction: 'at_least' });
  const openMeasure = intent({ id: 'm2', kind: 'measure', target_value: 10, actual_value: 3, direction: 'at_least' });
  const untested = intent({ id: 'a2', kind: 'assumption' });
  const supported = intent({ id: 'a3', kind: 'assumption', verdict: 'supported' });
  const elements = [
    { id: 'e1', title: 'On the old decision', status: 'in_progress' },
    { id: 'e2', title: 'Tests a dead hypothesis', status: 'todo' },
    { id: 'e3', title: 'Finished on the old decision', status: 'done' },
    { id: 'e4', title: 'No reason', status: 'todo' },
    { id: 'e5', title: 'Descendant work, no reason', status: 'todo' },
    { id: 'e6', title: 'Serves the new decision', status: 'todo' },
  ];
  const report = buildGapReport({
    intents: [intent({ id: 'root', kind: 'master', parent_intent_id: null }), reversed, standing, rejected, metMeasure, openMeasure, untested, supported],
    bindings: [bind('d1', 'e1'), bind('a1', 'e2'), bind('d1', 'e3'), bind('d2', 'e6')],
    elements,
    ownElementIds: new Set(['e1', 'e2', 'e3', 'e4', 'e6']),
  });

  it('finds open work standing on a reversed decision or a rejected hypothesis, not finished work', () => {
    expect(report.broken.map((b) => [b.element.id, b.cause])).toEqual([['e1', 'reversed'], ['e2', 'rejected']]);
  });
  it('lists only intents that still owe work and have none', () => {
    expect(report.unserved.map((i) => i.id)).toEqual(['m2', 'a2']);
  });
  it('lists unbound open work in the Strategy’s own Objects only', () => {
    expect(report.unanchored.map((e) => e.id)).toEqual(['e4']);
  });
  it('says nothing about reasons when the Strategy has no intents', () => {
    const empty = buildGapReport({ intents: [], bindings: [], elements, ownElementIds: new Set(['e4']) });
    expect(empty.hasIntents).toBe(false);
    expect(empty.unanchored).toEqual([]);
  });
});

describe('standingOf', () => {
  const report = { broken: [{ element: { id: 'b', title: '' }, intent: {} as Intent, cause: 'reversed' as const }], anchoredIds: new Set(['a', 'x']) };
  it('puts broken bases and Athena’s off-course work outside, its unclear work on the edge', () => {
    expect(standingOf('b', report, new Map())).toBe('out');
    expect(standingOf('a', report, new Map([['a', 'off_course' as const]]))).toBe('out');
    expect(standingOf('x', report, new Map([['x', 'unclear' as const]]))).toBe('edge');
    expect(standingOf('a', report, new Map())).toBe('aligned');
    expect(standingOf('z', report, new Map())).toBe('unknown');
  });
});

describe('isCheckStale', () => {
  it('is stale once the Strategy or an intent changed after the check', () => {
    expect(isCheckStale('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z', [{ updated_at: '2026-01-15T00:00:00Z' }])).toBe(false);
    expect(isCheckStale('2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z', [])).toBe(true);
    expect(isCheckStale('2026-02-01T00:00:00Z', null, [{ updated_at: '2026-03-01T00:00:00Z' }])).toBe(true);
  });
});

describe('strategy-gap brief', () => {
  const input = {
    root: { id: 'S-root', name: '法人向けに絞る', description: '個人向けはやめる', depth: 0 },
    intents: [{ id: 'I-a', kind: 'decision', title: '個人向けをやめる', subtitle: null, verdict: null, superseded: false }],
    below: [{ id: 'S-child', name: '展示会', description: null, depth: 1 }],
    objects: [{ id: 'O-1', name: '販促', description: null, strategyId: 'S-child' }],
    elements: [{ id: 'E-1', displayId: 'MKT-3', title: '個人向けキャンペーン', description: null, status: 'todo', objectId: 'O-1', intentIds: ['I-a'] }],
    skipped: 0,
  };

  it('names things by reference, never by id', () => {
    const text = brief.briefOf(input);
    expect(text).toContain('E1 [todo] 個人向けキャンペーン（O1）');
    expect(text).toContain('目的: I1');
    expect(text).not.toContain('E-1');
  });

  it('keeps findings only on references it gave, never the root, once each', () => {
    const answer = brief.readAnswer(input, {
      summary: 'ずれがある',
      findings: [
        { ref: 'E1', kind: 'off_course', reason: '方針と逆', suggestion: '取りやめる' },
        { ref: 'e1', kind: 'obsolete', reason: '重複', suggestion: '' },
        { ref: 'E9', kind: 'unclear', reason: '架空', suggestion: '' },
        { ref: 'S1', kind: 'unclear', reason: '根', suggestion: '' },
        { ref: 'S2', kind: 'unclear', reason: '子', suggestion: '' },
        { ref: 'O1', kind: 'bogus', reason: '種類なし', suggestion: '' },
      ],
      uncovered: [{ intent: 'I1', title: '法人の新規開拓', suggestion: '起票する' }, { intent: '', title: '本文から', suggestion: '' }],
    });
    expect(answer.findings.map((f) => [f.target_type, f.target_id, f.kind])).toEqual([
      ['element', 'E-1', 'off_course'],
      ['strategy', 'S-child', 'unclear'],
    ]);
    expect(answer.findings[0].label).toBe('MKT-3 個人向けキャンペーン');
    expect(answer.uncovered.map((u) => u.intent_id)).toEqual(['I-a', null]);
  });
});

describe('gap over time', async () => {
  const { timePoints, standingTable } = await import('../src/ActivitySpace/strategy/initiative/gapTimeModel');
  const now = Date.parse('2026-11-16T00:00:00Z');
  const els = [
    { id: 'a', label: 'a', standing: 'aligned' as const, created_at: '2026-11-15T00:00:00Z', updated_at: '2026-11-15T12:00:00Z' },
    { id: 'b', label: 'b', standing: 'unknown' as const, created_at: '2026-11-06T00:00:00Z', updated_at: null },
    { id: 'c', label: 'c', standing: 'unknown' as const, created_at: null, updated_at: '2026-11-10T00:00:00Z' },
  ];
  it('measures age from creation and idle from the last update, skipping undated work', () => {
    expect(timePoints(els, 'age', now).map((p) => [p.id, p.days])).toEqual([['a', 1], ['b', 10]]);
    expect(timePoints(els, 'idle', now).map((p) => [p.id, p.days])).toEqual([['a', 0.5], ['b', 10]]);
  });
  it('reads percentiles by nearest rank and tables them by standing', () => {
    const rows = standingTable(timePoints(els, 'age', now));
    expect(rows.find((r) => r.standing === 'unknown')).toMatchObject({ n: 1, p50: 10 });
    expect(rows.find((r) => r.standing === 'out')).toMatchObject({ n: 0, p50: null });
  });
});
