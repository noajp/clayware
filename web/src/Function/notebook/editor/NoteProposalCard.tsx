'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCheck, ChevronLeft, ChevronRight, Sparkles, X } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import type { NoteProposalKind } from '@/hooks/noteAi';
import type { ResolvedProposal } from '../noteAiModel';

interface NoteProposalCardProps {
  proposals: ResolvedProposal[];
  activeId: string | null;
  anchor: { left: number; top: number; bottom: number; width: number } | null;
  keyboardActive: boolean;
  onSelect: (id: string) => void;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onAcceptAll: () => void;
  onCloseAll: () => void;
}

const KIND_LABEL: Record<NoteProposalKind, string> = {
  condense: 'Condense',
  clarify: 'Clarify',
  structure: 'Structure',
  action: 'Action item',
  missing: 'Add from speech',
};

export function NoteProposalCard({
  proposals,
  activeId,
  anchor,
  keyboardActive,
  onSelect,
  onAccept,
  onDismiss,
  onAcceptAll,
  onCloseAll,
}: NoteProposalCardProps) {
  const { t } = useI18n();
  const activeIndex = Math.max(
    0,
    proposals.findIndex((p) => p.id === activeId),
  );
  const current = proposals[activeIndex] ?? proposals[0];

  useEffect(() => {
    if (!keyboardActive || !current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        onAccept(current.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss(current.id);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [keyboardActive, current, onAccept, onDismiss]);

  if (!current || !anchor) return null;

  const cardWidth = Math.min(420, Math.max(280, window.innerWidth - 24));
  const left = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, anchor.left));
  const estimatedHeight = 200;
  const openBelow = anchor.bottom + estimatedHeight + 16 <= window.innerHeight;
  const top = openBelow
    ? Math.max(12, anchor.bottom + 8)
    : Math.max(12, anchor.top - estimatedHeight - 8);

  const prev = () => {
    const idx = (activeIndex - 1 + proposals.length) % proposals.length;
    onSelect(proposals[idx].id);
  };
  const next = () => {
    const idx = (activeIndex + 1) % proposals.length;
    onSelect(proposals[idx].id);
  };

  return createPortal(
    <div
      role="region"
      aria-label={t('AI revision proposals')}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-40 rounded-lg border border-border bg-[var(--surface-overlay)] p-2.5 shadow-[var(--shadow-overlay)]"
      style={{ left, top, width: cardWidth }}
    >
      {/* Header: kind badge, reason, pagination */}
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-text)]">
          <Sparkles size={11} />
          {t(KIND_LABEL[current.kind])}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
          {current.reason}
        </span>
        {proposals.length > 1 && (
          <div className="flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
            <button
              type="button"
              onClick={prev}
              title={t('Previous proposal')}
              aria-label={t('Previous proposal')}
              className="inline-flex size-5 items-center justify-center rounded hover:bg-[var(--surface-strong)] hover:text-foreground"
            >
              <ChevronLeft size={12} />
            </button>
            <span>
              {activeIndex + 1}/{proposals.length}
            </span>
            <button
              type="button"
              onClick={next}
              title={t('Next proposal')}
              aria-label={t('Next proposal')}
              className="inline-flex size-5 items-center justify-center rounded hover:bg-[var(--surface-strong)] hover:text-foreground"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onCloseAll}
          title={t('Dismiss all proposals')}
          aria-label={t('Dismiss all proposals')}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-[var(--surface-strong)] hover:text-foreground"
        >
          <X size={12} />
        </button>
      </div>

      {/* Inline Diff Preview */}
      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-md border border-border/70 bg-card p-2 text-[12.5px] leading-[1.5]">
        {current.kind !== 'missing' && (
          <div className="rounded bg-[var(--status-danger-subtle)] px-1.5 py-0.5 text-[var(--status-danger-text)] line-through decoration-current/60">
            {current.originalText}
          </div>
        )}
        <div className="whitespace-pre-wrap rounded bg-[var(--status-success-subtle)] px-1.5 py-0.5 text-foreground">
          {current.kind === 'missing' ? `+ ${current.proposedText}` : current.proposedText}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {proposals.length > 1 ? (
          <button
            type="button"
            onClick={onAcceptAll}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
          >
            <CheckCheck size={12} />
            {t('Apply all')}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDismiss(current.id)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
          >
            {t('Skip')}
            <kbd className="rounded bg-[var(--surface-muted)] px-1 text-[10px]">Esc</kbd>
          </button>
          <button
            type="button"
            onClick={() => onAccept(current.id)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--accent-default)] px-2.5 text-[11.5px] font-medium text-primary-foreground transition-colors hover:bg-[var(--accent-hover)]"
          >
            <Check size={12} />
            {t('Apply')}
            <kbd className="rounded bg-primary-foreground/15 px-1 text-[10px] font-normal">Tab</kbd>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
