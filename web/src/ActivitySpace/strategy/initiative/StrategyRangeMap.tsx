'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { formatDateTime } from '@/Function/shared/dateUtils';
import type { Standing } from './gapModel';
import { formatDays, standingTable, timePoints } from './gapTimeModel';

// The range map: one Strategy and the work under it, drawn as the reach of
// its intent. The Strategy is the star on the left; the cone is what it
// covers; the work fans out to the right, one column per layer (Strategies
// under it, Objects, Elements).
//
// Every coordinate is read off data, by fixed rules:
//   - the column is the layer the item sits in;
//   - inside the Element column, left to right is the day it was made;
//   - the distance from the centre line is its standing (gapModel.standingOf),
//     in bands — serves the Strategy, no reason written, on the edge,
//     outside — and within its band, how long since it last moved: the
//     longer idle, the further out;
//   - above or below the centre line is the branch (its Object's side).
// So the centre is "serves the Strategy and moved recently" and the far
// rim is "outside and long idle". Nothing is scored: the bands are the
// Gap verdict and the offset inside one is days. Every mark is also a row
// in the Gap lists below, which is the map's table view.

export interface RangeNode { id: string; label: string }
export interface RangeObject extends RangeNode { holderId: string | null; standing: 'in' | 'out' }
export interface RangeElement extends RangeNode {
  objectId: string | null;
  standing: Standing;
  createdAt: string | null;
  updatedAt: string | null;
}

const W = 800;
const H = 320;
const CY = 150;
const STAR_X = 30;
const END_X = 790;
const REACH = 112;
const COL = { strategy: 200, object: 360, elementFrom: 470, elementTo: 770 };
const DAY = 86_400_000;

/** Each standing's band, as a share of the cone's half height at that x. */
const BAND: Record<Standing, [number, number]> = {
  aligned: [0.06, 0.36],
  unknown: [0.44, 0.84],
  edge: [0.97, 1.03],
  out: [1.14, 1.5],
};
/** The dashed rays between the bands, and what lies inside each. */
const RAYS = [0.4, 0.9];

const half = (x: number) => ((x - STAR_X) / (END_X - STAR_X)) * REACH;
const clampY = (y: number) => Math.max(-CY + 10, Math.min(H - CY - 34, y));

function spread(n: number, span: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => -span + (2 * span * i) / (n - 1));
}

interface Placed { x: number; y: number }

