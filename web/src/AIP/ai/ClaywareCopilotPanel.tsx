'use client';
import { formatError } from '@/Function/shared/formatError';
import dynamic from 'next/dynamic';
import { Button } from '@/ui/button';
import { SendIcon } from '@/Function/shared/SendIcon';

import { useEffect, useRef, useState } from 'react';
import { AiGraph, AlertCircle, CornerDownRight, X, Maximize2, Minimize2, Paperclip, Plus, Square } from '@/ui/icons';
import { SidebarReveal } from '@/Function/shared/SidebarReveal';
import { buildCopilotContext, type CopilotAttachment, type CopilotContext, type CopilotSubject } from './useClaywareCopilot';
import { useStrategies } from '@/hooks/strategyData';
import { CopilotMessageView, AttachmentChips } from './CopilotMessages';
import { ATTACH_ACCEPT, AttachError, MAX_FILES, MAX_PDF_BYTES, readAttachment } from './copilotFiles';
import { ClaywareFilePicker } from './ClaywareFilePicker';
import { useCopilotConversation } from './CopilotProvider';
import { CredentialChatHint } from '@/AIP/connectors/CredentialChatHint';
import { getActiveSpaceId, useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { useIsSpaceOwner } from '@/AIP/connectors/data';
import { toDateOnlyString } from '@/Function/shared/dateUtils';
import { getActiveDomainId } from '@/Function/space/domainsStore';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { useSpacePlan } from '@/hooks/spacePlanData';
import { planHasAthena } from '@/Function/space/spacePlan';
import { openPlanSettings } from '@/Function/settings/settingsNav';

const SlidesAssistant = dynamic(() => import('@/ActivitySpace/artifacts/slides/SlidesAssistant').then((m) => m.SlidesAssistant), { ssr: false });

/** Where a conversation can start. Each is a request the AI can carry out
 *  with what the Space already holds. Two, so the empty screen has one
 *  thing to do — type — and a nudge, not a menu to read. */
const STARTERS = [
  'Show what is waiting on me',
  'Find Elements that have stalled',
];

const FLOAT_KEY = 'clayware.copilot.float';
const FLOAT_MIN_W = 320;
const FLOAT_MIN_H = 280;

/** The pop-up's place, measured from the bottom-right corner of the page so
 *  it stays in that corner when the window changes size. */
interface FloatRect { right: number; bottom: number; width: number; height: number }
type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const EDGE_CLASS: Record<Edge, string> = {
  n: 'left-3 right-3 top-0 h-2 cursor-ns-resize',
  s: 'left-3 right-3 bottom-0 h-2 cursor-ns-resize',
  w: 'top-3 bottom-3 left-0 w-2 cursor-ew-resize',
  e: 'top-3 bottom-3 right-0 w-2 cursor-ew-resize',
  nw: 'left-0 top-0 h-4 w-4 cursor-nwse-resize',
  se: 'right-0 bottom-0 h-4 w-4 cursor-nwse-resize',
  ne: 'right-0 top-0 h-4 w-4 cursor-nesw-resize',
  sw: 'left-0 bottom-0 h-4 w-4 cursor-nesw-resize',
};

function readFloatRect(): FloatRect | null {
  try {
    const v = JSON.parse(localStorage.getItem(FLOAT_KEY) ?? 'null');
    if (v && [v.right, v.bottom, v.width, v.height].every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) return v;
  } catch { /* private mode */ }
  return null;
}

export interface ClaywareCopilotPanelProps {
  /** Open state is owned by the page so the corner button, ⌘L and the
   *  panel's own close all flip the same boolean. Ignored on the AI screen. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the screen is about, when the panel should speak to it rather
   *  than to Clayware at large: slides makes it the open deck's assistant; a
   *  strategy is context for the next send only — the panel's entry and
   *  its bounds do not change with the subject. The copilot is one
   *  conversation by design: switching the open Strategy mid-conversation
   *  changes the next send's context, never resets the conversation. */
  subject?: CopilotSubject;
  /** floating: a pop-up above the corner button, moved by its title bar and
   *  sized from any edge. page: the AI screen, the whole island. */
  variant?: 'floating' | 'page';
  /** The pop-up's expand button: open the AI screen. */
  onExpand?: () => void;
  /** The AI screen's shrink button: back to the pop-up. */
  onMinimize?: () => void;
}

/**
 * The AI. One conversation (CopilotProvider) shown as a pop-up or a screen
 * of its own; on Slides the pop-up is the open deck's assistant. Its tools
 * are the catalog's panel entry, run under the caller's own JWT — RLS
 * bounds what they may see and change, and deletes are confirmed in the
 * chat. A subject scopes the next send's context; it grants nothing.
 */
export function ClaywareCopilotPanel({ open, onOpenChange, subject = null, variant = 'floating', onExpand, onMinimize }: ClaywareCopilotPanelProps) {
  const { t } = useI18n();
  const floating = variant === 'floating';
  const page = variant === 'page';
  const shown = page || open;
  const [rect, setRect] = useState<FloatRect | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<CopilotAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const { messages, streaming, error, send, cancel, newConversation, retry, truncate, decideApproval, setChartColors, library, sessionId } = useCopilotConversation();
  const activeSessionTitle = sessionId ? library.sessions.find((s) => s.id === sessionId)?.title : null;
  // A standing approval on an approval card is the Space owner's to give.
  const canRememberApproval = useIsSpaceOwner(useActiveSpaceId()) === true;
  // A Space whose plan has no Athena: the screen says so instead of letting a message fail.
  const { plan } = useSpacePlan(useActiveSpaceId());
  const noAthena = !!plan && !planHasAthena(plan);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLElement>(null);

  // Hydrate the pop-up's kept place once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of stored prefs after mount
    setRect(readFloatRect());
    setHydrated(true);
  }, []);

  // Track active Domain (Domains store keeps it in localStorage; re-read on
  // open + on storage events so a Domain switch from elsewhere is reflected).
  useEffect(() => {
    const sync = () => setActiveDomainId(getActiveDomainId());
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [shown]);

  // Cmd/Ctrl+L toggles the panel; Esc closes the pop-up. The AI screen is
  // left by the rail, so it listens to neither. Cmd+L collides with Chrome's
  // address-bar focus; that's acceptable inside a SPA.
  useEffect(() => {
    if (page) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        onOpenChange(!open);
      } else if (floating && open && e.key === 'Escape' && !e.defaultPrevented) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange, floating, page]);

  // Auto-scroll to bottom on new content while streaming.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streaming, shown]);

  // Auto-focus the input when the panel opens.
  useEffect(() => {
    if (shown) setTimeout(() => inputRef.current?.focus(), 60);
  }, [shown]);

  // ── Floating: move by the title bar, size from any edge ────────────────
  // Both work in the page's coordinates (the pop-up's offset parent) and
  // keep the whole pop-up inside it.
  const startFloat = (e: React.PointerEvent, edge: Edge | 'move') => {
    const box = boxRef.current;
    const parent = box?.offsetParent as HTMLElement | null;
    if (!box || !parent || e.button !== 0) return;
    e.preventDefault();
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const start: FloatRect = {
      right: pw - box.offsetLeft - box.offsetWidth,
      bottom: ph - box.offsetTop - box.offsetHeight,
      width: box.offsetWidth,
      height: box.offsetHeight,
    };
    const sx = e.clientX;
    const sy = e.clientY;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let last = start;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      const next = { ...start };
      if (edge === 'move') {
        next.right = clamp(start.right - dx, 0, pw - start.width);
        next.bottom = clamp(start.bottom - dy, 0, ph - start.height);
      } else {
        if (edge.includes('w')) next.width = clamp(start.width - dx, FLOAT_MIN_W, pw - start.right);
        if (edge.includes('e')) {
          next.width = clamp(start.width + dx, FLOAT_MIN_W, start.width + start.right);
          next.right = start.right - (next.width - start.width);
        }
        if (edge.includes('n')) next.height = clamp(start.height - dy, FLOAT_MIN_H, ph - start.bottom);
        if (edge.includes('s')) {
          next.height = clamp(start.height + dy, FLOAT_MIN_H, start.height + start.bottom);
          next.bottom = start.bottom - (next.height - start.height);
        }
      }
      last = next;
      setRect(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { localStorage.setItem(FLOAT_KEY, JSON.stringify(last)); } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startEdge = (e: React.PointerEvent<HTMLDivElement>) => startFloat(e, e.currentTarget.dataset.edge as Edge);

  // A Strategy subject's name, from the same source the Strategy picker
  // reads; unresolved, the context calls it 'Strategy'.
  const { data: strategies } = useStrategies();
  const strategyName = subject?.kind === 'strategy'
    ? strategies?.find((s) => s.id === subject.id)?.name ?? null
    : null;

  const contextNow = (): CopilotContext => buildCopilotContext({
    subject,
    strategyName,
    domainId: activeDomainId,
    spaceId: getActiveSpaceId(),
    today: toDateOnlyString(new Date()),
  });

  const addFiles = async (list: FileList | File[]) => {
    setFileError(null);
    const picked = Array.from(list);
    if (files.length + picked.length > MAX_FILES) { setFileError(t('Up to {n} files at a time.', { n: MAX_FILES })); return; }
    const read: CopilotAttachment[] = [];
    for (const file of picked) {
      try { read.push(await readAttachment(file)); }
      catch (e) {
        if (e instanceof AttachError) {
          setFileError(e.reason === 'type'
            ? t('{name}: only PDF, Markdown and text files can be read.', { name: e.fileName })
            : t('{name} is too large (PDF up to {mb} MB).', { name: e.fileName, mb: MAX_PDF_BYTES / 1024 / 1024 }));
        } else setFileError(formatError(e));
      }
    }
    if (read.length) setFiles((prev) => [...prev, ...read]);
  };

  const submit = () => {
    const text = input.trim();
    if ((!text && files.length === 0) || streaming || noAthena) return;
    setInput('');
    const attachments = files;
    if (inputRef.current) { inputRef.current.style.height = ''; inputRef.current.style.overflowY = ''; }
    setFiles([]);
    setFileError(null);
    send(text, { context: contextNow(), attachments });
  };

  // The capture asks this conversation carries: while one stands,
  // the composer says the password belongs in its card (PR4).
  const credentialRequestIds = messages.flatMap((m) => (m.credentials ?? []).map((c) => c.requestId));

  // Editing the latest question puts it back in the composer and starts over
  // from it.
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const editLast = () => {
    const q = messages[lastUser];
    if (!q) return;
    setInput(q.content);
    setFiles((q.attachments ?? []).filter((a) => a.data));
    truncate(lastUser);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Render nothing until hydration finishes so the initial CSR matches the
  // SSR'd HTML.
  if (!hydrated || !shown) return null;

  const boxClass = page
    ? 'flex flex-1 flex-col overflow-hidden bg-card'
    : `absolute z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl ${rect ? '' : 'bottom-4 right-4 h-[min(600px,calc(100%-2rem))] w-[400px] max-w-[calc(100%-2rem)]'}`;
  const boxStyle = page ? undefined : (rect ?? undefined);
  // The conversation and composer keep a readable measure on the AI screen.
  const column = page ? 'mx-auto w-full max-w-3xl' : '';

  return (
    <aside ref={boxRef} style={boxStyle} className={boxClass}>
      {floating && (Object.keys(EDGE_CLASS) as Edge[]).map((edge) => (
        <div key={edge} data-edge={edge} onPointerDown={startEdge} className={`absolute z-10 ${EDGE_CLASS[edge]}`} aria-hidden />
      ))}

      {/* Header. On the AI screen it is h-12 (48px), aligned with every page's
          PageHeader; as a pop-up it is a draggable title bar. */}
      <div
        onPointerDown={floating ? (e) => { if (!(e.target as HTMLElement).closest('button')) startFloat(e, 'move'); } : undefined}
        className={`flex flex-shrink-0 items-center gap-2 bg-card ${floating ? 'gloss-bar h-12 cursor-grab pl-3.5 pr-2 active:cursor-grabbing' : 'gloss-bar h-12 px-4'}`}
      >
        {page && <SidebarReveal />}
        {floating ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <AiGraph size={15} className="text-[var(--accent-default)]" />
            {t('Agent')}
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
            <AiGraph size={15} className="shrink-0 text-[var(--accent-default)]" />
            <span className="truncate">{activeSessionTitle || t('Agent')}</span>
          </span>
        )}
        {subject?.kind === 'slides' && (
          <span className="inline-flex h-5 items-center rounded-[5px] bg-[var(--surface-muted)] px-1.5 text-[11px] font-medium text-muted-foreground">
            {t('Slides')}
          </span>
        )}
        {subject?.kind === 'strategy' && (
          <span className="inline-flex h-5 max-w-44 items-center truncate rounded-[5px] bg-[var(--surface-muted)] px-1.5 text-[11px] font-medium text-muted-foreground">
            {strategyName ?? t('Strategy')}
          </span>
        )}
        <div className="flex-1" />
        {subject?.kind !== 'slides' && messages.length > 0 && (
          <Button size="xs" type="button" variant="ghost" onClick={() => newConversation()} title={t('Start a new conversation')}>
            <Plus size={13} />
            {t('New conversation')}
          </Button>
        )}
        {floating && onExpand && (
          <Button size="icon-sm" type="button" variant="ghost" onClick={onExpand}
            title={t('Open the Agent screen')} aria-label={t('Open the Agent screen')} className="text-muted-foreground">
            <Maximize2 size={14} />
          </Button>
        )}
        {page && onMinimize && (
          <Button size="icon-sm" type="button" variant="ghost" onClick={onMinimize}
            title={t('Shrink to a pop-up')} aria-label={t('Shrink to a pop-up')} className="text-muted-foreground">
            <Minimize2 size={14} />
          </Button>
        )}
        {!page && (
          <Button size="icon-sm" type="button" variant="ghost" onClick={() => onOpenChange(false)}
            title={`${t('Hide Agent')} (⌘L)`} aria-label={t('Hide Agent')} className="text-muted-foreground">
            <X size={14} />
          </Button>
        )}
      </div>

      {/* One AI panel across the app: on Slides it is the open deck's
          assistant (its conversation and composer), elsewhere Clayware's. */}
      {subject?.kind === 'slides' ? <SlidesAssistant /> : <>
      {/* Conversation — Antigravity-style clean turns & structured empty state */}
      <div ref={listRef} className={`flex-1 overflow-y-auto pb-6 pt-5 text-[13.5px] leading-[1.65] ${page ? 'px-8' : 'px-3.5'}`}>
        {messages.length === 0 && !error ? (
          <div className={`flex h-full min-h-[260px] flex-col items-center justify-center text-center ${column}`}>
            <span className="mb-3.5 flex size-10 items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-well)] text-[var(--accent-default)] shadow-[var(--shadow-card)]">
              <AiGraph size={19} />
            </span>
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-foreground">
              {t('How can I help?')}
            </h2>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
              {t('Ask about your Elements, Strategies, or schedule — or delegate work directly.')}
            </p>
            {!noAthena && (
              <div className={`mt-5 grid w-full gap-2 ${page ? 'max-w-xl sm:grid-cols-3' : 'grid-cols-1'}`}>
                {[
                  { label: t('Review priorities'), prompt: t('Summarize my highest-priority and overdue Elements right now.') },
                  { label: t('Check Strategy progress'), prompt: t('Summarize current progress and blockers across our Strategies.') },
                  { label: t('Plan today'), prompt: t('Suggest a focused plan for what I should tackle today.') },
                ].map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => send(starter.prompt, { context: contextNow() })}
                    className="group/starter flex flex-col items-start gap-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-well)] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-default)] hover:bg-[var(--surface-strong)]/60"
                  >
                    <span className="text-[12.5px] font-medium text-foreground">{starter.label}</span>
                    <span className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{starter.prompt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div role="log" aria-label={t('Conversation')} className={`space-y-6 ${column}`}>
            {messages.map((m, i) => (
              <CopilotMessageView key={i} message={m} streaming={streaming && i === messages.length - 1 && !m.done}
                onRetry={!streaming && m.role === 'assistant' && i === messages.length - 1 ? () => retry({ context: contextNow() }) : undefined}
                onEdit={!streaming && i === lastUser ? editLast : undefined}
                canRememberApproval={canRememberApproval}
                spaceId={getActiveSpaceId()}
                onContinueConnection={!streaming && m.role === 'assistant' ? (c) => send(t('Please continue "{work}" (connected {names}).', { work: c.waitingFor, names: c.names.join(', ') }), { context: contextNow() }) : undefined}
                onContinueCredential={!streaming && m.role === 'assistant' ? (c) => send(t('Please continue "{work}" (entered credentials for {label}).', { work: c.waitingFor || t('the pending work'), label: c.label }), { context: contextNow() }) : undefined}
                onChartColors={m.role === 'assistant' ? (chartIndex, colors) => setChartColors(i, chartIndex, colors) : undefined}
                onDecideApproval={!streaming && m.role === 'assistant' ? (a, approve, opts) => void decideApproval(a, approve, opts) : undefined} />
            ))}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-[8px] border border-[var(--status-danger)]/25 bg-[var(--status-danger-subtle)] px-3 py-2 text-[12.5px] text-[var(--status-danger)]">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">{error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Antigravity-style two-tier composer island */}
      <div className={`pt-2 ${page ? 'px-8 pb-6' : 'px-3.5 pb-3.5'}`}>
        <div className={column}>
          <CredentialChatHint requestIds={credentialRequestIds} />
        </div>
        {noAthena && (
          <div role="status" className={`mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-foreground/[0.04] px-4 py-3 ${column}`}>
            <p className="text-[13px] text-foreground">{t('Athena is available from the Team plan. This Space is on Free.')}</p>
            <Button type="button" variant="secondary" size="sm" onClick={openPlanSettings}>{t('See plans')}</Button>
          </div>
        )}
        {messages.length === 0 && !streaming && !noAthena && (
          // Places to start, while nothing has been said: picking one writes
          // it into the box, for the person to send or change.
          <div className={`mb-2 flex flex-wrap gap-1.5 ${column}`}>
            {STARTERS.map((starter) => (
              <Button key={starter} type="button" variant="secondary" size="sm" shape="tab"
                onClick={() => { setInput(t(starter)); inputRef.current?.focus(); }}>
                <CornerDownRight size={12} />
                {t(starter)}
              </Button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); } }}
          className={`flex flex-col rounded-[10px] border bg-[var(--surface-raised)] dark:bg-[var(--surface-rail)] shadow-[var(--shadow-card)] transition-colors focus-within:border-[var(--accent-default)]/55 ${dragging ? 'border-[var(--accent-default)] bg-[var(--accent-subtle)]' : 'border-[var(--border-default)]'} ${column}`}
        >
          {files.length > 0 && (
            <div className="flex px-3 pt-2.5">
              <AttachmentChips files={files} align="start" onRemove={(i) => setFiles((prev) => prev.filter((_, k) => k !== i))} />
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Grows with what is written, up to the cap.
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 192)}px`;
              // No scrollbar until the text outgrows the cap.
              e.target.style.overflowY = e.target.scrollHeight > 192 ? 'auto' : 'hidden';
            }}
            onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void addFiles(e.clipboardData.files); } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={noAthena || streaming}
            placeholder={streaming ? '…' : t('Ask Athena anything')}
            aria-label={t('Message AI')}
            className="max-h-48 min-h-[42px] w-full resize-none overflow-hidden bg-transparent px-3.5 pb-1.5 pt-2.5 text-[13.5px] leading-[1.55] text-foreground placeholder:text-muted-foreground/65 disabled:opacity-60"
            style={{ fontWeight: 400 }}
          />
          <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]/70 px-2 pb-1.5 pt-1.5">
            <div className="flex items-center gap-0.5">
              <input ref={fileInputRef} type="file" accept={ATTACH_ACCEPT} multiple hidden
                onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
              <Button size="icon-xs" type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={streaming}
                title={t('Attach a file (PDF, Markdown, text)')} aria-label={t('Attach a file (PDF, Markdown, text)')} className="text-muted-foreground hover:text-foreground">
                <Paperclip size={14} />
              </Button>
              <ClaywareFilePicker disabled={streaming || files.length >= MAX_FILES} onPick={(f) => { setFileError(null); setFiles((prev) => [...prev, f]); }} />
            </div>
            <div className="flex items-center gap-2">
              {page && !streaming && (
                <span className="hidden items-center gap-1 text-[11px] text-muted-foreground/75 sm:inline-flex">
                  <kbd className="kbd-key">↵</kbd>
                  <span>{t('Send')}</span>
                </span>
              )}
              {streaming ? (
                <Button size="xs" type="button" onClick={cancel} title={t('Stop')} aria-label={t('Stop')} variant="secondary">
                  <Square size={12} />
                  <span>{t('Stop')}</span>
                </Button>
              ) : (
                <Button size="xs" type="submit" disabled={noAthena || (!input.trim() && files.length === 0)} title={t('Send (Enter)')} aria-label={t('Send')} variant="primary"
                  className="px-2.5">
                  <SendIcon size={13} />
                </Button>
              )}
            </div>
          </div>
          {fileError && <span role="alert" className="truncate px-3 pb-2 text-[11px] text-[var(--status-danger)]" title={fileError}>{fileError}</span>}
        </form>
      </div>
      </>}
    </aside>
  );
}
