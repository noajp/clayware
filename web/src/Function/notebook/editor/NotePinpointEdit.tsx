'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CornerDownLeft, Loader2, RotateCcw, Sparkles, X } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { useEscapeLayer } from '@/Function/shared/keyboard';
import { editNoteSelection, type SelectionEditResult } from '@/hooks/noteAi';
import { formatError } from '@/Function/shared/formatError';

interface NotePinpointEditProps {
  x: number;
  y: number;
  title: string;
  selectedText: string;
  beforeContext: string;
  afterContext: string;
  recentTranscript?: string;
  language: string;
  onApply: (result: SelectionEditResult) => void;
  onClose: () => void;
}

const QUICK_PRESETS = [
  { id: 'condense', label: 'Condense', instruction: '要点を残して簡潔に圧縮してください' },
  { id: 'clarify', label: 'Clarify', instruction: '曖昧な表現を明確で読みやすい表現に整えてください' },
  { id: 'bullet', label: 'Bullets', instruction: '要点を箇条書きに整理してください' },
  { id: 'checklist', label: 'Checklist', instruction: '実行項目をチェックリスト形式に整理してください' },
] as const;

export function NotePinpointEdit({
  x,
  y,
  title,
  selectedText,
  beforeContext,
  afterContext,
  recentTranscript,
  language,
  onApply,
  onClose,
}: NotePinpointEditProps) {
  const { t } = useI18n();
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SelectionEditResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reqIdRef = useRef(0);

  useEscapeLayer(true, onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runEdit = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await editNoteSelection({
        title,
        selectedText,
        beforeContext,
        afterContext,
        instruction: trimmed,
        recentTranscript,
        language,
      });
      if (reqId !== reqIdRef.current) return;
      setResult(next);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(formatError(err));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  };

  // Accept with Tab/Enter while previewing a result.
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Tab' || (e.key === 'Enter' && document.activeElement !== inputRef.current)) {
        e.preventDefault();
        onApply(result);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, onApply]);

  const width = Math.min(380, Math.max(280, window.innerWidth - 24));
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, x - width / 2));
  const estimatedHeight = result ? 260 : 132;
  const top =
    y + estimatedHeight + 16 > window.innerHeight
      ? Math.max(12, y - estimatedHeight - 12)
      : Math.max(12, y + 10);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-label={t('Pinpoint AI edit')}
        className="fixed z-50 rounded-lg border border-border bg-[var(--surface-overlay)] p-2.5 shadow-[var(--shadow-overlay)]"
        style={{ left, top, width }}
      >
        <div className="flex items-center gap-1.5 rounded-md bg-[var(--surface-muted)] px-2 py-1.5">
          <Sparkles size={13} className="shrink-0 text-[var(--accent-default)]" />
          <input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void runEdit(instruction);
              }
            }}
            placeholder={t('Ask AI to adjust this selection…')}
            className="no-focus-ring min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground outline-none"
          />
          {loading ? (
            <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <button
              type="button"
              disabled={!instruction.trim()}
              onClick={() => void runEdit(instruction)}
              title={t('Run')}
              aria-label={t('Run')}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground disabled:opacity-40"
            >
              <CornerDownLeft size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title={t('Close')}
            aria-label={t('Close')}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
          >
            <X size={13} />
          </button>
        </div>

        {/* Quick pinpoint presets */}
        {!result && (
          <div className="mt-2 flex flex-wrap gap-1">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={loading}
                onClick={() => {
                  setInstruction(t(preset.label));
                  void runEdit(preset.instruction);
                }}
                className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11.5px] text-foreground/85 transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground disabled:opacity-50"
              >
                {t(preset.label)}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-2 rounded-md bg-[var(--status-danger-subtle)] px-2 py-1.5 text-[11.5px] text-[var(--status-danger-text)]">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-2.5 space-y-2">
            {result.reason && (
              <p className="text-[11px] text-muted-foreground">{result.reason}</p>
            )}
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-border/70 bg-card p-2 text-[12.5px] leading-[1.5]">
              <div className="rounded bg-[var(--status-danger-subtle)] px-1.5 py-1 text-[var(--status-danger-text)] line-through decoration-current/60">
                {selectedText}
              </div>
              <div className="whitespace-pre-wrap rounded bg-[var(--status-success-subtle)] px-1.5 py-1 text-foreground">
                {result.replacement}
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                disabled={loading}
                onClick={() => void runEdit(instruction || QUICK_PRESETS[0].instruction)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
              >
                <RotateCcw size={12} />
                {t('Retry')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-7 items-center rounded-md px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={() => onApply(result)}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--accent-default)] px-2.5 text-[11.5px] font-medium text-primary-foreground transition-colors hover:bg-[var(--accent-hover)]"
              >
                <Check size={12} />
                {t('Apply')}
                <kbd className="ml-0.5 rounded bg-primary-foreground/15 px-1 text-[10px] font-normal">Tab</kbd>
              </button>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
