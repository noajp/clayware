'use client';

import { useMemo } from 'react';
import { useI18n } from '@/Function/i18n/I18nProvider';
import type { Standing } from './gapModel';

// The range map: one Strategy and the work under it, drawn as the reach of
// its intent. The Strategy is the point on the left; the cone is what it
// covers; the work fans out to the right, one column per layer (Strategies
// under it, Objects, Elements).
//
// Only two things on it carry meaning, and both are data:
//   - the column is the layer the item really sits in;
//   - inside / on the edge / outside is the Gap verdict (gapModel.standingOf)
//     — a category, never a measure. Where in its column a dot sits is
//     layout only, so the map never claims an angle or a distance nobody
//     measured.
// Every mark is also a row in the Gap lists below it, which is the map's
// table view.

export interface RangeNode { id: string; label: string }
export interface RangeObject extends RangeNode { holderId: string | null; standing: 'in' | 'out' }
export interface RangeElement extends RangeNode { objectId: string | null; standing: Standing }

const W = 800;
const H = 300;
const CY = H / 2;
const STAR_X = 30;
const END_X = 790;
const REACH = 118;
const COL = { strategy: 210, object: 380, elementFrom: 500, elementTo: 760 };
const ELEMENT_COLS = 5;

/** The cone's half height at x. */
const half = (x: number) => ((x - STAR_X) / (END_X - STAR_X)) * REACH;
const clampY = (y: number) => Math.max(-CY + 8, Math.min(CY - 8, y));

/** Spread n slots evenly across [-span, span]. */
function spread(n: number, span: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => -span + (2 * span * i) / (n - 1));
}

