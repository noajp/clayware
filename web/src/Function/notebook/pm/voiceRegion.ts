import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { ySyncPluginKey } from 'y-prosemirror';
import { schema } from './schema';
import { docToHtml, htmlToDoc, isEmptyDoc } from './html';

// Voice minutes inside the Note. Words are written as they are spoken; once
// enough have gathered they are folded into a transcript block with the
// section made from them below it, and once enough sections have gathered
// those are regrouped under the transcripts they came from. The part of the
// Note this may rewrite is the part it wrote: everything else is left as it is.

/** A transcript: a code block of this language, so it is plain text to save
 *  and to read, drawn folded to its first line until the caret is in it. */
const TRANSCRIPT_LANG = 'transcript';

const isTranscript = (node: PMNode) =>
  node.type === schema.nodes.code_block && node.attrs.lang === TRANSCRIPT_LANG;

/** Boundaries between top-level blocks. The minutes are [start, mid), the
 *  words as spoken are [mid, end). `cut` is where the words being organized
 *  stop: those after it were spoken since. */
export interface VoiceRegion {
  start: number;
  mid: number;
  end: number;
  cut: number | null;
  /** What is being said now, not yet settled. Shown, never written. */
  interim: string;
  /** The block just above the region is the transcript's file, placed by voice. */
  filed?: boolean;
}

export type VoiceReplaceOutcome = 'done' | 'changed' | 'gone';

export const voiceKey = new PluginKey<VoiceRegion | null>('note-voice-region');

const clamp = (doc: PMNode, pos: number) => Math.max(0, Math.min(pos, doc.content.size));

/** Pure. The nearest boundary between top-level blocks, leaving a block the
 *  position fell inside out of the region. */
function toBoundary(doc: PMNode, pos: number, side: 'start' | 'end'): number {
  const at = clamp(doc, pos);
  const $pos = doc.resolve(at);
  if ($pos.depth === 0) return at;
  return side === 'start' ? $pos.after(1) : $pos.before(1);
}

function ordered(region: VoiceRegion): VoiceRegion {
  const start = region.start;
  const end = Math.max(start, region.end);
  const mid = Math.max(start, Math.min(region.mid, end));
  const cut = region.cut === null ? null : Math.max(mid, Math.min(region.cut, end));
  return { ...region, start, mid, end, cut };
}

/** Pure. The region after a change typed here. */
function mapVoiceRegion(region: VoiceRegion, tr: Transaction): VoiceRegion {
  const doc = tr.doc;
  return ordered({
    ...region,
    // Typed just before the region stays outside it, typed just after too.
    start: toBoundary(doc, tr.mapping.map(region.start, 1), 'start'),
    mid: toBoundary(doc, tr.mapping.map(region.mid, -1), 'start'),
    end: toBoundary(doc, tr.mapping.map(region.end, -1), 'end'),
    cut: region.cut === null ? null : toBoundary(doc, tr.mapping.map(region.cut, -1), 'end'),
  });
}

/** Pure. Where a boundary went when the whole document was laid down again
 *  (a change from someone else, an undo): found by the blocks beside it,
 *  which come back as they were. */
function reanchor(oldDoc: PMNode, newDoc: PMNode, pos: number, prefer: 'after' | 'before'): number {
  let index = 0;
  let offset = 0;
  while (index < oldDoc.childCount && offset < pos) {
    offset += oldDoc.child(index).nodeSize;
    index += 1;
  }
  const after = index < oldDoc.childCount ? oldDoc.child(index) : null;
  const before = index > 0 ? oldDoc.child(index - 1) : null;

  // The same block, or failing that one that reads the same, nearest to where it was.
  const find = (node: PMNode, wasAt: number): { from: number; to: number } | null => {
    let best: { from: number; to: number; far: number } | null = null;
    let at = 0;
    for (let i = 0; i < newDoc.childCount; i++) {
      const kid = newDoc.child(i);
      if (kid === node) return { from: at, to: at + kid.nodeSize };
      if (kid.eq(node)) {
        const far = Math.abs(i - wasAt);
        if (!best || far < best.far) best = { from: at, to: at + kid.nodeSize, far };
      }
      at += kid.nodeSize;
    }
    return best;
  };

  const viaAfter = after ? find(after, index)?.from ?? null : null;
  const viaBefore = before ? find(before, index - 1)?.to ?? null : null;
  const found = prefer === 'after' ? viaAfter ?? viaBefore : viaBefore ?? viaAfter;
  if (found !== null) return found;
  // Neither neighbour is left: keep the distance from the end.
  return toBoundary(newDoc, newDoc.content.size - (oldDoc.content.size - pos), 'end');
}

