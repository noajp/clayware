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

/** One point: its mark on its lane, the lines on down to the next older
 *  point, and what it says. A request whose older neighbour is on the line
 *  draws the branch leaving the line; an approval draws it coming back. */
function Point({ spec, older, last, indent }: { spec: PointSpec; older?: PointSpec; last: boolean; indent: boolean }) {
  const onBranch = spec.lane === 'branch';
  const forks = onBranch && spec.role === 'request' && older?.lane === 'main';
  const merges = !onBranch && older?.lane === 'branch';
  const branchBelow = onBranch && !forks && older?.lane === 'branch';
  return (
    <li className={`relative pb-2.5 last:pb-0 ${indent ? 'pl-11' : 'pl-7'}`}>
      {!last && <span aria-hidden className="absolute -bottom-2 top-2 w-[1.5px]" style={{ left: MAIN_X - 0.75, background: MAIN }} />}
      {branchBelow && <span aria-hidden className="absolute -bottom-2 top-2 w-[1.5px]" style={{ left: BRANCH_X - 0.75, background: BRANCH }} />}
      {merges && <span aria-hidden className="absolute -bottom-2 top-6 w-[1.5px]" style={{ left: BRANCH_X - 0.75, background: BRANCH }} />}
      {(forks || merges) && (
        <svg aria-hidden className="absolute left-0 top-0 overflow-visible" width={BRANCH_X + 4} height={24}>
          <path d={forks ? `M${BRANCH_X} 8 C${BRANCH_X} 18 ${MAIN_X} 14 ${MAIN_X} 24` : `M${MAIN_X} 8 C${MAIN_X} 18 ${BRANCH_X} 14 ${BRANCH_X} 24`}
            fill="none" strokeWidth={1.5} style={{ stroke: BRANCH }} />
        </svg>
      )}
      <span aria-hidden className="absolute top-0 flex h-4 w-5 items-center justify-center" style={{ left: (onBranch ? BRANCH_X : MAIN_X) - 10 }}>
        <MarkDot mark={spec.mark} count={spec.count} color={onBranch ? BRANCH : MAIN} />
      </span>
      {spec.body}
    </li>
  );
}

export function ActivityFeed({ entries, compact = false }: { entries: Entry[]; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  if (entries.length === 0) {
    return (
      <p className={`text-muted-foreground ${compact ? 'text-center text-[12px] py-3' : 'text-[13px]'}`}>
        {t('No activity yet')}
      </p>
    );
  }
  const textCls = compact ? 'text-[12px] leading-4' : 'text-[13px] leading-4';
  const metaCls = compact ? 'text-[11px] text-muted-foreground' : 'text-[11.5px] text-muted-foreground';
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
  const meta = (e: Entry, via?: string) => (
    <p className={metaCls}>{e.author}{via ? ` · ${t('via {name}', { name: via })}` : ''} · {formatAge(e.createdAt, true)}</p>
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
        body: <><p className={`${textCls} ${item.small ? 'text-muted-foreground' : 'text-foreground/90'}`}>{text}</p>{meta(e, item.via)}</>,
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
        <>
          <button type="button" onClick={toggle} aria-expanded={isOpen}
            className={`-ml-1 flex items-center gap-1 rounded-md px-1 text-left text-muted-foreground hover:bg-muted/40 hover:text-foreground ${textCls}`}>
            <ChevronRight size={12} className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            {t('Small changes · {n}', { n: item.entries.length })}
          </button>
          <p className={metaCls}>{span}</p>
        </>
      ),
    });
    if (isOpen) {
      for (const e of item.entries) {
        specs.push({
          key: e.id, lane: item.lane, mark: 'small',
          body: <><p className={`${textCls} text-muted-foreground`}>{say(e)}</p>{meta(e)}</>,
        });
      }
    }
  });
  const indent = specs.some((s) => s.lane === 'branch');
  return (
    <ol className="list-none">
      {specs.map((spec, i) => <Point key={spec.key} spec={spec} older={specs[i + 1]} last={i === specs.length - 1} indent={indent} />)}
    </ol>
  );
}
