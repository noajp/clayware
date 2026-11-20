'use client';

import { useState } from 'react';
import { ChevronRight } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { formatAge } from '@/Function/shared/dateUtils';
import { historyLine, readStatusChange, readableDetail, type BranchRole, type Lane } from '@/Function/shared/historyLine';
import { statusLabel } from '@/shared/designTokens';

// An Element's Activity drawn as a git graph is: one line in the key blue
// with what moves the work (status, a hand-over…) as points on it, the
// newest a ring (how the Element is now), and the details between (dates,
// people, wording) folded into one numbered point that opens. A request for
// approval branches off in the In Review colour; approval brings it back.

interface Entry { id: string; kind: string; detail: string; author: string; createdAt: Date }

type Mark = 'head' | 'change' | 'small' | 'fold';

const MAIN = 'var(--accent-default)';
const BRANCH = 'var(--element-status-review)';
// The two lanes' centres, in px from the list's left edge.
const MAIN_X = 10;
const BRANCH_X = 26;
/** Points shown before the older history folds into one "earlier" row. */
const RECENT_POINTS = 8;

function MarkDot({ mark, count, color }: { mark: Mark; count?: number; color: string }) {
  if (mark === 'fold') {
    return (
      <span className="flex size-[18px] items-center justify-center rounded-full border bg-card text-[10px] tabular-nums text-muted-foreground"
        style={{ borderColor: color }}>
        {count}
      </span>
    );
  }
  const cls = mark === 'head' ? 'size-3 border-[2.5px] bg-card' : mark === 'change' ? 'size-2.5' : 'size-1.5';
  return <span className={`rounded-full ${cls}`} style={mark === 'head' ? { borderColor: color } : { background: color }} />;
}

interface PointSpec {
  key: string;
  lane: Lane;
  mark: Mark;
  count?: number;
  role?: BranchRole;
  body: React.ReactNode;
}

// Every point is one row of the same height, so a line, a branch leaving
// the line or coming back can run the whole way from one point to the next.
const ROW = 26;
const MID = ROW / 2;

/** One point: its mark on its lane, the lines on down to the next older
 *  point, and its one line of text. A request whose older neighbour is on
 *  the line draws the branch leaving the line; an approval draws it coming
 *  back. */
function Point({ spec, older, last, indent }: { spec: PointSpec; older?: PointSpec; last: boolean; indent: boolean }) {
  const onBranch = spec.lane === 'branch';
  const forks = onBranch && spec.role === 'request' && older?.lane === 'main';
  const merges = !onBranch && older?.lane === 'branch';
  const branchBelow = onBranch && !forks && older?.lane === 'branch';
  const v = (x: number, color: string) => (
    <span aria-hidden className="absolute w-[1.5px]" style={{ left: x - 0.75, top: MID, height: ROW, background: color }} />
  );
  return (
    <li className={`relative flex min-w-0 items-center ${indent ? 'pl-11' : 'pl-7'}`} style={{ height: ROW }}>
      {!last && v(MAIN_X, MAIN)}
      {branchBelow && v(BRANCH_X, BRANCH)}
      {(forks || merges) && (
        <svg aria-hidden className="absolute left-0 overflow-visible" style={{ top: MID }} width={BRANCH_X + 4} height={ROW}>
          <path d={forks
            ? `M${BRANCH_X} 0 C${BRANCH_X} ${ROW * 0.6} ${MAIN_X} ${ROW * 0.4} ${MAIN_X} ${ROW}`
            : `M${MAIN_X} 0 C${MAIN_X} ${ROW * 0.6} ${BRANCH_X} ${ROW * 0.4} ${BRANCH_X} ${ROW}`}
            fill="none" strokeWidth={1.5} style={{ stroke: BRANCH }} />
        </svg>
      )}
      <span aria-hidden className="absolute flex w-5 items-center justify-center" style={{ left: (onBranch ? BRANCH_X : MAIN_X) - 10, top: 0, height: ROW }}>
        <MarkDot mark={spec.mark} count={spec.count} color={onBranch ? BRANCH : MAIN} />
      </span>
      {spec.body}
    </li>
  );
}