/** Pure. The region after the document was laid down again. */
export function reanchorVoiceRegion(region: VoiceRegion, oldDoc: PMNode, newDoc: PMNode): VoiceRegion {
  return ordered({
    ...region,
    start: reanchor(oldDoc, newDoc, region.start, region.end > region.start ? 'after' : 'before'),
    mid: reanchor(oldDoc, newDoc, region.mid, region.end > region.mid ? 'after' : 'before'),
    end: reanchor(oldDoc, newDoc, region.end, region.end > region.start ? 'before' : 'after'),
    cut: region.cut === null ? null : reanchor(oldDoc, newDoc, region.cut, 'before'),
  });
}

function replacesWholeDoc(tr: Transaction, oldDoc: PMNode): boolean {
  const first = tr.steps[0];
  if (!first) return false;
  let whole = false;
  first.getMap().forEach((from, to) => {
    if (from === 0 && to === oldDoc.content.size && oldDoc.childCount > 1) whole = true;
  });
  return whole;
}

export function voiceRegionPlugin(): Plugin<VoiceRegion | null> {
  return new Plugin<VoiceRegion | null>({
    key: voiceKey,
    state: {
      init: () => null,
      apply(tr, prev, oldState, newState) {
        const meta = tr.getMeta(voiceKey) as VoiceRegion | null | undefined;
        if (meta !== undefined) return meta;
        if (!prev || !tr.docChanged) return prev;
        const sync = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined;
        return sync?.isChangeOrigin || replacesWholeDoc(tr, oldState.doc)
          ? reanchorVoiceRegion(prev, oldState.doc, newState.doc)
          : mapVoiceRegion(prev, tr);
      },
    },
    props: {
      decorations(state: EditorState) {
        const region = voiceKey.getState(state);
        const decos: Decoration[] = [];
        // A transcript shows its first line; all of it while the caret is in it.
        const $from = state.selection.$from;
        const caretIn = $from.depth > 0 ? $from.before(1) : -1;
        state.doc.forEach((node, pos) => {
          if (isTranscript(node)) {
            decos.push(Decoration.node(pos, pos + node.nodeSize, { class: pos === caretIn ? 'note-transcript is-open' : 'note-transcript' }));
          }
        });
        if (!region) return decos.length ? DecorationSet.create(state.doc, decos) : null;
        // The words as spoken read a step back until they are organized.
        state.doc.nodesBetween(region.mid, region.end, (node, pos) => {
          if (pos >= region.mid && pos + node.nodeSize <= region.end) {
            decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'note-voice-spoken' }));
          }
          return false;
        });
        if (region.interim) {
          decos.push(
            Decoration.widget(
              region.end,
              () => {
                const line = document.createElement('p');
                line.className = 'note-voice-interim';
                line.setAttribute('aria-hidden', 'true');
                line.contentEditable = 'false';
                line.textContent = region.interim;
                return line;
              },
              { side: -1, key: `voice-interim:${region.interim}` },
            ),
          );
        }
        return decos.length ? DecorationSet.create(state.doc, decos) : null;
      },
    },
  });
}

/** Pure. Where a new region starts: at the end, above an empty last line (the
 *  one the person is on stays below what is spoken). */
function freshRegion(doc: PMNode): VoiceRegion {
  const last = doc.lastChild;
  const emptyLast = !!last && last.type === schema.nodes.paragraph && last.content.size === 0;
  const at = emptyLast ? doc.content.size - last.nodeSize : doc.content.size;
  return { start: at, mid: at, end: at, cut: null, interim: '' };
}