/** Points just outside the cone, alternating above and below, stepping out. */
function outside(n: number, x0: number, x1: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    const side = i % 2 === 0 ? -1 : 1;
    return { x, y: clampY(side * (half(x) + 12 + Math.floor(i / 2) % 3 * 9)) };
  });
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

  const layout = useMemo(() => {
    const hasSubs = strategies.length > 0;
    // Objects grouped by the Strategy that holds them, so each branch is one bundle.
    const subIndex = new Map(strategies.map((s, i) => [s.id, i]));
    const objOrder = [...objects].sort((a, b) => (a.holderId ? subIndex.get(a.holderId) ?? 0 : -1) - (b.holderId ? subIndex.get(b.holderId) ?? 0 : -1));
    const objIndex = new Map(objOrder.map((o, i) => [o.id, i]));
    const byObject = (a: RangeElement, b: RangeElement) => (objIndex.get(a.objectId ?? '') ?? 1e9) - (objIndex.get(b.objectId ?? '') ?? 1e9);
    const inside = elements.filter((e) => e.standing === 'aligned' || e.standing === 'unknown').sort(byObject);
    const edge = elements.filter((e) => e.standing === 'edge').sort(byObject);
    const out = elements.filter((e) => e.standing === 'out').sort(byObject);

    // Elements first, row by row in their Object's order: one Object's
    // Elements take neighbouring rows. Positions are kept as a share of the
    // cone's half height (-1..1) so the layers to the left can follow them.
    const ePos = new Map<string, Placed>();
    const share = new Map<string, number>();
    const rows = Math.max(1, Math.ceil(inside.length / ELEMENT_COLS));
    const colStep = (COL.elementTo - COL.elementFrom) / (ELEMENT_COLS - 1);
    inside.forEach((e, i) => {
      const r = Math.floor(i / ELEMENT_COLS);
      const c = i % ELEMENT_COLS;
      const x = COL.elementFrom + c * colStep;
      const s = rows === 1 ? 0 : -0.82 + (1.64 * r) / (rows - 1);
      share.set(e.id, s);
      ePos.set(e.id, { x, y: s * half(x) });
    });

    // Each Object stands at the middle of its Elements; one with none
    // takes its turn in the list order.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const oIn = objOrder.filter((o) => o.standing === 'in');
    const oOut = objOrder.filter((o) => o.standing === 'out');
    const fallback = spread(oIn.length, 0.78);
    const oShare = new Map<string, number>();
    const oPos = new Map<string, Placed>();
    oIn.forEach((o, i) => {
      const mine = inside.filter((e) => e.objectId === o.id).map((e) => share.get(e.id)!);
      const s = mine.length ? mean(mine) * 0.95 : fallback[i];
      oShare.set(o.id, s);
      oPos.set(o.id, { x: COL.object, y: s * half(COL.object) });
    });
    outside(oOut.length, COL.object - 20, COL.object + 20).forEach((p, i) => oPos.set(oOut[i].id, p));

    // And each Strategy below at the middle of its Objects.
    const sPos = new Map<string, Placed>();
    const sFallback = spread(strategies.length, 0.7);
    strategies.forEach((st, i) => {
      const mine = oIn.filter((o) => o.holderId === st.id).map((o) => oShare.get(o.id)!);
      const s = mine.length ? mean(mine) : sFallback[i];
      sPos.set(st.id, { x: COL.strategy, y: s * half(COL.strategy) });
    });
    edge.forEach((e, i) => {
      const x = edge.length === 1 ? (COL.elementFrom + COL.elementTo) / 2 : COL.elementFrom + ((COL.elementTo - COL.elementFrom) * i) / (edge.length - 1);
      ePos.set(e.id, { x, y: (i % 2 === 0 ? -1 : 1) * half(x) });
    });
    outside(out.length, COL.elementFrom, COL.elementTo).forEach((p, i) => ePos.set(out[i].id, p));

    const objectAnchor = (o: RangeObject): Placed => (o.holderId && sPos.get(o.holderId)) || { x: STAR_X, y: 0 };
    return { hasSubs, sPos, oPos, ePos, objectAnchor };
  }, [strategies, objects, elements]);

  const objById = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const counts = useMemo(() => {
    const c: Record<Standing, number> = { aligned: 0, unknown: 0, edge: 0, out: 0 };
    for (const e of elements) c[e.standing] += 1;
    return c;
  }, [elements]);

  const y = (v: number) => CY + v;
  const coneTop = CY - REACH;
  const coneBottom = CY + REACH;
  const dividers = [
    ...(layout.hasSubs ? [{ x: (STAR_X + COL.strategy) / 2 + 40, label: t('Strategies') }] : []),
    { x: (COL.strategy + COL.object) / 2 + (layout.hasSubs ? 10 : -40), label: t('Objects') },
    { x: (COL.object + COL.elementFrom) / 2, label: t('Elements') },
  ];

  const ink = (s: Standing) => s === 'out' ? 'var(--status-danger)' : s === 'edge' ? 'var(--element-status-review)' : 'var(--accent-default)';
  const elementLabel = (e: RangeElement) => {
    const why = e.standing === 'out' ? t('Outside the reach') : e.standing === 'edge' ? t('On the edge') : e.standing === 'aligned' ? t('Serves the Strategy') : t('No reason written');
    return `${e.label} — ${why}`;
  };
  const keyOpen = (fn: () => void) => (ev: React.KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(); } };

  return (
    <figure className="m-0">
      {/* Below 600px the map keeps its size and scrolls inside its own box,
          so its marks stay large enough to tap; the page never scrolls sideways. */}
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[600px]" role="group" aria-label={t('Range map of {name}', { name })}>
        {/* The reach of the intent. */}
        <polygon points={`${STAR_X},${CY} ${END_X},${coneTop} ${END_X},${coneBottom}`}
          fill="var(--accent-default)" fillOpacity={0.07} stroke="var(--accent-default)" strokeOpacity={0.35} strokeWidth={1} />
        <line x1={STAR_X} y1={CY} x2={END_X} y2={CY} stroke="var(--accent-default)" strokeOpacity={0.25} strokeDasharray="2 4" />

        {/* Layer boundaries — the only axis, and it is the layer. */}
        {dividers.map((d) => (
          <g key={d.label}>
            <line x1={d.x} y1={10} x2={d.x} y2={H - 6} stroke="var(--border-default)" strokeDasharray="3 4" />
            <text x={d.x + 6} y={16} fontSize={11} fill="var(--text-tertiary)">{d.label}</text>
          </g>
        ))}

        {/* Branches: Strategy → Object → Element. */}
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
            stroke={e.standing === 'out' ? 'var(--status-danger)' : 'var(--text-tertiary)'} strokeOpacity={e.standing === 'out' ? 0.55 : 0.14} />;
        })}

        {/* The Strategy itself. */}
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
              <rect x={p.x - 7} y={y(p.y) - 7} width={14} height={14} rx={3}
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
              <circle cx={p.x} cy={y(p.y)} r={4.5} fill={hollow ? 'var(--background)' : ink(e.standing)}
                stroke={hollow ? 'var(--text-tertiary)' : 'var(--background)'} strokeWidth={hollow ? 1.25 : 1.5} />
              <circle cx={p.x} cy={y(p.y)} r={9} fill="transparent" stroke="transparent" strokeWidth={1.5} />
            </g>
          );
        })}
        {objById.size === 0 && (
          <text x={W / 2} y={CY + 4} textAnchor="middle" fontSize={12} fill="var(--text-tertiary)">{t('No Objects under this Strategy yet.')}</text>
        )}
      </svg>
      </div>

      {/* Legend: every state named in words beside its mark. */}
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <LegendDot fill="var(--accent-default)" label={t('Serves the Strategy')} n={counts.aligned} />
        <LegendDot hollow label={t('No reason written')} n={counts.unknown} />
        <LegendDot fill="var(--element-status-review)" label={t('On the edge')} n={counts.edge} />
        <LegendDot fill="var(--status-danger)" label={t('Outside the reach')} n={counts.out} />
        {unserved > 0 && <span>{t('{n} intents with no work', { n: unserved })}</span>}
      </figcaption>
    </figure>
  );
}

function LegendDot({ fill, hollow = false, label, n }: { fill?: string; hollow?: boolean; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <circle cx="5" cy="5" r="4" fill={hollow ? 'transparent' : fill} stroke={hollow ? 'var(--text-tertiary)' : 'none'} strokeWidth={1.25} />
      </svg>
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{n}</span>
    </span>
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
