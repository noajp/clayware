'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { formatDateTime } from '@/Function/shared/dateUtils';
import type { Standing } from './gapModel';
import {
  dayTicks, formatDays, standingTable, timePoints,
  type GapMeasure, type TimedElement, type TimePoint,
} from './gapTimeModel';

// The Gap over time: each open Element at the day it was made (x) and how
// long it has been open or idle (y), coloured by its standing against the
// Strategy. The table under it is the chart's numbers by standing, and its
// table view. Both axes are measured (gapTimeModel); nothing is scored.

const W = 800;
const H = 280;
const M = { top: 14, right: 16, bottom: 26, left: 44 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;
const MONTH = 30.44 * 86_400_000;

const STANDING_LABEL: Record<Standing, string> = {
  aligned: 'Serves the Strategy',
  unknown: 'No reason written',
  edge: 'On the edge',
  out: 'Outside the reach',
};
const MEASURE_LABEL: Record<GapMeasure, string> = { age: 'Days open', idle: 'Days since last update' };
const INK: Record<Standing, string> = {
  aligned: 'var(--accent-default)',
  unknown: 'var(--text-tertiary)',
  edge: 'var(--element-status-review)',
  out: 'var(--status-danger)',
};

/** The quiet states are drawn first, so red and yellow sit on top. */
const DRAW_ORDER: Standing[] = ['unknown', 'aligned', 'edge', 'out'];

export function StrategyGapTimeline({ elements, onOpenElement }: {
  /** Open Elements with their standing. */
  elements: TimedElement[];
  onOpenElement: (id: string) => void;
}) {
  const { t } = useI18n();
  const [measure, setMeasure] = useState<GapMeasure>('age');
  const [now] = useState(() => Date.now());
  const points = useMemo(() => timePoints(elements, measure, now), [elements, measure, now]);
  const table = useMemo(() => standingTable(points), [points]);

  const scale = useMemo(() => {
    const xs = points.map((p) => p.createdAt);
    const x0 = xs.length ? Math.min(...xs) : now - MONTH;
    const x1 = now;
    const span = Math.max(x1 - x0, 7 * 86_400_000);
    const yTicks = dayTicks(points.length ? Math.max(...points.map((p) => p.days)) : 1);
    const yMax = yTicks[yTicks.length - 1];
    const sx = (v: number) => M.left + ((v - (x1 - span)) / span) * PW;
    const sy = (d: number) => M.top + PH - (d / yMax) * PH;
    // Date ticks across the span: days for a short one, months for a long
    // one, thinned to at most seven.
    const byMonth = span > 90 * 86_400_000;
    const start = new Date(x1 - span); start.setHours(0, 0, 0, 0);
    if (byMonth) start.setDate(1);
    const marks: number[] = [];
    for (const d = new Date(start); d.getTime() <= x1; byMonth ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 1)) {
      if (d.getTime() >= x1 - span) marks.push(d.getTime());
    }
    const every = Math.max(1, Math.ceil(marks.length / 7));
    const tickFormat: Intl.DateTimeFormatOptions = byMonth ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' };
    return { sx, sy, yTicks, xTicks: marks.filter((_, i) => i % every === 0), tickFormat };
  }, [points, now]);

  const ordered = useMemo(() => DRAW_ORDER.flatMap((s) => points.filter((p) => p.standing === s)), [points]);
  // Work made together lands on one spot: points closer than a dot apart
  // step sideways in turn (a beeswarm), so every Element stays countable.
  // The step moves the mark, never its value — the tooltip and the table
  // carry the measured numbers.
  const dodged = useMemo(() => {
    const placed: { p: TimePoint; cx: number; cy: number }[] = [];
    for (const p of ordered) {
      const x = scale.sx(p.createdAt);
      const cy = scale.sy(p.days);
      let cx = x;
      for (let k = 1; placed.some((q) => Math.abs(q.cx - cx) < 7.5 && Math.abs(q.cy - cy) < 7.5) && k < 60; k++) {
        cx = x + (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 7.5;
      }
      placed.push({ p, cx, cy });
    }
    return placed;
  }, [ordered, scale]);

  const keyOpen = (fn: () => void) => (ev: React.KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(); } };
  const label = (p: TimePoint) => `${p.label} — ${t(STANDING_LABEL[p.standing])} · ${formatDays(p.days)}`;

  return (
    <div>
      <div className="mb-2 inline-flex items-center gap-0.5 rounded-md border border-border/60 p-0.5" role="group" aria-label={t('Measure')}>
        {(['age', 'idle'] as GapMeasure[]).map((m) => (
          <button key={m} type="button" aria-pressed={measure === m} onClick={() => setMeasure(m)}
            className={`h-6 rounded px-2.5 text-[12px] font-medium transition-colors ${measure === m ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t(MEASURE_LABEL[m])}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[600px]" role="group"
          aria-label={t('{measure} of each open Element, by the day it was made', { measure: t(MEASURE_LABEL[measure]) })}>
          {scale.yTicks.map((d) => (
            <g key={`y-${d}`}>
              <line x1={M.left} x2={W - M.right} y1={scale.sy(d)} y2={scale.sy(d)} stroke="var(--border-default)" strokeDasharray={d === 0 ? undefined : '2 4'} />
              <text x={M.left - 8} y={scale.sy(d) + 4} textAnchor="end" fontSize={11} fill="var(--text-tertiary)">{d === 0 ? '0' : `${d}d`}</text>
            </g>
          ))}
          {scale.xTicks.map((m) => (
            <text key={`x-${m}`} x={scale.sx(m)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-tertiary)">
              {formatDateTime(m, scale.tickFormat)}
            </text>
          ))}
          {dodged.map(({ p, cx, cy }) => {
            const open = () => onOpenElement(p.id);
            return (
              <g key={p.id} role="button" tabIndex={0} aria-label={label(p)} onClick={open} onKeyDown={keyOpen(open)}
                className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-[var(--accent-default)]">
                <title>{label(p)}</title>
                <circle cx={cx} cy={cy} r={3.5} fill={p.standing === 'unknown' ? 'transparent' : INK[p.standing]}
                  stroke={p.standing === 'unknown' ? INK.unknown : 'var(--background)'} strokeWidth={p.standing === 'unknown' ? 1.25 : 1} />
                <circle cx={cx} cy={cy} r={8} fill="transparent" stroke="transparent" strokeWidth={1.5} />
              </g>
            );
          })}
          {points.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="var(--text-tertiary)">{t('No open Elements under this Strategy.')}</text>
          )}
        </svg>
      </div>

      {/* The chart's numbers, by standing — its table view. */}
      <table className="mt-2 w-full text-[12px] tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="py-1 text-left font-normal">{t(MEASURE_LABEL[measure])}</th>
            <th scope="col" className="py-1 text-right font-normal">{t('Elements')}</th>
            <th scope="col" className="py-1 text-right font-normal">{t('Median')}</th>
            <th scope="col" className="py-1 text-right font-normal">75%</th>
            <th scope="col" className="py-1 text-right font-normal">95%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50 border-t border-border/50">
          {table.filter((r) => r.n > 0 || r.standing === 'aligned' || r.standing === 'unknown').map((r) => (
            <tr key={r.standing}>
              <th scope="row" className="py-1.5 text-left font-normal text-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                    <circle cx="5" cy="5" r="4" fill={r.standing === 'unknown' ? 'transparent' : INK[r.standing]} stroke={r.standing === 'unknown' ? INK.unknown : 'none'} strokeWidth={1.25} />
                  </svg>
                  {t(STANDING_LABEL[r.standing])}
                </span>
              </th>
              <td className="py-1.5 text-right text-foreground">{r.n}</td>
              <td className="py-1.5 text-right text-foreground">{formatDays(r.p50)}</td>
              <td className="py-1.5 text-right text-muted-foreground">{formatDays(r.p75)}</td>
              <td className="py-1.5 text-right text-muted-foreground">{formatDays(r.p95)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