const textOf = (doc: PMNode, from: number, to: number) =>
  from < to ? doc.textBetween(from, to, '\n', ' ').trim() : '';

/** Starts keeping the words spoken from here on. */
export function beginVoice(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(voiceKey, freshRegion(view.state.doc)));
}

/** Stops: what was written stays, and is no longer the region's to rewrite. */
export function endVoice(view: EditorView): void {
  if (voiceKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(voiceKey, null));
}

export function setVoiceInterim(view: EditorView, text: string): void {
  const region = voiceKey.getState(view.state);
  const interim = text.trim();
  if (!region || region.interim === interim) return;
  view.dispatch(view.state.tr.setMeta(voiceKey, { ...region, interim }));
  if (interim) follow(view);
}

/** Keeps the newest words in view, unless the person is working further up. */
function follow(view: EditorView): void {
  const region = voiceKey.getState(view.state);
  if (!region) return;
  if (view.hasFocus() && view.state.selection.from < region.start) return;
  const spoken = view.dom.querySelectorAll<HTMLElement>('.note-voice-spoken');
  const line = view.dom.querySelector<HTMLElement>('.note-voice-interim') ?? spoken[spoken.length - 1];
  line?.scrollIntoView?.({ block: 'nearest' });
}

/** Writes words as they were spoken, as a line of their own. */
export function appendSpoken(view: EditorView, text: string): void {
  const words = text.trim();
  if (!words) return;
  const { state } = view;
  const region = voiceKey.getState(state) ?? freshRegion(state.doc);
  const line = schema.nodes.paragraph.create(null, schema.text(words));
  const tr = state.tr.insert(region.end, line);
  tr.setMeta(voiceKey, { ...region, end: region.end + line.nodeSize, interim: '' });
  view.dispatch(tr);
  follow(view);
}

/** How many characters are written as spoken and not yet organized. */
export function spokenChars(state: EditorState): number {
  const region = voiceKey.getState(state);
  return region ? textOf(state.doc, region.mid, region.end).length : 0;
}

/** The Note up to the words as spoken, without the transcripts: what the
 *  next section continues from. */
export function textBeforeSpoken(state: EditorState): string {
  const region = voiceKey.getState(state);
  if (!region) return '';
  const lines: string[] = [];
  state.doc.nodesBetween(0, region.mid, (node, pos) => {
    // The transcripts are what the sections were made from, not what comes next.
    if (pos + node.nodeSize <= region.mid && !isTranscript(node) && node.textContent.trim()) lines.push(node.textContent.trim());
    return false;
  });
  return lines.join('\n');
}

/** Takes the words as spoken to be organized. What is spoken from now on
 *  waits for the next round. */
export function takeSpoken(view: EditorView): string | null {
  const region = voiceKey.getState(view.state);
  if (!region) return null;
  const text = textOf(view.state.doc, region.mid, region.end);
  if (!text) return null;
  view.dispatch(view.state.tr.setMeta(voiceKey, { ...region, cut: region.end }));
  return text;
}

/** Gives back words that were taken and not organized. */
export function releaseSpoken(view: EditorView): void {
  const region = voiceKey.getState(view.state);
  if (region && region.cut !== null) view.dispatch(view.state.tr.setMeta(voiceKey, { ...region, cut: null }));
}

/** Folds the words taken into a transcript and puts the section made from
 *  them below it. Words edited since they were taken are left alone ('changed'). */
export function replaceSpoken(view: EditorView, html: string, taken: string): VoiceReplaceOutcome {
  const { state } = view;
  const region = voiceKey.getState(state);
  if (!region || region.cut === null) return 'gone';
  const { mid, cut } = region;
  if (textOf(state.doc, mid, cut) !== taken) {
    releaseSpoken(view);
    return 'changed';
  }
  // The words stay, folded, above what was made of them; with nothing made
  // of them they are folded all the same.
  const added = html.trim() ? htmlToDoc(html) : null;
  const transcript = schema.nodes.code_block.create({ lang: TRANSCRIPT_LANG }, schema.text(taken));
  const section = added && !isEmptyDoc(added)
    ? Fragment.from(transcript).append(added.content)
    : Fragment.from(transcript);
  const tr = state.tr.replaceWith(mid, cut, section);
  const grew = section.size - (cut - mid);
  tr.setMeta(voiceKey, { ...region, mid: mid + section.size, end: region.end + grew, cut: null });
  view.dispatch(tr);
  return 'done';
}

