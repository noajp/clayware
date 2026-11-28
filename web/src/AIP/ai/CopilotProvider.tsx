'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { copilotTitleOf, toKeptMessages, useClaywareCopilot, type CopilotMessage } from './useClaywareCopilot';
import { shouldResetOnArrival, type CopilotArrivalTransition } from './copilotArrival';
import { useAiConversations } from '@/hooks/useAiConversations';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import type { AthenaMood } from './athena3d/athenaGlbEngine';

// One conversation with the AI across the app: the pop-up and the AI screen
// are two windows onto it, so expanding the pop-up carries the talk along.
// Each conversation is kept as a session in the person's folders for the
// Space (the AI screen's sidebar lists them): a first send makes its row,
// the engine (Athena) writes its messages as its turns run, and this
// provider only files it — a title once it has one, and the folder it was
// started in.
type Conversation = ReturnType<typeof useClaywareCopilot> & {
  library: ReturnType<typeof useAiConversations>;
  /** The kept session on screen; null for one not yet answered. */
  sessionId: string | null;
  /** Folder a fresh unsaved conversation will be filed into; null for Recent. */
  draftFolderId: string | null;
  setDraftFolderId: (folderId: string | null) => void;
  openSession: (id: string) => Promise<void>;
  /** A fresh conversation, kept in this folder once answered (none: loose). */
  newConversation: (folderId?: string | null) => void;
  /**
   * An arrival at an AI surface (page.tsx reports the visibility
   * transition): starts a fresh conversation, unless the arrival
   * decision exempts it — a carry between the two windows, a live
   * turn streaming, or an already-fresh conversation.
   */
  arriveAtAi: (transition: CopilotArrivalTransition) => void;
};