export function ActivityFeed({ entries, compact = false }: { entries: Entry[]; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  if (entries.length === 0) {
    return (
      <p className={`text-muted-foreground ${compact ? 'text-center text-[12px] py-3' : 'text-[13px]'}`}>
        {t('No history yet')}
      </p>
    );
  }
  const textCls = compact ? 'text-[12px]' : 'text-[13px]';
  const timeCls = `shrink-0 pl-2 tabular-nums text-muted-foreground ${compact ? 'text-[11px]' : 'text-[11.5px]'}`;
  const say = (e: Entry) => {
    const change = e.kind === 'status' ? readStatusChange(e.detail) : null;
    return change ? `${change[0] === '—' ? '—' : statusLabel(change[0])} → ${statusLabel(change[1])}` : readableDetail(e.detail);
  };
  const ROLE_TEXT: Record<BranchRole, string> = {
    request: t('Asked for approval'),
    approve: t('Approved'),
    sendBack: t('Sent back'),
    close: t('Closed without approval'),
  };
  /** One line: what happened, cut with "…" when long, and when, flush
   *  right. Who did it, through what, and the whole text are its tooltip. */
  const row = (e: Entry, text: string, tone: string, via?: string) => (
    <span className="flex min-w-0 flex-1 items-center"
      title={`${text}\n${e.author}${via ? ` · ${t('via {name}', { name: via })}` : ''} · ${e.createdAt.toLocaleString()}`}>
      <span className={`min-w-0 flex-1 truncate ${textCls} ${tone}`}>{text}</span>
      <span className={timeCls}>{formatAge(e.createdAt, true)}</span>
    </span>
  );

  const line = historyLine(entries);
  const specs: PointSpec[] = [];
  line.forEach((item, i) => {
    if (item.type === 'change') {
      const e = item.entry;
      const h = item.handover;
      const text = item.role ? ROLE_TEXT[item.role]
        : h ? (h.from ? t('Handed over: {from} → {to}', { from: h.from, to: h.to }) : t('Handed to {to}', { to: h.to }))
          : say(e);
      specs.push({
        key: e.id, lane: item.lane, role: item.role,
        mark: i === 0 ? 'head' : item.small ? 'small' : 'change',
        body: row(e, text, item.small ? 'text-muted-foreground' : 'text-foreground/90', item.via),
      });
      return;
    }
    const isOpen = open.has(item.id);
    const newest = item.entries[0];
    const oldest = item.entries[item.entries.length - 1];
    const toggle = () => setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      return next;
    });
    const span = formatAge(newest.createdAt, true) === formatAge(oldest.createdAt, true)
      ? formatAge(newest.createdAt, true)
      : `${formatAge(newest.createdAt, true)} – ${formatAge(oldest.createdAt, true)}`;
    specs.push({
      key: item.id, lane: item.lane, mark: 'fold', count: item.entries.length,
      body: (
        <span className="flex min-w-0 flex-1 items-center">
          <button type="button" onClick={toggle} aria-expanded={isOpen}
            className={`-ml-1 flex min-w-0 items-center gap-1 rounded-md px-1 text-left text-muted-foreground hover:bg-muted/40 hover:text-foreground ${textCls}`}>
            <ChevronRight size={12} className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            <span className="truncate">{t('Small changes · {n}', { n: item.entries.length })}</span>
          </button>
          <span className={`ml-auto ${timeCls}`}>{span}</span>
        </span>
      ),
    });
    if (isOpen) {
      for (const e of item.entries) {
        specs.push({
          key: e.id, lane: item.lane, mark: 'small',
          body: row(e, say(e), 'text-muted-foreground'),
        });
      }
    }
  });
  // A long history shows its recent points; the rest is one row at the
  // bottom, on the lane the hidden history continues on, that opens it all.
  const hidden = showAll ? 0 : Math.max(0, specs.length - RECENT_POINTS);
  const shown: PointSpec[] = hidden === 0 ? specs : [
    ...specs.slice(0, RECENT_POINTS),
    {
      key: 'earlier', lane: specs[RECENT_POINTS].lane, mark: 'small',
      body: (
        <button type="button" onClick={() => setShowAll(true)}
          className={`-ml-1 flex min-w-0 items-center gap-1 rounded-md px-1 text-left text-muted-foreground hover:bg-muted/40 hover:text-foreground ${textCls}`}>
          <ChevronRight size={12} className="shrink-0 rotate-90" />
          {t('Earlier · {n}', { n: hidden })}
        </button>
      ),
    },
  ];
  const indent = shown.some((s) => s.lane === 'branch');
  return (
    <ol className="list-none">
      {shown.map((spec, i) => <Point key={spec.key} spec={spec} older={shown[i + 1]} last={i === shown.length - 1} indent={indent} />)}
    </ol>
  );
}
