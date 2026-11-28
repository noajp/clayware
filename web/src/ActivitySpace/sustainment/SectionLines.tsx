'use client';

import { useRef, useState } from 'react';
import { Plus, X } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';

// One section of a function's definition: its short lines, edited in place.
// A line saves when the focus leaves it; Enter saves and starts the next
// one; an emptied line is removed. Read-only, the lines are plain text.

export function SectionLines({ label, lines, readOnly, onChange }: {
  /** The section's name, to name its fields for a screen reader. */
  label: string;
  lines: readonly string[];
  readOnly: boolean;
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<string[]>([...lines]);
  const [seen, setSeen] = useState(lines);
  // The row being typed at the end, not yet a line.
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState('');
  if (lines !== seen) { setSeen(lines); setDrafts([...lines]); }

  const commit = (next: string[]) => {
    const clean = next.map((l) => l.trim()).filter(Boolean);
    setDrafts(clean);
    if (clean.length !== lines.length || clean.some((l, i) => l !== lines[i])) onChange(clean);
  };
  const commitFresh = (keepAdding: boolean) => {
    const text = fresh.trim();
    setFresh('');
    if (text) commit([...drafts, text]);
    if (!keepAdding || !text) setAdding(false);
  };

  if (readOnly) {
    if (lines.length === 0) return <p className="text-[13px] text-muted-foreground">{t('Nothing written')}</p>;
    return (
      <ul className="grid gap-0.5">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-[20px] text-foreground">
            <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
            <span className="min-w-0 break-words">{line}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="grid gap-0.5">
      {drafts.map((line, i) => (
        <div key={i} className="group/line -mx-1.5 flex items-start gap-2 rounded-[var(--radius-sm)] px-1.5 focus-within:bg-[var(--surface-strong)] hover:bg-[var(--surface-strong)]">
          <span aria-hidden className="mt-3 size-1 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
          <WrapField value={line} label={`${label} ${i + 1}`}
            onChange={(text) => setDrafts((prev) => prev.map((l, j) => (j === i ? text : l)))}
            onCommit={() => commit(drafts)}
            onCancel={() => setDrafts([...lines])} />
          <button type="button" aria-label={t('Remove “{line}”', { line })} title={t('Remove')}
            onClick={() => commit(drafts.filter((_, j) => j !== i))}
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 group-focus-within/line:opacity-100 group-hover/line:opacity-100">
            <X size={13} />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="-mx-1.5 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-strong)] px-1.5">
          <span aria-hidden className="mt-3 size-1 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
          <WrapField autoFocus value={fresh} label={t('New line in {section}', { section: label })}
            onChange={setFresh} onCommit={() => commitFresh(false)} onEnter={() => commitFresh(true)}
            onCancel={() => { setFresh(''); setAdding(false); }} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="-mx-1.5 flex h-7 w-fit items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground focus-visible:bg-[var(--surface-strong)] focus-visible:text-foreground">
          <Plus size={13} />{t('Add a line')}
        </button>
      )}
    </div>
  );
}

/** One line's field. It grows with its text and wraps instead of clipping:
 *  a hidden copy of the text sizes the cell the field fills. Enter ends the
 *  edit (or `onEnter`), Escape puts the saved text back. */
function WrapField({ value, label, autoFocus = false, onChange, onCommit, onEnter, onCancel }: {
  value: string;
  label: string;
  autoFocus?: boolean;
  onChange: (text: string) => void;
  /** The focus left the field. */
  onCommit: () => void;
  /** Enter, when it should do more than leave the field. */
  onEnter?: () => void;
  onCancel: () => void;
}) {
  const TEXT = 'col-start-1 row-start-1 min-w-0 whitespace-pre-wrap break-words py-1 text-[13px] leading-[20px]';
  // Escape leaves the field too; that blur must not save what was typed.
  const cancelled = useRef(false);
  return (
    <span className="grid min-w-0 flex-1">
      <span aria-hidden className={`${TEXT} invisible`}>{`${value} `}</span>
      <textarea value={value} rows={1} aria-label={label} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onBlur={() => { if (cancelled.current) cancelled.current = false; else onCommit(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (onEnter) onEnter(); else e.currentTarget.blur();
          }
          if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; onCancel(); e.currentTarget.blur(); }
        }}
        className={`${TEXT} resize-none overflow-hidden bg-transparent text-foreground outline-none`} />
    </span>
  );
}