export function StrategyRangeMap({ name, strategies, objects, elements, unserved, onOpenElement, onOpenObject }: {
  name: string;
  /** The Strategies under this one that hold Objects here. */
  strategies: RangeNode[];
  objects: RangeObject[];
  /** Open Elements only. */
  elements: RangeElement[];
  /** Intents no work is bound to — the empty part of the reach. */
  unserved: number;
  onOpenElement: (id: string) => void;
  onOpenObject: (id: string) => void;
}) {
  const { t } = useI18n();
  const [now] = useState(() => Date.now());

  const layout = useMemo(() => {
    const subIndex = new Map(strategies.map((s, i) => [s.id, i]));
    const objOrder = [...objects].sort((a, b) => (a.holderId ? subIndex.get(a.holderId) ?? 0 : -1) - (b.holderId ? subIndex.get(b.holderId) ?? 0 : -1));
    // A branch's side: the first half of the Objects above the centre line, the rest below.
    const side = new Map(objOrder.map((o, i) => [o.id, i < Math.ceil(objOrder.length / 2) ? -1 : 1]));

    // Time across the Element column: the oldest open Element to today.
    const created = elements.map((e) => (e.createdAt ? Date.parse(e.createdAt) : NaN)).filter((n) => !Number.isNaN(n));
    const t0 = created.length ? Math.min(...created) : now - 7 * DAY;
    const span = Math.max(now - t0, DAY);
    const xOf = (iso: string | null) => {
      const v = iso ? Date.parse(iso) : NaN;
      return COL.elementFrom + ((Number.isNaN(v) ? t0 : v) - t0) / span * (COL.elementTo - COL.elementFrom);
    };
    const idle = (e: RangeElement) => {
      const v = Date.parse(e.updatedAt ?? e.createdAt ?? '');
      return Number.isNaN(v) ? 0 : Math.max(0, (now - v) / DAY);
    };
    const maxIdle = Math.max(1, ...elements.map(idle));

    // Elements: x by date, distance by band and idle days, side by branch.
    // Marks that would touch step outward within their band.
    const ePos = new Map<string, Placed>();
    const placed: Placed[] = [];
    const order = [...elements].sort((a, b) => idle(a) - idle(b));
    let alt = 0;
    for (const e of order) {
      const x = xOf(e.createdAt);
      const [lo, hi] = BAND[e.standing];
      const sgn = e.objectId && side.has(e.objectId) ? side.get(e.objectId)! : (alt++ % 2 === 0 ? -1 : 1);
      const base = lo + (hi - lo) * Math.sqrt(idle(e) / maxIdle);
      const taken = (px: number, py: number) => placed.some((p) => Math.abs(p.x - px) < 6.5 && Math.abs(p.y - py) < 6.5);
      // Work made together lands on one spot: try a few steps either side of
      // its day first, then one step further out, and so on.
      let p = { x, y: clampY(sgn * base * half(x)) };
      search: for (let ring = 0; ring < 12; ring++) {
        const share = base + (ring * 6.5) / Math.max(half(x), 1);
        for (const dx of [0, 6.5, -6.5, 13, -13, 19.5, -19.5]) {
          const cand = { x: x + dx, y: clampY(sgn * share * half(x + dx)) };
          if (!taken(cand.x, cand.y)) { p = cand; break search; }
        }
      }
      placed.push(p);
      ePos.set(e.id, p);
    }

    // Each Object at the middle of its Elements, pulled into its own column.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const oPos = new Map<string, Placed>();
    const oShare = new Map<string, number>();
    const fallback = spread(objOrder.length, 0.7);
    objOrder.forEach((o, i) => {
      const mine = elements.filter((e) => e.objectId === o.id).map((e) => ePos.get(e.id)!).map((p) => p.y / Math.max(half(p.x), 1));
      let s = mine.length ? Math.max(-0.85, Math.min(0.85, mean(mine))) : fallback[i];
      if (o.standing === 'out') s = (side.get(o.id) ?? 1) * 1.25;
      oShare.set(o.id, s);
      oPos.set(o.id, { x: COL.object, y: clampY(s * half(COL.object)) });
    });

    // And each Strategy below at the middle of its Objects.
    const sPos = new Map<string, Placed>();
    const sFallback = spread(strategies.length, 0.6);
    strategies.forEach((st, i) => {
      const mine = objOrder.filter((o) => o.holderId === st.id && o.standing === 'in').map((o) => oShare.get(o.id)!);
      const s = mine.length ? mean(mine) : sFallback[i];
      sPos.set(st.id, { x: COL.strategy, y: s * half(COL.strategy) });
    });

    // Date ticks along the Element column: days for a short span, months for a long one.
    const byMonth = span > 90 * DAY;
    const marks: number[] = [];
    const d = new Date(t0); d.setHours(0, 0, 0, 0); if (byMonth) d.setDate(1);
    for (; d.getTime() <= now; byMonth ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 1)) if (d.getTime() >= t0) marks.push(d.getTime());
    const every = Math.max(1, Math.ceil(marks.length / 5));
    const ticks = marks.filter((_, i) => i % every === 0).map((m) => ({ x: COL.elementFrom + ((m - t0) / span) * (COL.elementTo - COL.elementFrom), m }));
    const tickFormat: Intl.DateTimeFormatOptions = byMonth ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' };

    const objectAnchor = (o: RangeObject): Placed => (o.holderId && sPos.get(o.holderId)) || { x: STAR_X, y: 0 };
    return { hasSubs: strategies.length > 0, sPos, oPos, ePos, objectAnchor, ticks, tickFormat };
  }, [strategies, objects, elements, now]);

  const counts = useMemo(() => {
    const c: Record<Standing, number> = { aligned: 0, unknown: 0, edge: 0, out: 0 };
    for (const e of elements) c[e.standing] += 1;
    return c;
  }, [elements]);
  // How long each standing has sat still: the numbers under the map.
  const idleRows = useMemo(() => {
    const rows = standingTable(timePoints(elements.map((e) => ({ id: e.id, label: e.label, standing: e.standing, created_at: e.createdAt, updated_at: e.updatedAt })), 'idle', now));
    return new Map(rows.map((r) => [r.standing, r]));
  }, [elements, now]);

  const y = (v: number) => CY + v;
  const dividers = [
    ...(layout.hasSubs ? [{ x: (STAR_X + COL.strategy) / 2 + 40, label: t('Strategies') }] : []),
    { x: (COL.strategy + COL.object) / 2 + (layout.hasSubs ? 0 : -40), label: t('Objects') },
    { x: COL.elementFrom - 22, label: t('Elements') },
  ];
  const ink = (s: Standing) => s === 'out' ? 'var(--status-danger)' : s === 'edge' ? 'var(--element-status-review)' : 'var(--accent-default)';
  const standingWord = (s: Standing) => s === 'out' ? t('Outside the reach') : s === 'edge' ? t('On the edge') : s === 'aligned' ? t('Serves the Strategy') : t('No reason written');
  const elementLabel = (e: RangeElement) => `${e.label} — ${standingWord(e.standing)}`;
  const keyOpen = (fn: () => void) => (ev: React.KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(); } };
  const ray = (share: number, sgn: number) => `M${STAR_X},${CY} L${END_X},${CY + sgn * share * REACH}`;
  const bottom = H - 14;

  return (
    <figure className="m-0">
      {/* Below 600px the map keeps its size and scrolls inside its own box,
          so its marks stay large enough to tap; the page never scrolls
          sideways. From md up it leans back a little, as a surface seen
          from above, and fades at its far edge. */}
      <div className="overflow-x-auto overflow-y-hidden md:overflow-hidden md:py-2">
        <div className="min-w-[600px] md:[transform:perspective(1600px)_rotateX(14deg)_rotateZ(-2.5deg)] md:[transform-origin:50%_60%]
          [mask-image:linear-gradient(to_right,transparent_0,black_3%,black_96%,transparent_100%)]">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={t('Range map of {name}', { name })}>
            {/* The reach of the intent, and the rays between its bands. */}
            <polygon points={`${STAR_X},${CY} ${END_X},${CY - REACH} ${END_X},${CY + REACH}`}
              fill="var(--accent-default)" fillOpacity={0.06} stroke="var(--accent-default)" strokeOpacity={0.4} strokeWidth={1} />
            {RAYS.flatMap((r) => [-1, 1].map((sgn) => (
              <path key={`ray-${r}-${sgn}`} d={ray(r, sgn)} stroke="var(--text-tertiary)" strokeOpacity={0.35} strokeDasharray="2 5" fill="none" />
            )))}
            <line x1={STAR_X} y1={CY} x2={END_X} y2={CY} stroke="var(--accent-default)" strokeOpacity={0.3} strokeDasharray="1 4" />
            <text x={END_X - 34} y={CY - 4} textAnchor="end" fontSize={10} fill="var(--text-tertiary)">{t('Serves the Strategy')}</text>
            <text x={END_X - 34} y={CY - 0.65 * REACH - 4} textAnchor="end" fontSize={10} fill="var(--text-tertiary)">{t('No reason written')}</text>
            <text x={END_X - 34} y={CY - REACH - 5} textAnchor="end" fontSize={10} fill="var(--text-tertiary)">{t('Edge')}</text>

            {/* Layer boundaries. */}
            {dividers.map((d) => (
              <g key={d.label}>
                <line x1={d.x} y1={14} x2={d.x} y2={bottom - 14} stroke="var(--border-default)" strokeDasharray="2 5" />
                <text x={d.x + 6} y={20} fontSize={11} fill="var(--text-tertiary)">{d.label}</text>
              </g>
            ))}

            {/* Days made, along the Element column. */}
            <line x1={COL.elementFrom} y1={bottom - 12} x2={COL.elementTo} y2={bottom - 12} stroke="var(--border-default)" />
            {layout.ticks.map((tk) => (
              <g key={tk.m}>
                <line x1={tk.x} y1={bottom - 15} x2={tk.x} y2={bottom - 9} stroke="var(--border-default)" />
                <text x={tk.x} y={bottom + 2} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">{formatDateTime(tk.m, layout.tickFormat)}</text>
              </g>
            ))}

            {/* Branches. */}
            {strategies.map((s) => {
              const p = layout.sPos.get(s.id)!;
              return <line key={`ls-${s.id}`} x1={STAR_X} y1={CY} x2={p.x} y2={y(p.y)} stroke="var(--text-tertiary)" strokeOpacity={0.35} />;
            })}
            {objects.map((o) => {
              const p = layout.oPos.get(o.id)!;
              const a = layout.objectAnchor(o);
              return <line key={`lo-${o.id}`} x1={a.x} y1={y(a.y)} x2={p.x} y2={y(p.y)} stroke={o.standing === 'out' ? 'var(--status-danger)' : 'var(--text-tertiary)'} strokeOpacity={o.standing === 'out' ? 0.6 : 0.3} />;
            })}
            {elements.map((e) => {
              const p = layout.ePos.get(e.id)!;
              const o = e.objectId ? layout.oPos.get(e.objectId) : undefined;
              if (!o) return null;
              return <line key={`le-${e.id}`} x1={o.x} y1={y(o.y)} x2={p.x} y2={y(p.y)}
                stroke={e.standing === 'out' ? 'var(--status-danger)' : 'var(--text-tertiary)'} strokeOpacity={e.standing === 'out' ? 0.5 : 0.1} />;
            })}

            <g>
              <title>{name}</title>
              <path d={star(STAR_X, CY, 9, 4)} fill="var(--accent-default)" />
            </g>

            {strategies.map((s) => {
              const p = layout.sPos.get(s.id)!;
              return (
                <g key={`s-${s.id}`}>
                  <title>{s.label}</title>
                  <rect x={p.x - 6} y={y(p.y) - 6} width={12} height={12} rx={3} fill="var(--background)" stroke="var(--accent-default)" strokeWidth={1.5} />
                </g>
              );
            })}

            {objects.map((o) => {
              const p = layout.oPos.get(o.id)!;
              const open = () => onOpenObject(o.id);
              return (
                <g key={`o-${o.id}`} role="button" tabIndex={0} aria-label={`${o.label}${o.standing === 'out' ? ` — ${t('Outside the reach')}` : ''}`}
                  onClick={open} onKeyDown={keyOpen(open)} className="cursor-pointer outline-none [&:focus-visible>rect:last-child]:stroke-[var(--accent-default)]">
                  <title>{o.label}</title>
                  <rect x={p.x - 6} y={y(p.y) - 6} width={12} height={12} rx={3}
                    fill={o.standing === 'out' ? 'var(--status-danger)' : 'var(--background)'} stroke={o.standing === 'out' ? 'var(--status-danger)' : 'var(--text-secondary)'} strokeWidth={1.5} />
                  <rect x={p.x - 11} y={y(p.y) - 11} width={22} height={22} rx={5} fill="transparent" stroke="transparent" strokeWidth={1.5} />
                </g>
              );
            })}

            {elements.map((e) => {
              const p = layout.ePos.get(e.id)!;
              const open = () => onOpenElement(e.id);
              const hollow = e.standing === 'unknown';
              return (
                <g key={`e-${e.id}`} role="button" tabIndex={0} aria-label={elementLabel(e)}
                  onClick={open} onKeyDown={keyOpen(open)} className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-[var(--accent-default)]">
                  <title>{elementLabel(e)}</title>
                  <circle cx={p.x} cy={y(p.y)} r={3} fill={hollow ? 'transparent' : ink(e.standing)}
                    stroke={hollow ? 'var(--accent-default)' : 'none'} strokeOpacity={hollow ? 0.75 : 1} strokeWidth={1.1} />
                  <circle cx={p.x} cy={y(p.y)} r={8} fill="transparent" stroke="transparent" strokeWidth={1.5} />
                </g>
              );
            })}
            {objects.length === 0 && (
              <text x={W / 2} y={CY + 4} textAnchor="middle" fontSize={12} fill="var(--text-tertiary)">{t('No Objects under this Strategy yet.')}</text>
            )}
          </svg>
        </div>
      </div>

      {/* The map's numbers: how many stand in each band, and how long they
          have sat still — every state named in words beside its mark. */}
      <figcaption className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/50 pt-3 text-[12px] sm:grid-cols-4">
        {(['aligned', 'unknown', 'edge', 'out'] as Standing[]).map((s) => {
          const row = idleRows.get(s);
          return (
            <div key={s} className="min-w-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <circle cx="5" cy="5" r="3.5" fill={s === 'unknown' ? 'transparent' : ink(s)} stroke={s === 'unknown' ? 'var(--accent-default)' : 'none'} strokeWidth={1.1} />
                </svg>
                <span className="truncate">{standingWord(s)}</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-2 tabular-nums">
                <span className="text-[18px] font-semibold leading-6 text-foreground">{counts[s]}</span>
                <span className="text-muted-foreground">{t('Median idle {d}', { d: formatDays(row?.p50 ?? null) })}</span>
              </div>
            </div>
          );
        })}
      </figcaption>
      {unserved > 0 && <p className="mt-2 text-[12px] text-muted-foreground">{t('{n} intents with no work', { n: unserved })}</p>}
    </figure>
  );
}

/** A five-pointed star's path. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
