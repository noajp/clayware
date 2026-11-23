import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { schema } from './schema';
import { docToHtml, htmlToDoc, isEmptyDoc } from './html';

// Voice minutes inside the Note. Words are written as they are spoken; once
// enough have gathered they are folded into a transcript block with the
// section made from them below it, and once enough sections have gathered
// those are regrouped under the transcripts they came from. The part of the
// Note this may rewrite is the part it wrote: everything else is left as it is.
//
// What voice wrote is found by what it says, not by where it was: a shared
// Note is laid down again whenever someone else opens it (the editor rebinds
// to the document they hold), and a position kept across that points nowhere.

/** A transcript: a code block of this language, so it is plain text to save
 *  and to read, drawn folded to its first line until the caret is in it. */
const TRANSCRIPT_LANG = 'transcript';

const isTranscript = (node: PMNode) =>
  node.type === schema.nodes.code_block && node.attrs.lang === TRANSCRIPT_LANG;

/** What this recording has written, by what it says. Kept by the editor, so
 *  it outlives the editor's state being made anew. */
export interface VoiceAnchor {
  /** Lines written as spoken and not yet organized, in order. */
  pending: string[];
  /** Of `pending`, how many are being organized now. */
  taken: number;
  /** The first transcript this recording folded: where its minutes begin. */
  firstTranscript: string | null;
  /** The transcript file this recording placed, by its source. */
  fileSource: string | null;
  /** What is being said now, not yet settled. Shown, never written. */
  interim: string;
}

export type VoiceReplaceOutcome = 'done' | 'changed' | 'gone';

const refreshKey = new PluginKey<Set<string>>('note-voice-region');

/** The transcripts opened here, by what they say. Each starts folded, and
 *  only its own toggle opens or folds it: clicking into one to correct a
 *  word must not fold it away under the caret. */
const toggleMeta = 'note-transcript-toggle';

/** Pure. A transcript's first line, as its folded label. */
function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line.trim();
}

export const newVoiceAnchor = (): VoiceAnchor => ({ pending: [], taken: 0, firstTranscript: null, fileSource: null, interim: '' });

interface Block { node: PMNode; pos: number; index: number }

function blocks(doc: PMNode): Block[] {
  const out: Block[] = [];
  doc.forEach((node, pos, index) => out.push({ node, pos, index }));
  return out;
}

const isLine = (node: PMNode, text: string) =>
  node.type === schema.nodes.paragraph && node.textContent.trim() === text;

/** Pure. The last run of top-level lines that read `lines`, in order. */
function findRun(doc: PMNode, lines: string[]): { from: number; to: number; first: number } | null {
  if (!lines.length) return null;
  const all = blocks(doc);
  for (let end = all.length - 1; end >= lines.length - 1; end--) {
    let ok = true;
    for (let k = 0; k < lines.length && ok; k++) ok = isLine(all[end - k].node, lines[lines.length - 1 - k]);
    if (ok) {
      const first = all[end - lines.length + 1];
      const last = all[end];
      return { from: first.pos, to: last.pos + last.node.nodeSize, first: first.index };
    }
  }
  return null;
}

/** Pure. The lines still waiting that can be found: the longest run at the
 *  end of `pending` (a line corrected by hand is no longer voice's to fold). */
function waitingRun(doc: PMNode, pending: string[]) {
  for (let drop = 0; drop < pending.length; drop++) {
    const lines = pending.slice(drop);
    const run = findRun(doc, lines);
    if (run) return { ...run, lines, dropped: drop };
  }
  return null;
}

/** Pure. Where new words go: below the lines still waiting, or at the end,
 *  above an empty last line (the one the person is on stays below). */
function insertAt(doc: PMNode, anchor: VoiceAnchor): number {
  const run = waitingRun(doc, anchor.pending);
  if (run) return run.to;
  const last = doc.lastChild;
  const emptyLast = !!last && last.type === schema.nodes.paragraph && last.content.size === 0;
  return emptyLast ? doc.content.size - last.nodeSize : doc.content.size;
}

/** Pure. Where this recording's minutes are: from its first transcript to
 *  the lines still waiting. */
function minutesRange(doc: PMNode, anchor: VoiceAnchor): { from: number; to: number } | null {
  if (!anchor.firstTranscript) return null;
  const all = blocks(doc);
  const run = waitingRun(doc, anchor.pending);
  const stop = run ? run.first : all.length;
  let start = -1;
  for (let i = stop - 1; i >= 0; i--) {
    if (isTranscript(all[i].node) && all[i].node.textContent === anchor.firstTranscript) { start = i; break; }
  }
  if (start < 0) return null;
  let end = stop;
  // The empty line the person writes on is not part of the minutes.
  while (end > start + 1 && all[end - 1].node.type === schema.nodes.paragraph && all[end - 1].node.content.size === 0) end--;
  const last = all[end - 1];
  return { from: all[start].pos, to: last.pos + last.node.nodeSize };
}

