'use client';
import { formatError } from '@/Function/shared/formatError';
import dynamic from 'next/dynamic';
import { Button } from '@/ui/button';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Calendar,
  Clock,
  Compass,
  Folder as FolderIcon,
  ListChecks,
  Maximize2,
  Minimize2,
  Paperclip,
  Plus,
  Square,
  X,
} from '@/ui/icons';
import { AthenaAvatar } from './AthenaAvatar';
import { SidebarReveal } from '@/Function/shared/SidebarReveal';
import { buildCopilotContext, type CopilotAttachment, type CopilotContext, type CopilotSubject } from './useClaywareCopilot';
import { useStrategies } from '@/hooks/strategyData';
import { CopilotMessageView, AttachmentChips } from './CopilotMessages';
import { ATTACH_ACCEPT, AttachError, MAX_FILES, MAX_PDF_BYTES, readAttachment } from './copilotFiles';
import { ClaywareFilePicker } from './ClaywareFilePicker';
import { useAthenaMood, useCopilotConversation } from './CopilotProvider';
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

/** Single curated set of starters shown beneath the empty-state composer. */
const QUICK_STARTERS = [
  {
    icon: ListChecks,
    label: 'Review priorities',
    prompt: 'Summarize my highest-priority and overdue Elements right now.',
  },
  {
    icon: Compass,
    label: 'Check Strategy progress',
    prompt: 'Summarize current progress and blockers across our Strategies.',
  },
  {
    icon: Calendar,
    label: 'Plan today',
    prompt: 'Suggest a focused plan for what I should tackle today.',
  },
  {
    icon: Clock,
    label: 'Find stalled Elements',
    prompt: 'Find Elements that have stalled',
  },
] as const;

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
  const [heroHover, setHeroHover] = useState(false);
  const [heroCheer, setHeroCheer] = useState(false);
  const heroCheerTimer = useRef<number | null>(null);
  const baseAthenaMood = useAthenaMood();
  const heroMood = heroCheer ? 'cheer' : heroHover && baseAthenaMood === 'idle' ? 'wave' : baseAthenaMood;
  const triggerHeroCheer = () => {
    setHeroCheer(true);
    if (heroCheerTimer.current) window.clearTimeout(heroCheerTimer.current);
    heroCheerTimer.current = window.setTimeout(() => setHeroCheer(false), 1800);
  };
  useEffect(() => () => { if (heroCheerTimer.current) window.clearTimeout(heroCheerTimer.current); }, []);
  const {
    messages,
    streaming,
    error,
    send,
    cancel,
    newConversation,
    retry,
    truncate,
    decideApproval,
    setChartColors,
    library,
    sessionId,
    draftFolderId,
    setDraftFolderId,
  } = useCopilotConversation();
  const activeSession = sessionId ? library.sessions.find((s) => s.id === sessionId) ?? null : null;
  const activeSessionTitle = activeSession?.title || null;
  const activeFolderId = activeSession ? activeSession.folder_id : draftFolderId;
  const activeFolder = activeFolderId ? library.folders.find((f) => f.id === activeFolderId) ?? null : null;
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
    : `absolute z-40 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl ${rect ? '' : 'bottom-4 right-4 h-[min(600px,calc(100%-2rem))] w-[400px] max-w-[calc(100%-2rem)]'}`;
  const boxStyle = page ? undefined : (rect ?? undefined);
  const isEmpty = messages.length === 0 && !error;
  const centeredEmptyPage = page && isEmpty;
  // Readable measure for the conversation stream and composer.
  const column = page ? 'mx-auto w-full max-w-[720px]' : 'w-full';
  const canSend = !noAthena && (input.trim().length > 0 || files.length > 0);

  const composerForm = (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); } }}
      className={`flex flex-col rounded-[16px] border transition-colors focus-within:border-[var(--accent-default)]/55 ${
        dragging
          ? 'border-[var(--accent-default)] bg-[var(--accent-subtle)]'
          : 'border-[var(--border-default)] bg-[var(--surface-muted)]/65 focus-within:bg-[var(--surface-raised)] dark:bg-[var(--surface-rail)] dark:focus-within:bg-[var(--surface-rail)]'
      } ${centeredEmptyPage ? 'w-full' : column}`}
    >
      {files.length > 0 && (
        <div className="flex px-3.5 pt-3">
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
        rows={centeredEmptyPage ? 2 : 1}
        disabled={noAthena || streaming}
        placeholder={streaming ? '…' : t('Ask Athena anything')}
        aria-label={t('Message AI')}
        className={`max-h-48 w-full resize-none overflow-hidden bg-transparent px-4 pt-3.5 text-[14px] leading-[1.55] text-foreground placeholder:text-muted-foreground/60 disabled:opacity-60 ${
          centeredEmptyPage ? 'min-h-[60px] pb-2' : 'min-h-[44px] pb-1.5'
        }`}
        style={{ fontWeight: 400 }}
      />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex items-center gap-0.5">
          <input ref={fileInputRef} type="file" accept={ATTACH_ACCEPT} multiple hidden
            onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
          <Button size="icon-xs" type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={streaming}
            title={t('Attach a file (PDF, Markdown, text)')} aria-label={t('Attach a file (PDF, Markdown, text)')}
            className="rounded-full text-muted-foreground hover:text-foreground">
            <Paperclip size={14} />
          </Button>
          <ClaywareFilePicker disabled={streaming || files.length >= MAX_FILES} onPick={(f) => { setFileError(null); setFiles((prev) => [...prev, f]); }} />
        </div>
        <div className="flex items-center gap-2">
          {page && !streaming && input.trim().length > 0 && (
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground/65 sm:inline-flex">
              <kbd className="kbd-key">↵</kbd>
              <span>{t('Send')}</span>
            </span>
          )}
          {streaming ? (
            <Button size="xs" type="button" onClick={cancel} title={t('Stop')} aria-label={t('Stop')} variant="secondary" shape="tab" className="px-2.5">
              <Square size={11} />
              <span>{t('Stop')}</span>
            </Button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              title={t('Send (Enter)')}
              aria-label={t('Send')}
              className={`flex size-7 items-center justify-center rounded-full transition-colors ${
                canSend
                  ? 'bg-[var(--accent-default)] text-primary-foreground hover:bg-[var(--accent-hover)]'
                  : 'bg-[var(--surface-strong)] text-muted-foreground/60 cursor-not-allowed'
              }`}
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
      {fileError && <span role="alert" className="truncate px-4 pb-2.5 text-[11.5px] text-[var(--status-danger)]" title={fileError}>{fileError}</span>}
    </form>
  );

  return (
    <aside ref={boxRef} style={boxStyle} className={boxClass}>
      {floating && (Object.keys(EDGE_CLASS) as Edge[]).map((edge) => (
        <div key={edge} data-edge={edge} onPointerDown={startEdge} className={`absolute z-10 ${EDGE_CLASS[edge]}`} aria-hidden />
      ))}

      {/* Header: airy and borderless on a fresh full-screen conversation; shows
          folder breadcrumb + conversation title once a chat is underway. */}
      <div
        onPointerDown={floating ? (e) => { if (!(e.target as HTMLElement).closest('button')) startFloat(e, 'move'); } : undefined}
        className={`flex h-12 flex-shrink-0 items-center gap-2 bg-card ${
          floating
            ? 'gloss-bar cursor-grab pl-3.5 pr-2 active:cursor-grabbing'
            : centeredEmptyPage
              ? 'px-4'
              : 'gloss-bar px-4'
        }`}
      >
        {page && <SidebarReveal />}
        {floating ? (
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <AthenaAvatar size="xs" working={streaming} />
            <span>{t('Athena')}</span>
          </span>
        ) : !isEmpty ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
            {activeFolder && (
              <>
                <span className="inline-flex max-w-36 shrink-0 items-center gap-1 truncate text-muted-foreground">
                  <FolderIcon size={13} className="shrink-0" />
                  <span className="truncate">{activeFolder.name}</span>
                </span>
                <span aria-hidden className="text-muted-foreground/45">/</span>
              </>
            )}
            <span className="truncate font-medium text-foreground">{activeSessionTitle || t('New conversation')}</span>
          </div>
        ) : activeFolder ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-well)] py-0.5 pl-2.5 pr-1.5 text-[12px] text-muted-foreground">
            <FolderIcon size={12} className="shrink-0 text-[var(--accent-text)]" />
            <span className="max-w-44 truncate text-foreground/85">{activeFolder.name}</span>
            <button
              type="button"
              onClick={() => setDraftFolderId(null)}
              aria-label={t('No folder')}
              title={t('No folder')}
              className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground"
            >
              <X size={11} />
            </button>
          </span>
        ) : null}
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
      {subject?.kind === 'slides' ? <SlidesAssistant /> : centeredEmptyPage ? (
        /* Centered companion hero + integrated composer — no dead vertical void,
           and one curated row of quick actions directly below the input. */
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-16 pt-4">
          <div className="flex w-full max-w-[660px] flex-col items-center">
            <div
              onMouseEnter={() => setHeroHover(true)}
              onMouseLeave={() => setHeroHover(false)}
              className="group/hero relative flex flex-col items-center"
            >
              <AthenaAvatar
                size="hero"
                mood={heroMood}
                working={streaming}
                orbitable
                onTap={triggerHeroCheer}
                className="transition-transform duration-150 group-hover/hero:scale-[1.03]"
              />
            </div>
            <h2 className="mt-4 text-[21px] font-semibold tracking-[-0.02em] text-foreground">
              {t('How can I help?')}
            </h2>
            <p className="mt-1 max-w-md text-center text-[13px] leading-relaxed text-muted-foreground">
              {t('Ask about your Elements, Strategies, or schedule — or delegate work directly.')}
            </p>

            {noAthena && (
              <div role="status" className="mt-5 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-well)] px-4 py-3">
                <p className="text-[13px] text-foreground">{t('Athena is available from the Team plan. This Space is on Free.')}</p>
                <Button type="button" variant="secondary" size="sm" onClick={openPlanSettings}>{t('See plans')}</Button>
              </div>
            )}

            <div className="mt-6 w-full">
              {composerForm}
            </div>

            {!noAthena && (
              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5">
                {QUICK_STARTERS.map(({ icon: StarterIcon, label, prompt }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => send(t(prompt), { context: contextNow() })}
                    title={t(prompt)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-well)] px-3 text-[12.5px] font-normal text-foreground/85 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--surface-muted)] hover:text-foreground"
                  >
                    <StarterIcon size={13} className="shrink-0 text-muted-foreground" />
                    <span>{t(label)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : <>
        {/* Active conversation stream (or compact floating pop-up empty state) */}
        <div ref={listRef} className={`flex-1 overflow-y-auto pb-6 pt-5 text-[13.5px] leading-[1.65] ${page ? 'px-8' : 'px-3.5'}`}>
          {isEmpty ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-2 text-center">
              <AthenaAvatar size="md" mood={heroMood} working={streaming} />
              <h2 className="mt-3 text-[15px] font-semibold tracking-[-0.015em] text-foreground">
                {t('How can I help?')}
              </h2>
              <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">
                {t('Ask about your Elements, Strategies, or schedule — or delegate work directly.')}
              </p>
              {!noAthena && (
                <div className="mt-4 flex w-full flex-col gap-1.5">
                  {QUICK_STARTERS.slice(0, 3).map(({ icon: StarterIcon, label, prompt }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => send(t(prompt), { context: contextNow() })}
                      className="flex items-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-well)] px-3 py-2 text-left text-[12.5px] text-foreground/85 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--surface-muted)] hover:text-foreground"
                    >
                      <StarterIcon size={13} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{t(label)}</span>
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
                <div role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)]/25 bg-[var(--status-danger-subtle)] px-3.5 py-2.5 text-[12.5px] text-[var(--status-danger)]">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom-docked composer for active conversations and the floating pop-up */}
        <div className={`pt-2 ${page ? 'bg-gradient-to-t from-card via-card to-transparent px-8 pb-5' : 'px-3.5 pb-3.5'}`}>
          <div className={column}>
            <CredentialChatHint requestIds={credentialRequestIds} />
          </div>
          {noAthena && (
            <div role="status" className={`mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-foreground/[0.04] px-4 py-3 ${column}`}>
              <p className="text-[13px] text-foreground">{t('Athena is available from the Team plan. This Space is on Free.')}</p>
              <Button type="button" variant="secondary" size="sm" onClick={openPlanSettings}>{t('See plans')}</Button>
            </div>
          )}
          {composerForm}
        </div>
      </>}
    </aside>
  );
}