const PLAIN = new Set(['paragraph', 'heading', 'blockquote', 'bullet_list', 'ordered_list', 'list_item', 'text', 'hard_break']);

export interface VoiceMinutes {
  /** The sections, without the transcripts between them. */
  html: string;
  chars: number;
  /** Text and lists only. Lines made into Elements, tables and drawings would
   *  not survive being written again, so minutes that hold one are kept. */
  plain: boolean;
  /** The whole of it as read, to tell whether it changed since. */
  key: string;
}

function minutesParts(state: EditorState, region: VoiceRegion) {
  const transcripts: PMNode[] = [];
  const sections: PMNode[] = [];
  state.doc.nodesBetween(region.start, region.mid, (node, pos) => {
    if (pos >= region.start && pos + node.nodeSize <= region.mid) (isTranscript(node) ? transcripts : sections).push(node);
    return false;
  });
  return { transcripts, sections };
}

/** The minutes written so far. */
export function readMinutes(state: EditorState): VoiceMinutes | null {
  const region = voiceKey.getState(state);
  if (!region || region.mid <= region.start) return null;
  const { sections } = minutesParts(state, region);
  if (!sections.length) return null;
  let plain = true;
  let chars = 0;
  for (const section of sections) {
    chars += section.textContent.length;
    section.descendants((node) => {
      if (!PLAIN.has(node.type.name) || (node.type === schema.nodes.list_item && node.attrs.elementId)) plain = false;
      return plain;
    });
    if (!PLAIN.has(section.type.name)) plain = false;
  }
  const whole = schema.nodes.doc.create(null, state.doc.slice(region.start, region.mid).content);
  return { html: docToHtml(schema.nodes.doc.create(null, sections)), chars, plain, key: docToHtml(whole) };
}

/** Puts the regrouped minutes where the minutes are, under the transcripts
 *  they came from, each still its own block. Minutes edited since they were
 *  read are left alone ('changed'). */
export function replaceMinutes(view: EditorView, html: string, key: string): VoiceReplaceOutcome {
  const { state } = view;
  const region = voiceKey.getState(state);
  const now = readMinutes(state);
  if (!region || !now) return 'gone';
  if (now.key !== key || !now.plain) return 'changed';
  const added = html.trim() ? htmlToDoc(html) : null;
  if (!added || isEmptyDoc(added)) return 'gone';
  const { start, mid } = region;
  const regrouped = Fragment.from(minutesParts(state, region).transcripts).append(added.content);
  const tr = state.tr.replaceWith(start, mid, regrouped);
  const grew = regrouped.size - (mid - start);
  tr.setMeta(voiceKey, {
    ...region,
    mid: mid + grew,
    end: region.end + grew,
    cut: region.cut === null ? null : region.cut + grew,
  });
  view.dispatch(tr);
  return 'done';
}

/** Places the transcript's file just above everything voice wrote. Placed
 *  again, it takes the place of the one placed before. */
export function placeVoiceFile(view: EditorView, file: PMNode): void {
  const { state } = view;
  const region = voiceKey.getState(state);
  if (!region) return;
  const before = state.doc.resolve(region.start).nodeBefore;
  const from = region.filed && before && before.type === schema.nodes.code_block ? region.start - before.nodeSize : region.start;
  const tr = state.tr.replaceWith(from, region.start, file);
  const grew = file.nodeSize - (region.start - from);
  tr.setMeta(voiceKey, {
    ...region,
    filed: true,
    start: region.start + grew,
    mid: region.mid + grew,
    end: region.end + grew,
    cut: region.cut === null ? null : region.cut + grew,
  });
  view.dispatch(tr);
}