/** `label` names a transcript of so many lines, in the person's language. */
export function voiceRegionPlugin(
  anchorOf: () => VoiceAnchor | null,
  label: (lines: number) => string = (lines) => `Transcript · ${lines} lines`,
): Plugin<Set<string>> {
  return new Plugin<Set<string>>({
    key: refreshKey,
    state: {
      init: () => new Set<string>(),
      apply(tr, open) {
        const key = tr.getMeta(toggleMeta) as string | undefined;
        if (key === undefined) return open;
        const next = new Set(open);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      },
    },
    props: {
      decorations(state: EditorState) {
        const decos: Decoration[] = [];
        // A transcript is folded to a labelled line until its toggle opens it.
        const open = refreshKey.getState(state) ?? new Set<string>();
        state.doc.forEach((node, pos) => {
          if (!isTranscript(node)) return;
          const text = node.textContent;
          const isOpen = open.has(text);
          decos.push(Decoration.node(pos, pos + node.nodeSize, { class: isOpen ? 'note-transcript is-open' : 'note-transcript' }));
          const lines = text.split('\n').filter((l) => l.trim()).length;
          decos.push(
            Decoration.widget(
              pos + 1,
              (view) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'note-transcript-toggle';
                button.contentEditable = 'false';
                button.setAttribute('aria-expanded', String(isOpen));
                const chevron = document.createElement('span');
                chevron.className = 'note-transcript-chevron';
                chevron.setAttribute('aria-hidden', 'true');
                chevron.textContent = '›';
                const name = document.createElement('span');
                name.className = 'note-transcript-label';
                name.textContent = label(lines);
                const preview = document.createElement('span');
                preview.className = 'note-transcript-preview';
                preview.textContent = firstLine(text);
                button.append(chevron, name, preview);
                button.addEventListener('mousedown', (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  view.dispatch(view.state.tr.setMeta(toggleMeta, text).setMeta('addToHistory', false));
                });
                return button;
              },
              { side: -1, key: `transcript:${isOpen ? 1 : 0}:${lines}:${firstLine(text).slice(0, 40)}`, ignoreSelection: true, stopEvent: () => true },
            ),
          );
        });
        const anchor = anchorOf();
        if (anchor) {
          // The words as spoken read a step back until they are organized.
          const run = waitingRun(state.doc, anchor.pending);
          if (run) {
            state.doc.nodesBetween(run.from, run.to, (node, pos) => {
              decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'note-voice-spoken' }));
              return false;
            });
          }
          if (anchor.interim) {
            const at = insertAt(state.doc, anchor);
            decos.push(
              Decoration.widget(
                at,
                () => {
                  const line = document.createElement('p');
                  line.className = 'note-voice-interim';
                  line.setAttribute('aria-hidden', 'true');
                  line.contentEditable = 'false';
                  line.textContent = anchor.interim;
                  return line;
                },
                { side: -1, key: `voice-interim:${anchor.interim}` },
              ),
            );
          }
        }
        return decos.length ? DecorationSet.create(state.doc, decos) : null;
      },
    },
  });
}

/** Draws again what the anchor says, when only the anchor changed. */
function refresh(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(refreshKey, true).setMeta('addToHistory', false));
}

/** Keeps the newest words in view, unless the person is working further up. */
function follow(view: EditorView, anchor: VoiceAnchor): void {
  const at = insertAt(view.state.doc, anchor);
  if (view.hasFocus() && view.state.selection.from < at - 2) return;
  const spoken = view.dom.querySelectorAll<HTMLElement>('.note-voice-spoken');
  const line = view.dom.querySelector<HTMLElement>('.note-voice-interim') ?? spoken[spoken.length - 1];
  line?.scrollIntoView?.({ block: 'nearest' });
}

export function setVoiceInterim(view: EditorView, anchor: VoiceAnchor, text: string): void {
  const interim = text.trim();
  if (anchor.interim === interim) return;
  anchor.interim = interim;
  refresh(view);
  if (interim) follow(view, anchor);
}

/** Writes words as they were spoken, as a line of their own. */
export function appendSpoken(view: EditorView, anchor: VoiceAnchor, text: string): void {
  const words = text.trim();
  if (!words) return;
  const at = insertAt(view.state.doc, anchor);
  anchor.pending.push(words);
  anchor.interim = '';
  view.dispatch(view.state.tr.insert(at, schema.nodes.paragraph.create(null, schema.text(words))));
  follow(view, anchor);
}

/** How many characters are written as spoken and not yet organized. */
export function spokenChars(state: EditorState, anchor: VoiceAnchor): number {
  const run = waitingRun(state.doc, anchor.pending);
  return run ? run.lines.join('\n').length : 0;
}

/** The Note up to the words as spoken, without the transcripts: what the
 *  next section continues from. */
