'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  X,
} from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { formatElapsed, type TranscriptSegment } from '../noteAiModel';
import type { VoiceSilence, VoiceStatus } from './useVoiceCapture';

interface VoiceMinutesDockProps {
  supported: boolean;
  status: VoiceStatus;
  segments: TranscriptSegment[];
  interimText: string;
  elapsedSec: number;
  unprocessedChars: number;
  structuring: boolean;
  notice: string | null;
  error: string | null;
  silence: VoiceSilence | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onClose: () => void;
  onStructureNow: () => void;
  onAppendManualText: (text: string) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function VoiceMinutesDock({
  supported,
  status,
  segments,
  interimText,
  elapsedSec,
  unprocessedChars,
  structuring,
  notice,
  error,
  silence,
  onStart,
  onPause,
  onResume,
  onStop,
  onClose,
  onStructureNow,
  onAppendManualText,
}: VoiceMinutesDockProps) {
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [copied, setCopied] = useState(false);

  const isStarting = status === 'starting';
  // Asked to listen counts as listening for the controls: it can be paused or stopped.
  const isListening = status === 'listening' || isStarting;
  const isPaused = status === 'paused';
  const latestText = interimText || segments[segments.length - 1]?.text || '';

  const errorMessage =
    error === 'permission-denied'
      ? t('Microphone access was denied. Allow microphone permission in your browser settings.')
      : error === 'no-microphone'
        ? t('No microphone was detected.')
        : error === 'not-started'
          ? t('The microphone has not started. Allow microphone access for this site in the browser, then press Record again.')
        : error === 'start-failed'
          ? t('Listening could not start. Press Record to try again.')
        : error === 'unsupported'
          ? t('Live voice recognition is not supported in this browser. You can still paste transcript lines below.')
          : error;

  // Listening with no words: how far the sound got, and what to do about it.
  const silenceMessage =
    silence === 'no-audio'
      ? t('The microphone is not sending any audio. Check that the right microphone is chosen in the browser and is not muted.')
      : silence === 'no-sound'
        ? t('No sound is reaching the microphone. Check that it is not muted and that the right one is chosen.')
        : silence === 'no-words'
          ? t('Sound is reaching the microphone, but this browser is returning no words. Speech recognition works in Chrome and Edge; you can also paste the transcript below.')
          : null;

  const copyTranscript = () => {
    const text = segments.map((s) => `[${formatTime(s.timestamp)}] ${s.text}`).join('\n');
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const submitManual = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    onAppendManualText(trimmed);
    setManualInput('');
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-border bg-[var(--surface-overlay)] shadow-[var(--shadow-overlay)]">
        {/* Expandable raw transcript & manual paste drawer */}
        {drawerOpen && (
          <div className="border-b border-border/70 px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-medium text-muted-foreground">
                {t('Raw transcript')} ({segments.length})
              </span>
              {segments.length > 0 && (
                <button
                  type="button"
                  onClick={copyTranscript}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? t('Copied') : t('Copy')}
                </button>
              )}
            </div>
            <div className="max-h-36 space-y-1 overflow-y-auto pr-1 text-[12px] leading-[1.5]">
              {segments.length === 0 && !interimText ? (
                <p className="py-2 text-muted-foreground">
                  {t('Spoken words appear here as you talk so nothing is missed.')}
                </p>
              ) : (
                <>
                  {segments.map((seg) => (
                    <div key={seg.id} className="flex items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                        {formatTime(seg.timestamp)}
                      </span>
                      <span className="text-foreground/90">{seg.text}</span>
                    </div>
                  ))}
                  {interimText && (
                    <div className="flex items-baseline gap-2 text-muted-foreground italic">
                      <span className="shrink-0 font-mono text-[10.5px]">…</span>
                      <span>{interimText}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submitManual();
                  }
                }}
                placeholder={t('Paste or type spoken notes to add to transcript…')}
                className="no-focus-ring h-7 min-w-0 flex-1 rounded-md bg-[var(--surface-muted)] px-2 text-[12px] text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:bg-[var(--surface-strong)]"
              />
              <button
                type="button"
                disabled={!manualInput.trim()}
                onClick={submitManual}
                className="inline-flex h-7 shrink-0 items-center rounded-md bg-[var(--surface-strong)] px-2.5 text-[11.5px] font-medium text-foreground transition-colors hover:bg-[var(--accent-subtle)] hover:text-[var(--accent-text)] disabled:opacity-40"
              >
                {t('Add')}
              </button>
            </div>
          </div>
        )}

        {/* Notice / error strip */}
        {(errorMessage || silenceMessage || notice) && (
          <div className="border-b border-border/60 px-3 py-1.5 text-[11.5px] [overflow-wrap:anywhere]">
            {errorMessage || silenceMessage ? (
              <span className="text-[var(--status-danger-text)]">{errorMessage || silenceMessage}</span>
            ) : (
              <span className="text-muted-foreground">{notice}</span>
            )}
          </div>
        )}

        {/* Main live strip */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {/* Status indicator + live preview */}
          <div className="flex min-w-[min(100%,12rem)] flex-1 items-center gap-2">
            <span
              className={[
                'inline-block size-2 shrink-0 rounded-full',
                isStarting
                  ? 'bg-muted-foreground/50'
                  : isListening
                  ? 'animate-pulse bg-[var(--status-danger)]'
                  : structuring
                    ? 'animate-pulse bg-[var(--accent-default)]'
                    : isPaused
                      ? 'bg-[var(--status-warning)]'
                      : 'bg-muted-foreground/50',
              ].join(' ')}
            />
            <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground">
              {formatElapsed(elapsedSec)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/90">
              {structuring ? (
                <span className="inline-flex items-center gap-1.5 text-[var(--accent-text)]">
                  <Loader2 size={12} className="animate-spin" />
                  {t('Structuring minutes…')}
                </span>
              ) : latestText ? (
                <span className={interimText ? 'text-muted-foreground' : 'text-foreground/90'}>
                  {latestText}
                </span>
              ) : isStarting ? (
                <span className="text-muted-foreground">{t('Waiting for the microphone…')}</span>
              ) : isListening ? (
                <span className="text-muted-foreground">{t('Listening… speak naturally')}</span>
              ) : isPaused ? (
                <span className="text-muted-foreground">{t('Paused')}</span>
              ) : (
                <span className="text-muted-foreground">{t('Ready to capture voice minutes')}</span>
              )}
            </span>
          </div>

          {/* Controls */}
          <div className="flex max-w-full flex-wrap items-center gap-1">
            {supported && (
              <>
                {isListening ? (
                  <button
                    type="button"
                    onClick={onPause}
                    title={t('Pause')}
                    aria-label={t('Pause')}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--surface-muted)] px-2 text-[11.5px] text-foreground transition-colors hover:bg-[var(--surface-strong)]"
                  >
                    <Pause size={12} />
                    <span className="hidden sm:inline">{t('Pause')}</span>
                  </button>
                ) : isPaused ? (
                  <button
                    type="button"
                    onClick={onResume}
                    title={t('Resume')}
                    aria-label={t('Resume')}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--accent-default)] px-2 text-[11.5px] font-medium text-primary-foreground transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    <Play size={12} />
                    <span className="hidden sm:inline">{t('Resume')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onStart}
                    title={t('Start recording')}
                    aria-label={t('Start recording')}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--status-danger)] px-2.5 text-[11.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Mic size={12} />
                    <span>{t('Record')}</span>
                  </button>
                )}

                {(isListening || isPaused) && (
                  <button
                    type="button"
                    onClick={onStop}
                    title={t('Stop and organize')}
                    aria-label={t('Stop and organize')}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--status-danger-subtle)] px-2 text-[11.5px] font-medium text-[var(--status-danger-text)] transition-colors hover:bg-[var(--status-danger)] hover:text-primary-foreground"
                  >
                    <Square size={10} />
                    <span className="hidden sm:inline">{t('Stop')}</span>
                  </button>
                )}
              </>
            )}

            {/* Structure now */}
            <button
              type="button"
              disabled={structuring || unprocessedChars === 0}
              onClick={onStructureNow}
              title={t('Organize transcript into minutes now')}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11.5px] text-foreground transition-colors hover:bg-[var(--surface-strong)] disabled:opacity-40"
            >
              {structuring ? <Loader2 size={11} className="animate-spin" /> : null}
              <span>{t('Organize now')}</span>
              {unprocessedChars > 0 && !structuring && (
                <span className="inline-block size-1.5 rounded-full bg-[var(--accent-default)]" />
              )}
            </button>

            {/* Raw transcript drawer toggle */}
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-expanded={drawerOpen}
              title={t('Toggle raw transcript')}
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11.5px] tabular-nums text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
            >
              <span>{segments.length}</span>
              {drawerOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>

            {/* Close dock */}
            {!isListening && (
              <button
                type="button"
                onClick={onClose}
                title={t('Close voice panel')}
                aria-label={t('Close voice panel')}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