const CopilotContext = createContext<Conversation | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  // The hook reads the session through refs: it is created before the
  // library exists, and its callbacks must see the current session, not
  // the one from the render that created them.
  const sessionIdRef = useRef<string | null>(null);
  const loadRef = useRef<((kept: CopilotMessage[]) => void) | null>(null);
  const loadMessagesRef = useRef<((id: string) => Promise<unknown[] | null>) | null>(null);
  const saveSessionRef = useRef<((id: string | null, patch: { title?: string; folder_id?: string | null; messages: unknown[] }) => Promise<string | null>) | null>(null);
  const folderForNew = useRef<string | null>(null);
  const [draftFolderId, setDraftFolderIdState] = useState<string | null>(null);
  const setDraftFolderId = useCallback((folderId: string | null) => {
    folderForNew.current = folderId;
    setDraftFolderIdState(folderId);
  }, []);
  const adoptSession = useCallback((id: string | null) => {
    sessionIdRef.current = id;
    setSessionId(id);
  }, []);
  const conversation = useClaywareCopilot({
    getSessionId: () => sessionIdRef.current,
    // A first send makes the kept conversation's row through the
    // library's insert — in the folder the conversation was started
    // in — and adopts it; the engine writes its messages from there.
    ensureSession: async () => {
      const existing = sessionIdRef.current;
      if (existing) return existing;
      const save = saveSessionRef.current;
      if (!save) return null;
      const id = await save(null, { title: '', folder_id: folderForNew.current, messages: [] });
      if (id) adoptSession(id);
      return id;
    },
    onSessionId: adoptSession,
    reloadSession: async () => {
      const id = sessionIdRef.current;
      if (!id || !loadMessagesRef.current || !loadRef.current) return false;
      const kept = await loadMessagesRef.current(id);
      if (!kept) return false;
      loadRef.current(kept as CopilotMessage[]);
      return true;
    },
    // A cut-back (an edited question, a retry) is the person's own
    // write of the kept conversation: what remains of it, in its kept
    // shape, re-filed under its title. The turns themselves are the
    // engine's to write.
    onTruncate: async (kept) => {
      const id = sessionIdRef.current;
      const save = saveSessionRef.current;
      if (!id || !save) return;
      await save(id, { title: copilotTitleOf(kept), messages: toKeptMessages(kept) });
    },
    // An annotation patch (a person's chart colors on one answer):
    // the messages only, in kept shape — no title is passed, so the
    // save never re-titles or re-files the conversation.
    onPatchMessages: async (messages) => {
      const id = sessionIdRef.current;
      const save = saveSessionRef.current;
      if (!id || !save) return;
      await save(id, { messages: toKeptMessages(messages) });
    },
  });
  const spaceId = useActiveSpaceId();
  const library = useAiConversations(spaceId);
  const { messages, streaming, reset, load } = conversation;
  const { saveSession, loadMessages, fileSession } = library;
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { loadMessagesRef.current = loadMessages; }, [loadMessages]);
  useEffect(() => { saveSessionRef.current = saveSession; }, [saveSession]);

  const newConversation = useCallback((folderId: string | null = null) => {
    reset();
    setDraftFolderId(folderId);
    adoptSession(null);
  }, [reset, setDraftFolderId, adoptSession]);

  // Coming to the AI chat lands on a fresh conversation (the previous
  // one is never resumed automatically; it waits in the sidebar list).
  // The reset is display-only: the kept session, its run and any
  // pending approvals persist server-side, untouched.
  const arriveAtAi = useCallback((transition: CopilotArrivalTransition) => {
    const fresh = sessionId === null && messages.length === 0;
    if (!shouldResetOnArrival({ ...transition, streaming, fresh })) return;
    newConversation();
  }, [sessionId, messages.length, streaming, newConversation]);

  const openSession = useCallback(async (id: string) => {
    const kept = await loadMessages(id);
    if (!kept) return;
    load(kept as CopilotMessage[]);
    // A kept conversation is already filed; its saves never move it.
    setDraftFolderId(null);
    adoptSession(id);
  }, [loadMessages, load, setDraftFolderId, adoptSession]);

  // Another Space has its own conversations.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Space is an outside store; its change starts afresh
  useEffect(() => { newConversation(); }, [spaceId, newConversation]);

  // File the conversation each time an answer finishes: its title
  // (only while it is still untitled) and the folder it was started
  // in, once. The messages themselves are the engine's record now.
  const wasStreaming = useRef(false);
  useEffect(() => {
    const finished = wasStreaming.current && !streaming;
    wasStreaming.current = streaming;
    if (!finished || messages.length === 0 || !sessionId) return;
    const folderId = folderForNew.current;
    setDraftFolderId(null);
    void fileSession(sessionId, { title: copilotTitleOf(messages), folder_id: folderId });
  }, [streaming, messages, sessionId, fileSession, setDraftFolderId]);

  return (
    <CopilotContext.Provider value={{ ...conversation, library, sessionId, draftFolderId, setDraftFolderId, openSession, newConversation, arriveAtAi }}>
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilotConversation(): Conversation {
  const conversation = useContext(CopilotContext);
  if (!conversation) throw new Error('useCopilotConversation needs a CopilotProvider');
  return conversation;
}

/** Reads whether Athena is currently streaming a reply; safe outside CopilotProvider. */
export function useCopilotStreaming(): boolean {
  return useContext(CopilotContext)?.streaming ?? false;
}

/**
 * Derives Athena's live 3D emotional state from the current conversation:
 * - working: actively executing tool calls
 * - thinking: streaming / composing a reply
 * - cheer: briefly celebrates for 2.6s right after finishing a reply
 * - surprise: an error occurred or an approval decision needs attention
 * - idle: calm living presence
 * Safe outside CopilotProvider (returns 'idle').
 */
export function useAthenaMood(): AthenaMood {
  const ctx = useContext(CopilotContext);
  const streaming = ctx?.streaming ?? false;
  const error = ctx?.error ?? null;
  const messages = ctx?.messages;

  const [celebrating, setCelebrating] = useState(false);
  const prevStreaming = useRef(false);

  useEffect(() => {
    const justFinished = prevStreaming.current && !streaming;
    prevStreaming.current = streaming;
    if (!justFinished || error || !messages?.length) return;
    const last = messages[messages.length - 1];
    if (last?.role !== 'assistant' || last.stopped) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- transient celebration window after streaming completes
    setCelebrating(true);
    const id = window.setTimeout(() => setCelebrating(false), 2600);
    return () => window.clearTimeout(id);
  }, [streaming, error, messages]);

  if (streaming) {
    const last = messages?.[messages.length - 1];
    const hasRunningTool = last?.toolEvents?.some((e) => e.result === undefined) ?? false;
    return hasRunningTool ? 'working' : 'thinking';
  }
  if (error) return 'surprise';
  const last = messages?.[messages.length - 1];
  const needsApproval = last?.approvals?.some((a) => a.status === 'pending') ?? false;
  if (needsApproval) return 'surprise';
  if (celebrating) return 'cheer';
  return 'idle';
}
