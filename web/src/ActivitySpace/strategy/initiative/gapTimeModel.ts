// The Gap over time: every open Element under a Strategy, placed by when it
// was made and how long it has waited, coloured by where it stands against
// the Strategy (gapModel.standingOf). Both axes are measured, never judged:
//
//   age   days from created_at to now — how long the work has been open;
//   idle  days from updated_at to now — how long since anything moved it.
//
// The table under the chart reads the same numbers by standing: how many,
// and the median, 75th and 95th percentile — so "work with no reason sits
// three times longer" is a figure, not an impression.
//
// Pure: `now` is the caller's.

import type { Standing } from './gapModel';

export type GapMeasure = 'age' | 'idle';

export interface TimedElement {
  id: string;
  label: string;
  standing: Standing;
  created_at: string | null;
  updated_at: string | null;
}

export interface TimePoint { id: string; label: string; standing: Standing; createdAt: number; days: number }

const DAY = 86_400_000;

export function timePoints(elements: readonly TimedElement[], measure: GapMeasure, now: number): TimePoint[] {
  const out: TimePoint[] = [];
  for (const e of elements) {
    const created = e.created_at ? Date.parse(e.created_at) : NaN;
    const from = measure === 'age' ? created : (e.updated_at ? Date.parse(e.updated_at) : created);
    if (Number.isNaN(created) || Number.isNaN(from)) continue;
    out.push({ id: e.id, label: e.label, standing: e.standing, createdAt: created, days: Math.max(0, (now - from) / DAY) });
  }
  return out;
}

/** Nearest-rank percentile of sorted values; null when there are none. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export interface StandingRow { standing: Standing; n: number; p50: number | null; p75: number | null; p95: number | null }

const STANDING_ORDER: Standing[] = ['aligned', 'unknown', 'edge', 'out'];

export function standingTable(points: readonly TimePoint[]): StandingRow[] {
  return STANDING_ORDER.map((standing) => {
    const xs = points.filter((p) => p.standing === standing).map((p) => p.days).sort((a, b) => a - b);
    return { standing, n: xs.length, p50: percentile(xs, 50), p75: percentile(xs, 75), p95: percentile(xs, 95) };
  });
}

/** A round top for the day axis and its ticks: 1, 2, 5, 10 … steps, four or five of them. */
export function dayTicks(max: number): number[] {
  const top = Math.max(1, max);
  const steps = [1, 2, 5, 7, 10, 14, 30, 60, 90, 180, 365];
  const step = steps.find((s) => top / s <= 5) ?? Math.ceil(top / 5);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < top) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Days for the table: hours under a day, else days. */
export function formatDays(d: number | null): string {
  if (d === null) return '—';
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h`;
  return d < 10 ? `${d.toFixed(1)}d` : `${Math.round(d)}d`;
}
