'use client';

import { useState } from 'react';
import { ChevronRight } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { formatAge } from '@/Function/shared/dateUtils';
import { historyLine, readStatusChange } from '@/Function/shared/historyLine';
import { statusLabel } from '@/shared/designTokens';

// An Element's Activity as one line in the key blue, drawn as a git graph is:
// each change a point on it, the newest a ring (how the Element is now), and
// small rewrites in a row folded into one numbered point that opens.

interface Entry { id: string; kind: string; detail: string; author: string; createdAt: Date }

type Mark = 'head' | 'change' | 'small' | 'fold';

function MarkDot({ mark, count }: { mark: Mark; count?: number }) {
  if (mark === 'fold') {
    return (
      <span className="flex size-[18px] items-center justify-center rounded-full border border-[var(--accent-default)] bg-card text-[10px] tabular-nums text-muted-foreground">
        {count}
      </span>
    );
  }
  const cls = mark === 'head' ? 'size-3 border-[2.5px] border-[var(--accent-default)] bg-card'
    : mark === 'change' ? 'size-2.5 bg-[var(--accent-default)]'
      : 'size-1.5 bg-[var(--accent-default)]';
  return <span className={`rounded-full ${cls}`} />;
}

/** One point on the line: its mark on the line, the line on to the next
 *  point (none after the last), and what it says. */
function Point({ mark, count, last, children }: { mark: Mark; count?: number; last: boolean; children: React.ReactNode }) {
  return (
    <li className="relative pb-2.5 pl-7 last:pb-0">
      {!last && <span aria-hidden className="absolute -bottom-2 left-[9.25px] top-2 w-[1.5px] bg-[var(--accent-default)]" />}
      <span aria-hidden className="absolute left-0 top-0 flex h-4 w-5 items-center justify-center"><MarkDot mark={mark} count={count} /></span>
      {children}
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
    return change ? `${change[0] === '—' ? '—' : statusLabel(change[0])} → ${statusLabel(change[1])}` : e.detail;
  };
  const line = historyLine(entries);
  const points: React.ReactNode[] = [];
  line.forEach((item, i) => {
    const lastItem = i === line.length - 1;
    if (item.type === 'change') {
      const e = item.entry;
      points.push(
        <Point key={e.id} mark={i === 0 ? 'head' : item.small ? 'small' : 'change'} last={lastItem}>
          <p className={`${textCls} ${item.small ? 'text-muted-foreground' : 'text-foreground/90'}`}>{say(e)}</p>
          <p className={metaCls}>{e.author} · {formatAge(e.createdAt, true)}</p>
        </Point>,
      );
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
    points.push(
      <Point key={item.id} mark="fold" count={item.entries.length} last={lastItem && !isOpen}>
        <button type="button" onClick={toggle} aria-expanded={isOpen}
          className={`-ml-1 flex items-center gap-1 rounded-md px-1 text-left text-muted-foreground hover:bg-muted/40 hover:text-foreground ${textCls}`}>
          <ChevronRight size={12} className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          {t('Small edits · {n}', { n: item.entries.length })}
        </button>
        <p className={metaCls}>
          {formatAge(newest.createdAt, true) === formatAge(oldest.createdAt, true)
            ? formatAge(newest.createdAt, true)
            : `${formatAge(newest.createdAt, true)} – ${formatAge(oldest.createdAt, true)}`}
        </p>
      </Point>,
    );
    if (isOpen) {
      item.entries.forEach((e, j) => {
        points.push(
          <Point key={e.id} mark="small" last={lastItem && j === item.entries.length - 1}>
            <p className={`${textCls} text-muted-foreground`}>{say(e)}</p>
            <p className={metaCls}>{e.author} · {formatAge(e.createdAt, true)}</p>
          </Point>,
        );
      });
    }
  });
  return <ol className="list-none">{points}</ol>;
}