export function textBeforeSpoken(state: EditorState, anchor: VoiceAnchor): string {
  const run = waitingRun(state.doc, anchor.pending);
  const stop = run ? run.from : state.doc.content.size;
  const lines: string[] = [];
  state.doc.forEach((node, pos) => {
    if (pos + node.nodeSize <= stop && !isTranscript(node) && node.textContent.trim()) lines.push(node.textContent.trim());
  });
  return lines.join('\n');
}

/** Takes the words as spoken to be organized; what is spoken from now on
 *  waits for the next round. Lines corrected by hand are left as they are. */
export function takeSpoken(view: EditorView, anchor: VoiceAnchor): string | null {
  const run = waitingRun(view.state.doc, anchor.pending);
  anchor.pending = run ? run.lines : [];
  anchor.taken = anchor.pending.length;
  return anchor.taken ? anchor.pending.join('\n') : null;
}

/** Gives back words that were taken and not organized. */
export function releaseSpoken(anchor: VoiceAnchor): void {
  anchor.taken = 0;
}

/** Folds the words taken into a transcript and puts the section made from
 *  them below it. Words edited since they were taken are left alone ('changed'). */
export function replaceSpoken(view: EditorView, anchor: VoiceAnchor, html: string, taken: string): VoiceReplaceOutcome {
  if (!anchor.taken) return 'gone';
  const lines = anchor.pending.slice(0, anchor.taken);
  const run = lines.join('\n') === taken ? findRun(view.state.doc, lines) : null;
  if (!run) {
    releaseSpoken(anchor);
    return 'changed';
  }
  // The words stay, folded, above what was made of them; with nothing made
  // of them they are folded all the same.
  const added = html.trim() ? htmlToDoc(html) : null;
  const transcript = schema.nodes.code_block.create({ lang: TRANSCRIPT_LANG }, schema.text(taken));
  const section = added && !isEmptyDoc(added) ? Fragment.from(transcript).append(added.content) : Fragment.from(transcript);
  anchor.pending = anchor.pending.slice(anchor.taken);
  anchor.taken = 0;
  if (!anchor.firstTranscript) anchor.firstTranscript = taken;
  view.dispatch(view.state.tr.replaceWith(run.from, run.to, section));
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

function minutesParts(doc: PMNode, range: { from: number; to: number }) {
  const transcripts: PMNode[] = [];
  const sections: PMNode[] = [];
  doc.nodesBetween(range.from, range.to, (node) => {
    (isTranscript(node) ? transcripts : sections).push(node);
    return false;
  });
  return { transcripts, sections };
}

/** The minutes this recording has written so far. */
export function readMinutes(state: EditorState, anchor: VoiceAnchor): VoiceMinutes | null {
  const range = minutesRange(state.doc, anchor);
  if (!range) return null;
  const { sections } = minutesParts(state.doc, range);
  if (!sections.length) return null;
  let plain = true;
  let chars = 0;
  for (const section of sections) {
    chars += section.textContent.length;
    if (!PLAIN.has(section.type.name)) plain = false;
    section.descendants((node) => {
      if (!PLAIN.has(node.type.name) || (node.type === schema.nodes.list_item && node.attrs.elementId)) plain = false;
      return plain;
    });
  }
  const whole = schema.nodes.doc.create(null, state.doc.slice(range.from, range.to).content);
  return { html: docToHtml(schema.nodes.doc.create(null, sections)), chars, plain, key: docToHtml(whole) };
}

/** Puts the regrouped minutes where the minutes are, under the transcripts
 *  they came from, each still its own block. Minutes edited since they were
 *  read are left alone ('changed'). */
export function replaceMinutes(view: EditorView, anchor: VoiceAnchor, html: string, key: string): VoiceReplaceOutcome {
  const { state } = view;
  const range = minutesRange(state.doc, anchor);
  const now = readMinutes(state, anchor);
  if (!range || !now) return 'gone';
  if (now.key !== key || !now.plain) return 'changed';
  const added = html.trim() ? htmlToDoc(html) : null;
  if (!added || isEmptyDoc(added)) return 'gone';
  const regrouped = Fragment.from(minutesParts(state.doc, range).transcripts).append(added.content);
  view.dispatch(state.tr.replaceWith(range.from, range.to, regrouped));
  return 'done';
}

/** Places the transcript's file just above this recording's minutes (or the
 *  words still waiting). Placed again, it takes the place of the one before. */
export function placeVoiceFile(view: EditorView, anchor: VoiceAnchor, file: PMNode): void {
  const { doc } = view.state;
  const tr = view.state.tr;
  let placed = false;
  if (anchor.fileSource) {
    doc.forEach((node, pos) => {
      if (placed || node.type !== schema.nodes.code_block || node.textContent !== anchor.fileSource) return;
      tr.replaceWith(pos, pos + node.nodeSize, file);
      placed = true;
    });
  }
  if (!placed) {
    const range = minutesRange(doc, anchor);
    const run = waitingRun(doc, anchor.pending);
    tr.insert(range ? range.from : run ? run.from : insertAt(doc, anchor), file);
  }
  anchor.fileSource = file.textContent;
  view.dispatch(tr);
}
