'use client';

import { useExplorerData } from '@/Function/shared/ExplorerDataContext';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeft, X } from '@/ui/icons';
import { useDomains, type ElementWithDetails } from '@/hooks/useSupabase';
import { proposeNoteRefinements, regroupVoiceMinutes, structureVoiceMinutes } from '@/hooks/noteAi';
import {
  NoteEditor,
  type NoteEditorHandle,
  type BulletContextInfo,
} from '@/Function/notebook/editor/NoteEditor';
import {
  computeTranscriptDelta,
  shouldAutoStructure,
  shouldRegroup,
  transcriptMarkdown,
  type DensityReport,
} from '@/Function/notebook/noteAiModel';
import { spokenLanguage, useVoiceCapture } from '@/Function/notebook/voice/useVoiceCapture';
import { VoiceMinutesDock } from '@/Function/notebook/voice/VoiceMinutesDock';
import type { SaveHow } from '@/Function/notebook/noteContentStore';
import { BulletExtractDialog } from './BulletExtractDialog';
import { useI18n, translate } from '@/Function/i18n/I18nProvider';
import { PresenceStack } from '@/Function/shared/PresenceStack';
import { SidebarReveal } from '@/Function/shared/SidebarReveal';
import { useNotePresence } from '@/hooks/usePresence';
import { formatError } from '@/Function/shared/formatError';
import { formatDateTime } from '@/Function/shared/dateUtils';
import { getActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { uploadToArtifacts } from '@/hooks/artifactData';

interface PageViewProps {
  fileId: string;
  title: string;
  icon?: string;
  /** HTML body of the note. */
  content: string;
  /** Object this Note is linked to. When set, bullet → Element conversion
   *  defaults to this Object (and its Domain). */
  linkedObjectId?: string | null;
  onLinkedObjectChange?: (objectId: string | null) => void;
  onTitleChange: (title: string) => void;
  onContentChange: (html: string, how?: SaveHow) => void;
  /** Open the Object draft dialog (Note → Object + Elements). */
  onObjectize: () => void;
  /** When true, the Object draft pipeline is currently running (AI summarize + draft). */
  objectizing?: boolean;
  /** Active Domain — used as the Object-picker scope fallback when no
   *  link is set yet. */
  activeDomainId?: string | null;
  /** Notify the host so the explorer can refetch after Elements are created. */
  onElementsCreated?: () => void;
  /** File-list pane visibility + toggle, surfaced as a header button. */
  filesPaneOpen?: boolean;
  onToggleFilesPane?: () => void;
}

// Caller should mount this with key={fileId} so the editor remounts
// (and re-initializes) when switching between pages.
// Titles we treat as "not really named yet" — the field shows the gray
// "Document title" placeholder for these instead of the literal word, the
// way Notion never surfaces its "Untitled" default as real text. The
// sidebar/tree keep their own "Untitled" fallback for display. New pages are
// named in the viewer's language, so its "Untitled" counts too.
const isPlaceholderTitle = (title: string) => title === '' || title === 'Untitled' || title === translate('Untitled');

export function PageView({
  fileId,
  title,
  icon,
  content,
  linkedObjectId,
  onTitleChange,
  onContentChange,
  onObjectize,
  objectizing,
  activeDomainId,
  onElementsCreated,
  filesPaneOpen,
  onToggleFilesPane,
}: PageViewProps) {
  const { t, locale } = useI18n();
  const explorerData = useExplorerData();
  // onLinkedObjectChange is still on the props (the host keeps wiring it)
  // but has no trigger here.
  const [draftTitle, setDraftTitle] = useState(
    isPlaceholderTitle(title.trim()) ? '' : title,
  );
  const [bulletCtx, setBulletCtx] = useState<BulletContextInfo | null>(null);
  const editorRef = useRef<NoteEditorHandle | null>(null);

  // Voice minutes and the Note's AI. Each AI call is one the person asked for:
  // /voice, /ai, /complete and ⌘J in the editor. The header carries no AI button.
  const voice = useVoiceCapture(spokenLanguage(locale === 'en' ? 'en-US' : 'ja-JP'));
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [autoStructure, setAutoStructure] = useState(true);
  const [structuring, setStructuring] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [density, setDensity] = useState<DensityReport>({
    isDense: false,
    totalChars: 0,
    longBlockCount: 0,
    unitCount: 0,
  });
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // Characters written as spoken and not yet organized.
  const [pendingChars, setPendingChars] = useState(0);

  const writtenCountRef = useRef(0);
  // Where this recording starts among the words heard, and how many of them
  // the transcript file already holds.
  const sessionStartRef = useRef(0);
  const filedCountRef = useRef(0);
  // Sections organized since the minutes were last regrouped.
  const roundsRef = useRef(0);
  const lastStructuredAtRef = useRef(0);
  const structuringRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((msg: string) => {
    setAiError(null);
    setAiNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setAiNotice(null);
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const fullText = useMemo(() => computeTranscriptDelta(voice.segments, 0).fullText, [voice.segments]);

  // Elements created from a Note land in the linked Object's Domain (when
  // a link is set) and otherwise fall back to the active Domain.
  useDomains(); // keep the cache warm; the result isn't needed here anymore
  const allObjects = explorerData?.objects ?? [];
  const linkedObject = useMemo(() => {
    if (!linkedObjectId) return null;
    return allObjects.find((o) => o.id === linkedObjectId) ?? null;
  }, [linkedObjectId, allObjects]);
  const elementDomainId = linkedObject?.domain_id ?? activeDomainId ?? null;
  const elementDefaultObjectId = linkedObject?.id ?? null;

  // Every Element the app holds, by id: a line made into one shows its
  // status live and opens its Status menu.
  const elementsById = useMemo<Record<string, ElementWithDetails>>(() => {
    const map: Record<string, ElementWithDetails> = {};
    for (const o of explorerData?.objects ?? []) {
      for (const e of o.elements ?? []) map[e.id] = e;
    }
    for (const e of explorerData?.rootElements ?? []) map[e.id] = e;
    return map;
  }, [explorerData]);

  const commitTitle = useCallback(() => {
    const next = draftTitle.trim();
    if (next && next !== title) onTitleChange(next);
    // Empty (or a placeholder default) → leave the field blank so the
    // "Document title" placeholder stays visible; don't resurrect "Untitled".
    else if (!next) setDraftTitle('');
    else setDraftTitle(title);
  }, [draftTitle, title, onTitleChange]);

  // Others with this page open (anyone who can see what it is attached to).
  const viewers = useNotePresence(fileId);

  const handleBulletContextMenu = useCallback((info: BulletContextInfo) => {
    setBulletCtx(info);
  }, []);

  // Words reach the Note as they are spoken, with or without AI.
  useEffect(() => {
    if (voice.segments.length < writtenCountRef.current) writtenCountRef.current = voice.segments.length;
    if (!voiceOpen || voice.segments.length === writtenCountRef.current) return;
    const spoken = voice.segments.slice(writtenCountRef.current);
    writtenCountRef.current = voice.segments.length;
    for (const seg of spoken) editorRef.current?.voice.append(seg.text);
    setPendingChars(editorRef.current?.voice.pendingChars() ?? 0);
  }, [voiceOpen, voice.segments]);

  // What is being said now shows below them until it settles.
  useEffect(() => {
    editorRef.current?.voice.interim(voiceOpen ? voice.interimText : '');
  }, [voiceOpen, voice.interimText]);

  // Once several sections have gathered they are grouped again, shorter.
  const runRegroup = useCallback(async (last: boolean) => {
    const editor = editorRef.current;
    const minutes = editor?.voice.minutes();
    if (!editor || !minutes) return;
    if (!shouldRegroup({ rounds: roundsRef.current, minutesChars: minutes.chars, plain: minutes.plain, last })) return;
    roundsRef.current = 0;
    try {
      const res = await regroupVoiceMinutes({
        title: draftTitle.trim(),
        minutesHtml: minutes.html,
        language: voice.language,
      });
      if (editor.voice.replaceMinutes(res.html, minutes.key) === 'done') {
        showNotice(t('Minutes regrouped · ⌘Z to undo'));
      }
    } catch {
      // The minutes stay as they are; the next round tries again.
      showNotice(t('The minutes could not be regrouped. They stay as they are.'));
    }
  }, [voice.language, draftTitle, showNotice, t]);

  const runStructure = useCallback(async (last = false) => {
    const editor = editorRef.current;
    if (!editor || structuringRef.current) return;
    // The words as written in the Note, with whatever was corrected by hand.
    const taken = editor.voice.take();
    if (!taken) {
      if (last) {
        structuringRef.current = true;
        setStructuring(true);
        try { await runRegroup(true); } finally { structuringRef.current = false; setStructuring(false); }
      }
      return;
    }

    structuringRef.current = true;
    setStructuring(true);
    setAiError(null);
    try {
      const currentTitle = draftTitle.trim();
      const res = await structureVoiceMinutes({
        title: currentTitle,
        existingText: editor.voice.context(),
        transcriptDelta: taken,
        fullTranscript: '',
        language: voice.language,
      });
      lastStructuredAtRef.current = Date.now();
      // Only the words it was made from are replaced; the rest of the Note stays.
      if (editor.voice.replaceSpoken(res.html, taken) === 'done') {
        roundsRef.current += 1;
        if (res.suggestedTitle && !currentTitle) {
          setDraftTitle(res.suggestedTitle);
          onTitleChange(res.suggestedTitle);
        }
        showNotice(
          res.summaryNote
            ? `${res.summaryNote} · ${t('⌘Z to undo')}`
            : t('Minutes updated · ⌘Z to undo'),
        );
        await runRegroup(last);
      }
    } catch (err) {
      // Without AI (no plan, budget spent, offline) the words stay in the Note
      // as spoken, and auto-organize turns off.
      editor.voice.release();
      setAiError(formatError(err));
      setAutoStructure(false);
    } finally {
      structuringRef.current = false;
      setStructuring(false);
      setPendingChars(editor.voice.pendingChars());
    }
  }, [voice.language, draftTitle, onTitleChange, showNotice, runRegroup, t]);

  // Automatic background structuring while speaking once enough speech builds up.
  useEffect(() => {
    if (!voiceOpen || !autoStructure) return;
    if (voice.status !== 'listening' && voice.status !== 'paused') return;
    const id = setInterval(() => {
      if (structuringRef.current) return;
      const chars = editorRef.current?.voice.pendingChars() ?? 0;
      setPendingChars(chars);
      const now = Date.now();
      if (
        shouldAutoStructure({
          unprocessedChars: chars,
          msSinceLastSpeech: voice.lastSpeechAt ? now - voice.lastSpeechAt : 0,
          msSinceLastStructure: now - lastStructuredAtRef.current,
        })
      ) {
        void runStructure();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [voiceOpen, autoStructure, voice.status, voice.lastSpeechAt, runStructure]);

  const handleOpenVoice = useCallback(() => {
    // What was said before the panel opened is not written again.
    writtenCountRef.current = voice.segments.length;
    sessionStartRef.current = voice.segments.length;
    filedCountRef.current = voice.segments.length;
    roundsRef.current = 0;
    editorRef.current?.voice.begin();
    setPendingChars(0);
    setVoiceOpen(true);
    setAiError(null);
    if (voice.supported && voice.status === 'idle') {
      voice.start();
    }
  }, [voice]);

  // Stopping asks for the last round and the transcript's file. Both wait for
  // the words still unsettled when listening ended to be written.
  const [stopped, setStopped] = useState(0);
  const handleStopVoice = useCallback(() => {
    voice.stop();
    setStopped((n) => n + 1);
  }, [voice]);

  const finishedRef = useRef(0);
  useEffect(() => {
    if (!stopped || finishedRef.current === stopped || !voiceOpen) return;
    if (writtenCountRef.current !== voice.segments.length) return;
    finishedRef.current = stopped;
    const editor = editorRef.current;
    const spoken = voice.segments.slice(sessionStartRef.current);
    const spaceId = getActiveSpaceId();
    void (async () => {
      if (autoStructure) await runStructure(true);
      // Everything said, word for word, kept in Artifacts and placed above the minutes.
      if (!editor || !spaceId || voice.segments.length === filedCountRef.current || !spoken.length) return;
      filedCountRef.current = voice.segments.length;
      try {
        const name = `${draftTitle.trim() || t('Voice minutes')} — ${t('Transcript')} ${formatDateTime(new Date(spoken[0].timestamp))}.md`;
        const file = new File([transcriptMarkdown(spoken)], name.replace(/[\\/:]/g, '-'), { type: 'text/markdown' });
        const saved = await uploadToArtifacts(spaceId, file);
        editor.voice.placeFile(saved.id);
      } catch (err) {
        setAiError(formatError(err));
      }
    })();
  }, [stopped, voiceOpen, voice.segments, autoStructure, runStructure, draftTitle, t]);

  const handleCloseVoice = useCallback(() => {
    voice.stop();
    editorRef.current?.voice.end();
    setVoiceOpen(false);
  }, [voice]);

  const handleRequestProposals = useCallback(async () => {
    if (proposing) return;
    const blocks = editorRef.current?.getBlocks() ?? [];
    if (!blocks.length) {
      showNotice(t('Write or dictate some notes before requesting refinements.'));
      return;
    }
    setProposing(true);
    setAiError(null);
    if (noticeTimerRef.current) { clearTimeout(noticeTimerRef.current); noticeTimerRef.current = null; }
    setAiNotice(t('Looking for lines to refine…'));
    try {
      const proposals = await proposeNoteRefinements({
        title: draftTitle.trim(),
        blocks,
        recentTranscript: fullText,
        language: locale,
        focus: density.isDense ? 'dense' : 'all',
      });
      const matched = editorRef.current?.setProposals(proposals) ?? 0;
      if (matched === 0) {
        showNotice(t('This note already looks crisp — no pinpoint edits needed.'));
      } else {
        setAiNotice(null);
      }
    } catch (err) {
      setAiNotice(null);
      setAiError(formatError(err));
    } finally {
      setProposing(false);
    }
  }, [proposing, draftTitle, fullText, locale, density.isDense, showNotice, t]);

  return (
    <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden bg-[var(--card)]">
      {/* Quiet 48px floating corner controls aligned with every page header. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-12 items-center justify-between px-3 [&>*]:pointer-events-auto">
        <div className="flex items-center gap-1">
          <SidebarReveal />
          {onToggleFilesPane && (
            <button type="button" onClick={onToggleFilesPane} aria-pressed={filesPaneOpen}
              title={filesPaneOpen ? t('Hide page list') : t('Show page list')}
              aria-label={filesPaneOpen ? t('Hide page list') : t('Show page list')}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground">
              <PanelLeft size={15} />
            </button>
          )}
        </div>
        <PresenceStack viewers={viewers} />
      </div>

      {/* Transient AI notice / error pill when Voice Dock is closed */}
      {(objectizing || (!voiceOpen && (aiNotice || aiError))) && (
        <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center px-4">
          <div
            className={[
              'pointer-events-auto inline-flex max-w-md items-center gap-2 rounded-full border px-3 py-1 text-[12px] shadow-[var(--shadow-1)]',
              aiError
                ? 'border-[var(--status-danger)]/30 bg-[var(--status-danger-subtle)] text-[var(--status-danger-text)]'
                : 'border-border bg-[var(--surface-overlay)] text-foreground',
            ].join(' ')}
          >
            <span className="truncate">{aiError || aiNotice || t('Drafting…')}</span>
            <button
              type="button"
              onClick={() => { setAiNotice(null); setAiError(null); }}
              aria-label={t('Close')}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className={`max-w-3xl mx-auto px-8 pt-16 ${voiceOpen ? 'pb-36' : 'pb-24'}`}>
          {icon && (
            <div className="text-5xl mb-3 leading-none select-none">{icon}</div>
          )}
          {/* The title stands on spacing alone — no rule under it. */}
          <div className="mb-6">
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                // Ignore the Enter that confirms an IME composition — calling
                // preventDefault() on it breaks the commit and the composing
                // text gets duplicated (e.g. "あ" → "ああああ").
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              placeholder={t('Document title')}
              // Box-aligned with the body (both sit at the px-12 content edge,
              // measured pixel-identical). We deliberately do NOT add a
              // negative text-indent to optically compensate the heading's
              // larger left side-bearing: an <input> clips its value at the
              // content edge, so any negative indent shears the first glyph of
              // a Latin title ("A" → cut off). Every major editor box-aligns
              // here and lives with the bearing.
              className="w-full bg-transparent border-0 no-focus-ring p-0 text-4xl font-bold text-foreground tracking-[-0.5px] leading-[1.15] placeholder:text-muted-foreground/50 transition-none"
            />
          </div>

          <NoteEditor
            ref={editorRef}
            collab={fileId}
            value={content}
            onChange={onContentChange}
            onBulletContextMenu={handleBulletContextMenu}
            elementsById={elementsById}
            aiAssist
            title={draftTitle}
            recentTranscript={fullText}
            onStartVoice={handleOpenVoice}
            onRequestProposals={() => { void handleRequestProposals(); }}
            onObjectize={objectizing ? undefined : onObjectize}
            onDensityChange={setDensity}
          />
        </div>
      </div>

      {voiceOpen && (
        <VoiceMinutesDock
          supported={voice.supported}
          status={voice.status}
          segments={voice.segments}
          interimText={voice.interimText}
          elapsedSec={voice.elapsedSec}
          unprocessedChars={pendingChars}
          autoStructure={autoStructure}
          structuring={structuring}
          notice={aiNotice}
          error={aiError || voice.error}
          silence={voice.silence}
          onStart={voice.start}
          onPause={voice.pause}
          onResume={voice.resume}
          onStop={handleStopVoice}
          onClose={handleCloseVoice}
          onToggleAutoStructure={() => setAutoStructure((v) => !v)}
          onStructureNow={() => { void runStructure(); }}
          onAppendManualText={voice.appendManualText}
        />
      )}

      {bulletCtx && (
        <BulletExtractDialog
          texts={bulletCtx.texts}
          anchor={{ x: bulletCtx.x, y: bulletCtx.y }}
          activeDomainId={elementDomainId}
          defaultObjectId={elementDefaultObjectId}
          onClose={() => setBulletCtx(null)}
          onCreated={(created) => {
            // Stamp the data-element-id link onto each source bullet so
            // its ○ starts mirroring the new (Backlog) Element.
            if (bulletCtx) {
              const entries = created
                .map((c) => ({ li: bulletCtx.liNodes[c.index], elementId: c.elementId }))
                .filter((e): e is { li: HTMLLIElement; elementId: string } => !!e.li);
              if (entries.length > 0) editorRef.current?.linkBullets(entries);
            }
            onElementsCreated?.();
          }}
        />
      )}
    </div>
  );
}
