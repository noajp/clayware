import { describe, expect, it } from 'vitest';
import { beltGradient, elapsedShare, outlook, warmthGradient, warnsAboutTime, withStates } from '@/Function/shared/pace';

const alphas = (g: string) => [...g.matchAll(/ ([\d.]+)%, transparent\)/g)].map((m) => Number(m[1]));

describe('Pace colour', () => {
  it('leaves finished and set-aside work alone', () => {
    expect(warnsAboutTime('done')).toBe(false);
    expect(warnsAboutTime('cancelled')).toBe(false);
    expect(warnsAboutTime('in_progress')).toBe(true);
    expect(warnsAboutTime(null)).toBe(true);
  });

  it('reads the outlook from progress against the share of the span gone by', () => {
    // 10-day bar, today its 5th day: half gone
    const at = (p: number) => outlook(p, '2026-11-10', '2026-11-19', '2026-11-14');
    expect(at(50)).toBe(0);
    expect(at(65)).toBeCloseTo(0.5);
    expect(at(80)).toBe(1);
    expect(at(35)).toBeCloseTo(-0.5);
    expect(at(0)).toBe(-1);
  });

  it('expects nothing before a bar starts and cannot judge without dates', () => {
    expect(outlook(0, '2026-11-20', '2026-11-30', '2026-11-14')).toBe(0);
    expect(outlook(30, '2026-11-20', '2026-11-30', '2026-11-14')).toBe(1);
    expect(outlook(100, null, '2026-11-10', '2026-11-14')).toBe(0);
  });

  it('reads a finished span without finished work as surely late', () => {
    expect(outlook(40, '2026-11-01', '2026-11-10', '2026-11-14')).toBe(-1);
    expect(outlook(100, '2026-11-01', '2026-11-10', '2026-11-14')).toBe(0);
  });

  it('paints nothing for a bar that has not started', () => {
    expect(warmthGradient(400, 0, 1)).toBeNull();
    expect(warmthGradient(400, -40, 1)).toBeNull();
  });

  it('opens clear and deepens to today in blue when sure of it, in red when not', () => {
    const sure = warmthGradient(400, 200, 1)!;
    const unsure = warmthGradient(400, 200, -1)!;
    expect(sure.startsWith('linear-gradient(in oklab to right, color-mix(in oklab, oklch(from var(--accent-default) calc(l + 0.12) calc(c * 1.25) h) 0.0%, transparent) 0.0px')).toBe(true);
    expect(sure).toContain('200.0px');
    expect(sure).not.toContain('var(--status-danger)');
    expect(unsure).toContain('var(--status-danger)');
    expect(unsure).not.toContain('var(--accent-default)');
  });

  it('deepens smoothly up to today, then fades back to clear', () => {
    const g = warmthGradient(400, 200, 0.5)!;
    const a = alphas(g);
    expect(a.length).toBeGreaterThan(6);
    expect(a.every((v, i) => i === 0 || v >= a[i - 1])).toBe(true);
    expect(g.endsWith('transparent 226.0px)') || g.includes(', transparent 2')).toBe(true);
  });

  it('has no fade when today is at the bar\'s end or beyond it', () => {
    expect(warmthGradient(400, 400, 1)).not.toContain(', transparent ');
    expect(warmthGradient(400, 900, 1)).not.toContain(', transparent ');
  });

  it('moves over to red from a milestone that has gone by, not from one still ahead', () => {
    const gone = warmthGradient(400, 300, 1, 150)!;
    expect(gone).toContain('var(--status-danger)');
    expect(gone).toContain('var(--accent-default)');
    const ahead = warmthGradient(400, 300, 1, 350)!;
    expect(ahead).not.toContain('var(--status-danger)');
  });

  it('draws a progress belt clear at its start and deepest at its edge, blue or red by outlook', () => {
    const blue = beltGradient(0.6);
    expect(blue.startsWith('linear-gradient(in oklab to right, color-mix(in oklab, oklch(from var(--accent-default)')).toBe(true);
    expect(blue).toContain('100.0%');
    expect(blue).not.toContain('var(--status-danger)');
    expect(beltGradient(-0.4)).toContain('var(--status-danger)');
    expect(beltGradient(0)).toContain('var(--accent-default)');
    expect(beltGradient(0)).not.toContain('var(--status-danger)');
    // On time with little to spare: blue, its tip leaning red.
    const thin = beltGradient(0.28);
    expect(thin).toContain('var(--status-danger)');
    expect(thin.split('%, transparent) 0.0%')[0]).not.toContain('var(--status-danger)');
    const a = alphas(blue);
    expect(a.every((v, i) => i === 0 || v >= a[i - 1])).toBe(true);
  });

  it('measures the share of a span gone by, null without one', () => {
    expect(elapsedShare('2026-11-10', '2026-11-19', '2026-11-14')).toBe(0.5);
    expect(elapsedShare('2026-11-10', '2026-11-19', '2026-11-01')).toBe(0);
    expect(elapsedShare('2026-11-10', '2026-11-19', '2026-12-01')).toBe(1);
    expect(elapsedShare(null, '2026-11-19', '2026-11-14')).toBeNull();
    expect(elapsedShare('2026-11-20', '2026-11-19', '2026-11-14')).toBeNull();
  });

  it('lets blocked and overdue open Elements pull the outlook down', () => {
    const today = '2026-11-15';
    const ok = { status: 'in_progress', due_date: '2026-11-20' };
    const late = { status: 'todo', due_date: '2026-11-14' };
    expect(withStates(0.9, [ok, ok, { status: 'done', due_date: '2026-11-01' }], today)).toBe(0.9);
    // One of four open in trouble: still on time, with little to spare.
    const one = withStates(0.9, [ok, ok, ok, late], today);
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(0.5);
    // Half: behind.
    expect(withStates(0.9, [ok, { status: 'blocked' }], today)).toBeLessThan(0);
    // No schedule still shows trouble.
    expect(withStates(0, [ok, ok, ok, late], today)).toBeGreaterThan(0);
  });
});
