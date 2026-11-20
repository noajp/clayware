import { supabase } from '@/lib/supabase';
import { getActiveSpaceId } from '@/Function/space/activeSpaceStore';

export type NoteProposalKind = 'condense' | 'clarify' | 'structure' | 'action' | 'missing';
export type NoteProposalBlockType = 'same' | 'paragraph' | 'bullet' | 'checklist' | 'heading';

export interface NoteProposal {
  id: string;
  blockIndex: number;
  kind: NoteProposalKind;
  originalText: string;
  proposedText: string;
  proposedBlockType: NoteProposalBlockType;
  reason: string;
}

export interface NoteBlockSummary {
  index: number;
  type: string;
  text: string;
}

export interface StructureMinutesResult {
  html: string;
  suggestedTitle: string | null;
  summaryNote: string;
}

export interface SelectionEditResult {
  replacement: string;
  blockType: 'same' | 'bullet' | 'checklist';
  reason: string;
}

async function invokeNoteAi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('note-ai', {
    body: { ...body, spaceId: getActiveSpaceId() },
  });
  if (error) {
    // Surface JSON error bodies (such as plan gating) cleanly when present.
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) throw new Error(parsed.error);
      } catch (inner) {
        if (inner instanceof Error && inner.message && inner !== error) throw inner;
      }
    }
    throw error;
  }
  const result = data as T & { error?: string };
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    throw new Error(result.error);
  }
  return result;
}

/** Turns words written as spoken into a titled section of minutes, as HTML
 *  that takes their place. The Note above them is context only. */
export async function structureVoiceMinutes(args: {
  title: string;
  existingText: string;
  transcriptDelta: string;
  fullTranscript: string;
  language: string;
}): Promise<StructureMinutesResult> {
  const res = await invokeNoteAi<{
    html?: string;
    suggestedTitle?: string | null;
    summaryNote?: string;
  }>({
    mode: 'structure',
    ...args,
  });
  return {
    html: res.html ?? '',
    suggestedTitle: res.suggestedTitle ?? null,
    summaryNote: res.summaryNote ?? '',
  };
}

/** Groups the minutes written so far again: sections on one topic under one
 *  heading, said once. The answer takes the place of those minutes. */
export async function regroupVoiceMinutes(args: {
  title: string;
  minutesHtml: string;
  language: string;
}): Promise<{ html: string }> {
  const res = await invokeNoteAi<{ html?: string }>({
    mode: 'structure',
    regroup: true,
    ...args,
  });
  return { html: res.html ?? '' };
}

/** Fast inline ghost-text Tab completion at the caret. */
export async function completeNoteInline(args: {
  title: string;
  prefix: string;
  suffix: string;
  currentBlockText: string;
  blockType: string;
  recentTranscript?: string;
  language: string;
}): Promise<string> {
  const res = await invokeNoteAi<{ completion?: string }>({
    mode: 'complete',
    ...args,
  });
  return typeof res.completion === 'string' ? res.completion : '';
}

/** Pinpoint block-level improvement proposals for a dense or rough Note. */
export async function proposeNoteRefinements(args: {
  title: string;
  blocks: NoteBlockSummary[];
  recentTranscript?: string;
  language: string;
  focus?: 'dense' | 'clarity' | 'actions' | 'all';
}): Promise<NoteProposal[]> {
  const res = await invokeNoteAi<{ proposals?: NoteProposal[] }>({
    mode: 'propose',
    ...args,
  });
  return Array.isArray(res.proposals) ? res.proposals : [];
}

/** Pinpoint rewrite for a user-selected range. */
export async function editNoteSelection(args: {
  title: string;
  selectedText: string;
  beforeContext: string;
  afterContext: string;
  instruction: string;
  recentTranscript?: string;
  language: string;
}): Promise<SelectionEditResult> {
  const res = await invokeNoteAi<{
    replacement?: string;
    blockType?: 'same' | 'bullet' | 'checklist';
    reason?: string;
  }>({
    mode: 'edit',
    ...args,
  });
  return {
    replacement: res.replacement ?? args.selectedText,
    blockType: res.blockType === 'bullet' || res.blockType === 'checklist' ? res.blockType : 'same',
    reason: res.reason ?? '',
  };
}
